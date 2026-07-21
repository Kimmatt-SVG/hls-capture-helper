const HLS_URL_PATTERN = /\.m3u8(?:$|[?#])/i;
const MAX_PLAYLISTS = 40;

const FORWARDED_HEADER_NAMES = new Set([
  "accept",
  "accept-language",
  "authorization",
  "cookie",
  "origin",
  "referer",
  "user-agent"
]);

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

function classifyPlaylist(url) {
  const lower = url.toLowerCase();
  if (lower.includes("master.m3u8")) return "master";
  if (lower.includes("playlist.m3u8") || lower.includes("index.m3u8")) return "media";
  return "playlist";
}

function shouldForwardHeader(name) {
  const lower = name.toLowerCase();
  return FORWARDED_HEADER_NAMES.has(lower) || lower.startsWith("x-");
}

function normalizeRequestHeaders(requestHeaders = []) {
  if (Array.isArray(requestHeaders)) {
    return requestHeaders.flatMap((header) => {
      if (!header || typeof header.name !== "string") return [];
      if (Array.isArray(header.value)) {
        return header.value.map((value) => ({ name: header.name, value: String(value) }));
      }
      if (typeof header.value === "string") {
        return [{ name: header.name, value: header.value }];
      }
      return [];
    });
  }

  if (requestHeaders && typeof requestHeaders === "object") {
    return Object.entries(requestHeaders).flatMap(([name, value]) => {
      if (Array.isArray(value)) {
        return value.map((entry) => ({ name, value: String(entry) }));
      }
      if (typeof value === "string") {
        return [{ name, value }];
      }
      return [];
    });
  }

  return [];
}

function captureHeaders(requestHeaders = []) {
  const normalized = normalizeRequestHeaders(requestHeaders);
  if (!Array.isArray(normalized)) return [];

  return normalized
    .filter((header) => {
      if (!shouldForwardHeader(header.name)) return false;
      return !/[\r\n]/.test(header.name) && !/[\r\n]/.test(header.value);
    })
    .map((header) => ({ name: header.name, value: header.value }));
}

function safePlaylistUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    const fileName = pathParts[pathParts.length - 1] || "";
    const safePath = fileName ? `/.../${fileName}` : "/";
    const suffix = parsed.search ? "?[redacted]" : "";
    return `${parsed.origin}${safePath}${suffix}`;
  } catch {
    return "[redacted playlist URL]";
  }
}

function kindPriority(kind) {
  if (kind === "master") return 5;
  if (kind === "media") return 3;
  return 1;
}

function playlistUrlPriority(url) {
  const lower = String(url).toLowerCase();
  if (/master\.m3u8/.test(lower)) return 4;
  if (/index\.m3u8|playlist\.m3u8/.test(lower)) return 2;
  if (/\?t\.m3u8$/.test(lower)) return -3;
  return 0;
}

function isLikelyVideoPlaylistUrl(url) {
  const lower = String(url).toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg|bmp)(\?|#|$)/.test(lower)) return false;
  if (/(^|\/)(thumb|poster|sprite|storyboard)[^/]*\.m3u8(\?|#|$)/.test(lower)) return false;
  return true;
}

class HlsCapture {
  constructor() {
    this.playlists = [];
  }

  remember(url, requestHeaders = []) {
    if (!HLS_URL_PATTERN.test(url)) return;

    const normalizedUrl = normalizeUrl(url);
    const existing = this.playlists.find((item) => item.url === normalizedUrl);
    const now = Date.now();
    const capturedHeaders = captureHeaders(requestHeaders);

    if (existing) {
      existing.lastSeenAt = now;
      existing.hits += 1;
      if (capturedHeaders.length) {
        existing.requestHeaders = capturedHeaders;
      }
      return;
    }

    this.playlists.unshift({
      url: normalizedUrl,
      displayUrl: safePlaylistUrl(normalizedUrl),
      kind: classifyPlaylist(normalizedUrl),
      requestHeaders: capturedHeaders,
      firstSeenAt: now,
      lastSeenAt: now,
      hits: 1
    });

    this.playlists = this.playlists.slice(0, MAX_PLAYLISTS);
  }

  list() {
    return this.playlists.map((item) => ({ ...item }));
  }

  bestPlaylist() {
    const playable = this.playlists.filter((item) => isLikelyVideoPlaylistUrl(item.url));
    if (!playable.length) return null;

    return [...playable].sort((a, b) => {
      const urlDiff = playlistUrlPriority(b.url) - playlistUrlPriority(a.url);
      if (urlDiff !== 0) return urlDiff;
      const recencyDiff = b.lastSeenAt - a.lastSeenAt;
      if (recencyDiff !== 0) return recencyDiff;
      const kindDiff = kindPriority(b.kind) - kindPriority(a.kind);
      if (kindDiff !== 0) return kindDiff;
      return b.hits - a.hits;
    })[0];
  }

  clear() {
    this.playlists = [];
  }
}

module.exports = {
  HlsCapture,
  safePlaylistUrl
};
