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
  const dir = path.dirname(videoPath);
  const candidates = [
    `${base}-poster.jpg`,
    `${base}-poster.jpeg`,
    `${base}-poster.png`,
    `${base}-poster.webp`,
    `${base}.jpg`,
    `${base}.jpeg`,
    `${base}.png`,
    `${base}.webp`,
    path.join(dir, "poster.jpg"),
    path.join(dir, "poster.jpeg"),
    path.join(dir, "poster.png"),
    path.join(dir, "folder.jpg"),
    path.join(dir, "cover.jpg")
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

function extractVideoPoster(ffmpegPath, videoPath, outputPath, options = {}) {
  if (!ffmpegPath || !videoPath || !outputPath) {
    return { ok: false, error: "Missing ffmpeg or paths." };
  }
  if (!fs.existsSync(videoPath)) {
    return { ok: false, error: "Video not found." };
  }

  try {
    if (fs.existsSync(outputPath) && fs.statSync(outputPath).isFile() && fs.statSync(outputPath).size > 1024) {
      return { ok: true, path: outputPath, cached: true };
    }
  } catch {
    // Continue and regenerate.
  }

  const seekSeconds = Number.isFinite(options.seekSeconds) ? options.seekSeconds : 8;
  const width = Number.isFinite(options.width) ? options.width : 400;
  const tempPath = `${outputPath}.tmp.jpg`;

  try {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  } catch {
    // Best effort.
  }

  const result = spawnSync(
    ffmpegPath,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      String(Math.max(0, seekSeconds)),
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-vf",
      `scale=${width}:-2`,
      "-q:v",
      "4",
      "-y",
      tempPath
    ],
    { encoding: "utf8", windowsHide: true, timeout: 45000 }
  );

  if (result.status !== 0 || !fs.existsSync(tempPath)) {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {
      // Ignore.
    }
    return { ok: false, error: result.stderr?.trim() || "Could not extract poster frame." };
  }

  try {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.renameSync(tempPath, outputPath);
  } catch (error) {
    try {
      fs.copyFileSync(tempPath, outputPath);
      fs.unlinkSync(tempPath);
    } catch (copyError) {
      return { ok: false, error: copyError.message || error.message };
    }
  }

  return { ok: true, path: outputPath, cached: false };
}

module.exports = {
  videoBasename,
  posterPathForVideo,
  mediaServerPosterPath,
  findPosterForVideo,
  relatedPosterFiles,
  embedPosterInVideo,
  embedPosterInVideoAsync,
  extractVideoPoster
};
