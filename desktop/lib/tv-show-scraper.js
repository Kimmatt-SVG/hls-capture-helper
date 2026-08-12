const { isAniwaveUrl, scrapeAniwaveTvShowFromPage, setupAniwaveScraper } = require("./aniwave-scraper");

function buildTvShowScraperScript() {
  return `
(() => {
  if (window.__tornadoTvShowScraperInstalled) return;
  window.__tornadoTvShowScraperInstalled = true;

  const normalize = (url) => {
    try {
      const parsed = new URL(url, window.location.href);
      parsed.hash = "";
      return parsed.toString().replace(/\\/$/, "");
    } catch {
      return "";
    }
  };

  const parseSeasonEpisode = (text) => {
    const source = String(text || "");
    const patterns = [
      /\\bS(\\d{1,2})\\s*E(\\d{1,3})\\b/i,
      /\\b(\\d{1,2})x(\\d{1,3})\\b/,
      /season[-_\\s]?(\\d{1,2}).*?episode[-_\\s]?(\\d{1,3})/i,
      /season[-_\\s]?(\\d{1,2})/i,
      /episode[-_\\s]?(\\d{1,3})/i
    ];

    for (const pattern of patterns) {
      const match = source.match(pattern);
      if (!match) continue;
      if (/episode/i.test(pattern.source) && match.length < 3) {
        return { season: 0, episode: Number.parseInt(match[1], 10) || 0 };
      }
      if (/season/i.test(pattern.source) && match.length < 3) {
        return { season: Number.parseInt(match[1], 10) || 0, episode: 0 };
      }
      if (match.length >= 3) {
        return {
          season: Number.parseInt(match[1], 10) || 0,
          episode: Number.parseInt(match[2], 10) || 0
        };
      }
    }

    return { season: 0, episode: 0 };
  };

  const seasonFromText = (text) => {
    const parsed = parseSeasonEpisode(text);
    return parsed.season > 0 ? parsed.season : null;
  };

  const detectActiveSeason = () => {
    const sources = [
      window.location.pathname,
      window.location.href,
      document.title,
      document.querySelector("h1, .title, .movie-title, .show-title")?.textContent || ""
    ];

    for (const source of sources) {
      const match = String(source).match(/season[-_\\s]?(\\d{1,2})/i);
      if (match) return Number.parseInt(match[1], 10) || 1;
    }

    const activeSelectors = [
      ".seasons .active",
      ".seasons .selected",
      ".season-tabs .active",
      ".season-list .active",
      "[data-season].active",
      "[aria-selected='true']",
      ".nav-seasons .active",
      ".episodes-seasons .active"
    ];

    for (const selector of activeSelectors) {
      for (const element of document.querySelectorAll(selector)) {
        const label = [
          element.textContent,
          element.getAttribute("data-season"),
          element.getAttribute("title"),
          element.getAttribute("aria-label")
        ]
          .filter(Boolean)
          .join(" ");
        const season = seasonFromText(label);
        if (season) return season;
      }
    }

    const select = document.querySelector("select[name*='season' i], select[id*='season' i]");
    if (select) {
      const selected = select.options[select.selectedIndex];
      const label = [selected?.textContent, selected?.value, select.value].filter(Boolean).join(" ");
      const season = seasonFromText(label);
      if (season) return season;
    }

    return 1;
  };

  const isEpisodeLink = (href) => {
    if (!href) return false;
    return /\\/(?:tv-series|tv|serie|series|episode|episodes|watch)\\//i.test(href);
  };

  const episodeRoots = () => {
    const selectors = [
      ".episodes-list",
      ".episode-list",
      ".episodes",
      "#episodes",
      ".season-episodes",
      ".episodes-block",
      ".list-episodes",
      ".show-episodes",
      ".tv-episodes"
    ];

    const roots = [];
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        roots.push(element);
      }
    }
    return roots;
  };

  const collectEpisodeLinks = (activeSeason) => {
    const found = new Map();
    const roots = episodeRoots();
    const scopes = roots.length ? roots : [document];

    for (const scope of scopes) {
      for (const element of scope.querySelectorAll("a[href]")) {
        const rawHref = element.getAttribute("href") || "";
        const href = normalize(rawHref);
        if (!href || !isEpisodeLink(href)) continue;

        const text = String(element.textContent || "").trim();
        const label = [text, href, element.getAttribute("title") || ""].join(" ");
        const numbers = parseSeasonEpisode(label);
        const season = numbers.season > 0 ? numbers.season : activeSeason;
        const episode = numbers.episode;

        if (numbers.season > 0 && numbers.season !== activeSeason) continue;

        if (!found.has(href)) {
          found.set(href, {
            url: href,
            title: text || "Episode",
            season,
            episode
          });
        }
      }
    }

    return [...found.values()];
  };

  const normalizeEpisodeNumbers = (episodes, activeSeason) => {
    const sorted = [...episodes].sort((a, b) => {
      const aEpisode = a.episode > 0 ? a.episode : Number.MAX_SAFE_INTEGER;
      const bEpisode = b.episode > 0 ? b.episode : Number.MAX_SAFE_INTEGER;
      if (aEpisode !== bEpisode) return aEpisode - bEpisode;
      return String(a.title).localeCompare(String(b.title));
    });

    return sorted.map((item, index) => ({
      ...item,
      season: activeSeason,
      episode: item.episode > 0 ? item.episode : index + 1
    }));
  };

  window.__tornadoScrapeSeasons = () => {
    const seasons = new Map();

    const addSeason = (number, label, url) => {
      const seasonNumber = Number.parseInt(number, 10);
      if (!seasonNumber || seasonNumber < 1 || !url) return;
      const normalizedUrl = normalize(url);
      if (!normalizedUrl) return;
      if (!seasons.has(seasonNumber)) {
        seasons.set(seasonNumber, {
          number: seasonNumber,
          label: String(label || "Season " + seasonNumber).trim(),
          url: normalizedUrl
        });
      }
    };

    for (const select of document.querySelectorAll("select")) {
      const context = [select.name, select.id, select.className, select.getAttribute("aria-label") || ""]
        .join(" ");
      if (!/season/i.test(context)) continue;

      for (const option of select.options) {
        const label = String(option.textContent || "").trim();
        const value = String(option.value || "").trim();
        const season = seasonFromText([label, value, context].join(" "));
        if (!season) continue;
        let url = value && !/^\\d+$/.test(value) ? value : window.location.href;
        try {
          url = new URL(url, window.location.href).href;
        } catch {
          url = window.location.href;
        }
        addSeason(season, label || "Season " + season, url);
      }
    }

    const seasonLinkSelectors = [
      ".seasons a[href]",
      ".season-tabs a[href]",
      ".season-list a[href]",
      ".nav-seasons a[href]",
      ".episodes-seasons a[href]",
      "[data-season][href]",
      "a[href*='season']"
    ];

    for (const selector of seasonLinkSelectors) {
      for (const element of document.querySelectorAll(selector)) {
        const href = element.getAttribute("href") || "";
        if (!href || href.startsWith("#")) continue;
        const label = String(element.textContent || element.getAttribute("title") || "").trim();
        const dataSeason = element.getAttribute("data-season") || "";
        const season = seasonFromText([label, dataSeason, href, element.getAttribute("aria-label") || ""].join(" "));
        if (!season) continue;
        addSeason(season, label || "Season " + season, href);
      }
    }

    const activeSeason = detectActiveSeason();
    addSeason(activeSeason, "Season " + activeSeason, window.location.href);

    const list = [...seasons.values()].sort((a, b) => a.number - b.number);
    return {
      ok: list.length > 0,
      seasons: list
    };
  };

  window.__tornadoScanTvShow = async () => {
    const pageUrl = normalize(window.location.href);
    const pathname = window.location.pathname || "";
    const isShowPage = /\\/(?:tv-series|tv|serie|series)\\//i.test(pathname);
    const activeSeason = detectActiveSeason();
    const baseTitle =
      document.querySelector("h1, .title, .movie-title, .show-title")?.textContent?.trim() ||
      document.title.replace(/\\s*[-|].*$/, "").trim() ||
      "TV Show";
    const showTitle = baseTitle.replace(/\\s*[-–]\\s*season\\s*\\d+.*$/i, "").trim() || baseTitle;

    const posterCandidates = [
      document.querySelector('meta[property="og:image"]')?.content,
      document.querySelector('meta[name="twitter:image"]')?.content,
      document.querySelector(".film-poster img, .movie-poster img, .poster img, img.poster")?.currentSrc,
      document.querySelector(".film-poster img, .movie-poster img, .poster img, img.poster")?.src,
      document.querySelector(".poster[data-img]")?.getAttribute("data-img")
    ];
    let posterUrl = "";
    for (const raw of posterCandidates) {
      try {
        if (!raw || String(raw).startsWith("data:")) continue;
        posterUrl = new URL(String(raw), window.location.href).href;
        if (posterUrl) break;
      } catch {
        // try next
      }
    }

    const rawEpisodes = collectEpisodeLinks(activeSeason);
    const episodeList = normalizeEpisodeNumbers(rawEpisodes, activeSeason);

    return {
      ok: episodeList.length > 0,
      isShowPage,
      showTitle,
      season: activeSeason,
      showUrl: pageUrl,
      posterUrl: posterUrl || undefined,
      episodeCount: episodeList.length,
      episodes: episodeList,
      notes: [
        "Scanned season " + activeSeason + " only (visible episodes on the current page).",
        "Open a specific season page before scanning if you want a different season."
      ],
      pathname,
      title: document.title || ""
    };
  };
})();
`;
}

function setupTvShowScraper(contents) {
  setupAniwaveScraper(contents);
  if (!contents || contents.isDestroyed()) return;

  const inject = () => {
    contents.executeJavaScript(buildTvShowScraperScript()).catch(() => {});
  };

  contents.on("dom-ready", inject);
  contents.on("did-finish-load", inject);
}

async function scrapeTvSeasonsFromPage(contents) {
  if (!contents || contents.isDestroyed()) {
    return { ok: false, seasons: [], error: "Browser is not ready." };
  }

  await contents.executeJavaScript(buildTvShowScraperScript()).catch(() => {});

  try {
    return await contents.executeJavaScript("window.__tornadoScrapeSeasons?.() || { ok: false, seasons: [] }");
  } catch (error) {
    return { ok: false, seasons: [], error: error.message || String(error) };
  }
}

async function scrapeTvShowFromPage(contents) {
  if (!contents || contents.isDestroyed()) {
    return { ok: false, error: "Browser is not ready." };
  }

  const pageUrl = contents.getURL() || "";
  if (isAniwaveUrl(pageUrl)) {
    return scrapeAniwaveTvShowFromPage(contents);
  }

  await contents.executeJavaScript(buildTvShowScraperScript()).catch(() => {});

  try {
    return await contents.executeJavaScript("window.__tornadoScanTvShow?.() || { ok: false }");
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

module.exports = {
  buildTvShowScraperScript,
  setupTvShowScraper,
  scrapeTvSeasonsFromPage,
  scrapeTvShowFromPage
};
