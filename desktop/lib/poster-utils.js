const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const VIDEO_EXT_PATTERN = /\.(mp4|mkv|mov|m4v|webm|ts)$/i;

function videoBasename(videoPath) {
  return path.basename(videoPath, path.extname(videoPath));
}

function posterPathForVideo(videoPath, extension = ".jpg") {
  return videoPath.replace(VIDEO_EXT_PATTERN, `-poster${extension}`);
}

function mediaServerPosterPath(videoPath, extension = ".jpg") {
  return path.join(path.dirname(videoPath), `${videoBasename(videoPath)}${extension}`);
}

function findPosterForVideo(videoPath) {
  const base = videoPath.replace(VIDEO_EXT_PATTERN, "");
  const candidates = [
    `${base}-poster.jpg`,
    `${base}-poster.jpeg`,
    `${base}-poster.png`,
    `${base}-poster.webp`,
    `${base}.jpg`,
    `${base}.jpeg`,
    `${base}.png`,
    `${base}.webp`
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // Try next candidate.
    }
  }

  return null;
}

function relatedPosterFiles(videoPath) {
  const seen = new Set();
  const files = [];

  for (const candidate of [
    findPosterForVideo(videoPath),
    posterPathForVideo(videoPath),
    mediaServerPosterPath(videoPath)
  ]) {
    if (!candidate || seen.has(candidate)) continue;
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        seen.add(candidate);
        files.push(candidate);
      }
    } catch {
      // Skip unreadable poster files.
    }
  }

  return files;
}

function embedPosterInVideo(ffmpegPath, videoPath, posterPath) {
  if (!ffmpegPath || !posterPath || !fs.existsSync(videoPath) || !fs.existsSync(posterPath)) {
    return { ok: false };
  }

  const tempPath = `${videoPath}.poster-tmp.mp4`;
  try {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  } catch {
    // Best effort cleanup.
  }

  const result = spawnSync(
    ffmpegPath,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      videoPath,
      "-i",
      posterPath,
      "-map",
      "0",
      "-map",
      "1",
      "-c",
      "copy",
      "-c:v:1",
      "mjpeg",
      "-disposition:v:1",
      "attached_pic",
      "-y",
      tempPath
    ],
    { encoding: "utf8", windowsHide: true }
  );

  if (result.status !== 0) {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {
      // Ignore cleanup errors.
    }
    return { ok: false, error: result.stderr?.trim() || "Could not embed poster." };
  }

  try {
    fs.renameSync(tempPath, videoPath);
    return { ok: true, path: videoPath };
  } catch (error) {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {
      // Ignore cleanup errors.
    }
    return { ok: false, error: error.message };
  }
}

function embedPosterInVideoAsync(ffmpegPath, videoPath, posterPath, options = {}) {
  return new Promise((resolve) => {
    if (!ffmpegPath || !posterPath || !fs.existsSync(videoPath) || !fs.existsSync(posterPath)) {
      resolve({ ok: false });
      return;
    }

    const tempPath = `${videoPath}.poster-tmp.mp4`;
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {
      // Best effort cleanup.
    }

    const child = spawn(
      ffmpegPath,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        videoPath,
        "-i",
        posterPath,
        "-map",
        "0",
        "-map",
        "1",
        "-c",
        "copy",
        "-c:v:1",
        "mjpeg",
        "-disposition:v:1",
        "attached_pic",
        "-y",
        tempPath
      ],
      { windowsHide: true }
    );

    child.on("close", (code) => {
      if (code !== 0) {
        try {
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        } catch {
          // Ignore cleanup errors.
        }
        resolve({ ok: false, error: "Could not embed poster." });
        return;
      }

      try {
        fs.renameSync(tempPath, videoPath);
        if (options.removePosterAfterEmbed) {
          try {
            fs.unlinkSync(posterPath);
          } catch {
            // Keep sidecar poster if cleanup fails.
          }
        }
        resolve({ ok: true, path: videoPath });
      } catch (error) {
        try {
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        } catch {
          // Ignore cleanup errors.
        }
        resolve({ ok: false, error: error.message });
      }
    });

    child.on("error", (error) => {
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch {
        // Ignore cleanup errors.
      }
      resolve({ ok: false, error: error.message });
    });
  });
}

module.exports = {
  videoBasename,
  posterPathForVideo,
  mediaServerPosterPath,
  findPosterForVideo,
  relatedPosterFiles,
  embedPosterInVideo,
  embedPosterInVideoAsync
};
