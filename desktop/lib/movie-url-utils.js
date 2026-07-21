const { SITE_BASE_URL } = require("./site-config");

function canonicalMoviePageUrl(url, baseUrl = SITE_BASE_URL) {
  try {
    const parsed = new URL(String(url || ""), baseUrl);
    const match = parsed.pathname.match(/\/movie\/([^/]+)\/([^/]+)/i);
    if (!match) return null;
    return `${parsed.origin}/movie/${match[1]}/${match[2]}`.replace(/\/$/, "");
  } catch {
    const match = String(url || "").match(/\/movie\/([^/]+)\/([^/?#]+)/i);
    if (!match) return null;
    try {
      return new URL(`/movie/${match[1]}/${match[2]}`, baseUrl).toString().replace(/\/$/, "");
    } catch {
      return null;
    }
  }
}

function extractMovieIdFromUrl(url) {
  const canonical = canonicalMoviePageUrl(url) || String(url || "");
  const match = canonical.match(/\/movie\/[^/]+\/([^/?#]+)/i);
  return match ? match[1] : null;
}

function normalizeMovieUrl(url, baseUrl = SITE_BASE_URL) {
  return canonicalMoviePageUrl(url, baseUrl) || String(url || "").trim();
}

module.exports = {
  canonicalMoviePageUrl,
  extractMovieIdFromUrl,
  normalizeMovieUrl
};
