const fs = require("fs");
const os = require("os");
const path = require("path");
const fetch = require("cross-fetch");
const { net } = require("electron");
const { probeStream } = require("./stream-probe");
const { enrichRequestHeaders } = require("./session-headers");

function headersToFetchObject(requestHeaders = []) {
  const headers = {};
  for (const header of requestHeaders) {
    if (header?.name && header?.value) {
      headers[header.name] = header.value;
    }
  }
  return headers;
}

function resolveSegmentUrl(baseUrl, relativeUrl) {
  return new URL(relativeUrl, baseUrl).toString();
}

function pickFirstSegmentUrl(playlistText, playlistUrl) {
  const lines = playlistText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  for (const line of lines) {
    if (/\.(png|jpe?g|gif|webp|svg|bmp)(\?|#|$)/i.test(line)) continue;
    return resolveSegmentUrl(playlistUrl, line);
  }

  return null;
}

function bufferLooksLikePng(buffer) {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return true;
  }

  for (let index = 0; index <= buffer.length - 8; index += 1) {
    if (
      buffer[index] === 0x89 &&
      buffer[index + 1] === 0x50 &&
      buffer[index + 2] === 0x4e &&
      buffer[index + 3] === 0x47
    ) {
      return true;
    }
  }

  return false;
}

function bufferLooksLikeMpegTs(buffer) {
  if (buffer.length < 376) return false;

  let syncCount = 0;
  for (let offset = 0; offset < 376; offset += 188) {
    if (buffer[offset] === 0x47) syncCount += 1;
  }

  return syncCount >= 2;
}

async function fetchSegmentBytes(segmentUrl, requestHeaders = [], options = {}, byteLimit = 65536) {
  const enriched = await enrichRequestHeaders(requestHeaders, {
    pageUrl: options.pageUrl,
    targetUrl: segmentUrl,
    embedUrl: options.embedUrl,
    session: options.session
  });
  const headers = headersToFetchObject(enriched);

  const response = options.session
    ? await net.fetch(segmentUrl, { session: options.session, headers, redirect: "follow" })
    : await fetch(segmentUrl, { headers, redirect: "follow" });

  if (!response.ok) {
    throw new Error(`Could not fetch segment (${response.status}).`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer.slice(0, byteLimit);
}

async function probeSegmentBuffer(buffer, ffprobePath) {
  if (!ffprobePath || !buffer?.length) {
    return { status: "unknown" };
  }

  const tempPath = path.join(os.tmpdir(), `hls-seg-${Date.now()}-${Math.random().toString(16).slice(2)}.ts`);

  try {
    fs.writeFileSync(tempPath, buffer);
    return await probeStream(tempPath, [], ffprobePath, 15000);
  } finally {
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // Best effort cleanup.
    }
  }
}

async function validatePlaylistSegmentContent(playlistText, playlistUrl, requestHeaders = [], options = {}) {
  const segmentUrl = pickFirstSegmentUrl(playlistText, playlistUrl);
  if (!segmentUrl) {
    return { status: "unknown", reason: "no segment URL in playlist" };
  }

  let buffer;
  try {
    buffer = await fetchSegmentBytes(segmentUrl, requestHeaders, options);
  } catch (error) {
    return { status: "unknown", reason: error.message || String(error), segmentUrl };
  }

  if (bufferLooksLikePng(buffer)) {
    return { status: "invalid", codec: "png", reason: "segment contains PNG data", segmentUrl };
  }

  const ffprobePath = options.ffprobePath;
  if (ffprobePath) {
    const probe = await probeSegmentBuffer(buffer, ffprobePath);
    if (probe.status === "ok") {
      return {
        status: "ok",
        codec: probe.codec,
        width: probe.width,
        height: probe.height,
        streamIndex: probe.streamIndex,
        segmentUrl
      };
    }
    if (probe.status === "invalid") {
      return {
        status: "invalid",
        codec: probe.codec || "png",
        reason: "segment ffprobe detected image stream",
        segmentUrl
      };
    }
  }

  if (bufferLooksLikeMpegTs(buffer)) {
    return { status: "likely-video", codec: "mpegts", segmentUrl };
  }

  return { status: "unknown", reason: "segment format inconclusive", segmentUrl };
}

module.exports = {
  pickFirstSegmentUrl,
  validatePlaylistSegmentContent,
  bufferLooksLikePng,
  bufferLooksLikeMpegTs
};
