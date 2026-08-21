const brandTitle = document.getElementById("brand-title");
const landingTitle = document.getElementById("landing-title");
const landingLead = document.getElementById("landing-lead");
const envStatus = document.getElementById("env-status");
const downloadStatus = document.getElementById("download-status");
const streamStatus = document.getElementById("stream-status");
const downloadButton = document.getElementById("download");
const saveNasButton = document.getElementById("save-nas");
const stopButton = document.getElementById("stop-download");
const refreshButton = document.getElementById("refresh-detect");
const reloadSiteButton = document.getElementById("reload-site");
const backButton = document.getElementById("go-back");
const forwardButton = document.getElementById("go-forward");
const openSettingsButton = document.getElementById("open-settings");
const syncToNasButton = document.getElementById("sync-to-nas");
const nasConnectPanel = document.getElementById("nas-connect-panel");
const nasConnectForm = document.getElementById("nas-connect-form");
const nasUsernameInput = document.getElementById("nas-username");
const nasPasswordInput = document.getElementById("nas-password");
const nasConnectError = document.getElementById("nas-connect-error");
const nasConnectCancel = document.getElementById("nas-connect-cancel");
const siteConnectPanel = document.getElementById("site-connect-panel");
const siteConnectForm = document.getElementById("site-connect-form");
const siteUsernameInput = document.getElementById("site-username");
const sitePasswordInput = document.getElementById("site-password");
const siteAutoLoginInput = document.getElementById("site-auto-login");
const siteConnectError = document.getElementById("site-connect-error");
const siteConnectCancel = document.getElementById("site-connect-cancel");
const blockedPanel = document.getElementById("blocked-panel");
const blockedDetail = document.getElementById("blocked-detail");
const installStatus = document.getElementById("install-status");
const installWarpButton = document.getElementById("install-warp");
const retryLoadButton = document.getElementById("retry-load");
const warpDownloadLink = document.getElementById("warp-download-link");
const adblockStatus = document.getElementById("adblock-status");
const redirectStatus = document.getElementById("redirect-status");
const searchPanel = document.getElementById("search-panel");
const searchError = document.getElementById("search-error");
const browseHomeButton = document.getElementById("browse-home");
const catalogHome = document.getElementById("catalog-home");
const catalogLibrary = document.getElementById("catalog-library");
const catalogResults = document.getElementById("catalog-results");
const catalogDetail = document.getElementById("catalog-detail");
const catalogGrid = document.getElementById("catalog-grid");
const catalogResultsTitle = document.getElementById("catalog-results-title");
const catalogResultsSummary = document.getElementById("catalog-results-summary");
const catalogBackHome = document.getElementById("catalog-back-home");
const catalogBackLibraryHome = document.getElementById("catalog-back-library-home");
const catalogBackResults = document.getElementById("catalog-back-results");
const openLibraryButton = document.getElementById("open-library");

function setToolbarDisabled(button, disabled) {
  if (button) button.disabled = disabled;
}
const catalogQueueAll = document.getElementById("catalog-queue-all");
const catalogDetailPoster = document.getElementById("catalog-detail-poster");
const catalogDetailTitle = document.getElementById("catalog-detail-title");
const catalogDetailYear = document.getElementById("catalog-detail-year");
const catalogDetailStatus = document.getElementById("catalog-detail-status");
const catalogDownloadLocal = document.getElementById("catalog-download-local");
const catalogDownloadNas = document.getElementById("catalog-download-nas");
const catalogAddQueue = document.getElementById("catalog-add-queue");
const catalogTvPanel = document.getElementById("catalog-tv-panel");
const catalogSeasonSelect = document.getElementById("catalog-season-select");
const catalogEpisodeSummary = document.getElementById("catalog-episode-summary");
const catalogEpisodeList = document.getElementById("catalog-episode-list");
const catalogBrand = document.getElementById("catalog-brand");
const toolbarSearchForm = document.getElementById("toolbar-search-form");
const toolbarSearchInput = document.getElementById("toolbar-search-input");
const progressDock = document.getElementById("progress-dock");
const progressPhase = document.getElementById("progress-phase");
const progressPercent = document.getElementById("progress-percent");
const progressTrack = document.getElementById("progress-track");
const progressFill = document.getElementById("progress-fill");
const progressDetailLeft = document.getElementById("progress-detail-left");
const progressDetailRight = document.getElementById("progress-detail-right");
const librarySections = document.getElementById("library-sections");
const librarySummary = document.getElementById("library-summary");
const refreshLibraryButton = document.getElementById("refresh-library");
const streamDebugButton = document.getElementById("stream-debug");
const activityLog = document.getElementById("activity-log");
const activityLogClear = document.getElementById("activity-log-clear");
const activityLogCopy = document.getElementById("activity-log-copy");
const downloadQueueSummary = document.getElementById("download-queue-summary");
const downloadQueueList = document.getElementById("download-queue-list");
const addSearchToQueueButton = document.getElementById("add-search-to-queue");
const addCurrentToQueueButton = document.getElementById("add-current-to-queue");
const startDownloadQueueLocalButton = document.getElementById("start-download-queue-local");
const startDownloadQueueNasButton = document.getElementById("start-download-queue-nas");
const stopDownloadQueueButton = document.getElementById("stop-download-queue");
const clearDownloadQueueButton = document.getElementById("clear-download-queue");
const queueDebugCopyButton = document.getElementById("queue-debug-copy");
const searchFeatures = document.getElementById("search-features");
const tvShowLead = document.getElementById("tv-show-lead");
const tvShowTitle = document.getElementById("tv-show-title");
const downloadQueueSection = document.getElementById("download-queue-section");
const tvShowSection = document.getElementById("tv-show-section");
const tvShowSummary = document.getElementById("tv-show-summary");
const tvShowEpisodeList = document.getElementById("tv-show-episode-list");
const scanTvShowButton = document.getElementById("scan-tv-show");
const addTvToQueueButton = document.getElementById("add-tv-to-queue");
const clearTvShowPlanButton = document.getElementById("clear-tv-show-plan");
const browseSiteForTvButton = document.getElementById("browse-site-for-tv");
const backToCatalogButton = document.getElementById("back-to-catalog");

const PROGRESS_DOCK_HEIGHT = 88;
const MAX_LOG_ENTRIES = 120;

let progressHideTimer = null;
let progressErrorPinned = false;
let chromeLayoutFrame = null;
let downloadActive = false;
let librarySyncActive = false;
let queueActive = false;
let tvShowActive = false;
let tvShowPlan = null;
let siteBrowseMode = false;
let hideMovieDownloader = false;
let catalogMode = false;
let catalogMovies = [];
let selectedCatalogMovie = null;
let catalogView = "home";
let catalogTvSeasons = [];
let catalogTvPlan = null;
let catalogTvScanning = false;
let catalogHomeAnimated = false;
let siteLabel = "Tornado Movies";
let pendingNasRetry = null;
let lastLibraryRefreshAt = 0;
let activityLogEntries = [];
let loggedDownloadJobId = null;

function formatLogTime(date = new Date()) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function appendActivityLog(level, message, detail = null) {
  const empty = activityLog.querySelector(".activity-log-empty");
  if (empty) empty.remove();

  const entry = document.createElement("article");
  entry.className = `log-entry ${level}`;

  const head = document.createElement("div");
  head.className = "log-entry-head";

  const time = document.createElement("span");
  time.className = "log-time";
  time.textContent = formatLogTime();

  const levelLabel = document.createElement("span");
  levelLabel.className = "log-level";
  levelLabel.textContent = level;

  head.append(time, levelLabel);

  const body = document.createElement("div");
  body.className = "log-message";
  body.textContent = message;

  entry.append(head, body);

  if (detail) {
    const pre = document.createElement("pre");
    pre.className = "log-detail";
    pre.textContent = detail;
    entry.appendChild(pre);
  }

  activityLog.appendChild(entry);
  activityLog.scrollTop = activityLog.scrollHeight;

  activityLogEntries.push({ level, message, detail, time: time.textContent });
  if (activityLogEntries.length > MAX_LOG_ENTRIES) {
    activityLogEntries.shift();
    activityLog.firstElementChild?.remove();
  }
}

function clearActivityLog() {
  activityLogEntries = [];
  activityLog.replaceChildren();
  const empty = document.createElement("p");
  empty.className = "activity-log-empty";
  empty.textContent = "Download and stream events will appear here.";
  activityLog.appendChild(empty);
}

function getActivityLogText() {
  return activityLogEntries
    .map((entry) => {
      const lines = [`[${entry.time}] ${entry.level.toUpperCase()} ${entry.message}`];
      if (entry.detail) lines.push(entry.detail);
      return lines.join("\n");
    })
    .join("\n\n");
}

function showStreamDebugPanel(text) {
  const summary = text?.split("\n").find((line) => line.startsWith("Summary:")) || "Stream diagnosis";
  appendActivityLog("debug", summary.replace(/^Summary:\s*/, "") || "Stream diagnosis complete", text);
}

async function refreshStreamDebug() {
  appendActivityLog("info", "Running stream diagnosis...");
  try {
    const result = await window.streamApp.diagnoseStreams();
    if (!result.ok) {
      appendActivityLog("error", result.error || "Stream diagnosis failed.");
      return;
    }
    showStreamDebugPanel(result.text);
    if (result.report?.summary) {
      streamStatus.textContent = `Debug: ${result.report.summary}`;
    }
  } catch (error) {
    appendActivityLog("error", error.message || "Stream diagnosis failed.");
  }
}

function showSearchPanel() {
  searchPanel.hidden = false;
  if (catalogMode) {
    const keep =
      catalogView === "detail" || catalogView === "results" || catalogView === "library"
        ? catalogView
        : "home";
    showCatalogView(keep);
    streamStatus.textContent =
      catalogView === "home" ? "Search the catalog to begin." : streamStatus.textContent;
  } else {
    streamStatus.textContent = hideMovieDownloader
      ? "Search for an anime series on Aniwave."
      : "Search for a movie to begin.";
  }
  toolbarSearchInput?.focus();
}

function hideSearchPanel() {
  if (catalogMode) return;
  searchPanel.hidden = true;
  searchError.textContent = "";
}

function showCatalogView(view) {
  if (!catalogMode) return;
  const previous = catalogView;
  catalogView = view;
  siteBrowseMode = false;
  searchPanel.hidden = false;
  searchPanel.classList.add("catalog-mode");
  searchPanel.classList.remove("site-browse-mode");
  if (browseSiteForTvButton) browseSiteForTvButton.hidden = false;
  if (backToCatalogButton) backToCatalogButton.hidden = true;
  if (catalogHome) catalogHome.hidden = view !== "home";
  if (catalogLibrary) catalogLibrary.hidden = view !== "library";
  if (catalogResults) catalogResults.hidden = view !== "results";
  if (catalogDetail) catalogDetail.hidden = view !== "detail";
  reportChromeLayout();

  if (view === "home" && catalogHome && (previous !== "home" || !catalogHomeAnimated)) {
    catalogHomeAnimated = true;
    window.shellMotion?.animateCatalogHome(catalogHome);
  }
  if (view === "library") {
    refreshLibrary(true);
  }
}

function renderCatalogPoster(container, movie, className) {
  container.innerHTML = "";
  if (movie?.posterUrl) {
    const img = document.createElement("img");
    img.src = movie.posterUrl;
    img.alt = movie.title || "Poster";
    img.loading = "lazy";
    img.addEventListener("error", () => {
      container.innerHTML = "";
      const fallback = document.createElement("div");
      fallback.className = className;
      fallback.textContent = movie.title || "No poster";
      container.appendChild(fallback);
    });
    container.appendChild(img);
    return;
  }
  const fallback = document.createElement("div");
  fallback.className = className;
  fallback.textContent = movie?.title || "No poster";
  container.appendChild(fallback);
}

function isCatalogTvItem(item) {
  return item?.kind === "tv" || /\/(?:tv-series|tv|serie|series)\//i.test(String(item?.movieUrl || ""));
}

function renderCatalogGrid(movies, query, counts = null) {
  catalogMovies = Array.isArray(movies) ? movies : [];
  if (!catalogGrid) return;
  catalogGrid.innerHTML = "";

  if (catalogResultsTitle) {
    catalogResultsTitle.textContent = query ? `Results for “${query}”` : "Results";
  }
  if (catalogResultsSummary) {
    const total = catalogMovies.length;
    const movieCount = counts?.movies ?? catalogMovies.filter((item) => !isCatalogTvItem(item)).length;
    const tvCount = counts?.tv ?? catalogMovies.filter((item) => isCatalogTvItem(item)).length;
    catalogResultsSummary.textContent = `${total} title${total === 1 ? "" : "s"} · ${movieCount} movie${movieCount === 1 ? "" : "s"} · ${tvCount} TV`;
  }

  for (const movie of catalogMovies) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `catalog-card${isCatalogTvItem(movie) ? " kind-tv" : " kind-movie"}`;
    card.setAttribute("role", "listitem");

    const poster = document.createElement("div");
    poster.className = "catalog-card-poster";
    renderCatalogPoster(poster, movie, "catalog-card-poster-fallback");

    const badge = document.createElement("span");
    badge.className = "catalog-card-kind";
    badge.textContent = isCatalogTvItem(movie) ? "TV" : "Movie";
    poster.appendChild(badge);

    const title = document.createElement("div");
    title.className = "catalog-card-title";
    title.textContent = movie.title || (isCatalogTvItem(movie) ? "TV Show" : "Movie");

    card.append(poster, title);
    if (movie.year) {
      const year = document.createElement("div");
      year.className = "catalog-card-year";
      year.textContent = movie.year;
      card.appendChild(year);
    }

    card.addEventListener("click", () => openCatalogMovie(movie));
    catalogGrid.appendChild(card);
  }

  showCatalogView("results");
  const cards = catalogGrid.querySelectorAll(".catalog-card");
  window.shellMotion?.animateCatalogGrid(cards);
  window.shellMotion?.bindPosterInteractions?.(cards);
}

function clearCatalogTvPanel() {
  catalogTvSeasons = [];
  catalogTvPlan = null;
  catalogTvScanning = false;
  if (catalogTvPanel) catalogTvPanel.hidden = true;
  if (catalogSeasonSelect) catalogSeasonSelect.replaceChildren();
  if (catalogEpisodeSummary) catalogEpisodeSummary.textContent = "";
  if (catalogEpisodeList) catalogEpisodeList.replaceChildren();
}

function renderCatalogEpisodeList(plan) {
  if (!catalogEpisodeList || !catalogEpisodeSummary) return;

  catalogEpisodeList.replaceChildren();
  if (!plan?.episodes?.length) {
    catalogEpisodeSummary.textContent = "No episodes found for this season.";
    return;
  }

  catalogEpisodeSummary.textContent = `${plan.showTitle || selectedCatalogMovie?.title || "Show"} · Season ${String(plan.season || 1).padStart(2, "0")} · ${plan.episodes.length} episode${plan.episodes.length === 1 ? "" : "s"}`;

  for (const episode of plan.episodes) {
    const item = document.createElement("li");
    const season = String(episode.season || plan.season || 1).padStart(2, "0");
    const episodeNumber = String(episode.episode || 0).padStart(2, "0");
    item.textContent = episode.title
      ? `S${season}E${episodeNumber} · ${episode.title}`
      : `S${season}E${episodeNumber}`;
    catalogEpisodeList.appendChild(item);
  }
}

function renderCatalogTvSeasons(seasons = []) {
  catalogTvSeasons = Array.isArray(seasons) ? seasons : [];
  if (!catalogTvPanel || !catalogSeasonSelect) return;

  catalogSeasonSelect.replaceChildren();
  if (!catalogTvSeasons.length) {
    catalogTvPanel.hidden = true;
    return;
  }

  for (const season of catalogTvSeasons) {
    const option = document.createElement("option");
    option.value = String(season.number);
    option.textContent = season.label || `Season ${season.number}`;
    option.dataset.url = season.url || "";
    catalogSeasonSelect.appendChild(option);
  }

  catalogTvPanel.hidden = false;
}

function selectedCatalogSeason() {
  if (!catalogSeasonSelect) return null;
  const option = catalogSeasonSelect.selectedOptions[0];
  if (!option) return catalogTvSeasons[0] || null;
  const number = Number.parseInt(option.value, 10);
  return (
    catalogTvSeasons.find((season) => season.number === number) || {
      number,
      label: option.textContent,
      url: option.dataset.url || selectedCatalogMovie?.movieUrl || ""
    }
  );
}

async function scanSelectedCatalogSeason() {
  if (!selectedCatalogMovie?.movieUrl || catalogTvScanning) {
    return catalogTvPlan;
  }

  const season = selectedCatalogSeason();
  if (!season?.url) {
    if (catalogDetailStatus) {
      catalogDetailStatus.textContent = "Pick a season to load episodes.";
    }
    return null;
  }

  catalogTvScanning = true;
  catalogTvPlan = null;
  if (catalogDetailStatus) {
    catalogDetailStatus.textContent = `Loading ${season.label || "season"}...`;
  }
  if (catalogEpisodeSummary) {
    catalogEpisodeSummary.textContent = "Scanning episodes in the background...";
  }
  if (catalogEpisodeList) catalogEpisodeList.replaceChildren();

  const result = await window.streamApp.catalogScanTvSeason({
    seasonUrl: season.url,
    season: season.number,
    showTitle: selectedCatalogMovie.title,
    showUrl: selectedCatalogMovie.movieUrl,
    posterUrl: selectedCatalogMovie.posterUrl
  });

  catalogTvScanning = false;

  if (!result.ok) {
    if (catalogDetailStatus) {
      catalogDetailStatus.textContent = result.error || "Could not scan this season.";
    }
    if (catalogEpisodeSummary) {
      catalogEpisodeSummary.textContent = result.error || "Could not scan this season.";
    }
    appendActivityLog("error", result.error || "Could not scan TV season.");
    return null;
  }

  catalogTvPlan = result.plan;
  renderCatalogEpisodeList(catalogTvPlan);
  if (catalogDetailStatus) {
    catalogDetailStatus.textContent = `${catalogTvPlan.episodes.length} episodes ready. Add to queue or download.`;
  }
  streamStatus.textContent = `Loaded ${catalogTvPlan.showTitle} · Season ${catalogTvPlan.season}`;
  return catalogTvPlan;
}

async function ensureCatalogTvPlanReady() {
  if (catalogTvPlan?.episodes?.length) {
    return catalogTvPlan;
  }
  return scanSelectedCatalogSeason();
}

async function queueSelectedCatalogSeason(destination = "local") {
  const plan = await ensureCatalogTvPlanReady();
  if (!plan?.episodes?.length) {
    return { ok: false, error: "Scan a season first." };
  }

  const result = await window.streamApp.addTvPlanToQueue(destination);
  if (!result.ok) {
    appendActivityLog("error", result.error || "Could not add season to queue.");
    return result;
  }

  appendActivityLog(
    "success",
    `Added ${result.added?.length || plan.episodes.length} episode(s) from ${plan.showTitle} to the queue.`
  );
  if (catalogDetailStatus) {
    catalogDetailStatus.textContent = `Added ${result.added?.length || plan.episodes.length} episodes to the queue.`;
  }
  return result;
}

function updateCatalogDetailActions(movie) {
  const isTv = isCatalogTvItem(movie);
  if (catalogDownloadLocal) {
    catalogDownloadLocal.textContent = isTv ? "Download Season → PC" : "Download → PC";
    catalogDownloadLocal.hidden = false;
  }
  if (catalogDownloadNas) {
    catalogDownloadNas.textContent = isTv ? "Download Season → NAS" : "Save to NAS";
    catalogDownloadNas.hidden = false;
  }
  if (catalogAddQueue) {
    catalogAddQueue.textContent = isTv ? "Add Season to Queue" : "Add to Queue";
  }
  if (catalogTvPanel) {
    catalogTvPanel.hidden = !isTv;
  }
}

function renderCatalogDetail(movie) {
  selectedCatalogMovie = movie;
  const isTv = isCatalogTvItem(movie);
  clearCatalogTvPanel();
  if (catalogDetailTitle) catalogDetailTitle.textContent = movie.title || (isTv ? "TV Show" : "Movie");
  if (catalogDetailYear) {
    catalogDetailYear.textContent = [isTv ? "TV Show" : "Movie", movie.year].filter(Boolean).join(" · ");
  }
  if (catalogDetailStatus) {
    catalogDetailStatus.textContent = isTv
      ? "Choose a season, then download or add episodes to the queue."
      : "Ready to download or add to queue.";
  }
  if (catalogDetailPoster) {
    renderCatalogPoster(catalogDetailPoster, movie, "catalog-detail-poster-fallback");
  }
  updateCatalogDetailActions(movie);
  if (isTv && catalogTvPanel) catalogTvPanel.hidden = false;
  const wasDetail = catalogView === "detail";
  showCatalogView("detail");
  if (!wasDetail) {
    window.shellMotion?.animateCatalogDetail(catalogDetail);
  }
}

async function openCatalogMovie(movie) {
  if (!movie?.movieUrl) return;
  selectedCatalogMovie = movie;
  renderCatalogDetail(movie);
  const isTv = isCatalogTvItem(movie);
  streamStatus.textContent = `Opening “${movie.title || (isTv ? "show" : "movie")}”...`;
  if (catalogDetailStatus) {
    catalogDetailStatus.textContent = isTv ? "Loading show details..." : "Loading movie details...";
  }

  const result = await window.streamApp.catalogOpenMovie(movie);
  if (result.movie) {
    selectedCatalogMovie = { ...movie, ...result.movie };
    renderCatalogDetail(selectedCatalogMovie);
  }
  if (!result.ok) {
    streamStatus.textContent = result.error || "Could not open details.";
    if (catalogDetailStatus) {
      catalogDetailStatus.textContent = result.error || "Showing search result details.";
    }
    appendActivityLog("error", result.error || "Could not open details.");
    return;
  }

  streamStatus.textContent = `Selected “${selectedCatalogMovie.title}”`;
  if (isCatalogTvItem(selectedCatalogMovie)) {
    renderCatalogTvSeasons(result.seasons || [{ number: 1, label: "Season 1", url: selectedCatalogMovie.movieUrl }]);
    await scanSelectedCatalogSeason();
    return;
  }

  if (catalogDetailStatus) {
    catalogDetailStatus.textContent = "Ready to download or add to queue.";
  }
}

async function openSelectedCatalogTvShow() {
  if (!selectedCatalogMovie?.movieUrl) {
    appendActivityLog("error", "Select a TV show from the catalog first.");
    return;
  }
  await setSiteBrowseMode(true);
  const result = await window.streamApp.navigate(selectedCatalogMovie.movieUrl);
  if (result?.ok === false) {
    appendActivityLog("error", result.error || "Could not open the show page.");
    return;
  }
  streamStatus.textContent = `Opened “${selectedCatalogMovie.title}” — pick a season, then Scan Current Season.`;
  appendActivityLog("info", `Opened TV show “${selectedCatalogMovie.title}” for scanning`);
}

async function downloadSelectedCatalogMovie(destination) {
  if (!selectedCatalogMovie?.movieUrl) {
    appendActivityLog("error", "Select a title from the catalog first.");
    return;
  }
  if (isCatalogTvItem(selectedCatalogMovie)) {
    const label = destination === "nas" ? "NAS" : "PC";
    streamStatus.textContent = `Queueing season for ${label}...`;
    if (catalogDetailStatus) catalogDetailStatus.textContent = `Preparing season download to ${label}...`;

    const queued = await queueSelectedCatalogSeason(destination);
    if (!queued.ok) {
      streamStatus.textContent = queued.error || "Could not queue season.";
      if (catalogDetailStatus) catalogDetailStatus.textContent = queued.error || "Could not queue season.";
      return;
    }

    const started = await window.streamApp.startDownloadQueue(destination);
    if (!started.ok) {
      appendActivityLog("error", started.error || "Could not start queue.");
      streamStatus.textContent = started.error || "Could not start queue.";
      if (catalogDetailStatus) catalogDetailStatus.textContent = started.error || "Could not start queue.";
      return;
    }

    appendActivityLog("info", `Season download started → ${label}`);
    if (catalogDetailStatus) catalogDetailStatus.textContent = `Season download started → ${label}`;
    if (progressHideTimer) clearTimeout(progressHideTimer);
    progressDock.hidden = false;
    return;
  }

  const label = destination === "nas" ? "NAS" : "PC";
  streamStatus.textContent = `Starting download to ${label}...`;
  if (catalogDetailStatus) catalogDetailStatus.textContent = `Preparing download to ${label}...`;
  appendActivityLog("info", `Downloading “${selectedCatalogMovie.title}” → ${label}`);

  const result = await window.streamApp.downloadMovie({
    movieUrl: selectedCatalogMovie.movieUrl,
    title: selectedCatalogMovie.title,
    posterUrl: selectedCatalogMovie.posterUrl,
    destination
  });

  if (!result.ok) {
    appendActivityLog("error", result.error || "Download failed.");
    streamStatus.textContent = result.error || "Download failed.";
    if (catalogDetailStatus) catalogDetailStatus.textContent = result.error || "Download failed.";
    return;
  }

  appendActivityLog("success", `Download started for “${selectedCatalogMovie.title}”`);
  if (catalogDetailStatus) catalogDetailStatus.textContent = `Download started → ${label}`;
}

async function addSelectedCatalogMovieToQueue(destination = "local") {
  if (!selectedCatalogMovie?.movieUrl) {
    appendActivityLog("error", "Select a title from the catalog first.");
    return { ok: false };
  }
  if (isCatalogTvItem(selectedCatalogMovie)) {
    return queueSelectedCatalogSeason(destination);
  }

  const result = await window.streamApp.addMovieToQueue({
    movieUrl: selectedCatalogMovie.movieUrl,
    title: selectedCatalogMovie.title,
    posterUrl: selectedCatalogMovie.posterUrl,
    destination
  });

  if (!result.ok) {
    appendActivityLog("error", result.error || "Could not add to queue.");
    return result;
  }

  appendActivityLog("success", `Added “${result.item.title}” to queue`);
  if (catalogDetailStatus) catalogDetailStatus.textContent = "Added to download queue.";
  window.shellMotion?.pulseQueueChrome();
  return result;
}

async function runSearch(query, sourceInput = null) {
  const trimmed = String(query || "").trim();
  if (!trimmed) {
    searchError.textContent = hideMovieDownloader
      ? "Enter an anime title to search."
      : "Enter a movie or TV title to search.";
    if (catalogMode) showCatalogView("home");
    return;
  }

  searchError.textContent = "";
  streamStatus.textContent = `Searching for "${trimmed}"...`;
  if (catalogMode && catalogResultsSummary) {
    catalogResultsSummary.textContent = "Searching...";
    showCatalogView("results");
    if (catalogGrid) catalogGrid.innerHTML = "";
  }

  const result = await window.streamApp.searchMovies(trimmed);
  if (!result.ok) {
    searchError.textContent = result.error;
    streamStatus.textContent = result.error;
    if (catalogMode) {
      showCatalogView("home");
      appendActivityLog("error", result.error || "Search failed.");
    }
    return;
  }

  if (toolbarSearchInput) toolbarSearchInput.value = trimmed;
  if (sourceInput) sourceInput.blur();

  if (catalogMode) {
    renderCatalogGrid(result.movies || [], trimmed, result.counts || null);
    const total = result.movies?.length || 0;
    const tvCount = result.counts?.tv ?? (result.movies || []).filter((item) => isCatalogTvItem(item)).length;
    streamStatus.textContent = `Found ${total} result${total === 1 ? "" : "s"} for "${trimmed}"${tvCount ? ` (${tvCount} TV)` : ""}`;
    appendActivityLog("success", `Catalog search: ${total} titles for “${trimmed}”`);
    return;
  }

  hideSearchPanel();
  streamStatus.textContent = `Showing results for "${trimmed}"`;
}

function showBlockedPanel(details = {}) {
  blockedPanel.hidden = false;
  streamStatus.textContent = "Website blocked or unreachable.";

  if (details.errorDescription || details.url) {
    blockedDetail.textContent = [
      details.errorDescription ? `Error: ${details.errorDescription}` : null,
      details.url ? `URL: ${details.url}` : null
    ]
      .filter(Boolean)
      .join(" · ");
  } else {
    blockedDetail.textContent = "";
  }
}

function hideBlockedPanel() {
  blockedPanel.hidden = true;
  installStatus.textContent = "";
}

function updateNavigationButtons(state) {
  backButton.disabled = !state.canGoBack;
  forwardButton.disabled = !state.canGoForward;
}

async function refreshNavigationButtons() {
  const state = await window.streamApp.getNavigationState();
  updateNavigationButtons(state);
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function renderLibraryItem(movie) {
  if (movie?.kind === "tv-show") {
    return renderLibraryShowItem(movie);
  }

  const item = document.createElement("li");
  item.className = "library-item library-item-movie";
  item.title = movie.title;
  item.tabIndex = 0;
  item.setAttribute("role", "button");

  const card = document.createElement("div");
  card.className = "library-poster-card";

  if (movie.posterUrl) {
    const banner = document.createElement("img");
    banner.className = "library-banner";
    banner.src = movie.posterUrl;
    banner.alt = movie.title;
    banner.loading = "lazy";
    banner.decoding = "async";
    banner.addEventListener("error", () => {
      banner.replaceWith(createBannerFallback(movie.title));
    });
    card.appendChild(banner);
  } else {
    card.appendChild(createBannerFallback(movie.title));
  }

  const scrub = document.createElement("div");
  scrub.className = "library-poster-scrub";

  const badge = document.createElement("span");
  badge.className = "library-poster-badge";
  badge.textContent = "Movie";

  const title = document.createElement("span");
  title.className = "library-title";
  title.textContent = movie.title;

  scrub.append(badge, title);
  card.appendChild(scrub);
  const progress = Number(movie.playbackProgress);
  if (progress > 0.02 && progress < 0.97) {
    const bar = document.createElement("div");
    bar.className = "library-progress";
    const fill = document.createElement("div");
    fill.className = "library-progress-fill";
    fill.style.width = `${Math.round(progress * 100)}%`;
    bar.appendChild(fill);
    card.appendChild(bar);
  }
  item.appendChild(card);

  const openMovie = async () => {
    if (!movie.filePath) return;
    await window.streamApp.openDownloadedMovie(movie.filePath);
    refreshLibrary(true);
  };
  item.addEventListener("click", openMovie);
  item.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openMovie();
    }
  });

  return item;
}

function renderLibraryShowItem(show) {
  const item = document.createElement("li");
  item.className = "library-item library-item-show";
  item.title = show.title;
  item.dataset.showId = show.id || show.title;

  const header = document.createElement("button");
  header.type = "button";
  header.className = "library-show-header library-poster-card";

  if (show.posterUrl) {
    const banner = document.createElement("img");
    banner.className = "library-banner";
    banner.src = show.posterUrl;
    banner.alt = show.title;
    banner.loading = "lazy";
    banner.decoding = "async";
    banner.addEventListener("error", () => {
      banner.replaceWith(createBannerFallback(show.title));
    });
    header.appendChild(banner);
  } else {
    header.appendChild(createBannerFallback(show.title));
  }

  const scrub = document.createElement("div");
  scrub.className = "library-poster-scrub";

  const badge = document.createElement("span");
  badge.className = "library-poster-badge kind-tv";
  badge.textContent = "TV";

  const title = document.createElement("span");
  title.className = "library-title";
  title.textContent = show.title;

  const subtitle = document.createElement("span");
  subtitle.className = "library-item-kind";
  subtitle.textContent = show.subtitle || `${show.episodeCount || 0} episodes`;

  scrub.append(badge, title, subtitle);
  header.appendChild(scrub);

  const episodeList = document.createElement("ul");
  episodeList.className = "library-episode-list";
  episodeList.hidden = true;

  for (const episode of show.episodes || []) {
    const row = document.createElement("li");
    row.className = "library-episode-item";

    const label = document.createElement("span");
    const code =
      episode.season && episode.episode
        ? `S${String(episode.season).padStart(2, "0")}E${String(episode.episode).padStart(2, "0")}`
        : "";
    label.textContent = code ? `${code} · ${episode.title}` : episode.title;

    const play = document.createElement("button");
    play.type = "button";
    play.className = "library-episode-play";
    play.textContent = "Play";
    play.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!episode.filePath) return;
      await window.streamApp.openDownloadedMovie(episode.filePath);
      refreshLibrary(true);
    });

    row.append(label, play);
    episodeList.appendChild(row);
  }

  const toggle = () => {
    const section = item.closest(".library-section");
    const drawer = section?.querySelector(".library-episode-drawer");
    const open = !item.classList.contains("expanded");

    if (section) {
      for (const other of section.querySelectorAll(".library-item-show.expanded")) {
        if (other === item) continue;
        other.classList.remove("expanded");
        const otherList = other.querySelector(".library-episode-list");
        if (otherList) otherList.hidden = true;
      }
    }

    item.classList.toggle("expanded", open);
    episodeList.hidden = !open;

    if (drawer) {
      drawer.replaceChildren();
      if (open) {
        const heading = document.createElement("div");
        heading.className = "library-episode-drawer-head";
        heading.innerHTML = `<strong>${show.title}</strong><span>${show.subtitle || `${show.episodeCount || 0} episodes`}</span>`;
        const clone = episodeList.cloneNode(true);
        clone.hidden = false;
        clone.removeAttribute("hidden");
        drawer.replaceChildren(heading, clone);
        drawer.hidden = false;
        drawer.querySelectorAll(".library-episode-play").forEach((btn, index) => {
          btn.addEventListener("click", async (event) => {
            event.stopPropagation();
            const episode = show.episodes?.[index];
            if (!episode?.filePath) return;
            await window.streamApp.openDownloadedMovie(episode.filePath);
            refreshLibrary(true);
          });
        });
      } else {
        drawer.hidden = true;
        drawer.replaceChildren();
      }
    }
  };

  header.addEventListener("click", toggle);
  item.append(header, episodeList);
  return item;
}

function createBannerFallback(title) {
  const fallback = document.createElement("div");
  fallback.className = "library-banner-fallback";
  fallback.textContent = title;
  return fallback;
}

function isIOSCatalogLibrary() {
  return document.body.classList.contains("platform-ios");
}

function formatLibraryPath(folderPath) {
  if (!folderPath) return "";
  if (folderPath.includes("/") && !folderPath.includes("\\")) {
    const parts = folderPath.split("/").filter(Boolean);
    if (parts.includes("Downloads")) return "On My iPhone · Downloads";
    return parts.slice(-2).join("/") || folderPath;
  }

  const normalized = folderPath.replace(/\//g, "\\");
  if (normalized.startsWith("\\\\")) {
    const parts = normalized.replace(/^\\+/, "").split("\\").filter(Boolean);
    return parts.slice(1).join("\\") || parts.join("\\");
  }

  const parts = normalized.split("\\").filter(Boolean);
  if (parts.length >= 2) return parts.slice(-2).join("\\");
  return normalized;
}

function renderLibrarySection(section, label, location) {
  const wrapper = document.createElement("section");
  wrapper.className = "library-section";

  const head = document.createElement("div");
  head.className = "library-section-head";

  const titleWrap = document.createElement("div");
  titleWrap.className = "library-section-title-wrap";

  const title = document.createElement("span");
  title.className = `library-section-title ${location}`;
  title.textContent = label;

  const folderPath = document.createElement("span");
  folderPath.className = "library-folder-path";
  folderPath.textContent = formatLibraryPath(section.folderPath);
  folderPath.title = section.folderPath || "";

  titleWrap.append(title, folderPath);

  const actions = document.createElement("div");
  actions.className = "library-section-actions";

  const count = document.createElement("span");
  count.className = "library-count";
  const entryCount = section.movies?.length || 0;
  const showCount = section.showCount || section.movies?.filter((entry) => entry.kind === "tv-show").length || 0;
  const movieCount = section.movieCount || entryCount - showCount;
  count.textContent = String(entryCount);
  count.title = `${movieCount} movie${movieCount === 1 ? "" : "s"} · ${showCount} show${showCount === 1 ? "" : "s"}`;

  const openFolder = document.createElement("button");
  openFolder.type = "button";
  openFolder.className = "library-open-folder";
  openFolder.textContent = "Open";
  openFolder.addEventListener("click", (event) => {
    event.stopPropagation();
    window.streamApp.openLibraryFolder(location);
  });

  actions.append(count);
  const isIOS = document.body.classList.contains("platform-ios");
  if (!isIOS && location === "local" && section.accessible) {
    const syncButton = document.createElement("button");
    syncButton.type = "button";
    syncButton.className = "library-open-folder";
    syncButton.textContent = "Sync";
    syncButton.title = "Copy all PC movies to NAS (skip existing)";
    syncButton.addEventListener("click", (event) => {
      event.stopPropagation();
      runLibrarySync();
    });
    actions.append(syncButton);
  }
  if (!isIOS) {
    actions.append(openFolder);
  }
  head.append(titleWrap, actions);
  wrapper.appendChild(head);

  if (!section.accessible) {
    const error = document.createElement("p");
    error.className = "library-error";
    error.textContent =
      section.error ||
      (location === "nas" ? "NAS unavailable — use Connect NAS" : "Folder unavailable");
    wrapper.appendChild(error);
    return wrapper;
  }

  if (!section.movies.length) {
    const empty = document.createElement("p");
    empty.className = "library-empty";
    empty.textContent = section.exists === false ? "(empty)" : "(empty)";
    wrapper.appendChild(empty);
    return wrapper;
  }

  const list = document.createElement("ul");
  list.className = "library-list";
  for (const movie of section.movies) {
    list.appendChild(renderLibraryItem(movie));
  }
  wrapper.appendChild(list);

  const drawer = document.createElement("div");
  drawer.className = "library-episode-drawer";
  drawer.hidden = true;
  wrapper.appendChild(drawer);

  return wrapper;
}

async function refreshLibrary(force = false) {
  if (!librarySections || !librarySummary) return;
  const now = Date.now();
  if (!force && now - lastLibraryRefreshAt < 4000) return;

  lastLibraryRefreshAt = now;
  const library = await window.streamApp.getDownloadedMovies({
    backfillPosters: Boolean(force)
  });

  if (isIOSCatalogLibrary()) {
    librarySections.replaceChildren(
      renderLibrarySection(library.local, "On this iPhone", "local")
    );
  } else {
    librarySections.replaceChildren(
      renderLibrarySection(library.local, "Movies & TV on this PC", "local"),
      renderLibrarySection(library.nas, "Movies & TV on NAS", "nas")
    );
  }

  const env = await window.streamApp.getEnvironment();
  const nasLabel = formatLibraryPath(env.nasVideoFolder);
  librarySummary.textContent = `${library.totalCount} title${library.totalCount === 1 ? "" : "s"}${
    library.showCount ? ` · ${library.showCount} TV show${library.showCount === 1 ? "" : "s"}` : ""
  }${nasLabel && !isIOSCatalogLibrary() ? ` · NAS: ${nasLabel}` : ""}`;

  if (catalogMode && catalogView === "library") {
    const items = librarySections.querySelectorAll(".library-item");
    for (const item of items) {
      item.style.opacity = "";
      item.style.transform = "";
    }
    if (!isIOSCatalogLibrary()) {
      window.shellMotion?.bindPosterInteractions?.(items);
    }
  }
}

if (refreshLibraryButton) {
  refreshLibraryButton.addEventListener("click", () => refreshLibrary(true));
}

function beginDownloadUi(destination) {
  setToolbarDisabled(downloadButton, true);
  setToolbarDisabled(saveNasButton, true);
  if (progressHideTimer) clearTimeout(progressHideTimer);
  progressDock.hidden = false;
  updateProgressDock({
    state: "running",
    phase: destination === "nas" ? "Preparing NAS save..." : "Preparing download...",
    percent: 3,
    destination
  });
}

async function beginDownloadSession(destination) {
  if (progressHideTimer) clearTimeout(progressHideTimer);
  await window.streamApp.clearDownloadJob();
  beginDownloadUi(destination);
}

function resetDownloadButtons(options = {}) {
  setToolbarDisabled(downloadButton, false);
  setToolbarDisabled(saveNasButton, false);
  if (!options.keepProgress) {
    hideProgressDock();
  }
}

function showDownloadError(message, debugText = null) {
  stopButton.hidden = true;
  progressDock.hidden = false;
  updateProgressDock({
    state: "failed",
    phase: message,
    percent: 100,
    destination: "local"
  });
  progressDetailRight.textContent = "See Activity Log on the right";
  appendActivityLog("error", message, debugText);
  scheduleProgressHide(8000);
}

function setSyncControlsDisabled(disabled) {
  setToolbarDisabled(syncToNasButton, disabled);
}

function queueStatusLabel(status) {
  switch (status) {
    case "loading":
      return "Loading";
    case "downloading":
      return "Downloading";
    case "done":
      return "Done";
    case "failed":
      return "Failed";
    default:
      return "Pending";
  }
}

function formatQueueSummary(snapshot) {
  const counts = snapshot?.counts || {};
  const parts = [];
  if (counts.pending) parts.push(`${counts.pending} pending`);
  if (counts.movies) parts.push(`${counts.movies} movie${counts.movies === 1 ? "" : "s"}`);
  if (counts.episodes) parts.push(`${counts.episodes} ep${counts.episodes === 1 ? "" : "s"}`);
  if (counts.done) parts.push(`${counts.done} done`);
  if (counts.failed) parts.push(`${counts.failed} failed`);
  if (snapshot?.running) parts.push("running");
  if (parts.length) return parts.join(" · ");
  return "0 items queued";
}

function renderDownloadQueue(snapshot) {
  const items = snapshot?.items || [];
  downloadQueueSummary.textContent = formatQueueSummary(snapshot);
  downloadQueueList.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("li");
    empty.className = "download-queue-empty";
    empty.textContent =
      "Add movies from search or TV episodes from a season scan. One queue runs everything.";
    downloadQueueList.appendChild(empty);
    return;
  }

  for (const item of items) {
    const row = document.createElement("li");
    row.className = `download-queue-item status-${item.status}`;
    if (item.kind === "episode") row.classList.add("kind-episode");
    if (item.id === snapshot.currentId) row.classList.add("current");

    const title = document.createElement("span");
    title.className = "download-queue-item-title";
    title.textContent = item.title;
    title.title = item.movieUrl;

    const badge = document.createElement("span");
    badge.className = "download-queue-item-status";
    badge.textContent = queueStatusLabel(item.status);

    const meta = document.createElement("span");
    meta.className = "download-queue-item-meta";
    const kindLabel = item.kind === "episode" ? "TV" : "Movie";
    meta.textContent = `${kindLabel} · ${item.destination === "nas" ? "NAS" : "PC"}`;

    row.append(title, badge, meta);

    if (item.status === "failed" && item.error) {
      const error = document.createElement("span");
      error.className = "download-queue-item-error";
      error.textContent = item.error;
      row.appendChild(error);
    }

    const isCurrent = snapshot.running && item.id === snapshot.currentId;
    if (!isCurrent && item.status !== "downloading" && item.status !== "loading") {
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "download-queue-remove";
      removeButton.textContent = "×";
      removeButton.title = "Remove from queue";
      removeButton.addEventListener("click", async () => {
        const result = await window.streamApp.removeFromQueue(item.id);
        if (!result.ok) appendActivityLog("error", result.error);
      });
      row.appendChild(removeButton);
    }

    downloadQueueList.appendChild(row);
  }
}

function updateQueueControls(snapshot) {
  const running = Boolean(snapshot?.running);
  const hasPending = (snapshot?.counts?.pending || 0) > 0;

  startDownloadQueueLocalButton.disabled = running || !hasPending;
  startDownloadQueueNasButton.disabled = running || !hasPending;
  stopDownloadQueueButton.hidden = !running;
  clearDownloadQueueButton.disabled = running;
  addSearchToQueueButton.disabled = running;
  addCurrentToQueueButton.disabled = running;

  if (running) {
    setToolbarDisabled(downloadButton, true);
    setToolbarDisabled(saveNasButton, true);
  }
}

function handleQueueUpdate(payload = {}) {
  const snapshot = payload.snapshot || payload;
  queueActive = Boolean(snapshot.running);
  renderDownloadQueue(snapshot);
  updateQueueControls(snapshot);
  renderTvShowPlan(tvShowPlan, { processing: queueActive });

  if (queueActive && payload.item) {
    const target = payload.item.destination === "nas" ? "NAS" : "PC";
    if (payload.phase === "loading") {
      streamStatus.textContent = `Queue: opening ${payload.item.title}...`;
      if (progressHideTimer) clearTimeout(progressHideTimer);
      progressDock.hidden = false;
      updateProgressDock({
        state: "running",
        phase: `Queue · Opening ${payload.item.title}`,
        indeterminate: true,
        destination: payload.item.destination,
        outputName: payload.item.title
      });
    } else if (payload.phase === "fetching-link") {
      streamStatus.textContent = `Queue: generating fresh download link for ${payload.item.title}...`;
      updateProgressDock({
        state: "running",
        phase: `Queue · Fresh link · ${payload.item.title}`,
        indeterminate: true,
        destination: payload.item.destination,
        outputName: payload.item.title
      });
    } else if (payload.phase === "retrying") {
      streamStatus.textContent = `Queue: retrying ${payload.item.title} (attempt ${payload.attempt || 2})...`;
    } else if (payload.phase === "preparing") {
      streamStatus.textContent = `Queue: starting download for ${payload.item.title} (${target})...`;
    } else if (payload.phase === "item-failed") {
      streamStatus.textContent = payload.error || payload.item?.error || "Download failed.";
      updateProgressDock({
        state: "failed",
        phase: payload.error || payload.item?.error || "Download failed",
        lastLogLine: payload.error || payload.item?.error,
        destination: payload.item?.destination,
        outputName: payload.item?.title
      });
    }
  }

  if (payload.phase === "stopping") {
    streamStatus.textContent = "Stopping queue...";
  }

  if (payload.phase === "complete") {
    const counts = snapshot.counts || {};
    appendActivityLog(
      "info",
      `Queue finished: ${counts.done || 0} done, ${counts.failed || 0} failed`
    );
    window.streamApp.getQueueDebug().then((result) => {
      if (result.ok && result.logPath) {
        appendActivityLog("debug", "Queue debug log saved", `Log file:\n${result.logPath}`);
      }
    });
    streamStatus.textContent = counts.failed
      ? "Queue finished with errors — see the queue list."
      : "Queue finished — all downloads complete.";
    const failedItem = (snapshot.items || []).find((item) => item.status === "failed");
    if (counts.failed) {
      updateProgressDock({
        state: "failed",
        phase: failedItem?.error || (counts.done ? "Queue finished with errors" : "Download failed"),
        lastLogLine: failedItem?.error || payload.error,
        destination: failedItem?.destination,
        outputName: failedItem?.title
      });
    } else {
      updateProgressDock({
        state: "finished",
        phase: counts.failed ? "Queue finished with errors" : "Queue finished",
        destination: "local"
      });
    }
    refreshLibrary(true);
  }

  if (payload.phase === "item-complete" && payload.item) {
    appendActivityLog("success", `Queue: finished ${payload.item.title}`);
  }
}

async function refreshDownloadQueue() {
  const result = await window.streamApp.getDownloadQueue();
  if (result.ok) {
    handleQueueUpdate({
      snapshot: result.snapshot,
      phase: result.processing ? "running" : "idle"
    });
  }
}

async function showNasConnectPanel(retryAction = null) {
  pendingNasRetry = retryAction;
  nasConnectError.textContent = "";
  const creds = await window.streamApp.getNasCredentials();
  nasUsernameInput.value = creds.username || "";
  nasPasswordInput.value = "";
  nasConnectPanel.hidden = false;
  nasUsernameInput.focus();
}

function hideNasConnectPanel() {
  nasConnectPanel.hidden = true;
  nasConnectError.textContent = "";
  pendingNasRetry = null;
}

function hideSiteConnectPanel() {
  siteConnectPanel.hidden = true;
  siteConnectError.textContent = "";
}

async function showSiteConnectPanel() {
  const creds = await window.streamApp.getSiteCredentials();
  siteConnectError.textContent = "";
  siteUsernameInput.value = creds.username || "";
  sitePasswordInput.value = "";
  siteAutoLoginInput.checked = creds.autoLogin !== false;
  siteConnectPanel.hidden = false;
  siteUsernameInput.focus();
}

async function saveSiteConnection(event) {
  event.preventDefault();
  siteConnectError.textContent = "";

  const username = siteUsernameInput.value.trim();
  const password = sitePasswordInput.value;

  if (!username || !password) {
    siteConnectError.textContent = "Enter both username and password.";
    return;
  }

  await window.streamApp.saveSiteCredentials({
    username,
    password,
    autoLogin: siteAutoLoginInput.checked
  });

  hideSiteConnectPanel();
  hideSearchPanel();
  appendActivityLog("info", "Attempting Tornado Movies login...");
  streamStatus.textContent = "Opening Tornado Movies sign-in page...";

  const result = await window.streamApp.siteLogin();
  if (!result.ok) {
    siteConnectError.textContent = result.error || "Could not start site login.";
    siteConnectPanel.hidden = false;
    streamStatus.textContent = result.error || "Site login failed.";
    return;
  }

  streamStatus.textContent = "Submitting sign-in on premium page (no modal)...";
}

async function saveNasConnection(event) {
  event?.preventDefault();
  nasConnectError.textContent = "";

  const username = nasUsernameInput.value.trim();
  const password = nasPasswordInput.value;

  if (!username) {
    nasConnectError.textContent = "Enter your NAS username.";
    return;
  }

  const result = await window.streamApp.saveNasCredentials({ username, password });
  if (!result.ok) {
    nasConnectError.textContent = result.error || "Could not connect to NAS.";
    return;
  }

  hideNasConnectPanel();
  streamStatus.textContent = result.createdFolder
    ? `Connected to NAS as ${username}. Created Videos folder on the share.`
    : `Connected to NAS as ${username}.`;
  await refreshLibrary(true);

  if (pendingNasRetry === "sync") {
    await runLibrarySync();
  } else if (pendingNasRetry === "download") {
    await runDownload("nas");
  }
}

function handleNasAccessFailure(result, retryAction = null) {
  if (result?.needsCredentials) {
    showNasConnectPanel(retryAction);
    streamStatus.textContent = result.error || "NAS sign-in required.";
    return true;
  }
  return false;
}

async function runLibrarySync() {
  if (librarySyncActive || downloadActive) return;

  librarySyncActive = true;
  setSyncControlsDisabled(true);
  setToolbarDisabled(downloadButton, true);
  setToolbarDisabled(saveNasButton, true);
  if (progressHideTimer) clearTimeout(progressHideTimer);
  progressDock.hidden = false;
  streamStatus.textContent = "Syncing Movies folder to NAS...";

  updateProgressDock({
    state: "running",
    phase: "Preparing library sync...",
    indeterminate: true,
    destination: "nas"
  });

  const unsubscribe = window.streamApp.onLibrarySyncProgress((progress) => {
    updateSyncProgressDock(progress);
  });

  try {
    const result = await window.streamApp.syncMoviesToNas();
    unsubscribe();

    if (!result.ok) {
      if (handleNasAccessFailure(result, "sync")) return;
      showDownloadError(result.error);
      streamStatus.textContent = result.error;
      return;
    }

    const errorNote =
      result.errors?.length > 0 ? ` · ${result.errors.length} failed` : "";
    streamStatus.textContent = `NAS sync complete — ${result.copied} copied, ${result.skipped} skipped${errorNote}.`;
    updateProgressDock({
      state: "finished",
      phase: "NAS sync complete",
      percent: 100,
      destination: "nas"
    });
    progressDetailLeft.textContent = `${result.copied} copied · ${result.skipped} skipped`;
    progressDetailRight.textContent = errorNote ? `${result.errors.length} failed` : "All done";
    appendActivityLog(
      "success",
      `NAS sync complete — ${result.copied} copied, ${result.skipped} skipped${errorNote}`
    );
    await refreshLibrary(true);
    scheduleProgressHide(result.errors?.length ? 12000 : 6000);
  } catch (error) {
    unsubscribe();
    showDownloadError(error.message || "NAS sync failed.");
    streamStatus.textContent = error.message || "NAS sync failed.";
  } finally {
    librarySyncActive = false;
    setSyncControlsDisabled(false);
    if (!downloadActive) {
      setToolbarDisabled(downloadButton, false);
      setToolbarDisabled(saveNasButton, false);
    }
  }
}

async function runDownload(destination) {
  beginDownloadUi(destination);
  streamStatus.textContent =
    destination === "nas" ? "Saving stream to NAS..." : "Starting download...";

  const result = await (destination === "nas"
    ? window.streamApp.saveToNas()
    : window.streamApp.downloadCurrentStream());

  if (!result.ok) {
    if (handleNasAccessFailure(result, destination === "nas" ? "download" : null)) return;
    showDownloadError(result.error);
    streamStatus.textContent = result.error;
    setToolbarDisabled(downloadButton, false);
    setToolbarDisabled(saveNasButton, false);
    return;
  }

  streamStatus.textContent = destination === "nas"
    ? `Saving ${result.playlist?.kind || "stream"} (${result.quality?.label || "best available"})${result.artworkPath ? " + poster" : ""} to NAS...`
    : `Downloading ${result.playlist?.kind || "stream"} (${result.quality?.label || "best available"})${result.artworkPath ? " + poster" : ""}...`;
  stopButton.hidden = false;
  await refreshDownloadStatus();
}

function formatQualityWarnings(warnings) {
  return (warnings || []).map((item) => item.message).join(" · ");
}


function formatElapsed(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  if (minutes > 0) {
    return `${minutes}m ${String(secs).padStart(2, "0")}s`;
  }
  return `${secs}s`;
}

function reportChromeLayout() {
  if (chromeLayoutFrame) return;
  chromeLayoutFrame = requestAnimationFrame(() => {
    chromeLayoutFrame = null;

    const margin = 10;
    const toolbar = document.querySelector(".toolbar");
    const statusBar = document.querySelector(".status-bar");
    const dock = progressDock;
    const browseDock = searchPanel?.classList.contains("site-browse-mode") ? searchPanel : null;

    const top = Math.ceil(
      (statusBar?.getBoundingClientRect().bottom ??
        toolbar?.getBoundingClientRect().bottom ??
        74) + 4
    );

    const right = margin;

    let bottom = margin;
    if (browseDock && !browseDock.hidden) {
      bottom = Math.max(
        bottom,
        Math.ceil(window.innerHeight - browseDock.getBoundingClientRect().top + margin)
      );
    }
    if (dock && !dock.hidden) {
      bottom = Math.max(
        bottom,
        Math.ceil(window.innerHeight - dock.getBoundingClientRect().top + margin)
      );
    }

    window.streamApp.setChromeLayout({ top, right, bottom });
  });
}

function setupChromeLayoutObserver() {
  reportChromeLayout();

  const watched = [
    document.querySelector(".toolbar"),
    document.querySelector(".status-bar"),
    searchPanel,
    progressDock
  ].filter(Boolean);

  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(() => reportChromeLayout());
    for (const node of watched) observer.observe(node);
  }

  if (progressDock) {
    const dockObserver = new MutationObserver(() => reportChromeLayout());
    dockObserver.observe(progressDock, { attributes: true, attributeFilter: ["hidden", "class"] });
  }

  if (searchPanel) {
    const panelObserver = new MutationObserver(() => reportChromeLayout());
    panelObserver.observe(searchPanel, { attributes: true, attributeFilter: ["hidden", "class"] });
  }

  window.addEventListener("resize", reportChromeLayout);
}

function hideProgressDock() {
  if (progressErrorPinned) return;
  progressDock.hidden = true;
  reportChromeLayout();
  progressTrack.className = "progress-track";
  progressFill.style.width = "0%";
}

function scheduleProgressHide(delayMs = 6000) {
  if (queueActive || tvShowActive || progressErrorPinned) return;
  if (progressHideTimer) clearTimeout(progressHideTimer);
  progressHideTimer = setTimeout(async () => {
    progressHideTimer = null;
    if (progressErrorPinned) return;
    hideProgressDock();
    await window.streamApp.clearDownloadJob();
    loggedDownloadJobId = null;
    await refreshDetection();
    await refreshDownloadStatus();
  }, delayMs);
}


function updateSyncProgressDock(progress) {
  const percent =
    progress.overallPercent != null
      ? progress.overallPercent
      : progress.total > 0
        ? Math.round((progress.index / progress.total) * 100)
        : null;

  let phase = "Syncing to NAS...";
  if (progress.phase === "preparing") {
    phase = "Preparing NAS sync...";
  } else if (progress.phase === "copying" && progress.fileName) {
    phase = `Copying ${progress.fileName}`;
  } else if (progress.phase === "complete") {
    phase = "NAS sync complete";
  }

  progressDock.hidden = false;
  progressPhase.textContent = phase;

  progressTrack.classList.remove("indeterminate", "complete", "failed");
  if (percent == null) {
    progressTrack.classList.add("indeterminate");
    progressPercent.textContent = "…";
    progressFill.style.width = "";
  } else {
    const clamped = Math.max(0, Math.min(100, percent));
    progressPercent.textContent = `${clamped}%`;
    progressFill.style.width = `${clamped}%`;
  }

  const leftParts = [];
  if (progress.overallTotalBytes > 0) {
    leftParts.push(
      `${formatBytes(progress.overallBytes || 0)} / ${formatBytes(progress.overallTotalBytes)}`
    );
  } else if (progress.fileName && progress.fileTotalBytes > 0) {
    leftParts.push(
      `${formatBytes(progress.fileBytes || 0)} / ${formatBytes(progress.fileTotalBytes)}`
    );
  }
  if (progress.copied > 0 || progress.skipped > 0) {
    leftParts.push(`${progress.copied} copied · ${progress.skipped} skipped`);
  }
  progressDetailLeft.textContent = leftParts.join(" · ") || "Syncing to NAS";

  const rightParts = [];
  if (progress.total > 0) {
    rightParts.push(`File ${progress.index}/${progress.total}`);
  }
  if (progress.failed > 0) {
    rightParts.push(`${progress.failed} failed`);
  }
  rightParts.push("NAS");
  progressDetailRight.textContent = rightParts.join(" · ");
}

function updateProgressDock(status) {
  if (!status || status.state === "idle") {
    if (progressErrorPinned) return;
    if (!downloadActive && !librarySyncActive && !queueActive) hideProgressDock();
    return;
  }

  if (status.state === "running") {
    progressErrorPinned = false;
    if (progressHideTimer) {
      clearTimeout(progressHideTimer);
      progressHideTimer = null;
    }
  } else if (status.state === "failed") {
    progressErrorPinned = true;
    if (progressHideTimer) {
      clearTimeout(progressHideTimer);
      progressHideTimer = null;
    }
  } else if (status.state === "finished") {
    progressErrorPinned = false;
  }

  progressDock.hidden = false;
  progressPhase.textContent = status.phase || "Working...";

  progressTrack.classList.remove("indeterminate", "complete", "failed");

  if (status.state === "finished") {
    progressTrack.classList.add("complete");
    progressPercent.textContent = "100%";
    progressFill.style.width = "100%";
  } else if (status.state === "failed") {
    progressTrack.classList.add("failed");
    progressPercent.textContent = "Failed";
    progressFill.style.width = "100%";
  } else if (status.indeterminate) {
    progressTrack.classList.add("indeterminate");
    progressPercent.textContent = "…";
    progressFill.style.width = "";
  } else {
    const percent = Math.max(0, Math.min(100, Number(status.percent) || 0));
    progressPercent.textContent = `${percent}%`;
    progressFill.style.width = `${percent}%`;
  }

  const target = status.destination === "nas" ? "NAS" : "Movies";
  const leftParts = [];
  if (status.outputName) leftParts.push(status.outputName);
  if (status.qualityLabel) leftParts.push(status.qualityLabel);
  if (status.outputSize > 0) leftParts.push(formatBytes(status.outputSize));
  progressDetailLeft.textContent = leftParts.join(" · ") || `Saving to ${target}`;

  const rightParts = [];
  if (status.state === "running") {
    if (status.speed) rightParts.push(`${status.speed}x`);
    if (status.outTimeLabel && status.durationLabel) {
      rightParts.push(`${status.outTimeLabel} / ${status.durationLabel}`);
    } else if (status.outTimeLabel) {
      rightParts.push(`${status.outTimeLabel} captured`);
    }
    if (status.elapsedSeconds != null) {
      rightParts.push(`Elapsed ${formatElapsed(status.elapsedSeconds)}`);
    }
    rightParts.push(target);
  } else if (status.state === "finished") {
    if (status.artworkPath) rightParts.push("Poster saved");
    rightParts.push(target);
  } else if (status.state === "failed") {
    rightParts.push(status.lastLogLine || "See log file for details");
  }
  progressDetailRight.textContent = rightParts.join(" · ");
}

async function refreshDetection() {
  if (librarySyncActive || queueActive) return;

  const download = await window.streamApp.downloadStatus();
  if (download.state === "running") return;

  const { playlists, best, bestDirect } = await window.streamApp.getPlaylists();
  const target = bestDirect || best;

  if (catalogMode) {
    if (target && selectedCatalogMovie) {
      streamStatus.textContent = bestDirect
        ? `Direct ${bestDirect.qualityLabel} download ready · ${bestDirect.displayUrl}`
        : `Stream ready (${best?.kind || "hls"}) · ${best?.displayUrl || ""}`;
      if (download.state === "idle") {
        setToolbarDisabled(downloadButton, false);
        setToolbarDisabled(saveNasButton, false);
      }
    }
    return;
  }

  if (!target) {
    streamStatus.textContent =
      playlists.length === 0
        ? searchPanel.hidden
          ? "Waiting for download link... open a movie and click Download on the site."
          : "Search for a movie to begin."
        : `${playlists.length} playlist(s) seen, none selected yet.`;
    if (download.state === "idle") {
      setToolbarDisabled(downloadButton, true);
      setToolbarDisabled(saveNasButton, true);
    }
    return;
  }

  if (download.state === "idle") {
    if (bestDirect) {
      streamStatus.textContent = `Direct ${bestDirect.qualityLabel} download ready · ${bestDirect.displayUrl}`;
    } else {
      streamStatus.textContent = `Detected ${best.kind} stream · ${best.displayUrl}`;
    }
    setToolbarDisabled(downloadButton, false);
    setToolbarDisabled(saveNasButton, false);
  }
}

async function refreshDownloadStatus() {
  const status = await window.streamApp.downloadStatus();
  downloadActive = status.state === "running";
  setSyncControlsDisabled(librarySyncActive || downloadActive || queueActive || tvShowActive);

  if (librarySyncActive || tvShowActive) return;

  updateProgressDock(status);

  if (status.state === "idle") {
    downloadStatus.textContent = "";
    stopButton.hidden = true;
    setToolbarDisabled(downloadButton, false);
    setToolbarDisabled(saveNasButton, false);
    return;
  }

  stopButton.hidden = status.state !== "running";
  setToolbarDisabled(downloadButton, status.state === "running" || status.state === "finished" || status.state === "failed");
  setToolbarDisabled(saveNasButton, status.state === "running" || status.state === "finished" || status.state === "failed");

  if (status.state === "running") {
    const target = status.destination === "nas" ? "NAS" : "PC";
    downloadStatus.textContent = `${status.phase || "Downloading..."} · ${target} · ${formatBytes(status.outputSize)}`;
  } else if (status.state === "finished") {
    const warnings = status.postQualityWarnings || [];
    const artworkNote = status.artworkPath ? ` · Poster saved` : "";
    const warningNote = warnings.length ? ` · ${formatQualityWarnings(warnings)}` : "";
    downloadStatus.textContent = `Saved to ${status.outputPath}${artworkNote}${warningNote}`;
    streamStatus.textContent =
      warnings.length
        ? "Download complete — quality warnings flagged."
        : status.destination === "nas"
          ? "Saved to NAS. UPnP Media Server should pick it up shortly."
          : "Download complete.";
    scheduleProgressHide(warnings.length ? 12000 : 6000);
    refreshLibrary(true);
  } else if (status.state === "failed") {
    downloadStatus.textContent = status.lastLogLine || "Download failed.";
  }
}

function setMovieToolbarVisible(visible) {
  for (const button of [downloadButton, saveNasButton, refreshButton, streamDebugButton, syncToNasButton]) {
    if (button) button.hidden = !visible;
  }
}

function applyProfileLayout(env) {
  hideMovieDownloader = Boolean(env.hideMovieDownloader);
  catalogMode = Boolean(env.catalogMode) && !hideMovieDownloader;
  siteLabel = env.siteLabel || "Tornado Movies";
  if (browseHomeButton) {
    browseHomeButton.textContent = `Browse ${siteLabel}`;
    browseHomeButton.hidden = catalogMode;
  }
  if (openLibraryButton) openLibraryButton.hidden = hideMovieDownloader || !catalogMode;
  if (catalogBrand && env.profileLabel) catalogBrand.textContent = env.profileLabel;

  if (tvShowSection) tvShowSection.hidden = true;
  if (downloadQueueSection) downloadQueueSection.hidden = false;

  if (hideMovieDownloader) {
    if (searchFeatures) searchFeatures.hidden = true;
    if (tvShowLead && env.tvShowLead) tvShowLead.textContent = env.tvShowLead;
    if (tvShowTitle) tvShowTitle.textContent = "Anime";
    if (browseSiteForTvButton) browseSiteForTvButton.hidden = true;
    if (backToCatalogButton) backToCatalogButton.hidden = true;
    if (catalogResults) catalogResults.hidden = true;
    if (catalogDetail) catalogDetail.hidden = true;
    if (catalogLibrary) catalogLibrary.hidden = true;
    if (catalogHome) catalogHome.hidden = false;
    searchPanel.classList.remove("catalog-mode");
    setMovieToolbarVisible(false);
    for (const button of [backButton, forwardButton, reloadSiteButton]) {
      if (button) button.hidden = false;
    }
    if (streamStatus) {
      streamStatus.textContent = "Search Aniwave or open a series page, then scan episodes into the queue.";
    }
    return;
  }

  if (searchFeatures) searchFeatures.hidden = catalogMode;
  if (tvShowTitle) tvShowTitle.textContent = "TV Shows";
  if (tvShowLead) {
    tvShowLead.textContent =
      env.tvShowLead ||
      "Browse the site for a season, scan episodes, then add them to the shared download queue with movies.";
  }
  setMovieToolbarVisible(true);
  if (catalogMode) {
    searchPanel.classList.add("catalog-mode");
    showCatalogView("home");
    setSiteBrowseMode(false);
  } else {
    for (const button of [backButton, forwardButton, reloadSiteButton]) {
      if (button) button.hidden = false;
    }
  }
}

async function refreshEnvironmentStatus() {
  const env = await window.streamApp.getEnvironment();
  envStatus.textContent = `Local: ${formatLibraryPath(env.outputDirectory)} · NAS: ${formatLibraryPath(env.nasVideoFolder)} · Site: ${env.siteUsername ? `logged in as ${env.siteUsername}` : "not configured"}`;
  return env;
}

async function initEnvironment() {
  const env = await window.streamApp.getEnvironment();
  siteLabel = env.siteLabel || "Tornado Movies";
  if (env.profileLabel && brandTitle) {
    brandTitle.textContent = env.profileLabel;
    document.title = env.profileLabel;
  }
  if (env.searchPlaceholder && toolbarSearchInput) {
    toolbarSearchInput.placeholder = env.searchPlaceholder;
  }
  applyProfileLayout(env);
  if (!env.ffmpegPath) {
    streamStatus.textContent = "ffmpeg not found — install ffmpeg and restart the app.";
    if (!hideMovieDownloader) {
      setToolbarDisabled(downloadButton, true);
      setToolbarDisabled(saveNasButton, true);
    }
  }
  await refreshEnvironmentStatus();
  showSearchPanel();
  return env;
}

downloadButton?.addEventListener("click", async () => {
  if (catalogMode && selectedCatalogMovie?.movieUrl) {
    await downloadSelectedCatalogMovie("local");
    return;
  }

  setToolbarDisabled(downloadButton, true);
  setToolbarDisabled(saveNasButton, true);
  streamStatus.textContent = "Starting download...";
  if (progressHideTimer) clearTimeout(progressHideTimer);
  progressDock.hidden = false;
  updateProgressDock({
    state: "running",
    phase: "Preparing download...",
    percent: 3,
    destination: "local"
  });

  const result = await window.streamApp.downloadCurrentStream();
  if (!result.ok) {
    streamStatus.textContent = result.error;
    setToolbarDisabled(downloadButton, false);
    setToolbarDisabled(saveNasButton, false);
    hideProgressDock();
    return;
  }

  streamStatus.textContent =
    result.playlist?.kind === "direct"
      ? `Downloading direct ${result.quality?.label || "file"}${result.artworkPath ? " + poster" : ""}...`
      : `Downloading ${result.playlist.kind} stream (${result.quality?.label || "best available"})${result.artworkPath ? " + poster" : ""}...`;
  stopButton.hidden = false;
  await refreshDownloadStatus();
});

saveNasButton?.addEventListener("click", async () => {
  if (catalogMode && selectedCatalogMovie?.movieUrl) {
    await downloadSelectedCatalogMovie("nas");
    return;
  }

  setToolbarDisabled(downloadButton, true);
  setToolbarDisabled(saveNasButton, true);
  streamStatus.textContent = "Saving stream to NAS...";
  if (progressHideTimer) clearTimeout(progressHideTimer);
  progressDock.hidden = false;
  updateProgressDock({
    state: "running",
    phase: "Preparing NAS download...",
    percent: 3,
    destination: "nas"
  });

  const result = await window.streamApp.saveToNas();
  if (!result.ok) {
    if (result.needsCredentials) {
      pendingNasRetry = "save";
      openNasConnectPanel(result.error);
      hideProgressDock();
      return;
    }
    streamStatus.textContent = result.error;
    setToolbarDisabled(downloadButton, false);
    setToolbarDisabled(saveNasButton, false);
    hideProgressDock();
    return;
  }

  streamStatus.textContent = `Saving to NAS (${result.quality?.label || "best available"})${result.artworkPath ? " + poster" : ""}...`;
  stopButton.hidden = false;
  await refreshDownloadStatus();
});

stopButton.addEventListener("click", async () => {
  await window.streamApp.stopDownload();
  streamStatus.textContent = "Stopping download...";
  await refreshDownloadStatus();
});

refreshButton?.addEventListener("click", async () => {
  await window.streamApp.scanDirectDownloads();
  await refreshDetection();
});
streamDebugButton?.addEventListener("click", refreshStreamDebug);
activityLogClear.addEventListener("click", clearActivityLog);
activityLogCopy.addEventListener("click", async () => {
  const text = getActivityLogText();
  if (!text) return;
  await navigator.clipboard.writeText(text);
  streamStatus.textContent = "Activity log copied to clipboard.";
});

window.streamApp.onStreamDebugReport((payload) => {
  if (payload?.text) showStreamDebugPanel(payload.text);
});

backButton.addEventListener("click", async () => {
  await window.streamApp.goBack();
  await refreshNavigationButtons();
});
forwardButton.addEventListener("click", async () => {
  await window.streamApp.goForward();
  await refreshNavigationButtons();
});
reloadSiteButton.addEventListener("click", async () => {
  streamStatus.textContent = "Reloading page...";
  await window.streamApp.reloadCurrentPage();
});
openSettingsButton?.addEventListener("click", () => window.streamApp.openSettingsWindow());
window.streamApp.onStorageSettingsUpdated?.(() => {
  refreshEnvironmentStatus().catch(() => {});
});
syncToNasButton?.addEventListener("click", () => runLibrarySync());
nasConnectForm.addEventListener("submit", saveNasConnection);
siteConnectForm.addEventListener("submit", saveSiteConnection);
nasConnectCancel.addEventListener("click", hideNasConnectPanel);
siteConnectCancel.addEventListener("click", hideSiteConnectPanel);

function formatSiteLoginDebugDetail(entry) {
  if (!entry || typeof entry !== "object") return "";

  if (entry.type === "show-login-redirect") {
    return `redirecting to ${entry.target || "premium sign-in page"}`;
  }

  if (entry.type === "csrf-refresh-after-modal" || entry.type === "csrf-refresh-before-submit") {
    return entry.ok
      ? `csrf refreshed (${entry.tokenLength || "?"} chars)`
      : entry.status || entry.error || "csrf refresh failed";
  }

  if (entry.type === "login-submit-click") {
    const parts = [
      `form=${entry.mode || "?"}`,
      `emailLen=${entry.emailLength ?? "?"}`,
      `passLen=${entry.passwordLength ?? "?"}`,
      `recaptcha=${entry.recaptcha?.completed ? "yes" : "no"} (${entry.recaptcha?.responseLength || 0} chars)`,
      `csrf=${entry.csrf?.tokenLength ? "ok" : "missing"}`
    ];
    return parts.join(" · ");
  }

  if (entry.type === "login-request") {
    const parts = [
      `payload=${entry.payloadLength || 0}b`,
      `email=${entry.hasEmail ? "yes" : "no"}`,
      `password=${entry.hasPassword ? "yes" : "no"}`,
      `recaptchaField=${entry.hasRecaptchaField ? "yes" : "no"}`,
      `recaptchaDone=${entry.recaptcha?.completed ? "yes" : "no"}`
    ];
    return parts.join(" · ");
  }

  if (entry.type === "login-response") {
    const parts = [
      `http=${entry.httpStatus ?? "?"}`,
      `success=${entry.success ? "yes" : "no"}`,
      entry.serverMessage ? `msg=${entry.serverMessage}` : null
    ].filter(Boolean);
    return parts.join(" · ");
  }

  if (entry.type === "login-error") {
    return [
      `http=${entry.httpStatus ?? "?"}`,
      entry.statusText ? `status=${entry.statusText}` : null,
      entry.responseText ? `body=${entry.responseText.slice(0, 200)}` : null
    ]
      .filter(Boolean)
      .join(" · ");
  }

  return JSON.stringify(entry).slice(0, 300);
}

window.streamApp.onSiteLoginDebug((entry) => {
  const detail = formatSiteLoginDebugDetail(entry);
  const label = entry?.type || "login-debug";
  const level =
    entry?.type === "login-error" || entry?.success === false || entry?.serverMessage
      ? "error"
      : entry?.type === "login-response" && entry?.success
        ? "success"
        : "debug";

  appendActivityLog(level, `Login debug: ${label}`, detail || null);

  if (entry?.type === "login-response" && entry?.success === false) {
    const message = entry.serverMessage || entry?.response?.msg || "Login rejected by site";
    streamStatus.textContent = `Login failed: ${message}`;
  }

  if (entry?.type === "login-submit-click" && entry?.recaptcha && !entry.recaptcha.completed) {
    streamStatus.textContent = "Complete reCAPTCHA first, then click LOGIN.";
  }
});

window.streamApp.onSiteLoginResult((result) => {
  if (result?.ok) {
    if (result.status === "already-logged-in") {
      appendActivityLog("success", "Tornado Movies: already logged in");
      streamStatus.textContent = "Already logged in to Tornado Movies.";
      return;
    }
    appendActivityLog("success", "Tornado Movies login submitted");
    streamStatus.textContent = "Login submitted. If successful, browse movies normally.";
    return;
  }

  if (result?.status === "recaptcha-present") {
    appendActivityLog(
      "info",
      "Tornado Movies: complete reCAPTCHA, then click LOGIN"
    );
    streamStatus.textContent =
      "Credentials filled. Complete reCAPTCHA, then click LOGIN in the browser.";
    return;
  }

  if (result?.status === "server-rejected") {
    const serverMessage = result?.error || "Login rejected by Tornado Movies";
    appendActivityLog("error", "Tornado Movies login failed", serverMessage);
    streamStatus.textContent = `Login failed: ${serverMessage}`;
    return;
  }

  if (result?.status === "logged-in") {
    appendActivityLog("success", "Tornado Movies login successful");
    streamStatus.textContent = "Logged in to Tornado Movies.";
    return;
  }

  const message = result?.status || result?.error || "Site login failed";
  appendActivityLog("error", "Tornado Movies login failed", message);
  streamStatus.textContent = `Site login issue: ${message}`;
});

warpDownloadLink.addEventListener("click", (event) => {
  event.preventDefault();
  window.streamApp.openWarpDownload();
});

installWarpButton.addEventListener("click", async () => {
  installStatus.textContent = "Opening Command Prompt to install 1.1.1.1 VPN...";
  const result = await window.streamApp.installWarpVpn();
  if (result.ok) {
    installStatus.textContent = `Running: ${result.command}`;
  }
});

retryLoadButton.addEventListener("click", async () => {
  hideBlockedPanel();
  streamStatus.textContent = "Retrying...";
  await window.streamApp.reloadCurrentPage();
});

browseHomeButton.addEventListener("click", async () => {
  if (catalogMode) {
    showCatalogView("home");
    streamStatus.textContent = "Search the catalog to begin.";
    return;
  }
  searchError.textContent = "";
  const result = await window.streamApp.goHome();
  if (!result.ok) {
    searchError.textContent = result.error || `Could not open ${siteLabel}.`;
    return;
  }
  hideSearchPanel();
  streamStatus.textContent = hideMovieDownloader
    ? `Browsing ${siteLabel} — open a series and scan episodes in the sidebar.`
    : `Browsing ${siteLabel} — pick a movie and play it.`;
  await refreshDetection();
  await refreshNavigationButtons();
});

window.streamApp.onPageLoadFailed((details) => {
  showBlockedPanel(details);
});

window.streamApp.onGatewayRetry((details) => {
  if (!catalogMode) hideSearchPanel();
  streamStatus.textContent = `Site returned 502 — retrying (${details.attempt}/${details.maxAttempts})...`;
});

window.streamApp.onPageGatewayFailed((details) => {
  showBlockedPanel({
    errorDescription: `Bad gateway (502) after ${details.attempts} retries`,
    url: details.url
  });
});

window.streamApp.onPageLoadSucceeded(() => {
  if (catalogMode) {
    hideBlockedPanel();
    return;
  }
  hideSearchPanel();
  hideBlockedPanel();
  refreshDetection();
  refreshNavigationButtons();
});

window.streamApp.onBrowserContentVisible(() => {
  if (catalogMode) {
    hideBlockedPanel();
    return;
  }
  hideSearchPanel();
  hideBlockedPanel();
});

window.streamApp.onNavigationStateChanged((state) => {
  updateNavigationButtons(state);
});

window.streamApp.onRedirectBlocked((details) => {
  streamStatus.textContent = `Blocked redirect to ${details.displayUrl}`;
});

window.streamApp.onShowSearchLanding(() => {
  hideBlockedPanel();
  if (catalogMode) {
    catalogMovies = [];
    selectedCatalogMovie = null;
    showCatalogView("home");
  }
  showSearchPanel();
});

window.streamApp.onDirectDownloadFound((payload) => {
  const label = payload?.qualityLabel
    ? `${payload.qualityLabel} direct download`
    : payload?.url?.includes("2160")
      ? "4K direct download"
      : payload?.url?.includes("1080")
        ? "1080p direct download"
        : "Direct download link";
  appendActivityLog("success", `${label} captured from site`);
  refreshDetection();
});

window.streamApp.onDownloadQueueUpdated((payload) => {
  handleQueueUpdate(payload);
});

window.streamApp.onQueueDebug((entry) => {
  const detail = entry?.data ? JSON.stringify(entry.data, null, 2) : null;
  appendActivityLog("debug", `[Queue ${entry.step}] ${entry.message}`, detail);
});

addSearchToQueueButton.addEventListener("click", async () => {
  const movies = catalogMode ? catalogMovies : null;
  if (catalogMode && !movies?.length) {
    appendActivityLog("error", "Search the catalog first, then add results to the queue.");
    return;
  }

  const result = await window.streamApp.addSearchResultsToQueue("local", movies);
  if (!result.ok) {
    appendActivityLog("error", result.error);
    return;
  }

  const added = result.added?.length || 0;
  const skipped = result.skipped?.length || 0;
  appendActivityLog(
    "success",
    added
      ? `Added ${added} movie${added === 1 ? "" : "s"} to queue${skipped ? ` (${skipped} skipped)` : ""}`
      : "No new movies added to the queue."
  );
  if (added) window.shellMotion?.pulseQueueChrome();
});

addCurrentToQueueButton.addEventListener("click", async () => {
  if (catalogMode) {
    await addSelectedCatalogMovieToQueue("local");
    return;
  }

  const result = await window.streamApp.addCurrentToQueue("local");
  if (!result.ok) {
    appendActivityLog("error", result.error);
    return;
  }
  appendActivityLog("success", `Added "${result.item.title}" to queue`);
  window.shellMotion?.pulseQueueChrome();
});

if (catalogBackHome) {
  catalogBackHome.addEventListener("click", () => {
    showCatalogView("home");
    streamStatus.textContent = "Search the catalog to begin.";
  });
}

if (catalogBackLibraryHome) {
  catalogBackLibraryHome.addEventListener("click", () => {
    showCatalogView("home");
    streamStatus.textContent = "Search the catalog to begin.";
  });
}

if (openLibraryButton) {
  openLibraryButton.addEventListener("click", () => {
    if (!catalogMode) return;
    showCatalogView("library");
    streamStatus.textContent = "Your downloaded movies and TV shows.";
  });
}

if (catalogBackResults) {
  catalogBackResults.addEventListener("click", () => {
    if (catalogMovies.length) showCatalogView("results");
    else showCatalogView("home");
  });
}

if (catalogQueueAll) {
  catalogQueueAll.addEventListener("click", async () => {
    if (!catalogMovies.length) {
      appendActivityLog("error", "No search results to queue.");
      return;
    }
    const result = await window.streamApp.addSearchResultsToQueue("local", catalogMovies);
    if (!result.ok) {
      appendActivityLog("error", result.error);
      return;
    }
    const added = result.added?.length || 0;
    appendActivityLog("success", `Added ${added} movie${added === 1 ? "" : "s"} to queue`);
    if (added) window.shellMotion?.pulseQueueChrome();
  });
}

if (catalogDownloadLocal) {
  catalogDownloadLocal.addEventListener("click", () => downloadSelectedCatalogMovie("local"));
}
if (catalogDownloadNas) {
  catalogDownloadNas.addEventListener("click", () => downloadSelectedCatalogMovie("nas"));
}
if (catalogAddQueue) {
  catalogAddQueue.addEventListener("click", () => addSelectedCatalogMovieToQueue("local"));
}
if (catalogSeasonSelect) {
  catalogSeasonSelect.addEventListener("change", () => {
    catalogTvPlan = null;
    scanSelectedCatalogSeason().catch(() => {});
  });
}

async function startQueueDownload(destination) {
  const result = await window.streamApp.startDownloadQueue(destination);
  if (!result.ok) {
    appendActivityLog("error", result.error);
    return;
  }

  const target = destination === "nas" ? "NAS" : "PC";
  appendActivityLog("info", `Queue download started → ${target}`);
  if (progressHideTimer) clearTimeout(progressHideTimer);
  progressDock.hidden = false;
}

startDownloadQueueLocalButton.addEventListener("click", () => startQueueDownload("local"));
startDownloadQueueNasButton.addEventListener("click", () => startQueueDownload("nas"));

stopDownloadQueueButton.addEventListener("click", async () => {
  await window.streamApp.stopDownloadQueue();
  appendActivityLog("info", "Stopping queue...");
});

clearDownloadQueueButton.addEventListener("click", async () => {
  const result = await window.streamApp.clearDownloadQueue();
  if (!result.ok) appendActivityLog("error", result.error);
});

queueDebugCopyButton.addEventListener("click", async () => {
  const result = await window.streamApp.getQueueDebug();
  if (!result.ok) {
    appendActivityLog("error", "Could not load queue debug log.");
    return;
  }

  const lines = (result.entries || []).map((entry) => {
    const data = entry.data ? `\n${JSON.stringify(entry.data, null, 2)}` : "";
    return `[${entry.ts}] ${entry.step}: ${entry.message}${data}`;
  });
  const text = `${lines.join("\n\n")}\n\nLog file: ${result.logPath || "unknown"}`;

  try {
    await navigator.clipboard.writeText(text);
    appendActivityLog("info", "Queue debug log copied to clipboard", result.logPath || null);
  } catch {
    appendActivityLog("debug", "Queue debug log", text);
  }
});

async function setSiteBrowseMode(enabled) {
  if (hideMovieDownloader || !catalogMode) {
    siteBrowseMode = false;
    if (browseSiteForTvButton) browseSiteForTvButton.hidden = true;
    if (backToCatalogButton) backToCatalogButton.hidden = true;
    searchPanel?.classList.remove("site-browse-mode");
    return;
  }

  siteBrowseMode = Boolean(enabled);

  if (browseSiteForTvButton) browseSiteForTvButton.hidden = siteBrowseMode;
  if (backToCatalogButton) backToCatalogButton.hidden = !siteBrowseMode;

  if (siteBrowseMode) {
    await window.streamApp.setCatalogBrowserLocked(false);
    for (const button of [backButton, forwardButton, reloadSiteButton]) {
      if (button) button.hidden = false;
    }
    searchPanel.hidden = false;
    searchPanel.classList.add("site-browse-mode");
    if (catalogHome) catalogHome.hidden = false;
    if (catalogLibrary) catalogLibrary.hidden = true;
    if (catalogResults) catalogResults.hidden = true;
    if (catalogDetail) catalogDetail.hidden = true;
    streamStatus.textContent = "Site browse: open a season page, then scan episodes into the queue.";
    await window.streamApp.goHome();
    await refreshNavigationButtons();
    reportChromeLayout();
    return;
  }

  searchPanel.classList.remove("site-browse-mode");
  await window.streamApp.setCatalogBrowserLocked(true);
  for (const button of [backButton, forwardButton, reloadSiteButton]) {
    if (button) button.hidden = true;
  }
  showCatalogView(
    catalogView === "detail" || catalogView === "results" || catalogView === "library"
      ? catalogView
      : "home"
  );
  streamStatus.textContent = "Search the catalog, or browse the site for TV seasons.";
  reportChromeLayout();
}

function renderTvShowPlan(plan = tvShowPlan, payload = {}) {
  tvShowPlan = plan || null;
  const episodeCount = plan?.episodes?.length || 0;
  const processing = Boolean(payload.processing || tvShowActive || queueActive);

  if (!plan) {
    if (tvShowSummary) {
      tvShowSummary.textContent = "Browse a season page, scan it, then add episodes here with movies.";
    }
    if (tvShowEpisodeList) {
      tvShowEpisodeList.hidden = true;
      tvShowEpisodeList.innerHTML = '<li class="tv-show-empty">No season scanned yet.</li>';
    }
    if (addTvToQueueButton) addTvToQueueButton.disabled = true;
    return;
  }

  const season = plan.season || plan.episodes[0]?.season || 1;
  const seasonLabel = `Season ${String(season).padStart(2, "0")}`;
  if (tvShowSummary) {
    tvShowSummary.textContent = `${plan.showTitle} ${seasonLabel} · ${episodeCount} episode${episodeCount === 1 ? "" : "s"} ready to add`;
  }

  if (addTvToQueueButton) addTvToQueueButton.disabled = processing || episodeCount === 0;
  if (scanTvShowButton) scanTvShowButton.disabled = processing;
  if (clearTvShowPlanButton) clearTvShowPlanButton.disabled = processing;

  if (!tvShowEpisodeList) return;

  if (!episodeCount) {
    tvShowEpisodeList.hidden = false;
    tvShowEpisodeList.innerHTML = '<li class="tv-show-empty">No episodes found on the current page.</li>';
    return;
  }

  tvShowEpisodeList.hidden = false;
  tvShowEpisodeList.innerHTML = plan.episodes
    .map((episode) => {
      const label = `S${String(episode.season || 1).padStart(2, "0")}E${String(episode.episode || 0).padStart(2, "0")}`;
      return `<li class="tv-show-episode-item"><strong>${label} · ${escapeHtml(episode.title || "Episode")}</strong></li>`;
    })
    .join("");
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function handleTvShowUpdate(payload = {}) {
  const wasActive = tvShowActive;
  tvShowActive = Boolean(payload.processing);
  renderTvShowPlan(payload.plan ?? tvShowPlan, payload);

  if (tvShowActive && !wasActive) {
    if (progressHideTimer) clearTimeout(progressHideTimer);
    progressHideTimer = null;
    progressDock.hidden = false;
  }

  if (payload.phase === "downloading-episode" || payload.phase === "episode-complete") {
    progressDock.hidden = false;
    progressTrack.classList.remove("indeterminate");
    const total = payload.totalEpisodes || 1;
    const index = payload.index || payload.completedEpisodes || 0;
    const percent = total > 0 ? Math.round((index / total) * 100) : null;
    progressPhase.textContent = payload.label
      ? `TV show: ${payload.label} (${index}/${total})`
      : `TV show: episode ${index}/${total}`;
    if (percent != null) {
      progressPercent.textContent = `${percent}%`;
      progressFill.style.width = `${percent}%`;
    }
    progressDetailLeft.textContent = payload.showTitle || "Downloading episodes";
    const quality = payload.qualityLabel ? ` · ${payload.qualityLabel}` : "";
    progressDetailRight.textContent =
      payload.phase === "episode-complete"
        ? "Episode done"
        : `Downloading${quality}`;
  }

  if (payload.phase === "complete") {
    const saved = payload.completedEpisodes || payload.downloadedEpisodes?.length || 0;
    const failed = payload.failedEpisodes || 0;
    const folder = payload.outputDir || "";
    appendActivityLog(
      "success",
      `TV show complete: ${saved} episode${saved === 1 ? "" : "s"} saved${failed ? ` (${failed} failed)` : ""}${folder ? ` → ${folder}` : ""}`
    );
    if (progressHideTimer) clearTimeout(progressHideTimer);
    progressDock.hidden = false;
    progressTrack.classList.remove("indeterminate");
    progressPhase.textContent = "TV show download complete";
    progressPercent.textContent = "100%";
    progressFill.style.width = "100%";
    progressDetailLeft.textContent = folder || `${saved} episode(s) saved`;
    progressDetailRight.textContent = failed ? `${failed} failed` : "Complete";
    refreshLibrary(true);
  }

  if (payload.phase === "error" && payload.error) {
    appendActivityLog("error", payload.error);
    progressTrack.classList.remove("indeterminate");
    progressPhase.textContent = "TV show download failed";
    progressDetailLeft.textContent = payload.error;
  }
}

if (browseSiteForTvButton) {
  browseSiteForTvButton.addEventListener("click", () => setSiteBrowseMode(true));
}
if (backToCatalogButton) {
  backToCatalogButton.addEventListener("click", () => setSiteBrowseMode(false));
}

scanTvShowButton.addEventListener("click", async () => {
  appendActivityLog("info", "Scanning the current season for episodes...");
  const result = await window.streamApp.scanTvShow();
  if (!result.ok) {
    appendActivityLog("error", result.error);
    return;
  }

  renderTvShowPlan(result.plan);
  const season = result.plan.season || 1;
  appendActivityLog(
    "success",
    `Scanned "${result.plan.showTitle}" season ${season} (${result.plan.episodes.length} episode${result.plan.episodes.length === 1 ? "" : "s"})`
  );
});

clearTvShowPlanButton.addEventListener("click", async () => {
  const result = await window.streamApp.clearTvShowPlan();
  if (!result.ok) {
    appendActivityLog("error", result.error);
    return;
  }
  renderTvShowPlan(null);
});

if (addTvToQueueButton) {
  addTvToQueueButton.addEventListener("click", async () => {
    const result = await window.streamApp.addTvPlanToQueue("local");
    if (!result.ok) {
      appendActivityLog("error", result.error);
      return;
    }
    const added = result.added?.length || 0;
    const skipped = result.skipped?.length || 0;
    appendActivityLog(
      "success",
      `Added ${added} episode${added === 1 ? "" : "s"} to the shared queue${skipped ? ` (${skipped} already queued)` : ""}`
    );
    if (added) {
      window.shellMotion?.pulseQueueChrome?.();
      await refreshDownloadQueue();
    }
  });
}

window.streamApp.onTvShowUpdated((payload) => {
  handleTvShowUpdate(payload);
  if (payload.processing === false) {
    tvShowActive = false;
  }
});

window.streamApp.onStreamCaptureReset(() => {
  downloadStatus.textContent = "";
  if (catalogMode) {
    if (!selectedCatalogMovie) {
      streamStatus.textContent = "Search the catalog to begin.";
    }
    return;
  }
  streamStatus.textContent =
    "Stream capture reset — pause/play or seek the video to refresh, then download again.";
  setToolbarDisabled(downloadButton, true);
  setToolbarDisabled(saveNasButton, true);
});

toolbarSearchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await runSearch(toolbarSearchInput.value, toolbarSearchInput);
});

initEnvironment().then((env) => {
  appendActivityLog(
    "info",
    env?.startupLog ||
      (hideMovieDownloader
        ? "Anime mode ready. Open a season page, scan it, then download episodes from the sidebar."
        : "App ready. Open a movie and use the site's Download links, or play for HLS capture.")
  );
  if (!hideMovieDownloader) {
    refreshDownloadQueue();
  }
});
setupChromeLayoutObserver();
window.streamApp.getTvShowPlan().then((result) => {
  if (result?.plan) renderTvShowPlan(result.plan, result);
});
refreshDetection();
refreshNavigationButtons();
refreshLibrary(true);

setInterval(async () => {
  await refreshDetection();
  await refreshDownloadStatus();
  await refreshLibrary();
}, 1000);
