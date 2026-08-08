const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const {
  findPosterForVideo,
  posterPathForVideo,
  relatedPosterFiles
} = require("./poster-utils");

const VIDEO_EXTENSIONS = new Set([".mp4", ".mkv", ".mov", ".m4v", ".webm", ".ts"]);
const MIN_VIDEO_BYTES = 100 * 1024;

function isVideoFile(name) {
  return VIDEO_EXTENSIONS.has(path.extname(name).toLowerCase());
}

function titleFromFilename(filename) {
  const base = path.basename(filename, path.extname(filename));
  const cleaned = base
    .replace(/[-_]+/g, " ")
    .replace(/\s+\d{3,}$/, "")
    .trim();

  if (!cleaned) return base;

  return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
}

function scanMoviesFolder(folderPath, location, options = {}) {
  const maxDepth = Number.isInteger(options.maxDepth) ? options.maxDepth : 3;

  if (!folderPath) {
    return {
      location,
      folderPath: "",
      exists: false,
      accessible: true,
      error: null,
      movies: []
    };
  }

  if (!fs.existsSync(folderPath)) {
    return {
      location,
      folderPath,
      exists: false,
      accessible: true,
      error: null,
      movies: []
    };
  }

  const movies = [];

  const walk = (dir, depth) => {
    let names;
    try {
      names = fs.readdirSync(dir);
    } catch (error) {
      if (depth === 0) {
        throw error;
      }
      return;
    }

    for (const name of names) {
      const filePath = path.join(dir, name);
      let stat;
      try {
        stat = fs.statSync(filePath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        if (depth < maxDepth) walk(filePath, depth + 1);
        continue;
      }

      if (!stat.isFile() || !isVideoFile(name) || stat.size < MIN_VIDEO_BYTES) continue;

      const posterPath = findPosterForVideo(filePath);
      movies.push({
        filePath,
        fileName: name,
        title: titleFromFilename(name),
        size: stat.size,
        modifiedAt: stat.mtimeMs,
        posterUrl: posterPath ? pathToFileURL(posterPath).href : null
      });
    }
  };

  try {
    walk(folderPath, 0);
  } catch (error) {
    return {
      location,
      folderPath,
      exists: true,
      accessible: false,
      error: error.message,
      movies: []
    };
  }

  movies.sort((a, b) => b.modifiedAt - a.modifiedAt);

  return {
    location,
    folderPath,
    exists: true,
    accessible: true,
    error: null,
    movies
  };
}

function listDownloadedMovies({ localDir, nasDir }) {
  const local = scanMoviesFolder(localDir, "local");
  const nas = scanMoviesFolder(nasDir, "nas");

  return {
    local,
    nas,
    totalCount: local.movies.length + nas.movies.length
  };
}

module.exports = {
  listDownloadedMovies,
  scanMoviesFolder,
  titleFromFilename,
  posterPathForVideo,
  findPosterForVideo,
  relatedPosterFiles
};
