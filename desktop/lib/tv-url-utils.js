const { SITE_BASE_URL } = require("./site-config");
const { isAniwaveUrl, ANIWAVE_WATCH_PATTERN } = require("./aniwave-scraper");

const TV_PAGE_PATTERN = /\/(?:tv-series|tv|serie|series)\//i;
const EPISODE_PAGE_PATTERN = /\/(?:episode|episodes|watch)\//i;

function parseSeasonEpisode(text) {
  const source = String(text || "");
  const patterns = [
    /\bS(\d{1,2})\s*E(\d{1,3})\b/i,
    /\b(\d{1,2})x(\d{1,3})\b/,
    /season[-_\s]?(\d{1,2}).*?episode[-_\s]?(\d{1,3})/i,
    /episode[-_\s]?(\d{1,3})/i
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (!match) continue;
    if (match.length >= 3) {
      return {
        season: Number.parseInt(match[1], 10) || 1,
        episode: Number.parseInt(match[2], 10) || 1
      };
    }
    return {
      season: 1,
      episode: Number.parseInt(match[1], 10) || 1
    };
  }

  return { season: 1, episode: 0 };
}

function canonicalContentUrl(url, baseUrl = SITE_BASE_URL) {
  try {
    const parsed = new URL(String(url || ""), baseUrl);
    const pathname = parsed.pathname.replace(/\/+$/, "");
    const movieMatch = pathname.match(/\/movie\/([^/]+)\/([^/]+)/i);
    if (movieMatch) {
      return `${parsed.origin}/movie/${movieMatch[1]}/${movieMatch[2]}`;
    }

    const tvMatch = pathname.match(/\/(?:tv-series|tv|serie|series)\/([^/]+)\/([^/]+)/i);
    if (tvMatch) {
      return `${parsed.origin}${pathname.split("/").slice(0, 5).join("/")}`.replace(/\/$/, "");
    }

    const episodeMatch = pathname.match(
      /\/(?:episode|episodes)\/([^/]+)\/([^/]+)/i
    );
    if (episodeMatch) {
      return `${parsed.origin}/episode/${episodeMatch[1]}/${episodeMatch[2]}`;
    }

    const aniwaveMatch = pathname.match(/\/watch\/([^/]+)(?:\/ep-(\d+))?/i);
    if (aniwaveMatch) {
      const slug = aniwaveMatch[1];
      const episode = aniwaveMatch[2];
      return episode
        ? `${parsed.origin}/watch/${slug}/ep-${episode}`
        : `${parsed.origin}/watch/${slug}`;
    }

    return `${parsed.origin}${pathname}`.replace(/\/$/, "");
  } catch {
    return String(url || "").trim();
  }
}

function extractEpisodeWatchId(url) {
  const text = String(url || "");
  const watchMatch = text.match(/\/([A-Za-z0-9]+)-watching\.html?$/i);
  if (watchMatch?.[1]) return watchMatch[1];

  const segments = text.split("/").filter(Boolean);
  const last = segments[segments.length - 1] || "";
  const stripped = last.replace(/-watching\.html?$/i, "");
  if (stripped && stripped !== last) return stripped;
  return null;
}

function extractGetbuttonId(url) {
  const canonical = canonicalContentUrl(url) || String(url || "");
  const watchId = extractEpisodeWatchId(canonical);
  if (watchId) return watchId;

  const patterns = [
    /\/movie\/[^/]+\/([^/?#]+)/i,
    /\/(?:tv-series|tv|serie|series)\/[^/]+\/[^/]+\/[^/]+\/([^/?#]+)/i,
    /\/(?:tv-series|tv|serie|series)\/[^/]+\/([^/?#]+)/i,
    /\/(?:episode|episodes)\/[^/]+\/([^/?#]+)/i
  ];

  for (const pattern of patterns) {
    const match = canonical.match(pattern);
    if (match?.[1] && !/^(season|episode|watch)/i.test(match[1])) {
      return match[1];
    }
  }

  const segments = canonical.split("/").filter(Boolean);
  const last = segments[segments.length - 1] || "";
  if (last && !/\.html?$/i.test(last)) return last;
  return null;
}

function extractDownloadIds(url) {
  const canonical = canonicalContentUrl(url) || String(url || "");
  const ids = [];
  const seen = new Set();
  const add = (value) => {
    const id = String(value || "").trim();
    if (!id || seen.has(id) || /^(season|episode|watch)$/i.test(id)) return;
    seen.add(id);
    ids.push(id);
  };

  add(extractEpisodeWatchId(canonical));
  add(extractGetbuttonId(canonical));

  const movieMatch = canonical.match(/\/movie\/[^/]+\/([^/?#]+)/i);
  if (movieMatch?.[1]) add(movieMatch[1]);

  const seasonMatch = canonical.match(/\/(?:tv-series|tv|serie|series)\/[^/]+\/([^/?#]+)/i);
  if (seasonMatch?.[1]) add(seasonMatch[1]);

  return ids;
}

function isTvShowPageUrl(url) {
  return TV_PAGE_PATTERN.test(String(url || ""));
}

function isTvEpisodePageUrl(url) {
  const text = String(url || "");
  if (isAniwaveUrl(text)) return true;
  return EPISODE_PAGE_PATTERN.test(text) || /\/(?:tv-series|tv|serie|series)\/[^/]+\/[^/]+\//i.test(text);
}

function isDownloadableContentUrl(url) {
  const text = String(url || "");
  if (ANIWAVE_WATCH_PATTERN.test(text)) return true;
  return /\/movie\//i.test(text) || isTvShowPageUrl(text) || isTvEpisodePageUrl(text);
}

function episodeFileLabel(season, episode) {
  const seasonPart = `S${String(season).padStart(2, "0")}`;
  const episodePart = `E${String(episode).padStart(2, "0")}`;
  return `${seasonPart}${episodePart}`;
}

function safeShowFolderName(title) {
  return String(title || "TV Show")
    .replace(/[<>:"/\\|?*]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "TV Show";
}

module.exports = {
  TV_PAGE_PATTERN,
  parseSeasonEpisode,
  canonicalContentUrl,
  extractEpisodeWatchId,
  extractGetbuttonId,
  extractDownloadIds,
  isTvShowPageUrl,
  isTvEpisodePageUrl,
  isDownloadableContentUrl,
  episodeFileLabel,
  safeShowFolderName
};
