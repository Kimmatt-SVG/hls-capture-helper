const {
  app,
  BrowserWindow,
  BrowserView,
  ipcMain,
  shell,
  dialog
} = require("electron");
const path = require("path");
const { spawn, exec } = require("child_process");
const { HlsCapture } = require("./lib/hls-capture");
const { DirectDownloadCapture, isDirectDownloadUrl } = require("./lib/direct-download-capture");
const {
  setupTornadoDownloadScraper,
  scanDirectDownloads,
  fetchDirectLinksForMovie,
  extractMovieIdFromUrl
} = require("./lib/tornado-download-scraper");
const { FfmpegRunner, findFfmpeg, outputDirectory, safeOutputName, streamHeadersForDownload } = require("./lib/ffmpeg-runner");
const { loadNasConfig, ensureNasFolder } = require("./lib/nas-config");
const { loadNasCredentials, saveNasCredentials, prepareNasAccess } = require("./lib/nas-auth");
const { setupAdblocker, isAdblockerEnabled, syncAdblockerForUrl } = require("./lib/adblocker");
const { setupNavigationGuard } = require("./lib/navigation-guard");
const { setupEmbedCompatibility } = require("./lib/embed-compatibility");
const { setupChromeCompatibility } = require("./lib/chrome-compat");
const { outputNameFromPageUrl } = require("./lib/page-utils");
const { resolveBestFromCandidates, diagnoseStreamCandidates } = require("./lib/hls-quality");
const { findFfprobe, probeStream } = require("./lib/stream-probe");
const { streamDebug } = require("./lib/stream-debug");
const { saveArtworkForPage } = require("./lib/artwork");
const { findPosterForVideo, embedPosterInVideoAsync } = require("./lib/poster-utils");
const { SITE_HOME_URL, SITE_BASE_URL, SITE_LOGIN_URL, buildSearchUrl, getSiteProfile } = require("./lib/site-config");
const { isAnimeMode } = require("./lib/site-profiles");
const { isAniwaveUrl, prepareAniwavePlayer, inspectAniwavePlayer, waitForAniwaveServers, buildAniwaveServerAttempts, extractEmbedStreamFromFrames } = require("./lib/aniwave-scraper");
const { sessionHlsProxy, shouldProxyStreamUrl } = require("./lib/session-hls-proxy");
const { loadSiteCredentials, saveSiteCredentials } = require("./lib/site-auth");
const { setupSiteAutoLogin } = require("./lib/site-auto-login");
const { listDownloadedMovies } = require("./lib/download-library");
const { syncLocalMoviesToNas } = require("./lib/library-sync");
const { cleanupStaleDownloadArtifacts } = require("./lib/download-cleanup");
const { DownloadQueue, titleFromMovieUrl, normalizeMovieUrl } = require("./lib/download-queue");
const { canonicalMoviePageUrl } = require("./lib/movie-url-utils");
const { processDownloadQueue } = require("./lib/queue-runner");
const { createQueueDebugger, recentQueueDebugEntries } = require("./lib/queue-debug");
const {
  scrapeSearchMovieLinks,
  scrapeMovieDetail,
  buildTornadoSearchScraperScript
} = require("./lib/tornado-search-scraper");
const { setupTvShowScraper, scrapeTvShowFromPage } = require("./lib/tv-show-scraper");
const { runTvShowDownload } = require("./lib/tv-show-runner");
const {
  canonicalContentUrl,
  extractDownloadIds,
  extractGetbuttonId,
  isTvShowPageUrl,
  isDownloadableContentUrl
} = require("./lib/tv-url-utils");

const appProfile = getSiteProfile();
let catalogBrowserLocked = !Boolean(appProfile.hideMovieDownloader);

const WARP_DOWNLOAD_URL = "https://one.one.one.one/";
const WARP_WINGET_COMMAND =
  "winget install --id Cloudflare.Warp -e --source winget --accept-package-agreements --accept-source-agreements";

app.commandLine.appendSwitch("disable-blink-features", "AutomationControlled");
app.commandLine.appendSwitch(
  "disable-features",
  "ThirdPartyCookiesDeprecationTrial,ThirdPartyStoragePartitioning,PartitionedCookies"
);
const CHROME_MARGIN = 10;
const PROGRESS_BAR_HEIGHT = 88;
const DEFAULT_CHROME_TOP = 100;
const DEFAULT_CHROME_RIGHT = 330;

let chromeTop = DEFAULT_CHROME_TOP;
let chromeRight = DEFAULT_CHROME_RIGHT;
let chromeBottom = CHROME_MARGIN;
let progressDockHeight = PROGRESS_BAR_HEIGHT;
const ERR_ABORTED = -3;
const GATEWAY_RETRY_MAX = 5;
const GATEWAY_RETRY_DELAY_MS = 2000;

let mainWindow = null;
let browserView = null;
const hlsCapture = new HlsCapture();
const directDownloadCapture = new DirectDownloadCapture();
const ffmpegRunner = new FfmpegRunner();
const downloadQueue = new DownloadQueue();
let librarySyncRunning = false;
let queueProcessing = false;
let tvShowPlan = null;
let tvShowProcessing = false;
let tvShowCancelRequested = false;
let lastStreamPageUrl = null;
let siteAutoLogin = null;
let queueDebug = () => {};
let gatewayRetryUrl = "";
let gatewayRetryAttempt = 0;
let gatewayRetryTimer = null;

function clearGatewayRetryTimer() {
  if (!gatewayRetryTimer) return;
  clearTimeout(gatewayRetryTimer);
  gatewayRetryTimer = null;
}

function resetGatewayRetryState() {
  clearGatewayRetryTimer();
  gatewayRetryUrl = "";
  gatewayRetryAttempt = 0;
}

async function isCloudflareBadGatewayPage(contents) {
  try {
    const snippet = await contents.executeJavaScript(
      `(document.title || "") + "\\n" + (document.body?.innerText || "").slice(0, 600)`,
      true
    );
    return /bad gateway/i.test(snippet) && /502|error code/i.test(snippet);
  } catch {
    return false;
  }
}

function scheduleGatewayRetry(contents, url) {
  if (gatewayRetryAttempt >= GATEWAY_RETRY_MAX) {
    resetGatewayRetryState();
    hideBrowserView();
    mainWindow?.webContents.send("page-gateway-failed", {
      url,
      attempts: GATEWAY_RETRY_MAX
    });
    return;
  }

  gatewayRetryAttempt += 1;
  gatewayRetryUrl = url;
  ensureBrowserVisible();
  mainWindow?.webContents.send("gateway-retry", {
    url,
    attempt: gatewayRetryAttempt,
    maxAttempts: GATEWAY_RETRY_MAX
  });

  clearGatewayRetryTimer();
  gatewayRetryTimer = setTimeout(() => {
    contents.reload();
  }, GATEWAY_RETRY_DELAY_MS);
}

function sendToRenderer(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const contents = mainWindow.webContents;
  if (!contents || contents.isDestroyed()) return false;
  try {
    contents.send(channel, payload);
    return true;
  } catch {
    return false;
  }
}

function notifyTvShowUpdate(payload = {}) {
  sendToRenderer("tv-show-updated", {
    plan: tvShowPlan,
    processing: tvShowProcessing,
    ...payload
  });
}

function notifyQueueUpdate(payload = {}) {
  sendToRenderer("download-queue-updated", {
    snapshot: downloadQueue.snapshot(),
    ...payload
  });
}

queueDebug = createQueueDebugger(streamDebug, sendToRenderer);

function setupTornadoSearchScraper(contents) {
  if (!contents || contents.isDestroyed()) return;

  const inject = () => {
    contents.executeJavaScript(buildTornadoSearchScraperScript()).catch(() => {
      // Ignore injection failures on restricted pages.
    });
  };

  contents.on("dom-ready", inject);
  contents.on("did-finish-load", inject);
}

function loadMoviePageForQueue(url, timeoutMs = 90_000) {
  const targetUrl = canonicalMoviePageUrl(url) || normalizeMovieUrl(url);
  const movieId = extractMovieIdFromUrl(targetUrl);

  queueDebug("load-start", `Opening movie page`, {
    requestedUrl: url,
    targetUrl,
    movieId
  });

  return new Promise((resolve, reject) => {
    if (!browserView?.webContents || browserView.webContents.isDestroyed()) {
      const error = new Error("Browser is not ready.");
      queueDebug("load-fail", error.message, { targetUrl, movieId });
      reject(error);
      return;
    }

    const contents = browserView.webContents;
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      contents.removeListener("did-finish-load", onFinishLoad);
      contents.removeListener("did-fail-load", onFailLoad);
    };

    const finish = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) {
        queueDebug("load-fail", error.message, { targetUrl, movieId });
        reject(error);
      } else {
        queueDebug("load-ok", "Movie page loaded", { targetUrl, movieId });
        resolve();
      }
    };

    const onFinishLoad = () => {
      setTimeout(async () => {
        try {
          const pageCheck = await contents.executeJavaScript(`({
            url: location.href,
            pathname: location.pathname,
            title: document.title || "",
            isMovie: /\\/movie\\//i.test(location.pathname),
            hasJQuery: Boolean(window.jQuery),
            hasPlayer: Boolean(window.Player),
            bodyPreview: (document.body?.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 240),
            isError: /something went wrong|please report this problem|oops/i.test((document.body?.innerText || "").toLowerCase())
          })`);

          queueDebug("load-check", pageCheck.isError ? "Site error page detected" : "Page check complete", {
            targetUrl,
            movieId,
            pageCheck
          });

          if (pageCheck.isError) {
            finish(
              new Error(
                `Movie page returned a site error. URL=${pageCheck.url || targetUrl} title="${pageCheck.title || ""}"`
              )
            );
            return;
          }
          if (!pageCheck.isMovie) {
            finish(
              new Error(
                `Did not land on a movie page. Got ${pageCheck.pathname || pageCheck.url || "unknown URL"}`
              )
            );
            return;
          }
          finish();
        } catch (error) {
          finish(error);
        }
      }, 2200);
    };

    const onFailLoad = (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame || errorCode === ERR_ABORTED) return;
      queueDebug("load-fail", "Navigation failed", {
        targetUrl,
        movieId,
        errorCode,
        errorDescription,
        validatedURL
      });
      finish(new Error(errorDescription || `Page failed to load (${errorCode})`));
    };

    const timer = setTimeout(() => {
      finish(new Error("Movie page load timed out."));
    }, timeoutMs);

    contents.on("did-finish-load", onFinishLoad);
    contents.on("did-fail-load", onFailLoad);

    resetStreamCapture();
    ensureBrowserVisible();
    contents.loadURL(targetUrl).catch((error) => finish(error));
  });
}

function loadContentPageForDownload(url, timeoutMs = 90_000) {
  const targetUrl = canonicalMoviePageUrl(url) || canonicalContentUrl(url) || normalizeMovieUrl(url) || url;
  const contentId = extractMovieIdFromUrl(targetUrl) || extractGetbuttonId(targetUrl);

  queueDebug("tv-load-start", "Opening content page", {
    requestedUrl: url,
    targetUrl,
    contentId
  });

  return new Promise((resolve, reject) => {
    if (!browserView?.webContents || browserView.webContents.isDestroyed()) {
      const error = new Error("Browser is not ready.");
      queueDebug("tv-load-fail", error.message, { targetUrl, contentId });
      reject(error);
      return;
    }

    const contents = browserView.webContents;
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      contents.removeListener("did-finish-load", onFinishLoad);
      contents.removeListener("did-fail-load", onFailLoad);
    };

    const finish = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) {
        queueDebug("tv-load-fail", error.message, { targetUrl, contentId });
        reject(error);
      } else {
        queueDebug("tv-load-ok", "Content page loaded", { targetUrl, contentId });
        resolve();
      }
    };

    const onFinishLoad = () => {
      setTimeout(async () => {
        try {
          const pageCheck = await contents.executeJavaScript(`({
            url: location.href,
            pathname: location.pathname,
            title: document.title || "",
            isContent: /\\/(?:movie|tv-series|tv|serie|series|episode|episodes|watch)\\//i.test(location.pathname),
            hasJQuery: Boolean(window.jQuery),
            bodyPreview: (document.body?.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 240),
            isError: /something went wrong|please report this problem|oops/i.test((document.body?.innerText || "").toLowerCase())
          })`);

          if (pageCheck.isError) {
            finish(new Error(`Content page returned a site error (${pageCheck.url || targetUrl}).`));
            return;
          }
          if (!pageCheck.isContent) {
            finish(
              new Error(
                `Did not land on a movie or TV episode page (${pageCheck.pathname || pageCheck.url || "unknown"}).`
              )
            );
            return;
          }
          finish();
        } catch (error) {
          finish(error);
        }
      }, 2200);
    };

    const onFailLoad = (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame || errorCode === ERR_ABORTED) return;
      finish(new Error(errorDescription || `Page failed to load (${errorCode})`));
    };

    const timer = setTimeout(() => {
      finish(new Error("Content page load timed out."));
    }, timeoutMs);

    contents.on("did-finish-load", onFinishLoad);
    contents.on("did-fail-load", onFailLoad);

    resetStreamCapture();
    ensureBrowserVisible();
    contents.loadURL(targetUrl).catch((error) => finish(error));
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function buildAniwaveDownloadTarget(streamUrl, source, { session, pageUrl, embedUrl }) {
  const remoteUrl = streamUrl;
  const headers = await streamHeadersForDownload(source?.requestHeaders || [], pageUrl, {
    targetUrl: remoteUrl,
    embedUrl,
    session
  });

  if (!shouldProxyStreamUrl(remoteUrl)) {
    const probe = await probeStream(remoteUrl, headers, findFfprobe(), 25000);
    return { remoteUrl, downloadUrl: remoteUrl, headers, probe };
  }

  await sessionHlsProxy.ensureRunning({
    session,
    pageUrl,
    embedUrl,
    requestHeaders: source?.requestHeaders || []
  });

  const downloadUrl = sessionHlsProxy.localUrl(remoteUrl);
  const probe = await probeStream(downloadUrl, [], findFfprobe(), 30000);
  return {
    remoteUrl,
    downloadUrl,
    headers: [],
    probe,
    proxied: true
  };
}

async function fetchAniwaveEpisodeStream(contents, episode, options = {}) {
  if (!contents || contents.isDestroyed()) {
    return { ok: false, error: "Browser is not ready." };
  }

  const timeoutMs = options.timeoutMs ?? 90_000;
  const startedAt = Date.now();
  const preferDub = options.preferDub !== false;

  const serverWait = await waitForAniwaveServers(contents, 35000);
  queueDebug("aniwave-wait", serverWait.ok ? "Aniwave servers loaded" : "Timed out waiting for servers", {
    episodeUrl: episode.url,
    serverWait
  });

  if (!serverWait.ok) {
    return {
      ok: false,
      error:
        "Aniwave servers did not load in time. Reload the episode in the browser and make sure the player area appears."
    };
  }

  const inspection = await inspectAniwavePlayer(contents, { preferDub });
  queueDebug("aniwave-inspect", "Inspected Aniwave player", {
    episodeUrl: episode.url,
    inspection
  });

  const availableAttempts =
    Array.isArray(inspection.attempts) && inspection.attempts.length
      ? inspection.attempts
      : buildAniwaveServerAttempts({ preferDub }).filter((attempt) => {
          if (!Array.isArray(inspection.availableServers) || !inspection.availableServers.length) {
            return true;
          }
          return inspection.availableServers.some(
            (server) =>
              server.name.toLowerCase() === attempt.server.toLowerCase() &&
              (attempt.audioType === "unknown" ||
                server.audioType === attempt.audioType ||
                server.audioType === "unknown")
          );
        });

  if (!inspection.hasPlayerArea) {
    return {
      ok: false,
      error:
        "Could not find the Aniwave player area on this page. Open the episode in the browser and make sure the video player is visible."
    };
  }

  if (!availableAttempts.length) {
    return {
      ok: false,
      error:
        "No Aniwave stream servers were found on this page. Try reloading the episode and pick a DUB or SUB server manually."
    };
  }

  let lastPlayerResult = null;
  let embedUrl = null;

  for (let index = 0; index < availableAttempts.length; index += 1) {
    if (Date.now() - startedAt >= timeoutMs) break;

    const attempt = availableAttempts[index];
    hlsCapture.clear();
    lastPlayerResult = await prepareAniwavePlayer(contents, {
      preferDub,
      clickServer: attempt.server,
      clickAudioType: attempt.audioType,
      clickSvId: attempt.svId || null
    });
    if (lastPlayerResult.iframeSrc) {
      embedUrl = lastPlayerResult.iframeSrc;
    }

    queueDebug(
      "aniwave-player",
      lastPlayerResult.ok ? `Trying ${attempt.audioType} / ${attempt.server}` : "Could not click server",
      {
        episodeUrl: episode.url,
        attempt: index + 1,
        target: attempt,
        result: lastPlayerResult
      }
    );

    if (!lastPlayerResult.ok) continue;

    const waitUntil = Date.now() + 20_000;
    while (Date.now() < waitUntil && Date.now() - startedAt < timeoutMs) {
      const pageUrl = contents.getURL() || episode.url;
      const session = contents.session;
      const playlists = hlsCapture.list();
      if (playlists.length) {
        const { resolved } = await diagnoseStreamCandidates(playlists, { pageUrl, embedUrl, session });
        if (resolved?.url) {
          const source = resolved.source || hlsCapture.bestPlaylist() || playlists[0];
          const target = await buildAniwaveDownloadTarget(resolved.url, source, {
            session,
            pageUrl,
            embedUrl
          });

          if (target.probe.status !== "ok") {
            queueDebug("aniwave-probe", "Captured stream failed ffprobe preflight", {
              episodeUrl: episode.url,
              server: attempt.server,
              embedUrl,
              proxied: Boolean(target.proxied),
              probeStatus: target.probe.status,
              probeError: target.probe.error || null,
              streamUrl: target.remoteUrl
            });
          } else {
            const audioLabel =
              lastPlayerResult.audioType === "dub"
                ? "English dub"
                : lastPlayerResult.audioType === "sub"
                  ? "Sub"
                  : null;
            const qualityLabel = [audioLabel, resolved.qualityLabel || source.qualityLabel, attempt.server]
              .filter(Boolean)
              .join(" · ");

            return {
              ok: true,
              url: target.downloadUrl,
              headers: target.headers,
              qualityLabel: qualityLabel || null,
              mode: "hls",
              audioType: lastPlayerResult.audioType || null,
              server: lastPlayerResult.server || attempt.server,
              embedUrl
            };
          }
        }
      }

      const status = await inspectAniwavePlayer(contents, { preferDub });
      if (status.iframeSrc) {
        embedUrl = status.iframeSrc;
      }

      if (!playlists.length && (status.hasIframe || status.hasVideo)) {
        const frameStreamUrl = await extractEmbedStreamFromFrames(contents);
        if (frameStreamUrl) {
          const syntheticSource = { requestHeaders: [], qualityLabel: "embed" };
          const target = await buildAniwaveDownloadTarget(frameStreamUrl, syntheticSource, {
            session,
            pageUrl,
            embedUrl
          });
          if (target.probe.status === "ok") {
            const audioLabel =
              lastPlayerResult.audioType === "dub"
                ? "English dub"
                : lastPlayerResult.audioType === "sub"
                  ? "Sub"
                  : null;
            const qualityLabel = [audioLabel, attempt.server, "embed"].filter(Boolean).join(" · ");
            queueDebug("aniwave-embed-stream", "Using stream URL from embed player", {
              episodeUrl: episode.url,
              server: attempt.server,
              embedUrl,
              proxied: Boolean(target.proxied),
              streamUrl: target.remoteUrl
            });
            return {
              ok: true,
              url: target.downloadUrl,
              headers: target.headers,
              qualityLabel,
              mode: "hls",
              audioType: lastPlayerResult.audioType || null,
              server: lastPlayerResult.server || attempt.server,
              embedUrl
            };
          }
        }
      }

      if (status.hasIframe || status.hasVideo) {
        queueDebug("aniwave-embed", "Embed detected, waiting for HLS", {
          server: attempt.server,
          audioType: attempt.audioType,
          hasIframe: status.hasIframe,
          iframeSrc: status.iframeSrc,
          playlistCount: hlsCapture.list().length
        });
      }

      await sleep(900);
    }
  }

  return {
    ok: false,
    error:
      "Could not capture an Aniwave stream after trying available servers. Reload the episode, click a DUB server manually, let it play for a few seconds, then try again.",
    player: lastPlayerResult,
    availableServers: inspection.availableServers || []
  };
}

async function runTvShowDownloadJob(destination = "local") {
  if (tvShowProcessing) {
    return { ok: false, error: "A TV show download is already running." };
  }
  if (!tvShowPlan?.episodes?.length) {
    return { ok: false, error: "Scan a TV show page first." };
  }

  tvShowProcessing = true;
  tvShowCancelRequested = false;
  ensureBrowserVisible();
  notifyTvShowUpdate({ phase: "starting" });

  const nas = loadNasConfig();
  let outputDir = outputDirectory();
  if (destination === "nas") {
    const access = ensureNasFolder(nas.videoFolder);
    if (!access.ok) {
      tvShowProcessing = false;
      notifyTvShowUpdate({ phase: "idle" });
      return { ok: false, error: access.error, needsCredentials: Boolean(access.needsCredentials) };
    }
    outputDir = access.path;
  }

  const ffmpegPath = findFfmpeg();
  const session = browserView?.webContents?.session;
  const useAniwaveHls = isAnimeMode() || getSiteProfile().id === "anime";

  try {
    const result = await runTvShowDownload(tvShowPlan, {
      outputRoot: outputDirectory(),
      outputDir,
      contentSubfolder: useAniwaveHls ? null : "TV Shows",
      runner: ffmpegRunner,
      ffmpegPath,
      shouldCancel: () => tvShowCancelRequested,
      clearJob: () => ffmpegRunner.clearJob(),
      onDebug: (step, message, data) => queueDebug(step, message, data),
      onProgress: (payload) => notifyTvShowUpdate(payload),
      loadEpisodePage: async (episodeUrl) => {
        try {
          syncAdblockerForUrl(episodeUrl);
          await loadContentPageForDownload(episodeUrl);
          if (useAniwaveHls && isAniwaveUrl(episodeUrl)) {
            const contents = browserView?.webContents;
            const serverWait = await waitForAniwaveServers(contents, 35000);
            queueDebug("aniwave-wait", serverWait.ok ? "Servers ready for episode" : "Servers not ready", {
              episodeUrl,
              serverWait
            });
          }
          return { ok: true };
        } catch (error) {
          return { ok: false, error: error.message || String(error) };
        }
      },
      fetchEpisodeLink: async (episode) => {
        const contents = browserView?.webContents;
        if (useAniwaveHls && isAniwaveUrl(episode.url)) {
          notifyTvShowUpdate({
            phase: "fetching-link",
            episode,
            label: `S${String(episode.season || 1).padStart(2, "0")}E${String(episode.episode || 0).padStart(2, "0")}`,
            showTitle: tvShowPlan?.showTitle || "Anime"
          });
          return fetchAniwaveEpisodeStream(contents, episode, { preferDub: true });
        }

        const result = await fetchFreshDirectDownloadLink(contents, { movieUrl: episode.url });
        if (!result.ok || !result.best?.url) {
          return { ok: false, error: result.error || "Could not generate episode download link." };
        }
        const rawPageUrl = contents?.getURL() || episode.url;
        const pageUrl = canonicalMoviePageUrl(rawPageUrl) || canonicalContentUrl(rawPageUrl) || rawPageUrl;
        const headers = await streamHeadersForDownload(result.best.requestHeaders || [], pageUrl, {
          targetUrl: result.best.url,
          session
        });
        return {
          ok: true,
          url: result.best.url,
          headers,
          qualityLabel: result.best.qualityLabel || null,
          mode: "direct"
        };
      },
      startEpisodeDownload: async ({ url, headers, outputPath, label, qualityLabel, mode }) => {
        if (ffmpegRunner.isJobRunning()) {
          return { ok: false, error: "Another download is already running." };
        }
        ffmpegRunner.beginPrepare({
          destination,
          phase: `Downloading ${label}...`,
          percent: 5
        });
        const startOptions = {
          outputDir: path.dirname(outputPath),
          destination,
          qualityLabel,
          phase: `Downloading ${label}...`
        };
        const result =
          mode === "hls"
            ? await ffmpegRunner.start(url, headers, path.basename(outputPath), startOptions)
            : await ffmpegRunner.startDirect(url, headers, path.basename(outputPath), startOptions);
        return result;
      }
    });

    if (!result?.ok && !result?.cancelled) {
      notifyTvShowUpdate({
        phase: "error",
        error: result?.error || "TV show download failed."
      });
    }

    return result;
  } finally {
    tvShowProcessing = false;
    tvShowCancelRequested = false;
    notifyTvShowUpdate({ phase: "idle", processing: false });
  }
}

async function runDownloadQueue() {
  if (queueProcessing) {
    return { ok: false, error: "Queue is already running." };
  }

  queueProcessing = true;
  ensureBrowserVisible();
  queueDebug("queue-start", "Queue run started", {
    pending: downloadQueue.snapshot().counts.pending,
    logPath: streamDebug.logPath()
  });
  notifyQueueUpdate({ phase: "starting" });

  try {
    return await processDownloadQueue(downloadQueue, {
      loadPage: loadMoviePageForQueue,
      fetchFreshLink: async (item) => {
        const contents = browserView?.webContents;
        const result = await fetchFreshDirectDownloadLink(contents, { movieUrl: item.movieUrl });
        if (!result.ok || !result.best) {
          queueDebug("item-fail", `No fresh link for ${item.title}`, {
            itemId: item.id,
            movieUrl: item.movieUrl,
            error: result.error
          });
          return { ok: false, error: result.error || "Could not generate a fresh download link." };
        }
        return { ok: true, link: result.best };
      },
      startDownload: (destination) =>
        startStreamDownload(destination, { directOnly: true, skipLinkPrepare: true }),
      runner: ffmpegRunner,
      clearJob: () => ffmpegRunner.clearJob(),
      stopDownload: () => ffmpegRunner.stop(),
      onProgress: (payload) => notifyQueueUpdate(payload),
      onDebug: (step, message, data) => queueDebug(step, message, data)
    });
  } finally {
    queueProcessing = false;
    queueDebug("queue-finish", "Queue run finished", downloadQueue.snapshot().counts);
    notifyQueueUpdate({ phase: "idle" });
  }
}

function resetStreamCapture(options = {}) {
  hlsCapture.clear();
  if (!options.keepDirectLinks) {
    directDownloadCapture.clear();
  }
  if (!options.keepPageUrl) {
    lastStreamPageUrl = null;
  }
  mainWindow?.webContents.send("stream-capture-reset");
}

function rememberDirectDownloadLink(url, requestHeaders = [], source = "network") {
  if (!isDirectDownloadUrl(url)) return false;

  directDownloadCapture.remember(url, requestHeaders, source);
  streamDebug.log("capture", "Direct download link captured", { url, source });
  mainWindow?.webContents.send("direct-download-found", {
    url,
    source,
    qualityLabel: directDownloadCapture.bestLink()?.qualityLabel || null,
    height: directDownloadCapture.bestLink()?.height || null
  });
  return true;
}

function resetStreamCaptureOnNavigation(url) {
  if (!url || url === "about:blank") return;

  if (isDirectDownloadUrl(url)) {
    rememberDirectDownloadLink(url, [], "navigation");
    return;
  }

  let shouldReset = true;
  if (lastStreamPageUrl) {
    try {
      const prev = new URL(lastStreamPageUrl);
      const next = new URL(url);

      if (/loadshare\.org/i.test(prev.hostname) && /\/movie\//i.test(next.pathname)) {
        shouldReset = false;
      } else {
        shouldReset = prev.origin !== next.origin || prev.pathname !== next.pathname;
      }
    } catch {
      shouldReset = true;
    }
  }

  lastStreamPageUrl = url;
  if (shouldReset) {
    resetStreamCapture();
  }
}

function navigationHistory(contents) {
  return contents.navigationHistory || contents;
}

function layoutBrowserView() {
  if (!mainWindow || !browserView) return;

  const { width, height } = mainWindow.getContentBounds();
  browserView.setBounds({
    x: CHROME_MARGIN,
    y: chromeTop,
    width: Math.max(0, width - chromeRight - CHROME_MARGIN),
    height: Math.max(0, height - chromeTop - chromeBottom)
  });
}

function setupHlsListener(session) {
  session.webRequest.onBeforeSendHeaders({ urls: ["<all_urls>"] }, (details, callback) => {
    if (/\.m3u8(?:$|[?#])/i.test(details.url)) {
      hlsCapture.remember(details.url, details.requestHeaders);
      streamDebug.log("capture", "HLS playlist seen", {
        url: details.url,
        resourceType: details.resourceType || null
      });
    }

    if (/loadshare\.org\/download\//i.test(details.url)) {
      rememberDirectDownloadLink(details.url, details.requestHeaders, "network");
    }

    callback({ cancel: false, requestHeaders: details.requestHeaders });
  });
}

function isCatalogMode() {
  return !Boolean(appProfile.hideMovieDownloader);
}

function showBrowserView() {
  if (!mainWindow || !browserView) return;
  if (isCatalogMode() && catalogBrowserLocked) {
    hideBrowserView();
    return;
  }
  mainWindow.setBrowserView(browserView);
  layoutBrowserView();
  mainWindow.webContents.send("page-load-succeeded");
}

function ensureBrowserVisible() {
  if (isCatalogMode() && catalogBrowserLocked) {
    hideBrowserView();
    return;
  }
  showBrowserView();
  mainWindow?.webContents.send("browser-content-visible");
}

function isAutomatedBrowsingActive() {
  return Boolean(tvShowProcessing || queueProcessing);
}

function hideBrowserView() {
  if (!mainWindow || !browserView) return;
  mainWindow.removeBrowserView(browserView);
}

function showSearchLanding() {
  if (!mainWindow || !browserView) return;
  resetStreamCapture();
  hideBrowserView();
  mainWindow.webContents.send("show-search-landing");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadUrlAndWait(contents, url, options = {}) {
  const timeoutMs = Number(options.timeoutMs) || 45_000;
  const settleMs = Number(options.settleMs) || 1200;

  return new Promise((resolve, reject) => {
    if (!contents || contents.isDestroyed()) {
      reject(new Error("Browser is not ready."));
      return;
    }

    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      contents.removeListener("did-finish-load", onFinishLoad);
      contents.removeListener("did-fail-load", onFailLoad);
    };

    const finish = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };

    const onFinishLoad = () => {
      setTimeout(() => finish(), settleMs);
    };

    const onFailLoad = (_event, errorCode, errorDescription, _validatedURL, isMainFrame) => {
      if (!isMainFrame || errorCode === ERR_ABORTED) return;
      finish(new Error(errorDescription || `Page failed to load (${errorCode})`));
    };

    const timer = setTimeout(() => finish(new Error("Page load timed out.")), timeoutMs);

    contents.on("did-finish-load", onFinishLoad);
    contents.on("did-fail-load", onFailLoad);
    contents.loadURL(url).catch((error) => finish(error));
  });
}

function loadSearch(query) {
  if (!browserView) return;
  resetStreamCapture();
  const url = buildSearchUrl(query);
  ensureBrowserVisible();
  browserView.webContents.loadURL(url);
  return url;
}

async function catalogSearch(query) {
  const trimmed = String(query || "").trim();
  if (!trimmed) {
    return { ok: false, error: "Enter a movie title to search.", movies: [] };
  }
  if (!browserView?.webContents || browserView.webContents.isDestroyed()) {
    return { ok: false, error: "Browser is not ready.", movies: [] };
  }

  const url = buildSearchUrl(trimmed);
  resetStreamCapture();
  hideBrowserView();

  try {
    await loadUrlAndWait(browserView.webContents, url, { settleMs: 1600 });
    await delay(400);
    const scrape = await scrapeSearchMovieLinks(browserView.webContents);
    if (!scrape.ok) {
      return { ok: false, error: scrape.error || "Search scrape failed.", query: trimmed, url, movies: [] };
    }
    if (!scrape.movies?.length) {
      return {
        ok: false,
        error: `No movies found for "${trimmed}".`,
        query: trimmed,
        url,
        movies: []
      };
    }
    return { ok: true, query: trimmed, url, movies: scrape.movies };
  } catch (error) {
    return { ok: false, error: error.message || String(error), query: trimmed, url, movies: [] };
  }
}

async function catalogOpenMovie(movieUrl, fallback = {}) {
  const targetUrl = canonicalMoviePageUrl(movieUrl) || normalizeMovieUrl(movieUrl) || String(movieUrl || "");
  if (!/\/movie\//i.test(targetUrl)) {
    return { ok: false, error: "Invalid movie URL." };
  }

  try {
    await loadMoviePageForQueue(targetUrl);
    const scrape = await scrapeMovieDetail(browserView.webContents);
    const movie = {
      movieUrl: targetUrl,
      title: scrape.movie?.title || fallback.title || titleFromMovieUrl(targetUrl),
      posterUrl: scrape.movie?.posterUrl || fallback.posterUrl || undefined,
      year: scrape.movie?.year || fallback.year || undefined
    };
    return { ok: true, movie };
  } catch (error) {
    return {
      ok: false,
      error: error.message || String(error),
      movie: {
        movieUrl: targetUrl,
        title: fallback.title || titleFromMovieUrl(targetUrl),
        posterUrl: fallback.posterUrl,
        year: fallback.year
      }
    };
  }
}

function sendNavigationState() {
  if (!mainWindow || !browserView) return;

  const contents = browserView.webContents;
  const history = navigationHistory(contents);
  mainWindow.webContents.send("navigation-state-changed", {
    canGoBack: history.canGoBack(),
    canGoForward: history.canGoForward()
  });
}

function setupBrowserNavigationHandlers() {
  const contents = browserView.webContents;

  contents.on("will-navigate", (event, url, isSameDocument, isMainFrame) => {
    if (!isMainFrame || isSameDocument || !isDirectDownloadUrl(url)) return;
    event.preventDefault();
    rememberDirectDownloadLink(url, [], "navigation-intercept");
  });

  contents.on("did-start-navigation", (_event, url, isInPlace, isMainFrame) => {
    if (!isMainFrame || !url || url === "about:blank") return;
    if (!isInPlace && url !== gatewayRetryUrl) {
      resetGatewayRetryState();
    }
    syncAdblockerForUrl(url);
    resetStreamCaptureOnNavigation(url);
  });

  contents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === ERR_ABORTED) return;

    if (isAutomatedBrowsingActive()) {
      streamDebug.log("navigation", "Load failed during automated download (keeping browser visible)", {
        errorCode,
        errorDescription,
        url: validatedURL
      });
      ensureBrowserVisible();
      return;
    }

    hideBrowserView();
    mainWindow.webContents.send("page-load-failed", {
      errorCode,
      errorDescription,
      url: validatedURL
    });
  });

  contents.on("did-finish-load", async () => {
    const url = contents.getURL();
    if (!url || url === "about:blank") return;

    if (await isCloudflareBadGatewayPage(contents)) {
      ensureBrowserVisible();
      scheduleGatewayRetry(contents, url);
      return;
    }

    resetGatewayRetryState();
    ensureBrowserVisible();
    sendNavigationState();

    if (/\/movie\//i.test(url)) {
      scanDirectDownloads(contents).catch(() => {
        // Best effort scan on movie pages.
      });
    }
  });

  contents.on("did-navigate", () => sendNavigationState());
  contents.on("did-navigate-in-page", () => sendNavigationState());
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1680,
    height: 900,
    minWidth: 1200,
    minHeight: 640,
    title: appProfile.windowTitle,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  browserView = new BrowserView({
    webPreferences: {
      partition: appProfile.browserPartition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (!isCatalogMode()) {
    mainWindow.setBrowserView(browserView);
    layoutBrowserView();
  }
  mainWindow.on("resize", layoutBrowserView);

  const browserSession = browserView.webContents.session;
  setupChromeCompatibility(browserSession, browserView.webContents);
  await setupAdblocker(browserSession);
  setupEmbedCompatibility(browserSession, browserView.webContents);
  setupHlsListener(browserSession);
  setupNavigationGuard(browserView.webContents, browserSession, SITE_HOME_URL, (details) => {
    mainWindow?.webContents.send("redirect-blocked", details);
  }, getSiteProfile().allowedDomains || []);
  siteAutoLogin = setupSiteAutoLogin(browserView.webContents, {
    loginUrl: SITE_LOGIN_URL,
    homeUrl: SITE_HOME_URL,
    loadCredentials: loadSiteCredentials,
    onDebug: (entry) => {
      streamDebug.log("site-login-debug", entry.type || "login-debug", entry);
      mainWindow?.webContents.send("site-login-debug", entry);
    },
    onResult: (result) => {
      streamDebug.log("site-login", result.status || "site login attempt", result);
      mainWindow?.webContents.send("site-login-result", result);
    }
  });
  setupBrowserNavigationHandlers();
  setupTornadoDownloadScraper(browserView.webContents);
  setupTornadoSearchScraper(browserView.webContents);
  setupTvShowScraper(browserView.webContents);

  browserView.webContents.on("console-message", (_event, _level, message) => {
    const directMarker = "[TornadoDirectDownload]";
    const directIndex = String(message || "").indexOf(directMarker);
    if (directIndex >= 0) {
      try {
        const payload = JSON.parse(String(message).slice(directIndex + directMarker.length).trim());
        if (payload?.url) {
          rememberDirectDownloadLink(payload.url, [], payload.source || "page");
        }
      } catch {
        // Ignore parse failures.
      }
    }

    const loginMarker = "[TornadoLoginDebug]";
    const loginIndex = String(message || "").indexOf(loginMarker);
    if (loginIndex < 0) return;

    try {
      const payload = JSON.parse(String(message).slice(loginIndex + loginMarker.length).trim());
      streamDebug.log("site-login-debug", payload.type || "login-debug", payload);
      mainWindow?.webContents.send("site-login-debug", payload);
    } catch {
      streamDebug.log("site-login-debug", "parse-failed", { message: String(message).slice(0, 500) });
    }
  });

  mainWindow.loadFile(path.join(__dirname, "shell.html"));
  mainWindow.webContents.once("did-finish-load", () => {
    showSearchLanding();
  });
}

ipcMain.handle("get-playlists", () => {
  const playlists = hlsCapture.list();
  const best = hlsCapture.bestPlaylist();
  const directDownloads = directDownloadCapture.list();
  const bestDirect = directDownloadCapture.bestLink();

  return {
    playlists,
    best: best
      ? {
          url: best.url,
          displayUrl: best.displayUrl,
          kind: best.kind,
          lastSeenAt: best.lastSeenAt
        }
      : null,
    directDownloads,
    bestDirect: bestDirect
      ? {
          url: bestDirect.url,
          displayUrl: bestDirect.displayUrl,
          name: bestDirect.name,
          kind: bestDirect.kind,
          qualityLabel: bestDirect.qualityLabel,
          height: bestDirect.height,
          lastSeenAt: bestDirect.lastSeenAt
        }
      : null
  };
});

ipcMain.handle("scan-direct-downloads", async () => {
  if (!browserView?.webContents || browserView.webContents.isDestroyed()) {
    return { ok: false, error: "Browser is not ready." };
  }

  const scan = await scanDirectDownloads(browserView.webContents);
  await ingestDirectLinksFromScan(scan, "manual-scan");
  const bestDirect = directDownloadCapture.bestLink();
  return {
    ok: true,
    scan,
    directDownloads: directDownloadCapture.list(),
    bestDirect
  };
});

ipcMain.handle("clear-playlists", () => {
  hlsCapture.clear();
  directDownloadCapture.clear();
  return { ok: true };
});

ipcMain.handle("diagnose-streams", async () => {
  const playlists = hlsCapture.list();
  const rawPageUrl = browserView?.webContents?.getURL() || "";
  const pageUrl = canonicalMoviePageUrl(rawPageUrl) || rawPageUrl;
  const session = browserView?.webContents?.session;
  const { report } = await diagnoseStreamCandidates(playlists, { pageUrl, session });
  const text = streamDebug.formatReport(report);
  streamDebug.log("diagnose-manual", report.summary || "manual diagnosis", {
    playlistCount: report.playlistCount
  });
  return { ok: true, report, text, logPath: streamDebug.logPath() };
});

ipcMain.handle("open-stream-debug-log", () => {
  const logPath = streamDebug.logPath();
  shell.showItemInFolder(logPath);
  return { ok: true, path: logPath };
});

ipcMain.handle("get-environment", () => {
  const nas = loadNasConfig();
  const browserSession = browserView?.webContents?.session;
  return {
    profileId: appProfile.id,
    profileLabel: appProfile.brandLabel,
    siteBaseUrl: SITE_BASE_URL,
    siteHomeUrl: SITE_HOME_URL,
    siteLoginUrl: SITE_LOGIN_URL,
    siteUsername: loadSiteCredentials().username || null,
    siteAutoLoginEnabled: Boolean(loadSiteCredentials().autoLogin),
    ffmpegPath: findFfmpeg(),
    outputDirectory: outputDirectory(),
    nasPortalUrl: nas.portalUrl,
    nasVideoFolder: nas.videoFolder,
    nasUsername: loadNasCredentials().username || null,
    adBlockerEnabled: browserSession ? isAdblockerEnabled(browserSession) : false,
    redirectProtectionEnabled: Boolean(browserView),
    currentPageUrl: browserView?.webContents?.getURL() || null,
    openAnimeButton: Boolean(appProfile.openAnimeButton),
    hideMovieDownloader: Boolean(appProfile.hideMovieDownloader),
    catalogMode: isCatalogMode(),
    landingTitle: appProfile.landingTitle || null,
    landingLead: appProfile.landingLead || null,
    defaultSidebarMode: appProfile.defaultSidebarMode || "movies",
    siteLabel: appProfile.siteLabel || "Tornado Movies",
    tvShowLead: appProfile.tvShowLead || "",
    startupLog: appProfile.startupLog || "",
    searchPlaceholder: appProfile.searchPlaceholder
  };
});

ipcMain.handle("open-anime-window", () => {
  try {
    const args = [app.getAppPath(), "--anime"];
    spawn(process.execPath, args, {
      detached: true,
      stdio: "ignore",
      cwd: path.dirname(app.getAppPath())
    }).unref();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
});

ipcMain.handle("navigate", (_event, url) => {
  if (!browserView) return { ok: false, error: "Browser is not ready." };
  resetStreamCapture();
  browserView.webContents.loadURL(url);
  return { ok: true };
});

ipcMain.handle("reload-page", () => {
  if (!browserView) return { ok: false };
  showSearchLanding();
  return { ok: true };
});

ipcMain.handle("set-catalog-browser-locked", (_event, locked = true) => {
  catalogBrowserLocked = Boolean(locked);
  if (!isCatalogMode()) {
    return { ok: true, locked: false };
  }
  if (catalogBrowserLocked) {
    hideBrowserView();
    mainWindow?.webContents.send("show-search-landing");
  }
  return { ok: true, locked: catalogBrowserLocked };
});

ipcMain.handle("go-home", () => {
  if (!browserView) return { ok: false, error: "Browser is not ready." };
  if (isCatalogMode() && catalogBrowserLocked) {
    showSearchLanding();
    return { ok: true, catalog: true };
  }
  resetStreamCapture();
  ensureBrowserVisible();
  browserView.webContents.loadURL(SITE_HOME_URL);
  return { ok: true, url: SITE_HOME_URL };
});

ipcMain.handle("get-site-credentials", () => {
  const creds = loadSiteCredentials();
  return {
    username: creds.username || null,
    autoLogin: Boolean(creds.autoLogin),
    hasPassword: Boolean(creds.password)
  };
});

ipcMain.handle("save-site-credentials", (_event, payload) => {
  saveSiteCredentials(payload || {});
  return { ok: true };
});

ipcMain.handle("get-site-login-debug", async () => {
  if (!browserView?.webContents || browserView.webContents.isDestroyed()) {
    return { ok: false, entries: [] };
  }

  try {
    const entries = await browserView.webContents.executeJavaScript(
      "Array.isArray(window.__tornadoLoginDebug) ? window.__tornadoLoginDebug : []"
    );
    return { ok: true, entries, logPath: streamDebug.logPath() };
  } catch (error) {
    return { ok: false, entries: [], error: error.message || String(error) };
  }
});

ipcMain.handle("site-login", async () => {
  if (!browserView || !siteAutoLogin) {
    return { ok: false, error: "Browser is not ready." };
  }

  const creds = loadSiteCredentials();
  if (!creds.username || !creds.password) {
    return {
      ok: false,
      error: "Save your Tornado Movies username and password first.",
      needsCredentials: true
    };
  }

  ensureBrowserVisible();
  syncAdblockerForUrl(SITE_LOGIN_URL);
  return siteAutoLogin.requestManualLogin();
});

ipcMain.handle("search-movies", async (_event, query) => {
  if (!browserView) return { ok: false, error: "Browser is not ready.", movies: [] };

  if (isCatalogMode()) {
    return catalogSearch(query);
  }

  try {
    const url = loadSearch(query);
    return { ok: true, url, query: String(query || "").trim(), movies: [] };
  } catch (error) {
    return { ok: false, error: error.message || String(error), movies: [] };
  }
});

ipcMain.handle("catalog-open-movie", async (_event, payload = {}) => {
  if (!isCatalogMode()) {
    return { ok: false, error: "Catalog mode is only available in the movie app." };
  }
  return catalogOpenMovie(payload.movieUrl, {
    title: payload.title,
    posterUrl: payload.posterUrl,
    year: payload.year
  });
});

ipcMain.handle("download-movie", async (_event, payload = {}) => {
  if (!browserView) return { ok: false, error: "Browser is not ready." };
  const movieUrl = canonicalMoviePageUrl(payload.movieUrl) || String(payload.movieUrl || "");
  if (!/\/movie\//i.test(movieUrl)) {
    return { ok: false, error: "Pick a movie from the catalog first." };
  }

  const destination = payload.destination === "nas" ? "nas" : "local";
  try {
    await loadMoviePageForQueue(movieUrl);
    return await startStreamDownload(destination, { freshLink: true });
  } catch (error) {
    ffmpegRunner.clearJob();
    return { ok: false, error: error.message || String(error) };
  }
});

ipcMain.handle("add-movie-to-queue", (_event, payload = {}) => {
  const movieUrl = canonicalMoviePageUrl(payload.movieUrl) || String(payload.movieUrl || "");
  if (!/\/movie\//i.test(movieUrl)) {
    return { ok: false, error: "Invalid movie URL." };
  }

  const destination = payload.destination === "nas" ? "nas" : "local";
  const result = downloadQueue.add(movieUrl, {
    destination,
    title: payload.title || titleFromMovieUrl(movieUrl)
  });
  if (result.ok) {
    queueDebug("queue-add", `Added "${result.item.title}"`, {
      movieUrl: result.item.movieUrl,
      movieId: extractMovieIdFromUrl(result.item.movieUrl),
      destination
    });
    notifyQueueUpdate();
  }
  return result;
});

ipcMain.handle("reload-current-page", () => {
  if (!browserView) return { ok: false, error: "Browser is not ready." };

  ensureBrowserVisible();
  browserView.webContents.reload();
  return { ok: true };
});

ipcMain.handle("get-navigation-state", () => {
  if (!browserView) {
    return { canGoBack: false, canGoForward: false };
  }

  const contents = browserView.webContents;
  const history = navigationHistory(contents);
  return {
    canGoBack: history.canGoBack(),
    canGoForward: history.canGoForward()
  };
});

ipcMain.handle("go-back", () => {
  const history = navigationHistory(browserView?.webContents);
  if (!history?.canGoBack()) {
    return { ok: false };
  }

  ensureBrowserVisible();
  history.goBack();
  return { ok: true };
});

ipcMain.handle("go-forward", () => {
  const history = navigationHistory(browserView?.webContents);
  if (!history?.canGoForward()) {
    return { ok: false };
  }

  ensureBrowserVisible();
  history.goForward();
  return { ok: true };
});

ipcMain.handle("open-warp-download", async () => {
  await shell.openExternal(WARP_DOWNLOAD_URL);
  return { ok: true, url: WARP_DOWNLOAD_URL };
});

ipcMain.handle("install-warp-vpn", async () => {
  const command = `start "Install 1.1.1.1 VPN" cmd /k "${WARP_WINGET_COMMAND}"`;
  exec(command, { shell: true });
  return { ok: true, command: WARP_WINGET_COMMAND };
});

async function ingestDirectLinksFromScan(scanResult, source = "scan") {
  const links = Array.isArray(scanResult?.links) ? scanResult.links : [];
  for (const url of links) {
    rememberDirectDownloadLink(url, [], source);
  }
  return links.length;
}

async function fetchFreshDirectDownloadLink(contents, options = {}) {
  if (!contents || contents.isDestroyed()) {
    queueDebug("link-fail", "Browser is not ready", { movieUrl: options.movieUrl || null });
    return { ok: false, error: "Browser is not ready." };
  }

  const movieUrl = options.movieUrl || contents.getURL() || "";
  const canonicalUrl = canonicalMoviePageUrl(movieUrl) || canonicalContentUrl(movieUrl) || movieUrl;
  const downloadIds = extractDownloadIds(canonicalUrl);
  const movieId = downloadIds[0] || extractMovieIdFromUrl(canonicalUrl) || extractGetbuttonId(canonicalUrl);
  if (!movieId) {
    queueDebug("link-fail", "Missing movie ID in URL", { movieUrl });
    return { ok: false, error: "Invalid movie page URL (missing movie ID)." };
  }

  queueDebug("link-start", "Generating fresh download link", {
    movieUrl: canonicalUrl,
    movieId,
    currentPage: contents.getURL() || null
  });

  directDownloadCapture.clear();

  const timeoutMs = options.timeoutMs ?? 25_000;
  const minQualityHeight = options.minQualityHeight ?? 1080;
  const startedAt = Date.now();
  let attempt = 0;
  let bestSoFar = null;
  let maxHeightSeen = 0;

  while (Date.now() - startedAt < timeoutMs) {
    attempt += 1;
    const result = await fetchDirectLinksForMovie(contents, canonicalUrl);
    await ingestDirectLinksFromScan(result, "getbutton-id");

    const best = directDownloadCapture.bestLink();
    const allLinks = directDownloadCapture.list();
    maxHeightSeen = Math.max(maxHeightSeen, result.maxHeight || 0, ...allLinks.map((link) => link.height || 0));
    if (best && (!bestSoFar || (best.height || 0) > (bestSoFar.height || 0))) {
      bestSoFar = best;
    }

    queueDebug(
      bestSoFar ? "link-found" : "link-attempt",
      bestSoFar
        ? `Fresh link captured (${bestSoFar.qualityLabel || "direct"})`
        : "Collecting download links...",
      {
        movieUrl,
        movieId,
        attempt,
        elapsedMs: Date.now() - startedAt,
        scanOk: result.ok,
        scanReason: result.reason || result.error || null,
        attempts: result.attempts || [],
        links: result.links || [],
        maxHeightSeen,
        best: bestSoFar
          ? {
              qualityLabel: bestSoFar.qualityLabel,
              displayUrl: bestSoFar.displayUrl,
              height: bestSoFar.height
            }
          : null
      }
    );

    if (bestSoFar && maxHeightSeen >= minQualityHeight) {
      return { ok: true, best: bestSoFar, elapsedMs: Date.now() - startedAt, attempt };
    }

    if (bestSoFar && attempt >= 4 && maxHeightSeen > 0) {
      return { ok: true, best: bestSoFar, elapsedMs: Date.now() - startedAt, attempt };
    }

    await new Promise((resolve) => setTimeout(resolve, 800));
  }

  if (bestSoFar) {
    return { ok: true, best: bestSoFar, elapsedMs: Date.now() - startedAt, attempt };
  }

  queueDebug("link-fail", "Timed out waiting for fresh download link", {
    movieUrl,
    movieId,
    attempt,
    elapsedMs: Date.now() - startedAt
  });

  return {
    ok: false,
    best: null,
    error: "Could not generate a fresh download link from the movie page."
  };
}

async function prepareMoviePageForDirectDownload(contents, options = {}) {
  const movieUrl = options.movieUrl || contents?.getURL() || "";
  return fetchFreshDirectDownloadLink(contents, {
    movieUrl,
    timeoutMs: options.timeoutMs ?? 30_000
  });
}

async function ensureDirectDownloadLinks() {
  const contents = browserView?.webContents;
  if (!contents || contents.isDestroyed()) {
    return { ok: false, reason: "browser-not-ready" };
  }

  const pageUrl = contents.getURL() || "";
  if (!/\/movie\//i.test(pageUrl)) {
    return { ok: false, reason: "not-movie-page" };
  }

  if (directDownloadCapture.bestLink()) {
    return { ok: true, best: directDownloadCapture.bestLink() };
  }

  const initial = await scanDirectDownloads(contents);
  await ingestDirectLinksFromScan(initial, "ensure-scan");

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const best = directDownloadCapture.bestLink();
    if (best) {
      return { ok: true, best, attempt };
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
    if (attempt % 2 === 1) {
      const scan = await scanDirectDownloads(contents);
      await ingestDirectLinksFromScan(scan, "ensure-scan");
    }
  }

  return {
    ok: Boolean(directDownloadCapture.bestLink()),
    best: directDownloadCapture.bestLink(),
    reason: directDownloadCapture.bestLink() ? null : "no-links-found"
  };
}

async function resolveDownloadTarget(options = {}) {
  const rawPageUrl = browserView?.webContents?.getURL() || "";
  const pageUrl = canonicalMoviePageUrl(rawPageUrl) || rawPageUrl;
  const bestDirect = directDownloadCapture.bestLink();

  if (bestDirect) {
    return {
      ok: true,
      resolved: {
        url: bestDirect.url,
        qualityLabel: bestDirect.qualityLabel,
        width: bestDirect.height ? Math.round((bestDirect.height * 16) / 9) : null,
        height: bestDirect.height || null,
        kind: "direct",
        source: bestDirect
      },
      playlist: bestDirect,
      mode: "direct"
    };
  }

  if (options.directOnly) {
    return {
      ok: false,
      error:
        "No direct download link found. The queue opens each movie page and fetches loadshare.org links (4K first) — this page did not return one."
    };
  }

  const playlists = hlsCapture.list();
  if (!playlists.length) {
    return {
      ok: false,
      error:
        "No download link detected yet. Open a movie page and click the site's Download option (pick 4K if available), or start playing for HLS capture."
    };
  }

  ffmpegRunner.setPhase("Analyzing captured streams for best quality...", 12);

  const session = browserView?.webContents?.session;
  const resolveOptions = { pageUrl, session };

  const { report, resolved } = await diagnoseStreamCandidates(playlists, resolveOptions);
  const debugText = streamDebug.formatReport(report);
  streamDebug.log("diagnose", report.summary || "stream diagnosis complete", {
    playlistCount: report.playlistCount,
    probeCount: report.probes?.length || 0,
    selected: report.selected?.codec || null
  });

  if (!resolved?.url) {
    const summary = report.summary || "";
    const isAuthFailure = /failed ffprobe\/fetch|proxy may need cookies/i.test(summary);
    const isPngPreview = /PNG preview|thumbnails\/images \(png\)/i.test(summary);
    return {
      ok: false,
      error: isPngPreview
        ? "Only a PNG preview stream was captured — not the full movie. Keep playing for 30–60 seconds (skip ahead if needed), then try Download again."
        : isAuthFailure
          ? "Stream was captured but could not be validated — the proxy may require an active playback session. Keep the movie playing, wait 15–20 seconds, then try Download again."
          : "No real video stream found — only thumbnails or previews were detected. Make sure the movie is playing (not paused on a poster), wait 15–20 seconds, then try again.",
      debug: report,
      debugText
    };
  }

  return {
    ok: true,
    resolved,
    playlist: resolved.source,
    debug: report,
    debugText
  };
}

async function startStreamDownload(destination = "local", options = {}) {
  ffmpegRunner.beginPrepare({
    destination,
    phase: "Preparing download...",
    percent: 8
  });

  const rawPageUrl = browserView?.webContents?.getURL() || "";
  const pageUrl = canonicalMoviePageUrl(rawPageUrl) || rawPageUrl;
  if (/\/movie\//i.test(pageUrl) && !options.skipLinkPrepare) {
    ffmpegRunner.setPhase("Looking for direct download links (4K first)...", 10);
    if (options.freshLink) {
      directDownloadCapture.clear();
      await fetchFreshDirectDownloadLink(browserView.webContents);
    } else {
      await ensureDirectDownloadLinks();
    }
  }

  const target = await resolveDownloadTarget({ directOnly: Boolean(options.directOnly) });
  if (!target.ok) {
    ffmpegRunner.clearJob();
    if (target.debugText) {
      mainWindow?.webContents.send("stream-debug-report", {
        text: target.debugText,
        report: target.debug
      });
    }
    return target;
  }

  ffmpegRunner.setPhase(
    target.mode === "direct"
      ? `Direct ${target.resolved.qualityLabel || "download"} link found...`
      : "Checking stream with ffprobe...",
    15
  );

  const { resolved, playlist } = target;

  const ffprobePath = findFfprobe();
  if (ffprobePath && target.mode !== "direct") {
    const preProbeHeaders = await streamHeadersForDownload(playlist.requestHeaders, pageUrl, {
      targetUrl: resolved.url,
      session: browserView?.webContents?.session
    });
    const preProbe = await probeStream(resolved.url, preProbeHeaders, ffprobePath);
    if (preProbe.status === "invalid") {
      ffmpegRunner.clearJob();
      return {
        ok: false,
        error:
          "Selected stream is a PNG preview slideshow, not the movie. Keep playing for 30–60 seconds, then try Download again.",
        debug: target.debug,
        debugText: target.debugText
      };
    }
    if (preProbe.status === "ok") {
      resolved.streamIndex = preProbe.streamIndex;
      resolved.codec = preProbe.codec;
      resolved.width = preProbe.width || resolved.width;
      resolved.height = preProbe.height || resolved.height;
    }
  }

  ffmpegRunner.setPhase(
    target.mode === "direct"
      ? `Direct ${resolved.qualityLabel || "download"} link found. Downloading poster...`
      : `Best stream found (${resolved.qualityLabel || "best available"}). Downloading poster...`,
    22
  );
  const nas = loadNasConfig();
  let outputDir = outputDirectory();

  if (destination === "nas") {
    const access = ensureNasFolder(nas.videoFolder);
    if (!access.ok) {
      ffmpegRunner.clearJob();
      return {
        ok: false,
        error: access.error,
        needsCredentials: Boolean(access.needsCredentials)
      };
    }
    outputDir = access.path;
  }

  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const directName = playlist?.name?.replace(/_\d{3,4}$/i, "");
    const outputName =
      (directName ? `${directName}.mp4` : null) ||
      outputNameFromPageUrl(pageUrl) ||
      `movie-${stamp}.mp4`;
    const videoOutputPath = path.join(outputDir, safeOutputName(outputName, resolved.url));

    let artworkPath = null;
    try {
      artworkPath = await saveArtworkForPage(
        browserView?.webContents,
        playlist.requestHeaders,
        videoOutputPath
      );
    } catch {
      // Artwork is optional; continue when poster download fails.
    }

    ffmpegRunner.setPhase(
      target.mode === "direct"
        ? `Starting direct ${resolved.qualityLabel || "file"} download...`
        : "Starting FFmpeg and capturing stream to MP4...",
      30
    );

    const downloadHeaders = await streamHeadersForDownload(playlist.requestHeaders, pageUrl, {
      targetUrl: resolved.url,
      session: browserView?.webContents?.session
    });
    const ffmpegPath = findFfmpeg();
    const downloadOptions = {
      outputDir,
      destination,
      artworkPath,
      qualityLabel: resolved.qualityLabel,
      videoStreamIndex: resolved.streamIndex,
      session: browserView?.webContents?.session,
      onComplete: (job) => {
        const posterPath = findPosterForVideo(job.outputPath) || job.artworkPath;
        if (!posterPath || !ffmpegPath) return;

        setImmediate(() => {
          embedPosterInVideoAsync(ffmpegPath, job.outputPath, posterPath, {
            removePosterAfterEmbed: true
          })
            .then((result) => {
              if (result.ok) {
                streamDebug.log("poster", "Poster embedded in video file", job.outputPath);
                mainWindow?.webContents.send("poster-embedded", {
                  outputPath: job.outputPath
                });
              } else if (result.error) {
                streamDebug.log("poster", "Poster embed failed", {
                  outputPath: job.outputPath,
                  error: result.error
                });
              }
            })
            .catch(() => {
              // Poster embedding is optional and runs in the background.
            });
        });
      },
      onFinished: (code) => {
        if (code === 0) {
          resetStreamCapture();
        }
      }
    };

    const result =
      target.mode === "direct"
        ? await ffmpegRunner.startDirect(
            resolved.url,
            downloadHeaders,
            outputName,
            downloadOptions
          )
        : await ffmpegRunner.start(
            resolved.url,
            downloadHeaders,
            outputName,
            downloadOptions
          );

    return {
      ok: true,
      ...result,
      artworkPath,
      destination,
      nasPortalUrl: destination === "nas" ? nas.portalUrl : null,
      quality: {
        label: resolved.qualityLabel,
        width: resolved.width,
        height: resolved.height
      },
      playlist: {
        url: playlist.displayUrl,
        kind: playlist.kind
      }
    };
  } catch (error) {
    ffmpegRunner.clearJob();
    return { ok: false, error: error.message || String(error) };
  }
}

ipcMain.handle("download-current-stream", async () => startStreamDownload("local"));

ipcMain.handle("save-to-nas", async () => startStreamDownload("nas"));

ipcMain.handle("get-download-queue", () => ({
  ok: true,
  processing: queueProcessing,
  snapshot: downloadQueue.snapshot(),
  debugLogPath: streamDebug.logPath()
}));

ipcMain.handle("get-queue-debug", () => ({
  ok: true,
  entries: recentQueueDebugEntries(streamDebug, 60),
  logPath: streamDebug.logPath()
}));

ipcMain.handle("add-current-to-queue", (_event, destination = "local") => {
  const rawPageUrl = browserView?.webContents?.getURL() || "";
  const pageUrl = canonicalMoviePageUrl(rawPageUrl) || rawPageUrl;
  if (!/\/movie\//i.test(pageUrl)) {
    return { ok: false, error: "Open a movie page first, then add it to the queue." };
  }

  const result = downloadQueue.add(pageUrl, { destination, title: titleFromMovieUrl(pageUrl) });
  if (result.ok) {
    queueDebug("queue-add", `Added "${result.item.title}"`, {
      movieUrl: result.item.movieUrl,
      movieId: extractMovieIdFromUrl(result.item.movieUrl),
      destination
    });
    notifyQueueUpdate();
  }
  return result;
});

ipcMain.handle("add-search-results-to-queue", async (_event, destination = "local", movies = null) => {
  let list = Array.isArray(movies) ? movies : null;
  if (!list?.length) {
    const scrape = await scrapeSearchMovieLinks(browserView?.webContents);
    if (!scrape.ok || !scrape.movies?.length) {
      return {
        ok: false,
        error: scrape.error || "No movies found. Search the catalog first."
      };
    }
    list = scrape.movies;
  }

  const result = downloadQueue.addMany(list, destination);
  queueDebug("queue-add-many", `Added ${result.added?.length || 0} movies from search`, {
    found: list.length,
    added: result.added?.map((item) => ({
      title: item.title,
      movieUrl: item.movieUrl,
      movieId: extractMovieIdFromUrl(item.movieUrl)
    })),
    skipped: result.skipped
  });
  notifyQueueUpdate();
  return { ok: true, ...result, found: list.length };
});

ipcMain.handle("remove-from-queue", (_event, id) => {
  const result = downloadQueue.remove(String(id || ""));
  if (result.ok) notifyQueueUpdate();
  return result;
});

ipcMain.handle("clear-download-queue", () => {
  const result = downloadQueue.clear();
  if (result.ok) notifyQueueUpdate();
  return result;
});

ipcMain.handle("start-download-queue", async (_event, destination = "local") => {
  if (queueProcessing) {
    return { ok: false, error: "Queue is already running." };
  }

  if (!downloadQueue.nextPending()) {
    return { ok: false, error: "Queue is empty. Add movies first." };
  }

  const normalizedDestination = destination === "nas" ? "nas" : "local";
  downloadQueue.setPendingDestination(normalizedDestination);
  notifyQueueUpdate();

  runDownloadQueue().catch((error) => {
    streamDebug.log("queue", "Queue run failed", { error: error.message || String(error) });
    notifyQueueUpdate({ phase: "error", error: error.message || String(error) });
  });

  return { ok: true, started: true, destination: normalizedDestination };
});

ipcMain.handle("stop-download-queue", async () => {
  downloadQueue.requestCancel();
  await ffmpegRunner.stop();
  notifyQueueUpdate({ phase: "stopping" });
  return { ok: true };
});

ipcMain.handle("scan-tv-show", async () => {
  const contents = browserView?.webContents;
  if (!contents || contents.isDestroyed()) {
    return { ok: false, error: "Browser is not ready." };
  }

  const scan = await scrapeTvShowFromPage(contents);
  if (!scan.ok) {
    return {
      ok: false,
      error:
        scan.error ||
        (isAniwaveUrl(contents.getURL() || "")
          ? "Could not find episodes on this Aniwave page. Open a watch URL like /watch/show-name/ep-1, then scan again."
          : "Could not find episodes for this season. Open a specific season page with its episode list visible, then scan again.")
    };
  }

  const pageUrl = contents.getURL() || "";
  tvShowPlan = {
    showTitle: scan.showTitle,
    season: scan.season || scan.episodes[0]?.season || 1,
    showUrl: scan.showUrl || pageUrl,
    episodes: scan.episodes,
    scannedAt: Date.now(),
    notes: scan.notes || []
  };
  notifyTvShowUpdate({ phase: "scanned" });
  queueDebug("tv-scan", `Scanned ${scan.showTitle} season ${tvShowPlan.season}`, {
    episodeCount: scan.episodeCount,
    season: tvShowPlan.season,
    showUrl: tvShowPlan.showUrl
  });

  return { ok: true, plan: tvShowPlan };
});

ipcMain.handle("get-tv-show-plan", () => ({
  ok: true,
  processing: tvShowProcessing,
  plan: tvShowPlan
}));

ipcMain.handle("clear-tv-show-plan", () => {
  if (tvShowProcessing) {
    return { ok: false, error: "Stop the TV download before clearing the plan." };
  }
  tvShowPlan = null;
  notifyTvShowUpdate({ phase: "cleared" });
  return { ok: true };
});

ipcMain.handle("start-tv-show-download", async (_event, destination = "local") => {
  if (queueProcessing) {
    return { ok: false, error: "Stop the movie queue before starting a TV show download." };
  }
  if (ffmpegRunner.isJobRunning()) {
    return { ok: false, error: "A download is already running." };
  }

  const normalizedDestination = destination === "nas" ? "nas" : "local";
  runTvShowDownloadJob(normalizedDestination).catch((error) => {
    streamDebug.log("tv-show", "TV show download failed", { error: error.message || String(error) });
    notifyTvShowUpdate({ phase: "error", error: error.message || String(error) });
  });

  return { ok: true, started: true, destination: normalizedDestination };
});

ipcMain.handle("stop-tv-show-download", async () => {
  tvShowCancelRequested = true;
  await ffmpegRunner.stop();
  notifyTvShowUpdate({ phase: "stopping" });
  return { ok: true };
});

ipcMain.handle("open-nas-portal", async () => {
  const nas = loadNasConfig();
  await shell.openExternal(nas.portalUrl);
  return { ok: true, url: nas.portalUrl };
});

ipcMain.handle("get-nas-credentials", () => {
  const creds = loadNasCredentials();
  return {
    username: creds.username,
    hasPassword: Boolean(creds.password)
  };
});

ipcMain.handle("connect-nas", () => {
  const nas = loadNasConfig();
  return prepareNasAccess(nas.videoFolder);
});

ipcMain.handle("save-nas-credentials", (_event, payload) => {
  saveNasCredentials(payload || {});
  const nas = loadNasConfig();
  return prepareNasAccess(nas.videoFolder, loadNasCredentials());
});

ipcMain.handle("sync-movies-to-nas", async () => {
  if (librarySyncRunning) {
    return { ok: false, error: "A library sync is already running." };
  }

  const nas = loadNasConfig();
  librarySyncRunning = true;
  let syncAlive = true;

  try {
    const result = await syncLocalMoviesToNas(
      outputDirectory(),
      nas.videoFolder,
      (progress) => {
        if (!sendToRenderer("library-sync-progress", progress)) {
          syncAlive = false;
        }
      },
      { shouldContinue: () => syncAlive }
    );
    return result;
  } finally {
    librarySyncRunning = false;
  }
});

ipcMain.handle("embed-movie-poster", async (_event, filePath) => {
  const videoPath = String(filePath || "");
  if (!videoPath) {
    return { ok: false, error: "No movie file selected." };
  }

  const posterPath = findPosterForVideo(videoPath);
  if (!posterPath) {
    return { ok: false, error: "No poster image found next to this movie." };
  }

  const ffmpegPath = findFfmpeg();
  if (!ffmpegPath) {
    return { ok: false, error: "ffmpeg was not found." };
  }

  const result = await embedPosterInVideoAsync(ffmpegPath, videoPath, posterPath, {
    removePosterAfterEmbed: true
  });

  if (!result.ok) {
    return { ok: false, error: result.error || "Could not embed poster." };
  }

  return { ok: true, outputPath: videoPath };
});

ipcMain.handle("download-status", () => ffmpegRunner.getStatus());

ipcMain.handle("clear-download-job", () => {
  ffmpegRunner.clearJob();
  return { ok: true };
});

ipcMain.handle("set-progress-dock-height", (_event, height) => {
  const next = Number(height);
  progressDockHeight =
    Number.isFinite(next) && next >= PROGRESS_BAR_HEIGHT
      ? Math.round(next)
      : PROGRESS_BAR_HEIGHT;
  layoutBrowserView();
  return { ok: true, height: progressDockHeight };
});

ipcMain.handle("set-chrome-layout", (_event, layout) => {
  if (layout?.top != null) {
    const nextTop = Math.round(Number(layout.top));
    if (Number.isFinite(nextTop) && nextTop >= 48) chromeTop = nextTop;
  }
  if (layout?.right != null) {
    const nextRight = Math.round(Number(layout.right));
    if (Number.isFinite(nextRight) && nextRight >= 0) chromeRight = nextRight;
  }
  if (layout?.bottom != null) {
    const nextBottom = Math.round(Number(layout.bottom));
    if (Number.isFinite(nextBottom) && nextBottom >= CHROME_MARGIN) chromeBottom = nextBottom;
  }
  layoutBrowserView();
  return { ok: true, top: chromeTop, right: chromeRight, bottom: chromeBottom };
});

ipcMain.handle("stop-download", async () => ffmpegRunner.stop());

ipcMain.handle("open-output-folder", () => {
  shell.openPath(outputDirectory());
  return { ok: true };
});

ipcMain.handle("get-downloaded-movies", () => {
  const nas = loadNasConfig();
  prepareNasAccess(nas.videoFolder);
  return listDownloadedMovies({
    localDir: outputDirectory(),
    nasDir: nas.videoFolder
  });
});

ipcMain.handle("open-downloaded-movie", async (_event, filePath) => {
  if (!filePath || typeof filePath !== "string") {
    return { ok: false, error: "Invalid file path." };
  }

  const result = await shell.openPath(filePath);
  if (result) {
    return { ok: false, error: result };
  }

  return { ok: true };
});

ipcMain.handle("reveal-downloaded-movie", (_event, filePath) => {
  if (!filePath || typeof filePath !== "string") {
    return { ok: false, error: "Invalid file path." };
  }

  shell.showItemInFolder(filePath);
  return { ok: true };
});

ipcMain.handle("open-library-folder", (_event, location) => {
  const nas = loadNasConfig();
  const folderPath = location === "nas" ? nas.videoFolder : outputDirectory();
  shell.openPath(folderPath);
  return { ok: true, path: folderPath };
});

ipcMain.handle("show-output-folder", async () => {
  await dialog.showMessageBox(mainWindow, {
    type: "info",
    title: "Movies folder",
    message: "Videos are saved here:",
    detail: outputDirectory()
  });
  return { ok: true };
});

app.whenReady().then(async () => {
  cleanupStaleDownloadArtifacts(outputDirectory());
  const nas = loadNasConfig();
  cleanupStaleDownloadArtifacts(nas.videoFolder);
  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
