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
  installDownload() {
    
(() => {
  if (window.__tornadoDirectDownloadScraperInstalled) return;
  window.__tornadoDirectDownloadScraperInstalled = true;

  const isContentPage = () => /\/(?:movie|tv-series|tv|serie|series|episode|episodes)\//i.test(
    window.location.pathname
  );

  const isMoviePage = () => /\/movie\//i.test(window.location.pathname);

  const movieIdFromPath = () => {
    const match = window.location.pathname.match(/\/movie\/[^/]+\/([^/]+)/i);
    return match ? match[1] : null;
  };

  const pushDirectLink = (url, source) => {
    if (!url || !/loadshare\.org\/download\//i.test(url)) return;
    window.__tornadoCollectedLinks = window.__tornadoCollectedLinks || new Set();
    window.__tornadoCollectedLinks.add(url);
    console.log("[TornadoDirectDownload]", JSON.stringify({
      ts: new Date().toISOString(),
      url,
      source
    }));
  };

  const collectFromText = (text, source) => {
    if (!text || !/loadshare\.org/i.test(text)) return;
    const matches = String(text).match(/https?:\/\/[^\s"'<>]*loadshare\.org\/download\/[^\s"'<>]+/gi);
    if (!matches) return;
    for (const url of matches) pushDirectLink(url, source);
  };

  const collectFromDom = () => {
    if (!isContentPage()) return;

    const found = new Set();
    for (const element of document.querySelectorAll("a[href], [data-href], [data-url]")) {
      for (const attr of ["href", "data-href", "data-url"]) {
        const value = element.getAttribute(attr);
        if (value && /loadshare\.org\/download\//i.test(value)) {
          found.add(value);
        }
      }
    }

    collectFromText(document.documentElement?.innerHTML || "", "html-scan");
    for (const url of found) pushDirectLink(url, "dom");
  };

  const hookAjax = () => {
    if (!window.jQuery) {
      setTimeout(hookAjax, 250);
      return;
    }

    window.jQuery(document).ajaxSuccess((_event, _xhr, settings, data) => {
      const url = String(settings?.url || "");
      if (/loadshare|getbutton|getlink|download|player/i.test(url) || /loadshare/i.test(String(data))) {
        if (typeof data === "string") {
          collectFromText(data, "ajax:" + url);
        } else if (data != null) {
          try {
            collectFromText(JSON.stringify(data), "ajax-json:" + url);
          } catch {
            // Ignore serialization failures.
          }
        }
      }
    });
  };

  const tryPlayerApis = () => {
    if (!window.Player) return { ok: false, status: "player-missing" };

    const actions = [];
    if (typeof window.Player.getLinks === "function") {
      try {
        window.Player.getLinks();
        actions.push("getLinks");
      } catch (error) {
        actions.push("getLinks-error:" + String(error?.message || error));
      }
    }

    if (typeof window.Player.requestLink === "function") {
      try {
        window.Player.requestLink();
        actions.push("requestLink");
      } catch (error) {
        actions.push("requestLink-error:" + String(error?.message || error));
      }
    }

    return { ok: actions.length > 0, actions };
  };

  const fetchGetbuttonLinks = (forcedId) => {
    const id =
      forcedId ||
      document.querySelector("#player .play_button[data-id]")?.getAttribute("data-id") ||
      document.querySelector(".play_button[data-id]")?.getAttribute("data-id") ||
      movieIdFromPath();

    if (!id) {
      return Promise.resolve({ ok: false, reason: "missing-movie-id" });
    }

    if (!window.jQuery) {
      return Promise.resolve({ ok: false, reason: "missing-jquery" });
    }

    const clickCloudTriggers = () => {
      const selectors = [
        "#click_to_download",
        ".download_drop",
        ".fa-cloud-download",
        ".fa-cloud-download-alt",
        ".fa-cloud",
        "[class*='cloud-download']",
        "[class*='download-cloud']",
        "#player [class*='cloud']",
        "#player [class*='download']"
      ];
      for (const selector of selectors) {
        for (const element of document.querySelectorAll(selector)) {
          try {
            element.click();
          } catch {}
        }
      }
    };

    const tryApi = (path, dataType) =>
      new Promise((resolve) => {
        window.jQuery.ajax({
          url: "/" + path + "/" + id + "/true",
          type: "get",
          dataType,
          timeout: 15000,
          success: (data) => resolve({ ok: true, path, data }),
          error: () => resolve({ ok: false, path })
        });
      });

    return (async () => {
      clickCloudTriggers();
      const getdownload = await tryApi("getdownload", "json");
      if (getdownload.ok) {
        if (typeof getdownload.data === "string") collectFromText(getdownload.data, "getdownload");
        else {
          try {
            collectFromText(JSON.stringify(getdownload.data), "getdownload-json");
          } catch {}
        }
      }

      const getbutton = await tryApi("getbutton", "html");
      if (getbutton.ok && typeof getbutton.data === "string") {
        const html = String(getbutton.data || "");
        collectFromText(html, "getbutton");
        const temp = document.createElement("div");
        temp.innerHTML = html;
        for (const element of temp.querySelectorAll("a[href], [data-href], [data-url]")) {
          for (const attr of ["href", "data-href", "data-url"]) {
            const value = element.getAttribute(attr);
            if (value && /loadshare\.org\/download\//i.test(value)) {
              pushDirectLink(value, "getbutton-dom");
            }
          }
          collectFromText(element.outerHTML || "", "getbutton-element");
        }
        const trigger = temp.querySelector("#click_to_download") || temp.querySelector("[class*='cloud']");
        if (trigger) {
          try {
            trigger.click();
          } catch {}
        }
      }

      return { ok: true, movieId: id, getdownload: getdownload.ok, getbutton: getbutton.ok };
    })();
  };

  window.__tornadoScanDirectDownloads = async (forcedMovieId) => {
    if (!isContentPage() && !forcedMovieId) {
      return { ok: false, reason: "not-content-page", links: [] };
    }

    window.__tornadoCollectedLinks = new Set();
    collectFromDom();
    const player = tryPlayerApis();
    const getbutton = await fetchGetbuttonLinks(forcedMovieId || null);
    collectFromDom();

    return {
      ok: true,
      player,
      getbutton,
      linkCount: document.querySelectorAll('a[href*="loadshare.org/download/"]').length,
      links: [...(window.__tornadoCollectedLinks || [])]
    };
  };

  if (isContentPage()) {
    hookAjax();
    collectFromDom();
  }
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
  },
  async fetchDirectLinks() {
    this.installDownload();
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitStart = Date.now();
    while (Date.now() - waitStart < 5000 && !window.jQuery) {
      await sleep(200);
    }
    const jqueryReady = Boolean(window.jQuery);
    const play = document.querySelector("#player .play_button[data-id], .play_button[data-id]");
    const forced = Array.isArray(window.__forcedDownloadIds) ? window.__forcedDownloadIds.map(String) : [];
    if (window.__forcedDownloadId) forced.unshift(String(window.__forcedDownloadId));
    const playId = play && play.getAttribute("data-id");
    const pathId =
      ((location.pathname || "").match(/\/([A-Za-z0-9]+)-watching\.html?/i) || [])[1] ||
      ((location.pathname || "").match(/\/movie\/[^/]+\/([^/]+)/i) || [])[1] ||
      ((location.pathname || "").match(/\/(?:tv-series|tv|serie|series)\/[^/]+\/([^/]+)/i) || [])[1];
    const ids = [...new Set(forced.concat(playId || "", pathId || "").filter(Boolean))];
    const id = ids[0] || "";
    const type = (play && play.getAttribute("data-type")) || "true";
    const hooked = () => Array.from(window.__tornadoCollectedLinks || []);
    const fromDom = () => Array.from(document.querySelectorAll("a[href*='loadshare.org/download/']")).map((a) => a.href);
    const uniqueLinks = () => [...new Set(hooked().concat(fromDom()))].filter((url) => /loadshare\.org\/download\//i.test(String(url)));
    const pageUrl = String(location.href || "");
    const loggedOut =
      /premiummembership/i.test(document.body ? document.body.innerHTML : "") &&
      !document.querySelector('a[href*="logout"], a[href*="signout"]');

    if (!jqueryReady) {
      return { ok: false, reason: "missing-jquery", links: uniqueLinks(), jqueryReady, loggedOut, movieId: id || null, pageUrl };
    }
    if (!id) {
      return { ok: false, reason: "missing-movie-id", links: uniqueLinks(), jqueryReady, loggedOut, movieId: null, pageUrl };
    }

    const loginWaitStart = Date.now();
    while (Date.now() - loginWaitStart < 4500) {
      if (document.querySelector('a[href*="logout"], a[href*="signout"]')) break;
      if (window.__tornadoLoginDone) break;
      if (!window.__tornadoLoginStarted) break;
      await sleep(250);
    }

    if (typeof window.initDownloadButton === "function") {
      try { ids.forEach(function(nextId) { window.initDownloadButton(nextId, type); }); } catch (error) {}
    }

    let html = "";
    for (const nextId of ids) {
      const getDownloadJson = new Promise((resolve) => {
        window.jQuery.ajax({
          url: "/getdownload/" + nextId + "/" + type,
          type: "get",
          dataType: "json",
          timeout: 8000,
          success: (data) => resolve(data),
          error: () => resolve(null)
        });
      });
      const getButtonHtml = new Promise((resolve) => {
        window.jQuery.ajax({
          url: "/getbutton/" + nextId + "/" + type,
          type: "get",
          dataType: "html",
          timeout: 10000,
          success: (data) => resolve(String(data || "")),
          error: () => resolve("")
        });
      });
      const [downloadJson, buttonHtml] = await Promise.all([getDownloadJson, getButtonHtml]);
      if (downloadJson) {
        try {
          const text = typeof downloadJson === "string" ? downloadJson : JSON.stringify(downloadJson);
          const matches = String(text).match(/(?:https?:)?\/\/[^\s"'<>]*loadshare\.org\/download\/[^\s"'<>]+/gi) || [];
          for (const url of matches) {
            const clean = url.indexOf("//") === 0 ? "https:" + url : url;
            (window.__tornadoCollectedLinks || (window.__tornadoCollectedLinks = new Set())).add(clean);
          }
        } catch (error) {}
      }
      if (buttonHtml) html = buttonHtml;
      if (uniqueLinks().length) break;
      if (buttonHtml && /premiummembership/i.test(buttonHtml) && !document.querySelector('a[href*="logout"], a[href*="signout"]')) {
        return {
          ok: false,
          links: uniqueLinks(),
          jqueryReady,
          loggedOut: true,
          movieId: nextId,
          pageUrl,
          getbutton: true,
          error: "Not signed in on Tornado. Save Site Login, then try again."
        };
      }
      if (buttonHtml) {
        const htmlLinks = String(buttonHtml).match(/(?:https?:)?\/\/[^\s"'<>]*loadshare\.org\/download\/[^\s"'<>]+/gi) || [];
        for (const url of htmlLinks) {
          const clean = url.indexOf("//") === 0 ? "https:" + url : url;
          (window.__tornadoCollectedLinks || (window.__tornadoCollectedLinks = new Set())).add(clean);
        }
        let mount = document.getElementById("__ios_getbutton_mount");
        if (!mount) {
          mount = document.createElement("div");
          mount.id = "__ios_getbutton_mount";
          mount.style.cssText = "position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;";
          document.body.appendChild(mount);
        }
        mount.innerHTML = buttonHtml;
        const trigger =
          mount.querySelector("#click_to_download") ||
          mount.querySelector("[class*='cloud']") ||
          document.querySelector("#click_to_download");
        if (trigger) {
          try { trigger.click(); } catch (error) {}
        }
        const pollStart = Date.now();
        while (Date.now() - pollStart < 5000) {
          if (uniqueLinks().length) break;
          await sleep(250);
        }
        if (uniqueLinks().length) break;
      }
    }

    const links = uniqueLinks();
    return {
      ok: links.length > 0,
      links,
      jqueryReady,
      loggedOut,
      movieId: id,
      pageUrl,
      getbutton: Boolean(html),
      error: links.length
        ? null
        : loggedOut
          ? "Not signed in on Tornado. Save Site Login, then try again."
          : (html ? "No direct download link found." : "getbutton returned no download button.")
    };
  }
};
