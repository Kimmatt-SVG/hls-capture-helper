const fs = require("fs");
const path = require("path");
const { episodeFileLabel, safeShowFolderName } = require("./tv-url-utils");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fileHasContent(filePath) {
  try {
    return fs.statSync(filePath).size > 0;
  } catch {
    return false;
  }
}

async function waitForJobComplete(runner, shouldContinue, options = {}) {
  const outputPath = options.outputPath || null;
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? 8 * 60 * 60 * 1000;

  while (Date.now() - startedAt < timeoutMs) {
    if (!shouldContinue()) {
      return { ok: false, cancelled: true };
    }

    const status = runner.getStatus();
    if (status.state === "finished") {
      return { ok: true, status };
    }
    if (status.state === "failed") {
      return { ok: false, error: status.lastLogLine || status.phase || "Download failed" };
    }
    if (status.state === "idle") {
      if (outputPath && fileHasContent(outputPath)) {
        return { ok: true, status: { state: "finished", outputPath } };
      }
      return { ok: false, error: "Download ended before completion." };
    }

    await sleep(500);
  }

  if (outputPath && fileHasContent(outputPath)) {
    return { ok: true, status: { state: "finished", outputPath } };
  }

  return { ok: false, error: "Episode download timed out." };
}

async function runTvShowDownload(plan, deps) {
  if (!plan?.episodes?.length) {
    return { ok: false, error: "No episodes found in the TV show plan." };
  }

  const showTitle = plan.showTitle || "TV Show";
  const season = plan.season || plan.episodes[0]?.season || 1;
  const seasonLabel = `Season ${String(season).padStart(2, "0")}`;
  const folderName = safeShowFolderName(showTitle);
  const rootFolder = deps.contentSubfolder === null ? "" : (deps.contentSubfolder ?? "TV Shows");
  const seasonDir = path.join(deps.outputDir, rootFolder, folderName, seasonLabel);
  fs.mkdirSync(seasonDir, { recursive: true });

  const displayTitle = `${showTitle} - ${seasonLabel}`;
  const downloadedEpisodes = [];
  const failures = [];

  deps.onProgress?.({
    phase: "starting",
    showTitle: displayTitle,
    season,
    totalEpisodes: plan.episodes.length,
    completedEpisodes: 0,
    outputDir: seasonDir
  });

  for (let index = 0; index < plan.episodes.length; index += 1) {
    if (deps.shouldCancel?.()) {
      return { ok: false, cancelled: true, downloadedEpisodes, failures, outputDir: seasonDir };
    }

    const episode = plan.episodes[index];
    const label = episodeFileLabel(episode.season, episode.episode);
    const episodeName = `${label} - ${episode.title || "Episode"}.mp4`.replace(/[<>:"/\\|?*]+/g, "_");
    const episodePath = path.join(seasonDir, episodeName);

    deps.onProgress?.({
      phase: "loading-episode",
      showTitle: displayTitle,
      episode,
      index: index + 1,
      totalEpisodes: plan.episodes.length,
      label
    });
    deps.onDebug?.("tv-episode-start", `Loading ${label}`, {
      episodeUrl: episode.url,
      season: episode.season,
      episode: episode.episode
    });

    const page = await deps.loadEpisodePage(episode.url);
    if (!page.ok) {
      failures.push({ episode, error: page.error || "Episode page failed to load." });
      deps.onDebug?.("tv-episode-fail", page.error || "Episode page failed", { episode });
      continue;
    }

    deps.onProgress?.({
      phase: "fetching-link",
      showTitle: displayTitle,
      episode,
      index: index + 1,
      totalEpisodes: plan.episodes.length,
      label
    });

    const link = await deps.fetchEpisodeLink(episode);
    if (!link?.ok || !link.url) {
      failures.push({ episode, error: link?.error || "Could not get a download link." });
      deps.onDebug?.("tv-episode-fail", link?.error || "No download link", { episode });
      continue;
    }

    deps.onProgress?.({
      phase: "downloading-episode",
      showTitle: displayTitle,
      episode,
      index: index + 1,
      totalEpisodes: plan.episodes.length,
      label,
      qualityLabel: link.qualityLabel || null
    });

    const started = await deps.startEpisodeDownload({
      url: link.url,
      headers: link.headers || [],
      outputPath: episodePath,
      episode,
      label,
      qualityLabel: link.qualityLabel || null,
      mode: link.mode || "direct"
    });

    if (!started.ok) {
      failures.push({ episode, error: started.error || "Download failed to start." });
      continue;
    }

    const actualOutputPath = started.outputPath || episodePath;
    const finished = await waitForJobComplete(deps.runner, () => !deps.shouldCancel?.(), {
      outputPath: actualOutputPath
    });
    deps.clearJob?.();

    if (finished.cancelled) {
      return { ok: false, cancelled: true, downloadedEpisodes, failures, outputDir: seasonDir };
    }

    if (!finished.ok) {
      if (fileHasContent(actualOutputPath)) {
        downloadedEpisodes.push(actualOutputPath);
        deps.onDebug?.("tv-episode-done", `Finished ${label} (recovered from file)`, {
          episode,
          episodePath: actualOutputPath
        });
        deps.onProgress?.({
          phase: "episode-complete",
          showTitle: displayTitle,
          episode,
          index: index + 1,
          totalEpisodes: plan.episodes.length,
          completedEpisodes: downloadedEpisodes.length,
          label,
          outputDir: seasonDir
        });
        continue;
      }

      failures.push({ episode, error: finished.error || "Episode download failed." });
      deps.onDebug?.("tv-episode-fail", finished.error || "Episode download failed", { episode });
      continue;
    }

    downloadedEpisodes.push(actualOutputPath);
    deps.onDebug?.("tv-episode-done", `Finished ${label}`, { episode, episodePath: actualOutputPath });
    deps.onProgress?.({
      phase: "episode-complete",
      showTitle: displayTitle,
      episode,
      index: index + 1,
      totalEpisodes: plan.episodes.length,
      completedEpisodes: downloadedEpisodes.length,
      label,
      outputDir: seasonDir
    });
  }

  if (!downloadedEpisodes.length) {
    return {
      ok: false,
      error: "No episodes were downloaded successfully.",
      failures,
      outputDir: seasonDir
    };
  }

  deps.onDebug?.("tv-complete", `Saved ${downloadedEpisodes.length} episode(s)`, {
    outputDir: seasonDir,
    downloadedEpisodes
  });
  deps.onProgress?.({
    phase: "complete",
    showTitle: displayTitle,
    outputDir: seasonDir,
    downloadedEpisodes,
    completedEpisodes: downloadedEpisodes.length,
    totalEpisodes: plan.episodes.length,
    failedEpisodes: failures.length
  });

  return {
    ok: true,
    outputDir: seasonDir,
    downloadedEpisodes,
    failures
  };
}

module.exports = {
  runTvShowDownload
};
