const fs = require("fs");
const path = require("path");

const MOVIES_PROFILE = {
  id: "movies",
  windowTitle: "Movie Stream Downloader",
  outputFolder: "Movies",
  browserPartition: "persist:stream-browser",
  homeUrl:
    process.env.STREAM_SITE_HOME_URL ||
    process.env.STREAM_SITE_URL ||
    "https://www4.tornadomovies.co/tornado-1",
  loginPath: "/user/premiummembership",
  searchPathTemplate: "/search_all/~{query}~",
  brandLabel: "Movie Stream Downloader",
  siteLabel: "Tornado Movies",
  searchPlaceholder: "Search movies (e.g. avengers endgame)",
  landingTitle: "What do you want to watch?",
  landingLead:
    "Search for a movie, play it in the built-in browser, then save it as MP4 to your PC or NAS.",
  openAnimeButton: true,
  hideMovieDownloader: false,
  defaultSidebarMode: "movies",
  tvShowLead:
    "Open a specific season page on Tornado Movies, scan only that season's episodes, then download each episode as its own MP4.",
  startupLog:
    "App ready. Open a movie and use the site's Download links, or play for HLS capture."
};

function animeConfigPath() {
  const resourceConfig = path.join(process.resourcesPath || "", "anime-config.json");
  if (process.resourcesPath && fs.existsSync(resourceConfig)) {
    return resourceConfig;
  }
  return path.join(__dirname, "..", "anime-config.json");
}

function loadAnimeOverrides() {
  try {
    return JSON.parse(fs.readFileSync(animeConfigPath(), "utf8"));
  } catch {
    return {};
  }
}

function buildProfile(base, overrides = {}) {
  const homeUrl = overrides.homeUrl || base.homeUrl;
  let baseUrl = base.baseUrl;
  try {
    baseUrl = new URL(homeUrl).origin;
  } catch {
    baseUrl = base.baseUrl || "https://www4.tornadomovies.co";
  }

  return {
    ...base,
    ...overrides,
    homeUrl,
    baseUrl,
    loginUrl: `${baseUrl}${base.loginPath}`,
    allowedDomains: overrides.allowedDomains || base.allowedDomains || []
  };
}

function createAnimeProfile() {
  const overrides = loadAnimeOverrides();
  return buildProfile(
    {
      id: "anime",
      windowTitle: "Anime Stream Downloader",
      outputFolder: "Anime",
      browserPartition: "persist:anime-browser",
      homeUrl: "https://aniwaves.ru/home",
      baseUrl: "https://aniwaves.ru",
      loginPath: "/user/premiummembership",
      searchPathTemplate: "/filter?keyword={query}",
      siteLabel: "Aniwave",
      brandLabel: "Anime Stream Downloader",
      searchPlaceholder: "Search anime (e.g. sao, attack on titan)",
      landingTitle: "What anime do you want to watch?",
      landingLead:
        "Search Aniwave or open a series page in the browser, then scan and download episodes from the sidebar.",
      openAnimeButton: false,
      hideMovieDownloader: true,
      defaultSidebarMode: "tv",
      tvShowLead:
        "Open an Aniwave series page (e.g. /watch/show-name/ep-1), scan episodes, then download each one. English dub is tried first when available.",
      startupLog:
        "Anime mode ready. Open an Aniwave series page, scan it, then download episodes (dub preferred)."
    },
    overrides
  );
}

function isAnimeMode(argv = process.argv) {
  return argv.includes("--anime");
}

function getActiveProfile(argv = process.argv) {
  return isAnimeMode(argv) ? createAnimeProfile() : buildProfile(MOVIES_PROFILE);
}

function buildSearchUrl(query, profile = getActiveProfile()) {
  const trimmed = String(query || "").trim();
  if (!trimmed) {
    throw new Error("Enter a title to search.");
  }

  const encoded = encodeURIComponent(trimmed);
  const template = profile.searchPathTemplate || "/search_all/~{query}~";
  return `${profile.baseUrl}${template.replace("{query}", encoded)}`;
}

module.exports = {
  MOVIES_PROFILE,
  getActiveProfile,
  isAnimeMode,
  buildSearchUrl,
  animeConfigPath
};
