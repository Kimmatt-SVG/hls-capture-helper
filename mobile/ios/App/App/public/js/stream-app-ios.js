(function createStreamAppIOS() {
  const { Preferences } = window.Capacitor?.Plugins || {};
  const MovieEngine = window.MovieEngine;
  const SITE_BASE = "https://www4.tornadomovies.co";
  const SITE_HOME = `${SITE_BASE}/tornado-1`;

  const noopUnsub = () => {};

  function buildSearchUrl(query) {
    return `${SITE_HOME}?s=${encodeURIComponent(String(query || "").trim())}`;
  }

  async function scrape(url, runner) {
    const script = `(async () => {
      ${runner}
    })()`;
    const response = await MovieEngine.scrapePage({ url, script, waitMs: 2600 });
    return response?.result ?? response;
  }

  async function getStorageSummary() {
    const local = await MovieEngine.getLocalMoviesPath();
    const settings = await MovieEngine.getStorageSettings();
    return {
      localPath: local.displayPath || local.path,
      nasPath: settings.nasVideoFolder || ""
    };
  }

  let tvShowPlan = null;
  let queueSnapshot = { items: [], processing: false };

  window.streamApp = {
    getPlaylists: async () => ({ ok: true, playlists: [] }),
    scanDirectDownloads: async () => ({ ok: true, links: [] }),
    clearPlaylists: async () => ({ ok: true }),
    diagnoseStreams: async () => ({ ok: true, entries: [] }),
    openStreamDebugLog: async () => ({ ok: true }),
    async getEnvironment() {
      const storage = await getStorageSummary();
      let siteUsername = null;
      try {
        const stored = await Preferences?.get({ key: "site_credentials" });
        if (stored?.value) siteUsername = JSON.parse(stored.value).username || null;
      } catch {
        // ignore
      }
      return {
        profileId: "movies",
        profileLabel: "Movie Stream Downloader",
        siteLabel: "Tornado Movies",
        siteHomeUrl: SITE_HOME,
        siteUsername,
        outputDirectory: storage.localPath,
        nasVideoFolder: storage.nasPath,
        openAnimeButton: false,
        hideMovieDownloader: false,
        catalogMode: true,
        searchPlaceholder: "Search movies & TV",
        startupLog: "iOS app ready. Search a title, pick a season, then queue or download.",
        tvShowLead: "",
        defaultSidebarMode: "movies"
      };
    },
    navigate: async () => ({ ok: false, error: "Use catalog search on iOS." }),
    reloadPage: async () => ({ ok: true }),
    goHome: async () => ({ ok: true, url: SITE_HOME }),
    getSiteCredentials: async () => {
      try {
        const stored = await Preferences?.get({ key: "site_credentials" });
        const parsed = stored?.value ? JSON.parse(stored.value) : {};
        return {
          username: parsed.username || null,
          autoLogin: parsed.autoLogin !== false,
          hasPassword: Boolean(parsed.password)
        };
      } catch {
        return { username: null, autoLogin: true, hasPassword: false };
      }
    },
    saveSiteCredentials: async (payload) => {
      await Preferences?.set({
        key: "site_credentials",
        value: JSON.stringify({
          username: String(payload?.username || "").trim(),
          password: String(payload?.password || ""),
          autoLogin: payload?.autoLogin !== false
        })
      });
      return { ok: true };
    },
    siteLogin: async () => ({ ok: true }),
    setCatalogBrowserLocked: async () => ({ ok: true, locked: true }),
    async searchMovies(query) {
      const trimmed = String(query || "").trim();
      if (!trimmed) return { ok: false, error: "Enter a title to search.", movies: [] };

      const url = buildSearchUrl(trimmed);
      const result = await scrape(url, `
        window.mobileScrapers.installSearch();
        return window.__tornadoScrapeSearchMovies?.() || { ok: false, movies: [] };
      `);

      if (!result?.movies?.length) {
        return { ok: false, error: `No movies or TV shows found for "${trimmed}".`, movies: [], query: trimmed, url };
      }

      const movies = result.movies;
      const counts = result.counts || {
        total: movies.length,
        movies: movies.filter((item) => item.kind !== "tv").length,
        tv: movies.filter((item) => item.kind === "tv").length
      };

      return { ok: true, query: trimmed, url, movies, counts };
    },
    async catalogOpenMovie(payload = {}) {
      const movieUrl = String(payload.movieUrl || "").trim();
      if (!movieUrl) return { ok: false, error: "Missing show URL." };

      const isTv = payload.kind === "tv" || /\/(?:tv-series|tv|serie|series)\//i.test(movieUrl);
      const result = await scrape(movieUrl, `
        window.mobileScrapers.installTv();
        const detail = window.__tornadoScrapeMovieDetail?.() || null;
        const seasons = window.__tornadoScrapeSeasons?.() || { ok: false, seasons: [] };
        return {
          detail,
          seasons: seasons.seasons || []
        };
      `);

      const movie = {
        kind: isTv ? "tv" : "movie",
        movieUrl,
        title: payload.title || result?.detail?.movie?.title || payload.title || "Title",
        posterUrl: result?.detail?.movie?.posterUrl || payload.posterUrl,
        year: result?.detail?.movie?.year || payload.year
      };

      let seasons = result?.seasons || [];
      if (isTv && !seasons.length) {
        seasons = [{ number: 1, label: "Season 1", url: movieUrl }];
      }

      return { ok: true, movie, seasons };
    },
    async catalogScanTvSeason(payload = {}) {
      const seasonUrl = String(payload.seasonUrl || payload.url || "").trim();
      if (!seasonUrl) return { ok: false, error: "No season URL provided." };

      const scan = await scrape(seasonUrl, `
        window.mobileScrapers.installTv();
        return window.__tornadoScanTvShow?.() || { ok: false, episodes: [] };
      `);

      if (!scan?.ok || !scan?.episodes?.length) {
        return { ok: false, error: scan?.error || "Could not find episodes for this season." };
      }

      tvShowPlan = {
        showTitle: payload.showTitle || scan.showTitle,
        season: payload.season || scan.season || scan.episodes[0]?.season || 1,
        showUrl: payload.showUrl || scan.showUrl || seasonUrl,
        posterUrl: payload.posterUrl || scan.posterUrl || null,
        episodes: scan.episodes,
        scannedAt: Date.now()
      };

      return { ok: true, plan: tvShowPlan };
    },
    downloadMovie: async () => ({
      ok: false,
      error: "Single-tap movie downloads are coming soon on iOS. Use queue actions for now."
    }),
    addMovieToQueue: async (payload) => {
      const item = {
        id: `movie-${Date.now()}`,
        kind: "movie",
        title: payload.title,
        movieUrl: payload.movieUrl,
        destination: payload.destination === "nas" ? "nas" : "local",
        status: "pending"
      };
      queueSnapshot.items.push(item);
      return { ok: true, item };
    },
    reloadCurrentPage: async () => ({ ok: true }),
    getNavigationState: async () => ({ canGoBack: false, canGoForward: false }),
    goBack: async () => ({ ok: true }),
    goForward: async () => ({ ok: true }),
    downloadCurrentStream: async () => ({ ok: false, error: "Not available on iOS yet." }),
    saveToNas: async () => ({ ok: false, error: "Use catalog season download on iOS." }),
    syncMoviesToNas: async () => ({ ok: false, error: "Library sync is coming soon on iOS." }),
    getDownloadQueue: async () => ({
      ok: true,
      snapshot: queueSnapshot,
      processing: queueSnapshot.processing
    }),
    getQueueDebug: async () => ({ ok: true, entries: [] }),
    addCurrentToQueue: async () => ({ ok: false, error: "Open a catalog title first." }),
    addSearchResultsToQueue: async () => ({ ok: false, error: "Add individual titles from the catalog on iOS." }),
    removeFromQueue: async (id) => {
      queueSnapshot.items = queueSnapshot.items.filter((item) => item.id !== id);
      return { ok: true };
    },
    clearDownloadQueue: async () => {
      queueSnapshot = { items: [], processing: false };
      return { ok: true };
    },
    startDownloadQueue: async () => ({
      ok: false,
      error: "Background FFmpeg downloads are coming soon on iOS. Queueing seasons works today."
    }),
    stopDownloadQueue: async () => {
      queueSnapshot.processing = false;
      return { ok: true };
    },
    scanTvShow: async () => {
      if (!tvShowPlan) return { ok: false, error: "Select a season in the catalog first." };
      return { ok: true, plan: tvShowPlan };
    },
    getTvShowPlan: async () => ({ ok: true, processing: false, plan: tvShowPlan }),
    clearTvShowPlan: async () => {
      tvShowPlan = null;
      return { ok: true };
    },
    async addTvPlanToQueue(destination = "local") {
      if (!tvShowPlan?.episodes?.length) {
        return { ok: false, error: "Scan a TV season first." };
      }

      const normalizedDestination = destination === "nas" ? "nas" : "local";
      const added = tvShowPlan.episodes.map((episode, index) => ({
        id: `episode-${Date.now()}-${index}`,
        kind: "episode",
        title: `${tvShowPlan.showTitle} S${String(tvShowPlan.season).padStart(2, "0")}E${String(episode.episode).padStart(2, "0")}`,
        movieUrl: episode.url,
        showTitle: tvShowPlan.showTitle,
        season: tvShowPlan.season,
        episode: episode.episode,
        episodeTitle: episode.title,
        posterUrl: tvShowPlan.posterUrl,
        destination: normalizedDestination,
        status: "pending"
      }));

      queueSnapshot.items.push(...added);
      return { ok: true, added, skipped: [], plan: tvShowPlan };
    },
    startTvShowDownload: async () => ({ ok: false, error: "Use queue actions on iOS." }),
    stopTvShowDownload: async () => ({ ok: true }),
    getNasCredentials: async () => {
      const settings = await MovieEngine.getStorageSettings();
      return { username: settings.nasUsername || "", hasPassword: Boolean(settings.nasPassword) };
    },
    connectNas: (payload) => MovieEngine.connectNas(payload || {}),
    saveNasCredentials: (payload) => MovieEngine.connectNas(payload || {}),
    openNasPortal: async () => ({ ok: false }),
    downloadStatus: async () => ({ state: "idle" }),
    clearDownloadJob: async () => ({ ok: true }),
    setProgressDockHeight: async () => ({ ok: true }),
    setChromeLayout: async () => ({ ok: true }),
    stopDownload: async () => ({ ok: true }),
    openOutputFolder: async () => {
      await MovieEngine.openLocalFolder();
      return { ok: true };
    },
    openSettingsWindow: async () => {
      window.location.href = "settings.html";
      return { ok: true };
    },
    getDownloadedMovies: async () => ({
      totalCount: 0,
      showCount: 0,
      local: { movies: [] },
      nas: { movies: [] }
    }),
    openDownloadedMovie: async () => ({ ok: false }),
    revealDownloadedMovie: async () => ({ ok: false }),
    embedMoviePoster: async () => ({ ok: false }),
    openLibraryFolder: async () => ({ ok: false }),
    openWarpDownload: async () => ({ ok: false }),
    openAnimeWindow: async () => ({ ok: false, error: "Anime mode is desktop-only." }),
    installWarpVpn: async () => ({ ok: false }),
    onPageLoadFailed: () => noopUnsub,
    onPageLoadSucceeded: () => noopUnsub,
    onBrowserContentVisible: () => noopUnsub,
    onGatewayRetry: () => noopUnsub,
    onPageGatewayFailed: () => noopUnsub,
    onNavigationStateChanged: () => noopUnsub,
    onRedirectBlocked: () => noopUnsub,
    onShowSearchLanding: () => noopUnsub,
    onStreamCaptureReset: () => noopUnsub,
    onDirectDownloadFound: () => noopUnsub,
    onStreamDebugReport: () => noopUnsub,
    onLibrarySyncProgress: () => noopUnsub,
    onDownloadQueueUpdated: () => noopUnsub,
    onQueueDebug: () => noopUnsub,
    onTvShowUpdated: () => noopUnsub,
    onSiteLoginResult: () => noopUnsub,
    onSiteLoginDebug: () => noopUnsub,
    onStorageSettingsUpdated: () => noopUnsub,
    getSiteLoginDebug: async () => ({ ok: true, entries: [] })
  };

  window.MovieEngine = MovieEngine;
})();
