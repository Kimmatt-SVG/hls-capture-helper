window.mobileScrapers = {
  installSearch() {
    
(() => {
  if (window.__tornadoSearchScraperInstalledV2) return;
  window.__tornadoSearchScraperInstalledV2 = true;
  window.__tornadoSearchScraperInstalled = true;

  const normalize = (url) => {
    try {
      const parsed = new URL(url, window.location.href);
      parsed.hash = "";
      return parsed.toString().replace(/\/$/, "");
    } catch {
      return "";
    }
  };

  const classify = (url) => {
    try {
      const parsed = new URL(url, window.location.href);
      const pathname = parsed.pathname || "";
      const movieMatch = pathname.match(/\/movie\/([^/]+)\/([^/]+)/i);
      if (movieMatch) {
        return {
          kind: "movie",
          canonical: parsed.origin + "/movie/" + movieMatch[1] + "/" + movieMatch[2]
        };
      }
      const tvMatch = pathname.match(/\/(?:tv-series|tv|serie|series)\/([^/]+)\/([^/]+)/i);
      if (tvMatch) {
        const segments = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
        const keep = segments.slice(0, Math.min(segments.length, 4));
        return {
          kind: "tv",
          canonical: parsed.origin + "/" + keep.join("/")
        };
      }
      return null;
    } catch {
      return null;
    }
  };

  const titleFromUrl = (url, kind) => {
    const movieMatch = String(url).match(/\/movie\/([^/]+)\//i);
    const tvMatch = String(url).match(/\/(?:tv-series|tv|serie|series)\/([^/]+)\//i);
    const slug = (movieMatch || tvMatch)?.[1];
    if (!slug) return kind === "tv" ? "TV Show" : "Movie";
    return slug
      .replace(/-/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const resolveUrl = (raw) => {
    if (!raw || raw.startsWith("data:")) return "";
    try {
      return new URL(raw, window.location.href).href;
    } catch {
      return "";
    }
  };

  const pickPoster = (root) => {
    if (!root) return "";
    const posterNode =
      (root.matches?.(".poster, [data-img]") ? root : null) ||
      root.closest?.(".poster, [data-img]") ||
      root.querySelector?.(".poster, [data-img]");
    const dataImg = posterNode?.getAttribute?.("data-img") || "";
    if (dataImg) return resolveUrl(dataImg);

    const img =
      root.querySelector("img[src], img[data-src], img[data-original], img[data-lazy-src]") ||
      (root.closest("article, .item, .flw-item, .film-poster, .movie-item, .card, li, .col, .grid-item") || root)
        ?.querySelector?.("img[src], img[data-src], img[data-original], img[data-lazy-src]");
    if (!img) return "";
    const raw =
      img.currentSrc ||
      img.getAttribute("src") ||
      img.getAttribute("data-src") ||
      img.getAttribute("data-original") ||
      img.getAttribute("data-lazy-src") ||
      "";
    return resolveUrl(raw);
  };

  const cleanTitle = (value) =>
    String(value || "")
      .replace(/\s+/g, " ")
      .replace(/^watch\s+/i, "")
      .replace(/\s+online\b.*$/i, "")
      .replace(/\s+in\s+hd\b.*$/i, "")
      .replace(/\s+[|–]\s+.*$/i, "")
      .replace(/\s+-\s+.*$/i, "")
      .trim();

  const yearFromText = (text) => {
    const match = String(text || "").match(/\b(19|20)\d{2}\b/);
    return match ? match[0] : "";
  };

  window.__tornadoScrapeSearchMovies = () => {
    const found = new Map();
    const anchors = document.querySelectorAll(
      "a[href*='/movie/'], a[href*='/tv-series/'], a[href*='/tv/'], a[href*='/serie/'], a[href*='/series/']"
    );

    for (const element of anchors) {
      const rawHref = element.href || element.getAttribute("href") || "";
      const classified = classify(rawHref);
      if (!classified?.canonical) continue;
      const href = classified.canonical;
      const kind = classified.kind;

      if (kind === "movie" && !/\/movie\/[^/]+\/[^/?#]+/i.test(href)) continue;
      if (kind === "tv" && !/\/(?:tv-series|tv|serie|series)\/[^/]+\/[^/?#]+/i.test(href)) continue;

      const card =
        element.closest(
          ".poster, article, .item, .flw-item, .film-poster, .movie-item, .card, li, .col, .grid-item, .movie, .tv, .series"
        ) || element.parentElement;
      const dataName = cleanTitle(card?.getAttribute?.("data-name") || "");
      const text = cleanTitle(element.textContent || "");
      const titleAttr = cleanTitle(element.getAttribute("title") || element.getAttribute("aria-label") || "");
      const imgAlt = cleanTitle(card?.querySelector?.("img")?.alt || "");
      const fallbackTitle = titleFromUrl(href, kind);
      const title =
        (dataName && dataName.length < 120 ? dataName : "") ||
        (text && text.length < 80 ? text : "") ||
        (titleAttr && titleAttr.length < 100 ? titleAttr : "") ||
        (imgAlt && imgAlt.length < 100 ? imgAlt : "") ||
        fallbackTitle;
      const posterUrl = pickPoster(element) || pickPoster(card);
      const year = yearFromText(card?.getAttribute?.("data-name") || card?.textContent || text || titleAttr);

      const existing = found.get(href);
      if (!existing) {
        found.set(href, {
          kind,
          movieUrl: href,
          title,
          posterUrl: posterUrl || undefined,
          year: year || undefined
        });
        continue;
      }

      if ((!existing.posterUrl || existing.posterUrl.length < 8) && posterUrl) {
        existing.posterUrl = posterUrl;
      }
      if ((!existing.title || existing.title === fallbackTitle) && title && title !== fallbackTitle) {
        existing.title = title;
      }
      if (!existing.year && year) existing.year = year;
      if (!existing.kind) existing.kind = kind;
    }

    const movies = [...found.values()];
    return {
      ok: true,
      movies,
      counts: {
        total: movies.length,
        movies: movies.filter((item) => item.kind !== "tv").length,
        tv: movies.filter((item) => item.kind === "tv").length
      }
    };
  };

  window.__tornadoScrapeMovieDetail = () => {
    const classified = classify(location.href);
    const href = classified?.canonical || normalize(location.href);
    if (!href || !classified) {
      return { ok: false, error: "Not on a movie or TV page." };
    }

    const kind = classified.kind;
    const pathMatch =
      kind === "movie"
        ? location.pathname.match(/\/movie\/([^/]+)\/([^/]+)/i)
        : location.pathname.match(/\/(?:tv-series|tv|serie|series)\/([^/]+)\/([^/]+)/i);
    const slug = pathMatch?.[1] || "";
    const contentId = pathMatch?.[2] || "";

    const matchingPoster =
      (contentId && document.querySelector('.poster[data-id="' + contentId + '"]')) ||
      (slug &&
        [...document.querySelectorAll(".poster[data-href], .poster[data-name]")].find((node) => {
          const dataHref = String(node.getAttribute("data-href") || "");
          return dataHref.includes("/" + slug + "/");
        })) ||
      null;

    const title = cleanTitle(
      matchingPoster?.getAttribute("data-name") ||
        document.querySelector('meta[property="og:title"]')?.content ||
        document.querySelector("h1")?.textContent ||
        document.title ||
        titleFromUrl(href, kind)
    );

    const posterCandidates = [
      matchingPoster?.getAttribute("data-img"),
      document.querySelector('meta[property="og:image"]')?.content,
      document.querySelector('meta[name="twitter:image"]')?.content,
      matchingPoster?.querySelector("img")?.src,
      document.querySelector(".film-poster img, .movie-poster img, img.poster")?.src
    ].filter(Boolean);

    let posterUrl = "";
    for (const raw of posterCandidates) {
      posterUrl = resolveUrl(raw);
      if (posterUrl) break;
    }

    const year = yearFromText(
      matchingPoster?.getAttribute("data-name") ||
        document.querySelector(".film-stats, .movie-info, .detail, .description, h1")?.textContent ||
        document.body?.innerText?.slice(0, 800) ||
        ""
    );

    return {
      ok: true,
      movie: {
        kind,
        movieUrl: href,
        title: title || titleFromUrl(href, kind),
        posterUrl: posterUrl || undefined,
        year: year || undefined
      }
    };
  };
})();

  },
  installTv() {
    
(() => {
  if (window.__tornadoTvShowScraperInstalled) return;
  window.__tornadoTvShowScraperInstalled = true;

  const normalize = (url) => {
    try {
      const parsed = new URL(url, window.location.href);
      parsed.hash = "";
      return parsed.toString().replace(/\/$/, "");
    } catch {
      return "";
    }
  };

  const parseSeasonEpisode = (text) => {
    const source = String(text || "");
    const patterns = [
      /\bS(\d{1,2})\s*E(\d{1,3})\b/i,
      /\b(\d{1,2})x(\d{1,3})\b/,
      /season[-_\s]?(\d{1,2}).*?episode[-_\s]?(\d{1,3})/i,
      /season[-_\s]?(\d{1,2})/i,
      /episode[-_\s]?(\d{1,3})/i
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
      const match = String(source).match(/season[-_\s]?(\d{1,2})/i);
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
    return /\/(?:tv-series|tv|serie|series|episode|episodes|watch)\//i.test(href);
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
        let url = value && !/^\d+$/.test(value) ? value : window.location.href;
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
    const isShowPage = /\/(?:tv-series|tv|serie|series)\//i.test(pathname);
    const activeSeason = detectActiveSeason();
    const baseTitle =
      document.querySelector("h1, .title, .movie-title, .show-title")?.textContent?.trim() ||
      document.title.replace(/\s*[-|].*$/, "").trim() ||
      "TV Show";
    const showTitle = baseTitle.replace(/\s*[-–]\s*season\s*\d+.*$/i, "").trim() || baseTitle;

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

  },
  async scrapeSearch() {
    this.installSearch();
    return window.__tornadoScrapeSearchMovies?.() || { ok: false, movies: [] };
  },
  async scrapeSeasons() {
    this.installTv();
    return window.__tornadoScrapeSeasons?.() || { ok: false, seasons: [] };
  },
  async scrapeTvSeason() {
    this.installTv();
    return window.__tornadoScanTvShow?.() || { ok: false, episodes: [] };
  }
};
