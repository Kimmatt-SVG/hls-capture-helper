const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const INVALID_VIDEO_CODECS = new Set(["png", "mjpeg", "gif", "bmp", "webp", "svg", "unknown"]);
const VALID_VIDEO_CODECS = new Set([
  "h264",
  "hevc",
  "av1",
  "vp9",
  "vp8",
  "mpeg4",
  "mpeg2video",
  "mpeg1video",
  "h263",
  "prores",
  "theora"
]);

function findFfprobe(ffmpegPath = null) {
  const candidates = [];

  if (ffmpegPath) {
    const dir = path.dirname(ffmpegPath);
    candidates.push(path.join(dir, process.platform === "win32" ? "ffprobe.exe" : "ffprobe"));
  }

  const fromPath = process.env.PATH?.split(path.delimiter)
    .map((dir) => path.join(dir, process.platform === "win32" ? "ffprobe.exe" : "ffprobe"))
    .find((candidate) => fs.existsSync(candidate));
  if (fromPath) candidates.push(fromPath);

  candidates.push(
    "C:\\ffmpeg\\bin\\ffprobe.exe",
    "C:\\Program Files\\ffmpeg\\bin\\ffprobe.exe",
    path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WinGet", "Links", "ffprobe.exe")
  );

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }

  return null;
}

function ffprobeHeaderArgs(headers = []) {
  const args = [];
  const headerLines = [];

  for (const header of headers) {
    if (!header?.name || !header?.value) continue;
    if (/[\r\n]/.test(header.name) || /[\r\n]/.test(header.value)) continue;

    const lower = header.name.toLowerCase();
    if (lower === "user-agent") {
      args.push("-user_agent", header.value);
    } else if (lower === "referer") {
      args.push("-referer", header.value);
    } else {
      headerLines.push(`${header.name}: ${header.value}`);
    }
  }

  if (headerLines.length) {
    args.push("-headers", `${headerLines.join("\r\n")}\r\n`);
  }

  return args;
}

function isUsableVideoStream(stream) {
  if (!stream || stream.codec_type !== "video") return false;

  const codec = String(stream.codec_name || "").toLowerCase();
  if (INVALID_VIDEO_CODECS.has(codec)) return false;
  if (VALID_VIDEO_CODECS.has(codec)) return true;

  const width = Number(stream.width) || 0;
  const height = Number(stream.height) || 0;
  return width >= 320 && height >= 180;
}

function mergeProbeHeaders(requestHeaders = [], pageUrl = "") {
  const headers = [...requestHeaders];
  const hasHeader = (name) =>
    headers.some((header) => header.name?.toLowerCase() === name.toLowerCase());

  if (pageUrl && !hasHeader("referer")) {
    headers.push({ name: "Referer", value: pageUrl });
  }

  if (pageUrl && !hasHeader("origin")) {
    try {
      headers.push({ name: "Origin", value: new URL(pageUrl).origin });
    } catch {
      // Ignore invalid page URLs.
    }
  }

  return headers;
}

function summarizeStreams(streams = []) {
  return streams.map((stream) => ({
    index: Number(stream.index),
    codec_type: stream.codec_type || "?",
    codec_name: stream.codec_name || "?",
    width: Number(stream.width) || 0,
    height: Number(stream.height) || 0
  }));
}

function pickBestVideoStream(streams = []) {
  const summary = summarizeStreams(streams);
  const videoStreams = streams.filter((stream) => stream.codec_type === "video");
  if (!videoStreams.length) {
    return { status: "unknown", streams: summary };
  }

  let best = null;

  for (const stream of videoStreams) {
    const codec = String(stream.codec_name || "").toLowerCase();
    if (INVALID_VIDEO_CODECS.has(codec)) continue;
    if (!isUsableVideoStream(stream)) continue;

    const width = Number(stream.width) || 0;
    const height = Number(stream.height) || 0;
    const score = width * height || (VALID_VIDEO_CODECS.has(codec) ? 100000 : 0);
    if (!best || score > best.score) {
      best = {
        status: "ok",
        codec,
        width,
        height,
        streamIndex: Number(stream.index),
        score,
        streams: summary
      };
    }
  }

  if (best) return best;

  const onlyImageStreams = videoStreams.every((stream) =>
    INVALID_VIDEO_CODECS.has(String(stream.codec_name || "").toLowerCase())
  );
  if (onlyImageStreams) {
    return {
      status: "invalid",
      codec: videoStreams[0]?.codec_name || "png",
      streams: summary
    };
  }

  return { status: "unknown", streams: summary };
}

function probeStream(url, headers = [], ffprobePath, timeoutMs = 35000) {
  return new Promise((resolve) => {
    if (!ffprobePath || !url) {
      resolve({ status: "unknown" });
      return;
    }

    const args = [
      "-hide_banner",
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_streams",
      "-protocol_whitelist",
      "file,http,https,tcp,tls,crypto",
      "-analyzeduration",
      "20000000",
      "-probesize",
      "20000000",
      ...ffprobeHeaderArgs(headers),
      url
    ];

    const child = spawn(ffprobePath, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish({ status: "unknown" });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", () => finish({ status: "unknown", error: "ffprobe failed to start" }));

    child.on("close", (code) => {
      if (code !== 0) {
        const errLine = stderr.split(/\r?\n/).filter(Boolean).pop() || `exit ${code}`;
        finish({ status: "unknown", error: errLine });
        return;
      }

      try {
        const payload = JSON.parse(stdout);
        finish(pickBestVideoStream(payload?.streams || []));
      } catch {
        finish({ status: "unknown", error: "could not parse ffprobe output" });
      }
    });
  });
}

module.exports = {
  findFfprobe,
  probeStream,
  mergeProbeHeaders,
  pickBestVideoStream,
  isUsableVideoStream,
  VALID_VIDEO_CODECS,
  INVALID_VIDEO_CODECS
};
