(function createStreamAppIOS() {
  const { Preferences } = window.Capacitor?.Plugins || {};
  const getMovieEngine = () => window.MovieEngine;
  const SITE_BASE = "https://www4.tornadomovies.co";
  const SITE_HOME = `${SITE_BASE}/tornado-1`;

  const noopUnsub = () => {};

  function feedback(kind) {
    try {
      window.uiFeedback?.play(kind);
    } catch {
      // Feedback is optional.
    }
  }

  function buildSearchUrl(query) {
    const trimmed = String(query || "").trim();
    return `${SITE_BASE}/search_all/~${encodeURIComponent(trimmed)}~`;
  }

  function normalizeContentUrl(rawUrl) {
    const trimmed = String(rawUrl || "").trim();
    if (!trimmed) return "";
    try {
      return new URL(trimmed, SITE_BASE).href.replace(/\/$/, "");
    } catch {
      return trimmed;
    }
  }

  async function scrape(url, runnerExpression, options = {}) {
    const script = String(runnerExpression || "({ ok: false, error: 'Missing scrape runner.' })").trim();
    const timeoutMs = options.timeoutMs ?? 45000;
    try {
      const scrapePromise = getMovieEngine().scrapePage({
        url,
        script,
        waitMs: options.waitMs ?? 3200,
        retryWaitMs: options.retryWaitMs ?? 1800,
        overallTimeoutMs: options.overallTimeoutMs ?? timeoutMs,
        evalTimeoutMs: options.evalTimeoutMs ?? Math.min(timeoutMs - 3000, 40000),
        injectScrapers: options.injectScrapers !== false
      }).catch((error) => ({ ok: false, error: error?.message || "Scrape failed." }));
      const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => resolve({ ok: false, error: "Scrape timed out." }), timeoutMs + 10000);
      });
      const response = await Promise.race([scrapePromise, timeoutPromise]);
      const payload = response?.result ?? response;
      if (payload && typeof payload === "object" && payload.result && !payload.movies && !payload.seasons && !payload.detail && !payload.links) {
        return payload.result;
      }
      return payload;
    } catch (error) {
      console.warn("scrapePage failed", error);
      return { ok: false, error: error?.message || "Could not scrape page." };
    }
  }

  const SEARCH_RUNNER = `(function() {
    if (!window.mobileScrapers || typeof window.mobileScrapers.installSearch !== "function") {
      return { ok: false, movies: [], error: "Search scraper did not load." };
    }
    window.mobileScrapers.installSearch();
    return window.__tornadoScrapeSearchMovies
      ? window.__tornadoScrapeSearchMovies()
      : { ok: false, movies: [], error: "Search scraper unavailable." };
  })()`;

  const DETAIL_RUNNER = `(function() {
    if (!window.mobileScrapers) {
      return { detail: { ok: false, error: "Detail scraper did not load." }, seasons: [] };
    }
    if (typeof window.mobileScrapers.installSearch === "function") window.mobileScrapers.installSearch();
    if (typeof window.mobileScrapers.installTv === "function") window.mobileScrapers.installTv();
    return {
      detail: window.__tornadoScrapeMovieDetail
        ? window.__tornadoScrapeMovieDetail()
        : { ok: false, error: "Detail scraper unavailable." },
      seasons: (window.__tornadoScrapeSeasons ? window.__tornadoScrapeSeasons() : { seasons: [] }).seasons || []
    };
  })()`;

  const TV_SEASON_RUNNER = `(function() {
    if (!window.mobileScrapers || typeof window.mobileScrapers.installTv !== "function") {
      return { ok: false, episodes: [], error: "TV scraper did not load." };
    }
    window.mobileScrapers.installTv();
    return window.__tornadoScanTvShow
      ? window.__tornadoScanTvShow()
      : { ok: false, episodes: [] };
  })()`;

  const LOGIN_CHECK_RUNNER = `(function() {
    if (window.__tornadoLoginStarted && !window.__tornadoLoginDone) {
      return { pending: true };
    }
    var loginOk = window.__tornadoLoginOk === true;
    var loggedIn = !!document.querySelector('a[href*="logout"], a[href*="signout"]');
    var message = String(window.__tornadoLoginMsg || "");
    return {
      ok: loginOk || loggedIn,
      loggedIn: loggedIn,
      loggedOut: !loginOk && !loggedIn,
      loginOk: loginOk,
      error: (!loginOk && !loggedIn)
        ? (message || "Username or password is incorrect.")
        : null
    };
  })()`;

  function downloadLinkRunner(movieIds) {
    const ids = (Array.isArray(movieIds) ? movieIds : [movieIds]).map((id) => String(id || "")).filter(Boolean);
    const encoded = JSON.stringify(ids);
    return `(function() {
      window.__forcedDownloadIds = ${encoded};
      window.__forcedDownloadId = window.__forcedDownloadIds[0] || "";
      if (!window.mobileScrapers || typeof window.mobileScrapers.fetchDirectLinks !== "function") {
        return { ok: false, links: [], error: "Download scraper did not load." };
      }
      if (!window.__mobileDlJob) {
        window.__mobileDlJob = { pending: true };
        setTimeout(function() {
          window.mobileScrapers.fetchDirectLinks().then(function(result) {
            window.__mobileDlJob = { pending: false, result: result || { ok: false, links: [] } };
          }).catch(function(error) {
            window.__mobileDlJob = {
              pending: false,
              result: { ok: false, links: [], error: String(error && error.message ? error.message : error) }
            };
          });
        }, 0);
        return { pending: true };
      }
      if (window.__mobileDlJob.pending) return { pending: true };
      var result = window.__mobileDlJob.result;
      window.__mobileDlJob = null;
      return result || { ok: false, links: [], error: "empty scrape result" };
    })()`;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function safeOutputName(title, url) {
    let name = String(title || "").trim();
    if (!name) {
      try {
        const host = new URL(url).hostname.replace(/^www\./, "");
        name = `${host}-stream.mp4`;
      } catch {
        name = "stream.mp4";
      }
    }
    name = name.replace(/[^A-Za-z0-9._ -]+/g, "_").trim();
    if (!name) name = "stream.mp4";
    if (!/\.(mp4|mkv|mov|ts|m4v)$/i.test(name)) name += ".mp4";
    return name;
  }

  function pickBestDirectLink(links) {
    const list = Array.isArray(links) ? links : [];
    if (!list.length) return null;
    const scored = list
      .map((url) => {
        const match = String(url).match(/\/(2160|1440|1080|720|480|360)(?:\?|&|$|\/)/i);
        return { url, height: match ? Number(match[1]) : 0 };
      })
      .sort((a, b) => b.height - a.height);
    return scored[0]?.url || list[0];
  }

  function isRetryableDownloadError(error) {
    const text = String(error || "");
    return /expired|HTTP 40[13]|HTTP 416|fresh link|token|interrupted|timed out|network|connection/i.test(text);
  }

  async function getStorageSummary() {
    try {
      const local = await getMovieEngine().getLocalMoviesPath();
      const settings = await getMovieEngine().getStorageSettings();
      return {
        localPath: local.displayPath || local.path,
        nasPath: settings.nasVideoFolder || ""
      };
    } catch (error) {
      console.warn("getStorageSummary failed", error);
      return {
        localPath: "On My iPhone > Cinarip > Downloads",
        nasPath: ""
      };
    }
  }

  async function ensureAppDownloadsFolder() {
    try {
      await getMovieEngine().ensureLocalFolder();
    } catch (error) {
      console.warn("ensureLocalFolder failed", error);
    }
  }

  let tvShowPlan = null;
  let queueSnapshot = { items: [], processing: false, currentId: null };
  let queueCancelRequested = false;
  let downloadJobState = { state: "idle" };
  let libraryCache = null;
  let libraryCacheAt = 0;
  let environmentCache = null;
  let environmentCacheAt = 0;
  const queueListeners = new Set();
  const QUEUE_STORAGE_KEY = "ios_download_queue";

  function buildQueueSnapshot() {
    const items = queueSnapshot.items.map((item) => ({ ...item }));
    const pending = items.filter((item) => item.status === "pending").length;
    const done = items.filter((item) => item.status === "done").length;
    const failed = items.filter((item) => item.status === "failed").length;
    const movies = items.filter((item) => item.kind !== "episode").length;
    const episodes = items.filter((item) => item.kind === "episode").length;

    return {
      running: Boolean(queueSnapshot.processing),
      cancelRequested: false,
      currentId: queueSnapshot.currentId || null,
      items,
      counts: {
        total: items.length,
        pending,
        done,
        failed,
        movies,
        episodes
      }
    };
  }

  function notifyQueueUpdate(payload = {}) {
    const event = { snapshot: buildQueueSnapshot(), ...payload };
    for (const listener of queueListeners) {
      try {
        listener(event);
      } catch (error) {
        console.warn("queue listener failed", error);
      }
    }
  }

  async function persistQueue() {
    if (!Preferences) return;
    try {
      await Preferences.set({
        key: QUEUE_STORAGE_KEY,
        value: JSON.stringify({
          items: queueSnapshot.items,
          processing: false,
          currentId: null
        })
      });
    } catch (error) {
      console.warn("persistQueue failed", error);
    }
  }

  async function loadPersistedQueue() {
    if (!Preferences) return;
    try {
      const stored = await Preferences.get({ key: QUEUE_STORAGE_KEY });
      if (!stored?.value) return;
      const parsed = JSON.parse(stored.value);
      if (Array.isArray(parsed?.items)) {
        queueSnapshot.items = parsed.items;
        queueSnapshot.processing = false;
        queueSnapshot.currentId = null;
      }
    } catch (error) {
      console.warn("loadPersistedQueue failed", error);
    }
  }

  function findQueueItem(id) {
    return queueSnapshot.items.find((item) => item.id === id) || null;
  }

  function setQueueItemStatus(id, status, error = null) {
    const item = findQueueItem(id);
    if (!item) return null;
    item.status = status;
    item.error = error || null;
    if (status === "downloading" || status === "loading") {
      queueSnapshot.currentId = id;
    }
    return item;
  }

  function isUnusableDownloadScrape(result) {
    const reason = String(result?.reason || result?.error || "");
    return result?.jqueryReady === false
      || /missing-jquery/i.test(reason)
      || /did not load/i.test(reason)
      || /timed out/i.test(reason)
      || result?.loggedOut === true;
  }

  function extractWatchingId(url) {
    const text = String(url || "");
    const watching = text.match(/\/([A-Za-z0-9]+)-watching\.html?/i);
    return watching ? watching[1] : "";
  }

  function extractDownloadIds(url) {
    const text = String(url || "");
    const ids = [];
    const add = (value) => {
      const id = String(value || "").trim();
      if (!id || ids.includes(id) || /^(season|episode|watch|movie)$/i.test(id)) return;
      ids.push(id);
    };
    add(extractWatchingId(text));
    add(extractContentId(text));
    return ids;
  }

  function extractContentId(url) {
    const text = String(url || "");
    const movie = text.match(/\/movie\/[^/]+\/([^/?#]+)/i);
    if (movie) return movie[1];
    const tv = text.match(/\/(?:tv-series|tv|serie|series)\/[^/]+\/([^/?#]+)/i);
    if (tv) return tv[1];
    return "";
  }

  async function loadFullSiteCredentials() {
    try {
      const stored = await Preferences?.get({ key: "site_credentials" });
      const parsed = stored?.value ? JSON.parse(stored.value) : {};
      return {
        username: String(parsed.username || "").trim(),
        password: String(parsed.password || ""),
        autoLogin: parsed.autoLogin !== false
      };
    } catch {
      return { username: "", password: "", autoLogin: true };
    }
  }

  function withTimeout(promise, ms, error) {
    let timer = null;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => {
        resolve({ ok: false, error });
      }, ms);
    });
    return Promise.race([
      Promise.resolve(promise).finally(() => {
        if (timer) clearTimeout(timer);
      }),
      timeout
    ]);
  }

  async function fetchFreshDirectLink(movieUrl) {
    const pageUrl = normalizeContentUrl(movieUrl);
    const downloadIds = extractDownloadIds(pageUrl);
    const movieId = downloadIds[0] || extractContentId(pageUrl);
    const engine = getMovieEngine();
    const creds = await loadFullSiteCredentials();

    if (!creds.username || !creds.password) {
      return {
        ok: false,
        error: "Sign in on Tornado first. Open Settings, save Site Login, then try again."
      };
    }

    try {
      if (typeof engine.rememberSiteCredentials === "function") {
        await engine.rememberSiteCredentials({
          username: creds.username,
          password: creds.password
        });
      }
    } catch (error) {
      console.warn("rememberSiteCredentials failed", error);
    }

    const login = await withTimeout(
      scrape(SITE_HOME, LOGIN_CHECK_RUNNER, {
        waitMs: 400,
        retryWaitMs: 450,
        timeoutMs: 12000,
        overallTimeoutMs: 11000,
        evalTimeoutMs: 4000
      }),
      14000,
      "Timed out signing in."
    );
    if (login && login.ok === false && /did not load|timed out signing in/i.test(String(login.error || ""))) {
      console.warn("site login warm-up failed", login);
    }

    const native = await withTimeout((async () => {
      const response = await engine.fetchDirectLinks({
        url: pageUrl,
        movieId,
        movieIds: downloadIds,
        username: creds.username,
        password: creds.password
      }).catch((error) => ({
        ok: false,
        links: [],
        error: error?.message || "Native link fetch failed."
      }));
      return response?.result && Array.isArray(response.result.links) ? response.result : response;
    })(), 20000, "Timed out getting a download link.");
    const nativeIds = Array.isArray(native?.movieIds) ? native.movieIds : [];
    const allIds = [...new Set(downloadIds.concat(nativeIds).filter(Boolean))];
    const nativeBest = pickBestDirectLink(native?.links || []);
    if (nativeBest) {
      return { ok: true, url: nativeBest, links: native.links, source: "native" };
    }
    if (native?.loggedOut) {
      return {
        ok: false,
        error: native.error || "Not signed in on Tornado. Save Site Login, then try again.",
        debug: native
      };
    }

    const scrapeResult = await withTimeout(
      scrape(SITE_HOME, downloadLinkRunner(allIds.length ? allIds : downloadIds), {
        waitMs: 800,
        retryWaitMs: 700,
        timeoutMs: 25000,
        overallTimeoutMs: 22000,
        evalTimeoutMs: 10000
      }),
      28000,
      "Timed out getting a download link."
    );
    const scrapeLinks = scrapeResult?.links || [];
    const scrapeBest = pickBestDirectLink(scrapeLinks);
    if (scrapeBest) {
      return { ok: true, url: scrapeBest, links: scrapeLinks, source: "page" };
    }
    if (scrapeResult?.loggedOut) {
      return {
        ok: false,
        error: scrapeResult.error || "Not signed in on Tornado. Save Site Login, then try again.",
        debug: scrapeResult
      };
    }

    return {
      ok: false,
      error: scrapeResult?.error || native?.error || "Could not generate a fresh download link from the movie page.",
      debug: { native, scrape: scrapeResult, downloadIds: allIds }
    };
  }

  async function waitForNativeDownload(shouldContinue, timeoutMs = 8 * 60 * 60 * 1000) {
    const startedAt = Date.now();
    let sawRunning = false;
    while (Date.now() - startedAt < timeoutMs) {
      if (!shouldContinue()) {
        return { ok: false, cancelled: true };
      }
      try {
        downloadJobState = (await getMovieEngine().getDownloadStatus()) || { state: "idle" };
      } catch (error) {
        return { ok: false, error: error?.message || "Could not read download status." };
      }

      if (downloadJobState.state === "running") {
        sawRunning = true;
      }

      if (downloadJobState.state === "finished") {
        return { ok: true, status: downloadJobState };
      }
      if (downloadJobState.state === "failed") {
        return {
          ok: false,
          error: downloadJobState.lastLogLine || downloadJobState.phase || "Download failed."
        };
      }
      if (downloadJobState.state === "idle" && sawRunning) {
        await sleep(400);
        try {
          downloadJobState = (await getMovieEngine().getDownloadStatus()) || { state: "idle" };
        } catch (error) {
          return { ok: false, error: error?.message || "Could not read download status." };
        }
        if (downloadJobState.state === "finished") {
          return { ok: true, status: downloadJobState };
        }
        if (downloadJobState.state === "failed") {
          return {
            ok: false,
            error: downloadJobState.lastLogLine || downloadJobState.phase || "Download failed."
          };
        }
        return { ok: false, error: "Download ended before completion." };
      }
      await sleep(500);
    }
    return { ok: false, error: "Download timed out." };
  }

  async function startNativeDownload(item, directUrl) {
    const fileName = safeOutputName(item.title, directUrl);
    const started = await getMovieEngine().downloadFile({
      url: directUrl,
      fileName,
      referer: item.movieUrl
    });
    if (!started?.ok) {
      return { ok: false, error: started?.error || "Could not start download." };
    }
    downloadJobState = { state: "running", phase: "Downloading...", outputName: fileName, percent: 0 };
    return { ok: true, fileName };
  }

  async function processQueueItem(item) {
    if (item.kind === "episode") {
      // Reuse the same movie-page flow for episode URLs.
    }

    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (queueCancelRequested) return { cancelled: true };

      setQueueItemStatus(item.id, "loading");
      notifyQueueUpdate({
        phase: attempt === 1 ? "loading" : "retrying",
        item,
        attempt,
        snapshot: buildQueueSnapshot()
      });
      await persistQueue();

      notifyQueueUpdate({
        phase: "fetching-link",
        item,
        attempt,
        snapshot: buildQueueSnapshot()
      });

      const link = await fetchFreshDirectLink(item.movieUrl);
      if (queueCancelRequested) return { cancelled: true };
      if (!link.ok) {
        const retryLink = attempt < maxAttempts && !/timed out|did not load|missing-jquery|not signed in/i.test(String(link.error || ""));
        if (retryLink) continue;
        return { failed: link.error || "Could not generate a fresh download link." };
      }

      notifyQueueUpdate({
        phase: "preparing",
        item,
        attempt,
        snapshot: buildQueueSnapshot()
      });

      const started = await startNativeDownload(item, link.url);
      if (queueCancelRequested) return { cancelled: true };
      if (!started.ok) {
        if (attempt < maxAttempts && isRetryableDownloadError(started.error)) continue;
        return { failed: started.error || "Download failed to start." };
      }

      setQueueItemStatus(item.id, "downloading");
      feedback("start");
      notifyQueueUpdate({
        phase: "downloading",
        item,
        attempt,
        snapshot: buildQueueSnapshot()
      });
      await persistQueue();

      const finished = await waitForNativeDownload(() => !queueCancelRequested);
      await getMovieEngine().clearDownloadJob().catch(() => {});
      downloadJobState = { state: "idle" };

      if (finished.cancelled) {
        await getMovieEngine().stopDownload().catch(() => {});
        return { cancelled: true };
      }
      if (!finished.ok) {
        if (attempt < maxAttempts && isRetryableDownloadError(finished.error)) continue;
        return { failed: finished.error || "Download failed." };
      }

      const outputPath = finished.status?.outputPath;
      if (outputPath) {
        await saveTornadoPoster(item, outputPath);
      }

      return { ok: true };
    }

    return { failed: "Download failed after multiple attempts." };
  }

  async function saveTornadoPoster(item, outputPath) {
    const engine = getMovieEngine();
    if (!outputPath || typeof engine.fetchMoviePoster !== "function") {
      if (item.posterUrl && typeof engine.downloadArtwork === "function") {
        await engine.downloadArtwork({
          url: item.posterUrl,
          videoPath: outputPath,
          referer: item.movieUrl
        }).catch(() => {});
      }
      return;
    }
    await engine.fetchMoviePoster({
      pageUrl: item.movieUrl || "",
      posterUrl: item.posterUrl || "",
      videoPath: outputPath
    }).catch(() => {});
  }

  async function processDownloadQueue(destination) {
    try {
      libraryCacheAt = Date.now();
      const normalizedDestination = destination === "nas" ? "nas" : "local";
      if (normalizedDestination === "nas") {
        const nas = await getMovieEngine().connectNas({});
        if (!nas?.ok) {
          feedback("error");
          throw new Error(nas?.error || "Connect NAS in Settings before queueing to NAS.");
        }
      }

      for (const item of queueSnapshot.items) {
        if (item.status === "pending") {
          item.destination = normalizedDestination;
        }
      }
      await persistQueue();

      while (!queueCancelRequested) {
        const next = queueSnapshot.items.find((item) => item.status === "pending");
        if (!next) break;

        const outcome = await processQueueItem(next);
        if (outcome.cancelled) break;

        if (outcome.ok) {
          setQueueItemStatus(next.id, "done");
          feedback("success");
          notifyQueueUpdate({
            phase: "item-complete",
            item: findQueueItem(next.id),
            snapshot: buildQueueSnapshot()
          });
        } else {
          setQueueItemStatus(next.id, "failed", outcome.failed || "Download failed.");
          feedback("error");
          notifyQueueUpdate({
            phase: "item-failed",
            error: outcome.failed || "Download failed.",
            item: findQueueItem(next.id),
            snapshot: buildQueueSnapshot()
          });
        }
        await persistQueue();
      }
    } catch (error) {
      feedback("error");
      notifyQueueUpdate({
        phase: "error",
        error: error?.message || String(error),
        snapshot: buildQueueSnapshot()
      });
    } finally {
      queueSnapshot.processing = false;
      queueSnapshot.currentId = null;
      queueCancelRequested = false;
      downloadJobState = { state: "idle" };
      notifyQueueUpdate({ phase: "complete", snapshot: buildQueueSnapshot() });
      libraryCache = null;
      await persistQueue();
    }
  }

  window.streamApp = {
    getPlaylists: async () => ({ ok: true, playlists: [] }),
    scanDirectDownloads: async () => ({ ok: true, links: [] }),
    clearPlaylists: async () => ({ ok: true }),
    diagnoseStreams: async () => ({ ok: true, entries: [] }),
    openStreamDebugLog: async () => ({ ok: true }),
    async getEnvironment() {
      if (environmentCache && Date.now() - environmentCacheAt < 8000) {
        return environmentCache;
      }
      let storage = {
        localPath: "On My iPhone > Cinarip > Downloads",
        nasPath: ""
      };
      try {
        storage = await getStorageSummary();
      } catch (error) {
        console.warn("getEnvironment storage failed", error);
      }

      let siteUsername = null;
      try {
        const stored = await Preferences?.get({ key: "site_credentials" });
        if (stored?.value) siteUsername = JSON.parse(stored.value).username || null;
      } catch {
        // ignore
      }
      environmentCache = {
        profileId: "movies",
        profileLabel: "Cinarip",
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
      environmentCacheAt = Date.now();
      return environmentCache;
    },
    navigate: async () => ({ ok: false, error: "Use catalog search on iOS." }),
    reloadPage: async () => ({ ok: true }),
    goHome: async () => ({ ok: true, url: SITE_HOME }),
    getSiteCredentials: async () => {
      const parsed = await loadFullSiteCredentials();
      return {
        username: parsed.username || null,
        autoLogin: parsed.autoLogin !== false,
        hasPassword: Boolean(parsed.password)
      };
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
    siteLogin: async () => {
      const creds = await loadFullSiteCredentials();
      if (!creds.username || !creds.password) {
        return { ok: false, error: "Save your site login in Settings first." };
      }
      const engine = getMovieEngine();
      if (typeof engine.siteLogin !== "function") {
        return { ok: false, error: "Rebuild the app in Xcode to enable site login." };
      }
      return engine.siteLogin({
        username: creds.username,
        password: creds.password
      });
    },
    setCatalogBrowserLocked: async () => ({ ok: true, locked: true }),
    async searchMovies(query) {
      const trimmed = String(query || "").trim();
      if (!trimmed) {
        feedback("error");
        return { ok: false, error: "Enter a title to search.", movies: [] };
      }

      const url = buildSearchUrl(trimmed);
      const result = await scrape(url, SEARCH_RUNNER);

      if (result?.error && !result?.movies?.length) {
        feedback("error");
        return { ok: false, error: result.error, movies: [], query: trimmed, url };
      }

      if (!result?.movies?.length) {
        feedback("error");
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
      const movieUrl = normalizeContentUrl(payload.movieUrl);
      if (!movieUrl) return { ok: false, error: "Missing show URL." };

      const isTv = payload.kind === "tv" || /\/(?:tv-series|tv|serie|series)\//i.test(movieUrl);
      const fallbackMovie = {
        kind: isTv ? "tv" : "movie",
        movieUrl,
        title: payload.title || "Title",
        posterUrl: payload.posterUrl,
        year: payload.year
      };

      const result = await scrape(movieUrl, DETAIL_RUNNER, { waitMs: 4500, retryWaitMs: 2500 });

      if (result?.error && !result?.detail && !result?.seasons?.length) {
        feedback("error");
        return { ok: false, error: result.error, movie: fallbackMovie, seasons: [] };
      }

      const detail = result?.detail;
      const detailMovie = detail?.ok && detail?.movie ? detail.movie : null;
      const movie = {
        kind: detailMovie?.kind || fallbackMovie.kind,
        movieUrl: detailMovie?.movieUrl || movieUrl,
        title: detailMovie?.title || fallbackMovie.title,
        posterUrl: detailMovie?.posterUrl || fallbackMovie.posterUrl,
        year: detailMovie?.year || fallbackMovie.year
      };

      let seasons = Array.isArray(result?.seasons) ? result.seasons : [];
      seasons = seasons.filter((season) => {
        const url = String(season?.url || "");
        return /tornadomovies\.co/i.test(url) || url.startsWith("/");
      });
      if (isTv && !seasons.length) {
        seasons = [{ number: 1, label: "Season 1", url: movieUrl }];
      }

      if (!detailMovie && detail?.error) {
        return {
          ok: false,
          error: detail.error,
          movie,
          seasons: isTv ? seasons : []
        };
      }

      return { ok: true, movie, seasons };
    },
    async catalogScanTvSeason(payload = {}) {
      const seasonUrl = normalizeContentUrl(payload.seasonUrl || payload.url);
      if (!seasonUrl) return { ok: false, error: "No season URL provided." };

      const scan = await scrape(seasonUrl, TV_SEASON_RUNNER, { waitMs: 4500, retryWaitMs: 2500 });

      if (!scan?.ok || !scan?.episodes?.length) {
        feedback("error");
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
    downloadMovie: async (payload = {}) => {
      if (queueSnapshot.processing) {
        feedback("warning");
        return { ok: false, error: "Queue is already running." };
      }
      const movieUrl = normalizeContentUrl(payload.movieUrl);
      if (!movieUrl) {
        feedback("error");
        return { ok: false, error: "Missing movie URL." };
      }

      const item = {
        id: `movie-${Date.now()}`,
        kind: "movie",
        title: payload.title || "Movie",
        movieUrl,
        posterUrl: payload.posterUrl || null,
        destination: payload.destination === "nas" ? "nas" : "local",
        status: "pending",
        error: null,
        addedAt: Date.now()
      };
      queueSnapshot.items.push(item);
      notifyQueueUpdate();
      await persistQueue();

      queueCancelRequested = false;
      queueSnapshot.processing = true;
      notifyQueueUpdate({ phase: "running", snapshot: buildQueueSnapshot() });
      void processDownloadQueue(payload.destination || "local").catch((error) => {
        notifyQueueUpdate({
          phase: "error",
          error: error?.message || String(error),
          snapshot: buildQueueSnapshot()
        });
      });
      return { ok: true, item };
    },
    addMovieToQueue: async (payload) => {
      const item = {
        id: `movie-${Date.now()}`,
        kind: "movie",
        title: payload.title || "Movie",
        movieUrl: normalizeContentUrl(payload.movieUrl),
        posterUrl: payload.posterUrl || null,
        destination: payload.destination === "nas" ? "nas" : "local",
        status: "pending",
        error: null,
        addedAt: Date.now()
      };
      if (!item.movieUrl) {
        feedback("error");
        return { ok: false, error: "Missing movie URL." };
      }
      queueSnapshot.items.push(item);
      notifyQueueUpdate();
      await persistQueue();
      feedback("confirm");
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
      snapshot: buildQueueSnapshot(),
      processing: queueSnapshot.processing
    }),
    getQueueDebug: async () => ({ ok: true, entries: [] }),
    addCurrentToQueue: async () => ({ ok: false, error: "Open a catalog title first." }),
    addSearchResultsToQueue: async () => ({ ok: false, error: "Add individual titles from the catalog on iOS." }),
    removeFromQueue: async (id) => {
      queueSnapshot.items = queueSnapshot.items.filter((item) => item.id !== id);
      notifyQueueUpdate();
      await persistQueue();
      return { ok: true };
    },
    clearDownloadQueue: async () => {
      queueSnapshot = { items: [], processing: false, currentId: null };
      notifyQueueUpdate();
      await persistQueue();
      return { ok: true };
    },
    startDownloadQueue: async (destination = "local") => {
      if (queueSnapshot.processing && downloadJobState.state !== "running") {
        queueCancelRequested = true;
        queueSnapshot.processing = false;
      }
      if (queueSnapshot.processing) {
        feedback("warning");
        return { ok: false, error: "Queue is already running." };
      }
      const pending = queueSnapshot.items.filter((item) => item.status === "pending");
      if (!pending.length) {
        feedback("error");
        return { ok: false, error: "Queue is empty. Add movies or TV episodes first." };
      }

      queueCancelRequested = false;
      queueSnapshot.processing = true;
      notifyQueueUpdate({ phase: "running", snapshot: buildQueueSnapshot() });

      void processDownloadQueue(destination).catch((error) => {
        notifyQueueUpdate({
          phase: "error",
          error: error?.message || String(error),
          snapshot: buildQueueSnapshot()
        });
      });

      return { ok: true, started: true, destination: destination === "nas" ? "nas" : "local" };
    },
    stopDownloadQueue: async () => {
      queueCancelRequested = true;
      queueSnapshot.processing = false;
      await getMovieEngine().stopDownload().catch(() => {});
      downloadJobState = { state: "idle" };
      notifyQueueUpdate({ phase: "stopping", snapshot: buildQueueSnapshot() });
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
        feedback("error");
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
      notifyQueueUpdate();
      await persistQueue();
      feedback("confirm");
      return { ok: true, added, skipped: [], plan: tvShowPlan };
    },
    startTvShowDownload: async () => ({ ok: false, error: "Use queue actions on iOS." }),
    stopTvShowDownload: async () => ({ ok: true }),
    getNasCredentials: async () => {
      const settings = await getMovieEngine().getStorageSettings();
      return { username: settings.nasUsername || "", hasPassword: Boolean(settings.nasPassword) };
    },
    connectNas: (payload) => getMovieEngine().connectNas(payload || {}),
    saveNasCredentials: (payload) => getMovieEngine().connectNas(payload || {}),
    openNasPortal: async () => ({ ok: false }),
    downloadStatus: async () => downloadJobState,
    clearDownloadJob: async () => {
      await getMovieEngine().clearDownloadJob().catch(() => {});
      downloadJobState = { state: "idle" };
      return { ok: true };
    },
    setProgressDockHeight: async () => ({ ok: true }),
    setChromeLayout: async () => ({ ok: true }),
    stopDownload: async () => {
      queueCancelRequested = true;
      await getMovieEngine().stopDownload().catch(() => {});
      downloadJobState = { state: "idle" };
      return { ok: true };
    },
    openOutputFolder: async () => {
      await getMovieEngine().openLocalFolder();
      return { ok: true };
    },
    openSettingsWindow: async () => {
      window.location.href = "settings.html";
      return { ok: true };
    },
    getDownloadedMovies: async () => {
      const now = Date.now();
      if (queueSnapshot.processing) {
        if (libraryCache) return libraryCache;
      } else if (libraryCache && now - libraryCacheAt < 5000) {
        return libraryCache;
      }

      if (!queueSnapshot.processing) {
        await ensureAppDownloadsFolder();
      }
      let local = {
        location: "local",
        folderPath: "",
        displayPath: "On My iPhone > Cinarip > Downloads",
        exists: true,
        accessible: true,
        error: null,
        movies: [],
        entries: [],
        movieCount: 0,
        showCount: 0,
        episodeCount: 0
      };

      try {
        local = await getMovieEngine().listLocalDownloads();
      } catch (error) {
        local.error = error?.message || "Could not scan the app download folder.";
        local.accessible = false;
      }

      const nas = {
        location: "nas",
        folderPath: "",
        exists: false,
        accessible: false,
        error: "Use NAS settings to connect over SMB.",
        movies: [],
        entries: [],
        movieCount: 0,
        showCount: 0,
        episodeCount: 0
      };

      const totalCount = (local.movieCount || local.movies?.length || 0) + (nas.movieCount || 0);
      const payload = {
        local,
        nas,
        totalCount,
        movieCount: local.movieCount || local.movies?.length || 0,
        showCount: (local.showCount || 0) + (nas.showCount || 0),
        episodeCount: (local.episodeCount || 0) + (nas.episodeCount || 0)
      };
      libraryCache = payload;
      libraryCacheAt = Date.now();
      return payload;
    },
    openDownloadedMovie: async (filePath) => {
      if (!filePath) return { ok: false, error: "Missing video path." };
      if (typeof getMovieEngine().playVideo !== "function") {
        return { ok: false, error: "Rebuild the app in Xcode to play library videos." };
      }
      return getMovieEngine().playVideo({ path: filePath });
    },
    revealDownloadedMovie: async () => ({ ok: false }),
    embedMoviePoster: async () => ({ ok: false }),
    openLibraryFolder: async (location) => {
      if (location === "local") {
        await getMovieEngine().openLocalFolder();
        return { ok: true };
      }
      return { ok: false, error: "Open NAS folders from Files after connecting your share." };
    },
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
    onDownloadQueueUpdated: (callback) => {
      if (typeof callback !== "function") return noopUnsub;
      queueListeners.add(callback);
      callback({ snapshot: buildQueueSnapshot() });
      return () => queueListeners.delete(callback);
    },
    onQueueDebug: () => noopUnsub,
    onTvShowUpdated: () => noopUnsub,
    onSiteLoginResult: () => noopUnsub,
    onSiteLoginDebug: () => noopUnsub,
    onStorageSettingsUpdated: () => noopUnsub,
    getSiteLoginDebug: async () => ({ ok: true, entries: [] })
  };

  ensureAppDownloadsFolder();
  loadPersistedQueue().then(() => notifyQueueUpdate());
})();
