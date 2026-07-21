const fs = require("fs");
const path = require("path");
const { relatedPosterFiles } = require("./poster-utils");

function removeBrokenDownload(outputPath) {
  const targets = [
    outputPath,
    `${outputPath}.progress`,
    `${outputPath}.log`,
    ...relatedPosterFiles(outputPath)
  ];

  for (const target of targets) {
    try {
      if (target && fs.existsSync(target)) fs.unlinkSync(target);
    } catch {
      // Best effort cleanup.
    }
  }
}

function cleanupPosterTempFiles(folderPath) {
  if (!folderPath || !fs.existsSync(folderPath)) return 0;

  let names;
  try {
    names = fs.readdirSync(folderPath);
  } catch {
    return 0;
  }

  let removed = 0;
  for (const name of names) {
    if (!/\.poster-tmp\.mp4$/i.test(name)) continue;
    const tempPath = path.join(folderPath, name);
    const finalPath = tempPath.replace(/\.poster-tmp\.mp4$/i, ".mp4");
    if (fs.existsSync(finalPath)) {
      try {
        fs.unlinkSync(tempPath);
        removed += 1;
      } catch {
        // Best effort cleanup.
      }
    }
  }

  return removed;
}

function cleanupStaleDownloadArtifacts(folderPath) {
  if (!folderPath || !fs.existsSync(folderPath)) return;

  cleanupPosterTempFiles(folderPath);

  let names;
  try {
    names = fs.readdirSync(folderPath);
  } catch {
    return;
  }

  for (const name of names) {
    if (!name.endsWith(".progress")) continue;
    removeBrokenDownload(path.join(folderPath, name.slice(0, -".progress".length)));
  }
}

module.exports = {
  removeBrokenDownload,
  cleanupPosterTempFiles,
  cleanupStaleDownloadArtifacts
};
