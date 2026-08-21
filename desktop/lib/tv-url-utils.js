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

function showBaseSlugFromUrl(url) {
  try {
    const pathname = new URL(String(url || "")).pathname;
    const match = pathname.match(/\/(?:tv-series|tv|serie|series|episode|episodes|watch)\/([^/]+)/i);
    if (!match) return null;
    return match[1].replace(/-season-\d{1,2}$/i, "") || null;
  } catch {
    const match = String(url || "").match(
      /\/(?:tv-series|tv|serie|series|episode|episodes|watch)\/([^/?#]+)/i
    );
    if (!match) return null;
    return match[1].replace(/-season-\d{1,2}$/i, "") || null;
  }
}

function seasonNumberFromUrl(url) {
  try {
    const pathname = new URL(String(url || "")).pathname;
    const match = pathname.match(/-season-(\d{1,2})(?:\/|$)/i);
    return match ? Number.parseInt(match[1], 10) || null : null;
  } catch {
    const match = String(url || "").match(/-season-(\d{1,2})(?:\/|$|\?|#)/i);
    return match ? Number.parseInt(match[1], 10) || null : null;
  }
}

function isWatchingEpisodeUrl(url) {
  return /\/[A-Za-z0-9_-]+-watching\.html?$/i.test(String(url || ""));
}

/**
 * Tornado episode/season paths look like:
 *   /series/breaking-bad-season-1/NXRv9c1C/bnlun6q0-watching.html
 *   /series/curb-your-enthusiasm-season-1/ooglfzCm/XYGCjoqV/1p4OkVDs-watching.html
 * Each season has its own seasonId — never rewrite season-N while keeping another season's id.
 */
function parseTornadoSeriesUrl(url, baseUrl = SITE_BASE_URL) {
  try {
    const parsed = new URL(String(url || ""), baseUrl);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    if (!/^(?:tv-series|tv|serie|series)$/i.test(parts[0])) return null;

    const slug = parts[1];
    const seasonMatch = slug.match(/^(.*)-season-(\d{1,2})$/i);
    const watchingPart = parts.find((part) => /-watching\.html?$/i.test(part)) || null;
    const seasonId = parts[2] && !/-watching\.html?$/i.test(parts[2]) ? parts[2] : null;

    return {
      origin: parsed.origin,
      slug,
      baseSlug: seasonMatch ? seasonMatch[1] : slug,
      season: seasonMatch ? Number.parseInt(seasonMatch[2], 10) : null,
      seasonId,
      watchId: watchingPart ? watchingPart.replace(/-watching\.html?$/i, "") : null,
      isWatching: Boolean(watchingPart),
      href: parsed.toString().replace(/\/$/, "")
    };
  } catch {
    return null;
  }
}

function toSeasonHubUrl(url, baseUrl = SITE_BASE_URL) {
  const info = parseTornadoSeriesUrl(url, baseUrl);
  if (!info?.seasonId) return null;
  return `${info.origin}/series/${info.slug}/${info.seasonId}`;
}

function buildSeasonListFromUrl(url, maxSeason = null) {
  const baseSlug = showBaseSlugFromUrl(url);
  const currentSeason = seasonNumberFromUrl(url);
  const top = Number.parseInt(maxSeason, 10) || currentSeason;
  if (!baseSlug || !top || top < 1) return [];

  // Numbers only — Tornado season IDs differ per season, so fabricated URLs are wrong.
  const seasons = [];
  for (let number = 1; number <= Math.min(top, 99); number += 1) {
    seasons.push({
      number,
      label: `Season ${number}`,
      url: null
    });
  }
  return seasons;
}

function buildSeasonPageUrl(url, seasonNumber, baseUrl = SITE_BASE_URL) {
  // Intentionally conservative: only rewrite when the requested season matches the URL's season.
  // Cross-season navigation must use scraped dropdown links (unique season IDs).
  const season = Number.parseInt(seasonNumber, 10);
  const info = parseTornadoSeriesUrl(url, baseUrl);
  if (!season || !info?.season || info.season !== season) return null;
  return toSeasonHubUrl(url, baseUrl) || info.href;
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
  safeShowFolderName,
  buildSeasonPageUrl,
  showBaseSlugFromUrl,
  seasonNumberFromUrl,
  buildSeasonListFromUrl,
  isWatchingEpisodeUrl,
  parseTornadoSeriesUrl,
  toSeasonHubUrl
};
