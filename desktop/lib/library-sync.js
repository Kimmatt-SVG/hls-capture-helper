const fs = require("fs");
const path = require("path");
const { createReadStream, createWriteStream } = require("fs");
const { Transform } = require("stream");
const { pipeline } = require("stream/promises");
const { scanMoviesFolder } = require("./download-library");
const { ensureNasFolder } = require("./nas-config");
const { relatedPosterFiles } = require("./poster-utils");

const VIDEO_EXTENSIONS = new Set([".mp4", ".mkv", ".mov", ".m4v", ".webm", ".ts"]);
const PROGRESS_THROTTLE_MS = 250;

function isVideoFileName(name) {
  return VIDEO_EXTENSIONS.has(path.extname(name).toLowerCase());
}

function fileExistsOnNas(nasDir, fileName) {
  const target = path.join(nasDir, fileName);
  try {
    return fs.existsSync(target) && fs.statSync(target).isFile();
  } catch {
    return false;
  }
}

function relatedFilesForVideo(videoPath) {
  const files = [videoPath];
  for (const poster of relatedPosterFiles(videoPath)) {
    if (!files.includes(poster)) files.push(poster);
  }

  return files;
}

function buildSyncTasks(movies, nasDir) {
  const tasks = [];
  let skippedMovies = 0;

  for (const movie of movies) {
    const related = relatedFilesForVideo(movie.filePath);
    const pending = related.filter((src) => !fileExistsOnNas(nasDir, path.basename(src)));

    if (!pending.length) {
      skippedMovies += 1;
      continue;
    }

    for (const src of pending) {
      let size = 0;
      try {
        size = fs.statSync(src).size;
      } catch {
        continue;
      }

      tasks.push({
        src,
        dest: path.join(nasDir, path.basename(src)),
        fileName: path.basename(src),
        movieFileName: movie.fileName,
        size
      });
    }
  }

  return {
    tasks,
    skippedMovies,
    totalBytes: tasks.reduce((sum, task) => sum + task.size, 0)
  };
}

function createThrottledProgress(onChunk, totalBytes, startOffset = 0, shouldContinue = () => true) {
  let copiedBytes = startOffset;
  let lastEmit = 0;

  const emit = (force = false) => {
    if (!shouldContinue()) return;
    const now = Date.now();
    if (!force && now - lastEmit < PROGRESS_THROTTLE_MS && copiedBytes < totalBytes) {
      return;
    }
    lastEmit = now;
    try {
      onChunk?.({ copiedBytes, totalBytes });
    } catch {
      // Progress listener may fail if the renderer closed.
    }
  };

  const transform = new Transform({
    transform(chunk, _encoding, callback) {
      if (!shouldContinue()) {
        callback(new Error("Copy cancelled"));
        return;
      }
      copiedBytes += chunk.length;
      emit();
      callback(null, chunk);
    },
    flush(callback) {
      if (shouldContinue()) emit(true);
      callback();
    }
  });

  return { transform, emit };
}

async function getResumeState(src, dest, totalBytes) {
  try {
    if (!fs.existsSync(dest)) {
      return { startOffset: 0, writeFlags: "w" };
    }

    const destStat = await fs.promises.stat(dest);
    if (destStat.size >= totalBytes) {
      return { startOffset: totalBytes, writeFlags: null, complete: true };
    }

    if (destStat.size > 0) {
      return { startOffset: destStat.size, writeFlags: "a" };
    }
  } catch {
    // Fall back to a fresh copy.
  }

  return { startOffset: 0, writeFlags: "w" };
}

async function copyFileWithProgress(src, dest, onChunk, shouldContinue = () => true) {
  const stat = await fs.promises.stat(src);
  const totalBytes = stat.size;
  const resume = await getResumeState(src, dest, totalBytes);

  if (resume.complete) {
    try {
      onChunk?.({ copiedBytes: totalBytes, totalBytes });
    } catch {
      // Ignore progress listener failures.
    }
    return totalBytes;
  }

  const { transform, emit } = createThrottledProgress(
    onChunk,
    totalBytes,
    resume.startOffset,
    shouldContinue
  );
  const readStream = createReadStream(
    src,
    resume.startOffset > 0 ? { start: resume.startOffset } : undefined
  );
  const writeStream = createWriteStream(dest, { flags: resume.writeFlags || "w" });

  if (resume.startOffset > 0) {
    emit(true);
  }

  try {
    await pipeline(readStream, transform, writeStream);
  } catch (error) {
    if (error?.message === "Copy cancelled") {
      readStream.destroy();
      writeStream.destroy();
      throw error;
    }
    throw error;
  }

  emit(true);
  return totalBytes;
}

function createProgressEmitter(onProgress, shouldContinue = () => true) {
  let lastEmit = 0;

  return (payload) => {
    if (!shouldContinue()) return;
    const now = Date.now();
    const force = payload.phase === "preparing" || payload.phase === "complete";
    if (!force && now - lastEmit < PROGRESS_THROTTLE_MS) {
      return;
    }
    lastEmit = now;
    try {
      onProgress?.(payload);
    } catch {
      // Progress listener may fail if the renderer closed.
    }
  };
}

async function syncLocalMoviesToNas(localDir, nasDir, onProgress, options = {}) {
  const shouldContinue = options.shouldContinue || (() => true);
  const local = scanMoviesFolder(localDir, "local");
  if (!local.accessible) {
    return { ok: false, error: "Local Movies folder is not accessible." };
  }

  const nasAccess = ensureNasFolder(nasDir);
  if (!nasAccess.ok) {
    return {
      ok: false,
      error: nasAccess.error,
      needsCredentials: Boolean(nasAccess.needsCredentials)
    };
  }

  const emitProgress = createProgressEmitter(onProgress, shouldContinue);
  const movies = local.movies;

  emitProgress({
    phase: "preparing",
    fileName: null,
    index: 0,
    total: movies.length,
    copied: 0,
    skipped: 0,
    failed: 0,
    fileBytes: 0,
    fileTotalBytes: 0,
    overallBytes: 0,
    overallTotalBytes: 0,
    overallPercent: null
  });

  const { tasks, skippedMovies, totalBytes } = buildSyncTasks(movies, nasDir);
  let overallBytes = 0;
  const copiedMovies = new Set();
  let failed = 0;
  const errors = [];

  if (!tasks.length) {
    emitProgress({
      phase: "complete",
      fileName: null,
      index: movies.length,
      total: movies.length,
      copied: 0,
      skipped: skippedMovies,
      failed: 0,
      fileBytes: 0,
      fileTotalBytes: 0,
      overallBytes: 0,
      overallTotalBytes: 0,
      overallPercent: 100
    });

    return {
      ok: true,
      copied: 0,
      skipped: skippedMovies,
      failed: 0,
      total: movies.length,
      errors: []
    };
  }

  for (let index = 0; index < tasks.length; index += 1) {
    if (!shouldContinue()) break;

    const task = tasks[index];

    emitProgress({
      phase: "copying",
      fileName: task.fileName,
      movieFileName: task.movieFileName,
      index: index + 1,
      total: tasks.length,
      copied: copiedMovies.size,
      skipped: skippedMovies,
      failed,
      fileBytes: 0,
      fileTotalBytes: task.size,
      overallBytes,
      overallTotalBytes: totalBytes,
      overallPercent:
        totalBytes > 0 ? Math.min(99, Math.round((overallBytes / totalBytes) * 100)) : null
    });

    try {
      await copyFileWithProgress(
        task.src,
        task.dest,
        ({ copiedBytes, totalBytes: fileTotal }) => {
          const currentOverall = overallBytes + copiedBytes;
          emitProgress({
            phase: "copying",
            fileName: task.fileName,
            movieFileName: task.movieFileName,
            index: index + 1,
            total: tasks.length,
            copied: copiedMovies.size,
            skipped: skippedMovies,
            failed,
            fileBytes: copiedBytes,
            fileTotalBytes: fileTotal,
            overallBytes: currentOverall,
            overallTotalBytes: totalBytes,
            overallPercent:
              totalBytes > 0
                ? Math.min(99, Math.round((currentOverall / totalBytes) * 100))
                : null
          });
        },
        shouldContinue
      );

      overallBytes += task.size;
      if (isVideoFileName(task.fileName)) {
        copiedMovies.add(task.movieFileName);
      }
    } catch (error) {
      if (error?.message === "Copy cancelled") {
        break;
      }
      failed += 1;
      errors.push({
        fileName: task.fileName,
        error: error.message || String(error)
      });
    }
  }

  const copied = copiedMovies.size;

  emitProgress({
    phase: "complete",
    fileName: null,
    index: tasks.length,
    total: tasks.length,
    copied,
    skipped: skippedMovies,
    failed,
    fileBytes: 0,
    fileTotalBytes: 0,
    overallBytes,
    overallTotalBytes: totalBytes,
    overallPercent: 100
  });

  return {
    ok: true,
    copied,
    skipped: skippedMovies,
    failed,
    total: movies.length,
    errors
  };
}

module.exports = {
  syncLocalMoviesToNas
};
