const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

function quoteConcatPath(filePath) {
  const normalized = path.resolve(String(filePath)).replace(/\\/g, "/");
  return `'${normalized.replace(/'/g, "'\\''")}'`;
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function parseSpeed(value) {
  const match = String(value || "").match(/([\d.]+)x/);
  return match ? `${match[1]}x` : null;
}

function parseTimeSeconds(value) {
  const match = String(value || "").match(/(?:(\d+):)?(\d{2}):(\d{2})(?:\.(\d+))?/);
  if (!match) return 0;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  const fraction = Number((match[4] || "0").padEnd(3, "0").slice(0, 3)) / 1000;
  return hours * 3600 + minutes * 60 + seconds + fraction;
}

function sumInputBytes(files) {
  return files.reduce((sum, filePath) => {
    try {
      return sum + fs.statSync(filePath).size;
    } catch {
      return sum;
    }
  }, 0);
}

async function stitchMp4Files({
  inputPaths,
  outputPath,
  ffmpegPath,
  logPath = null,
  onProgress = null,
  shouldCancel = null
}) {
  const files = (inputPaths || []).filter((filePath) => {
    try {
      return fs.statSync(filePath).size > 0;
    } catch {
      return false;
    }
  });

  if (!files.length) {
    throw new Error("No episode files available to stitch.");
  }

  if (!ffmpegPath) {
    throw new Error("FFmpeg is required to stitch episodes into one file.");
  }

  const listPath = `${outputPath}.concat.txt`;
  const progressPath = `${outputPath}.stitch.progress`;
  const listBody = files.map((filePath) => `file ${quoteConcatPath(filePath)}`).join("\n");
  fs.writeFileSync(listPath, listBody, "utf8");

  const totalInputBytes = sumInputBytes(files);
  const startedAt = Date.now();

  const emitProgress = (extra = {}) => {
    if (typeof onProgress !== "function") return;

    let outputSize = 0;
    try {
      if (fs.existsSync(outputPath)) {
        outputSize = fs.statSync(outputPath).size;
      }
    } catch {
      // Output file may not exist yet.
    }

    const percent =
      totalInputBytes > 0
        ? Math.min(99, Math.round((outputSize / totalInputBytes) * 100))
        : null;

    onProgress({
      phase: "stitching",
      episodeCount: files.length,
      outputPath,
      outputSize,
      totalBytes: totalInputBytes,
      percent,
      elapsedSeconds: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
      ...extra
    });
  };

  const args = [
    "-hide_banner",
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    "-progress",
    progressPath,
    outputPath
  ];

  emitProgress({ status: "starting" });

  return new Promise((resolve, reject) => {
    const logStream = logPath ? fs.createWriteStream(logPath, { flags: "a" }) : null;
    if (logStream) {
      logStream.write(`\n--- Stitch ---\n${ffmpegPath} ${args.join(" ")}\n`);
    }

    const process = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = "";
    let lastSpeed = null;
    let lastOutTime = null;
    let progressTimer = null;

    const stopProgressTimer = () => {
      if (!progressTimer) return;
      clearInterval(progressTimer);
      progressTimer = null;
    };

    const readProgressFile = () => {
      try {
        const text = fs.readFileSync(progressPath, "utf8");
        const fields = {};
        for (const line of text.split(/\r?\n/)) {
          const separator = line.indexOf("=");
          if (separator === -1) continue;
          fields[line.slice(0, separator)] = line.slice(separator + 1);
        }
        if (fields.speed) lastSpeed = parseSpeed(fields.speed) || fields.speed;
        if (fields.out_time) lastOutTime = fields.out_time;
      } catch {
        // Progress file may not exist yet.
      }
    };

    progressTimer = setInterval(() => {
      if (typeof shouldCancel === "function" && shouldCancel()) {
        try {
          process.kill("SIGTERM");
        } catch {
          // Ignore kill failures.
        }
        return;
      }

      readProgressFile();
      emitProgress({
        status: "running",
        speed: lastSpeed,
        outTime: lastOutTime,
        outTimeSeconds: parseTimeSeconds(lastOutTime)
      });
    }, 500);

    process.stderr.on("data", (chunk) => {
      const text = String(chunk);
      stderr += text;
      if (logStream) logStream.write(text);

      const speedMatch = text.match(/speed=\s*([\d.]+x)/);
      if (speedMatch) lastSpeed = speedMatch[1];
      const timeMatch = text.match(/time=(\d{2}:\d{2}:\d{2}(?:\.\d{2})?)/);
      if (timeMatch) lastOutTime = timeMatch[1];
    });

    process.on("error", (error) => {
      stopProgressTimer();
      try {
        fs.unlinkSync(listPath);
      } catch {}
      try {
        fs.unlinkSync(progressPath);
      } catch {}
      if (logStream) logStream.end();
      reject(error);
    });

    process.on("close", (code) => {
      stopProgressTimer();
      try {
        fs.unlinkSync(listPath);
      } catch {}
      try {
        fs.unlinkSync(progressPath);
      } catch {}
      if (logStream) logStream.end();

      if (code === 0) {
        let outputSize = 0;
        try {
          outputSize = fs.statSync(outputPath).size;
        } catch {
          // Ignore stat failures.
        }
        emitProgress({
          status: "complete",
          percent: 100,
          speed: lastSpeed,
          outTime: lastOutTime
        });
        resolve({ ok: true, outputPath, inputCount: files.length, outputSize });
        return;
      }

      reject(new Error(stderr.trim() || `FFmpeg stitch failed (exit ${code}).`));
    });
  });
}

module.exports = {
  stitchMp4Files,
  formatBytes
};
