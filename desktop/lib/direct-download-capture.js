const DIRECT_DOWNLOAD_PATTERN = /loadshare\.org\/download\//i;
const MAX_LINKS = 30;

const FORWARDED_HEADER_NAMES = new Set([
  "accept",
  "accept-language",
  "authorization",
  "cookie",
  "origin",
  "referer",
  "user-agent"
]);

function decodeHtmlEntities(text) {
  return String(text || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function normalizeUrl(url) {
  try {
    const text = decodeHtmlEntities(String(url || "").trim());
    if (!text || /&amp;/i.test(text)) return "";
    const parsed = new URL(text);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function shouldForwardHeader(name) {
  const lower = String(name || "").toLowerCase();
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
  return normalizeRequestHeaders(requestHeaders)
    .filter((header) => {
      if (!shouldForwardHeader(header.name)) return false;
      return !/[\r\n]/.test(header.name) && !/[\r\n]/.test(header.value);
    })
    .map((header) => ({ name: header.name, value: header.value }));
}

function parseQuality(url) {
  const text = String(url || "");

  const pathMatch = text.match(/\/(2160|1440|1080|720|480|360)(?:\?|&|$|\/)/i);
  if (pathMatch) return Number(pathMatch[1]);

  const nameMatch = text.match(/[?&]name=[^&]*_(\d{3,4})/i);
  if (nameMatch) return Number(nameMatch[1]);

  const labelMatch = text.match(/(?:^|[?&/_-])(4k|uhd|2160p|1440p|1080p|720p)(?:[?&/_-]|$)/i);
  if (labelMatch) {
    const label = labelMatch[1].toLowerCase();
    if (label === "4k" || label === "uhd" || label === "2160p") return 2160;
    if (label === "1440p") return 1440;
    if (label === "1080p") return 1080;
    if (label === "720p") return 720;
  }

  return 0;
}

function isDirectDownloadUrl(url) {
  return DIRECT_DOWNLOAD_PATTERN.test(String(url || ""));
}

function qualityLabel(height) {
  if (!height) return "direct";
  if (height >= 2160) return "4K";
  if (height >= 1440) return "1440p";
  if (height >= 1080) return "1080p";
  if (height >= 720) return "720p";
  return `${height}p`;
}

function displayName(url) {
  try {
    const parsed = new URL(url);
    const name = parsed.searchParams.get("name");
    if (name) return name;
    const parts = parsed.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || parsed.hostname;
  } catch {
    return "direct download";
  }
}

function safeDisplayUrl(url) {
  try {
    const parsed = new URL(url);
    const name = parsed.searchParams.get("name");
    return name ? `${parsed.hostname}/.../${name}` : `${parsed.hostname}/.../download`;
  } catch {
    return "loadshare download";
  }
}

class DirectDownloadCapture {
  constructor() {
    this.links = [];
  }

  remember(url, requestHeaders = [], source = "network") {
    if (!DIRECT_DOWNLOAD_PATTERN.test(String(url || ""))) return;

    const normalizedUrl = normalizeUrl(url);
    if (!normalizedUrl) return;
    const height = parseQuality(normalizedUrl);
    const now = Date.now();
    const capturedHeaders = captureHeaders(requestHeaders);

    const existing = this.links.find((item) => item.url === normalizedUrl);
    if (existing) {
      existing.lastSeenAt = now;
      existing.hits += 1;
      if (capturedHeaders.length) existing.requestHeaders = capturedHeaders;
      return;
    }

    this.links.unshift({
      url: normalizedUrl,
      displayUrl: safeDisplayUrl(normalizedUrl),
      name: displayName(normalizedUrl),
      height,
      qualityLabel: qualityLabel(height),
      kind: "direct",
      source,
      requestHeaders: capturedHeaders,
      firstSeenAt: now,
      lastSeenAt: now,
      hits: 1
    });

    this.links = this.links.slice(0, MAX_LINKS);
  }

  list() {
    return this.links.map((item) => ({ ...item }));
  }

  bestLink() {
    if (!this.links.length) return null;

    const sourceRank = (source) => {
      if (source === "network") return 3;
      if (source === "navigation") return 2;
      return 1;
    };

    return [...this.links].sort((a, b) => {
      const qualityDiff = (b.height || 0) - (a.height || 0);
      if (qualityDiff !== 0) return qualityDiff;
      const sourceDiff = sourceRank(b.source) - sourceRank(a.source);
      if (sourceDiff !== 0) return sourceDiff;
      return b.lastSeenAt - a.lastSeenAt;
    })[0];
  }

  clear() {
    this.links = [];
  }
}

module.exports = {
  DirectDownloadCapture,
  DIRECT_DOWNLOAD_PATTERN,
  isDirectDownloadUrl,
  parseQuality,
  qualityLabel,
  normalizeUrl,
  decodeHtmlEntities
};
