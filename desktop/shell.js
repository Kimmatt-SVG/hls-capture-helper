const openAnimeWindowButton = document.getElementById("open-anime-window");
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
const openFolderButton = document.getElementById("open-folder");
const syncToNasButton = document.getElementById("sync-to-nas");
const connectNasButton = document.getElementById("connect-nas");
const connectSiteButton = document.getElementById("connect-site");
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
const searchForm = document.getElementById("search-form");
const searchInput = document.getElementById("search-input");
const searchError = document.getElementById("search-error");
const browseHomeButton = document.getElementById("browse-home");
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
const modeTabs = document.getElementById("mode-tabs");
const searchFeatures = document.getElementById("search-features");
const tvShowLead = document.querySelector(".tv-show-lead");
const tvShowTitle = document.getElementById("tv-show-title");
const tvShowBadge = document.querySelector(".tv-show-badge");
const modeTabMovies = document.getElementById("mode-tab-movies");
const modeTabTv = document.getElementById("mode-tab-tv");
const downloadQueueSection = document.getElementById("download-queue-section");
const tvShowSection = document.getElementById("tv-show-section");
const tvShowSummary = document.getElementById("tv-show-summary");
const tvShowEpisodeList = document.getElementById("tv-show-episode-list");
const scanTvShowButton = document.getElementById("scan-tv-show");
const startTvShowLocalButton = document.getElementById("start-tv-show-local");
const startTvShowNasButton = document.getElementById("start-tv-show-nas");
const stopTvShowButton = document.getElementById("stop-tv-show");
const clearTvShowPlanButton = document.getElementById("clear-tv-show-plan");

const PROGRESS_DOCK_HEIGHT = 88;
const MAX_LOG_ENTRIES = 120;

let progressHideTimer = null;
let chromeLayoutFrame = null;
let downloadActive = false;
let librarySyncActive = false;
let queueActive = false;
let tvShowActive = false;
let tvShowPlan = null;
let sidebarMode = "movies";
let hideMovieDownloader = false;
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
  streamStatus.textContent = hideMovieDownloader
    ? "Search for an anime series on Aniwave."
    : "Search for a movie to begin.";
  searchInput.focus();
}

function hideSearchPanel() {
  searchPanel.hidden = true;
  searchError.textContent = "";
}

async function runSearch(query, sourceInput = null) {
  const trimmed = String(query || "").trim();
  if (!trimmed) {
    searchError.textContent = hideMovieDownloader
      ? "Enter an anime title to search."
      : "Enter a movie title to search.";
    return;
  }

  searchError.textContent = "";
  streamStatus.textContent = `Searching for "${trimmed}"...`;

  const result = await window.streamApp.searchMovies(trimmed);
  if (!result.ok) {
    searchError.textContent = result.error;
    streamStatus.textContent = result.error;
    return;
  }

  hideSearchPanel();
  searchInput.value = trimmed;
  toolbarSearchInput.value = trimmed;
  streamStatus.textContent = `Showing results for "${trimmed}"`;
  if (sourceInput) sourceInput.blur();
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
  const item = document.createElement("li");
  item.className = "library-item";
  item.title = movie.title;

  if (movie.posterUrl) {
    const banner = document.createElement("img");
    banner.className = "library-banner";
    banner.src = movie.posterUrl;
    banner.alt = movie.title;
    banner.loading = "lazy";
    banner.addEventListener("error", () => {
      banner.replaceWith(createBannerFallback(movie.title));
    });
    item.appendChild(banner);
  } else {
    item.appendChild(createBannerFallback(movie.title));
  }

  const meta = document.createElement("div");
  meta.className = "library-meta";

  const title = document.createElement("span");
  title.className = "library-title";
  title.textContent = movie.title;
  meta.appendChild(title);

  item.appendChild(meta);
  return item;
}

function createBannerFallback(title) {
  const fallback = document.createElement("div");
  fallback.className = "library-banner-fallback";
  fallback.textContent = title;
  return fallback;
}

function formatLibraryPath(folderPath) {
  if (!folderPath) return "Unknown folder";

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
  count.textContent = String(section.movies.length);

  const openFolder = document.createElement("button");
  openFolder.type = "button";
  openFolder.className = "library-open-folder";
  openFolder.textContent = "Open";
  openFolder.addEventListener("click", (event) => {
    event.stopPropagation();
    window.streamApp.openLibraryFolder(location);
  });

  actions.append(count);
  if (location === "local" && section.accessible) {
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
  actions.append(openFolder);
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
  return wrapper;
}

async function refreshLibrary(force = false) {
  const now = Date.now();
  if (!force && now - lastLibraryRefreshAt < 4000) return;

  lastLibraryRefreshAt = now;
  const library = await window.streamApp.getDownloadedMovies();

  librarySections.replaceChildren(
    renderLibrarySection(library.local, "PC", "local"),
    renderLibrarySection(library.nas, "NAS", "nas")
  );

  const env = await window.streamApp.getEnvironment();
  librarySummary.textContent = `${library.totalCount} movie${library.totalCount === 1 ? "" : "s"} · NAS: ${formatLibraryPath(env.nasVideoFolder)}`;
}

refreshLibraryButton.addEventListener("click", () => refreshLibrary(true));

function beginDownloadUi(destination) {
  downloadButton.disabled = true;
  saveNasButton.disabled = true;
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
  downloadButton.disabled = false;
  saveNasButton.disabled = false;
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
  syncToNasButton.disabled = disabled;
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
  if (counts.done) parts.push(`${counts.done} done`);
  if (counts.failed) parts.push(`${counts.failed} failed`);
  if (snapshot?.running) parts.push("running");
  return parts.length ? parts.join(" · ") : "0 movies queued";
}

function renderDownloadQueue(snapshot) {
  const items = snapshot?.items || [];
  downloadQueueSummary.textContent = formatQueueSummary(snapshot);
  downloadQueueList.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("li");
    empty.className = "download-queue-empty";
    empty.textContent = "Add movie pages to the queue. Each download gets a fresh link right before it starts.";
    downloadQueueList.appendChild(empty);
    return;
  }

  for (const item of items) {
    const row = document.createElement("li");
    row.className = `download-queue-item status-${item.status}`;
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
    meta.textContent = item.destination === "nas" ? "NAS" : "PC";

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
    downloadButton.disabled = true;
    saveNasButton.disabled = true;
  }
}

function handleQueueUpdate(payload = {}) {
  const snapshot = payload.snapshot || payload;
  queueActive = Boolean(snapshot.running);
  renderDownloadQueue(snapshot);
  updateQueueControls(snapshot);

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
  downloadButton.disabled = true;
  saveNasButton.disabled = true;
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
      downloadButton.disabled = false;
      saveNasButton.disabled = false;
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
    downloadButton.disabled = false;
    saveNasButton.disabled = false;
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
    const sidebar = document.getElementById("library-sidebar");
    const dock = progressDock;

    const top = Math.ceil(
      (statusBar?.getBoundingClientRect().bottom ??
        toolbar?.getBoundingClientRect().bottom ??
        74) + 4
    );

    const sidebarLeft = sidebar?.getBoundingClientRect().left ?? window.innerWidth - 330;
    const right = Math.ceil(window.innerWidth - sidebarLeft + margin);

    let bottom = margin;
    if (dock && !dock.hidden) {
      bottom = Math.ceil(window.innerHeight - dock.getBoundingClientRect().top + margin);
    }

    window.streamApp.setChromeLayout({ top, right, bottom });
  });
}

function setupChromeLayoutObserver() {
  reportChromeLayout();

  const watched = [
    document.querySelector(".toolbar"),
    document.querySelector(".status-bar"),
    document.getElementById("library-sidebar"),
    progressDock
  ].filter(Boolean);

  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(() => reportChromeLayout());
    for (const node of watched) observer.observe(node);
  }

  if (progressDock) {
    const dockObserver = new MutationObserver(() => reportChromeLayout());
    dockObserver.observe(progressDock, { attributes: true, attributeFilter: ["hidden"] });
  }

  window.addEventListener("resize", reportChromeLayout);
}

function hideProgressDock() {
  progressDock.hidden = true;
  reportChromeLayout();
  progressTrack.className = "progress-track";
  progressFill.style.width = "0%";
}

function scheduleProgressHide(delayMs = 6000) {
  if (queueActive || tvShowActive) return;
  if (progressHideTimer) clearTimeout(progressHideTimer);
  progressHideTimer = setTimeout(async () => {
    progressHideTimer = null;
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
    if (!downloadActive && !librarySyncActive && !queueActive) hideProgressDock();
    return;
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

  if (!target) {
    streamStatus.textContent =
      playlists.length === 0
        ? searchPanel.hidden
          ? "Waiting for download link... open a movie and click Download on the site."
          : "Search for a movie to begin."
        : `${playlists.length} playlist(s) seen, none selected yet.`;
    if (download.state === "idle") {
      downloadButton.disabled = true;
      saveNasButton.disabled = true;
    }
    return;
  }

  if (download.state === "idle") {
    if (bestDirect) {
      streamStatus.textContent = `Direct ${bestDirect.qualityLabel} download ready · ${bestDirect.displayUrl}`;
    } else {
      streamStatus.textContent = `Detected ${best.kind} stream · ${best.displayUrl}`;
    }
    downloadButton.disabled = false;
    saveNasButton.disabled = false;
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
    downloadButton.disabled = false;
    saveNasButton.disabled = false;
    return;
  }

  stopButton.hidden = status.state !== "running";
  downloadButton.disabled =
    status.state === "running" || status.state === "finished" || status.state === "failed";
  saveNasButton.disabled =
    status.state === "running" || status.state === "finished" || status.state === "failed";

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
    scheduleProgressHide(8000);
  }
}

function setMovieToolbarVisible(visible) {
  for (const button of [downloadButton, saveNasButton, refreshButton, streamDebugButton, syncToNasButton]) {
    if (button) button.hidden = !visible;
  }
}

function applyProfileLayout(env) {
  hideMovieDownloader = Boolean(env.hideMovieDownloader);
  siteLabel = env.siteLabel || "Tornado Movies";
  if (browseHomeButton) browseHomeButton.textContent = `Browse ${siteLabel}`;
  if (connectSiteButton) connectSiteButton.hidden = hideMovieDownloader;

  if (hideMovieDownloader) {
    if (modeTabs) modeTabs.hidden = true;
    if (downloadQueueSection) downloadQueueSection.hidden = true;
    if (tvShowSection) tvShowSection.hidden = false;
    if (searchFeatures) searchFeatures.hidden = true;
    if (tvShowLead && env.tvShowLead) tvShowLead.textContent = env.tvShowLead;
    if (tvShowTitle) tvShowTitle.textContent = "Anime Downloader";
    if (tvShowBadge) tvShowBadge.hidden = true;
    setMovieToolbarVisible(false);
    if (streamStatus) {
      streamStatus.textContent = "Search Aniwave or open a series page to get started.";
    }
    setSidebarMode("tv");
    return;
  }

  if (connectSiteButton) connectSiteButton.hidden = false;

  if (modeTabs) modeTabs.hidden = false;
  if (searchFeatures) searchFeatures.hidden = false;
  if (tvShowTitle) tvShowTitle.textContent = "TV Show Mode";
  if (tvShowBadge) tvShowBadge.hidden = false;
  setMovieToolbarVisible(true);
  setSidebarMode(env.defaultSidebarMode === "tv" ? "tv" : "movies");
}

async function initEnvironment() {
  const env = await window.streamApp.getEnvironment();
  siteLabel = env.siteLabel || "Tornado Movies";
  if (env.profileLabel && brandTitle) {
    brandTitle.textContent = env.profileLabel;
    document.title = env.profileLabel;
  }
  if (env.searchPlaceholder) {
    toolbarSearchInput.placeholder = env.searchPlaceholder;
    const exampleMatch = env.searchPlaceholder.match(/\(([^)]+)\)/);
    searchInput.placeholder = exampleMatch ? exampleMatch[1] : env.searchPlaceholder;
  }
  if (env.landingTitle && landingTitle) landingTitle.textContent = env.landingTitle;
  if (env.landingLead && landingLead) landingLead.textContent = env.landingLead;
  if (openAnimeWindowButton) {
    openAnimeWindowButton.hidden = !env.openAnimeButton;
  }
  if (openFolderButton && env.profileId === "anime") {
    openFolderButton.textContent = "Open Anime Folder";
  }
  applyProfileLayout(env);
  if (!env.ffmpegPath) {
    streamStatus.textContent = "ffmpeg not found — install ffmpeg and restart the app.";
    if (!hideMovieDownloader) {
      downloadButton.disabled = true;
      saveNasButton.disabled = true;
    }
  }
  envStatus.textContent = `NAS: ${formatLibraryPath(env.nasVideoFolder)} · Site: ${env.siteUsername ? `logged in as ${env.siteUsername}` : "not configured"}`;
  adblockStatus.classList.toggle("visible", Boolean(env.adBlockerEnabled));
  redirectStatus.classList.toggle("visible", Boolean(env.redirectProtectionEnabled));
  showSearchPanel();
  return env;
}

downloadButton.addEventListener("click", async () => {
  downloadButton.disabled = true;
  saveNasButton.disabled = true;
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
    downloadButton.disabled = false;
    saveNasButton.disabled = false;
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

saveNasButton.addEventListener("click", async () => {
  downloadButton.disabled = true;
  saveNasButton.disabled = true;
  streamStatus.textContent = "Saving stream to NAS...";
  if (progressHideTimer) clearTimeout(progressHideTimer);
  progressDock.hidden = false;
  updateProgressDock({
    state: "running",
    phase: "Preparing NAS save...",
    percent: 3,
    destination: "nas"
  });

  const result = await window.streamApp.saveToNas();
  if (!result.ok) {
    streamStatus.textContent = result.error;
    downloadButton.disabled = false;
    saveNasButton.disabled = false;
    return;
  }

  streamStatus.textContent = `Saving ${result.playlist.kind} stream (${result.quality?.label || "best available"})${result.artworkPath ? " + poster" : ""} to NAS...`;
  stopButton.hidden = false;
  await refreshDownloadStatus();
});

stopButton.addEventListener("click", async () => {
  await window.streamApp.stopDownload();
  streamStatus.textContent = "Stopping download...";
  await refreshDownloadStatus();
});

refreshButton.addEventListener("click", async () => {
  await window.streamApp.scanDirectDownloads();
  await refreshDetection();
});
streamDebugButton.addEventListener("click", refreshStreamDebug);
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
openFolderButton.addEventListener("click", () => window.streamApp.openOutputFolder());
connectNasButton.addEventListener("click", () => showNasConnectPanel());
connectSiteButton.addEventListener("click", () => showSiteConnectPanel());
syncToNasButton.addEventListener("click", () => runLibrarySync());
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
  hideSearchPanel();
  streamStatus.textContent = `Site returned 502 — retrying (${details.attempt}/${details.maxAttempts})...`;
});

window.streamApp.onPageGatewayFailed((details) => {
  showBlockedPanel({
    errorDescription: `Bad gateway (502) after ${details.attempts} retries`,
    url: details.url
  });
});

window.streamApp.onPageLoadSucceeded(() => {
  hideSearchPanel();
  hideBlockedPanel();
  refreshDetection();
  refreshNavigationButtons();
});

window.streamApp.onBrowserContentVisible(() => {
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
  const result = await window.streamApp.addSearchResultsToQueue("local");
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
});

addCurrentToQueueButton.addEventListener("click", async () => {
  const result = await window.streamApp.addCurrentToQueue("local");
  if (!result.ok) {
    appendActivityLog("error", result.error);
    return;
  }
  appendActivityLog("success", `Added "${result.item.title}" to queue`);
});

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

function setSidebarMode(mode) {
  if (hideMovieDownloader) {
    sidebarMode = "tv";
    if (tvShowSection) tvShowSection.hidden = false;
    if (downloadQueueSection) downloadQueueSection.hidden = true;
    return;
  }

  sidebarMode = mode === "tv" ? "tv" : "movies";
  const isTv = sidebarMode === "tv";

  modeTabMovies.classList.toggle("active", !isTv);
  modeTabTv.classList.toggle("active", isTv);
  modeTabMovies.setAttribute("aria-selected", String(!isTv));
  modeTabTv.setAttribute("aria-selected", String(isTv));
  downloadQueueSection.hidden = isTv;
  tvShowSection.hidden = !isTv;
}

function renderTvShowPlan(plan = tvShowPlan, payload = {}) {
  tvShowPlan = plan || null;
  const episodeCount = plan?.episodes?.length || 0;
  const processing = Boolean(payload.processing || tvShowActive);

  if (!plan) {
    tvShowSummary.textContent = "Open a season page, then scan it";
    tvShowEpisodeList.innerHTML = '<li class="tv-show-empty">No season scanned yet.</li>';
    startTvShowLocalButton.disabled = true;
    startTvShowNasButton.disabled = true;
    stopTvShowButton.hidden = true;
    return;
  }

  const phase = payload.phase || "";
  const season = plan.season || plan.episodes[0]?.season || 1;
  const seasonLabel = `Season ${String(season).padStart(2, "0")}`;

  if (processing) {
    if (payload.label) {
      const quality = payload.qualityLabel ? ` · ${payload.qualityLabel}` : "";
      tvShowSummary.textContent = `${plan.showTitle} ${seasonLabel}: ${payload.label}${quality} (${payload.index || "?"}/${payload.totalEpisodes || episodeCount})`;
    } else {
      tvShowSummary.textContent = `Downloading ${plan.showTitle} ${seasonLabel}...`;
    }
  } else {
    tvShowSummary.textContent = `${plan.showTitle} ${seasonLabel} · ${episodeCount} episode${episodeCount === 1 ? "" : "s"} ready`;
  }

  startTvShowLocalButton.disabled = processing || episodeCount === 0;
  startTvShowNasButton.disabled = processing || episodeCount === 0;
  scanTvShowButton.disabled = processing;
  clearTvShowPlanButton.disabled = processing;
  stopTvShowButton.hidden = !processing;

  if (!episodeCount) {
    tvShowEpisodeList.innerHTML = '<li class="tv-show-empty">No episodes found on the current page.</li>';
    return;
  }

  tvShowEpisodeList.innerHTML = plan.episodes
    .map((episode) => {
      const label = `S${String(episode.season || 1).padStart(2, "0")}E${String(episode.episode || 0).padStart(2, "0")}`;
      return `<li class="tv-show-episode-item"><strong>${label} · ${escapeHtml(episode.title || "Episode")}</strong><span>${escapeHtml(episode.url || "")}</span></li>`;
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

modeTabMovies.addEventListener("click", () => setSidebarMode("movies"));
modeTabTv.addEventListener("click", () => setSidebarMode("tv"));

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

async function startTvShowDownload(destination) {
  if (progressHideTimer) clearTimeout(progressHideTimer);
  progressHideTimer = null;
  tvShowActive = true;
  hideSearchPanel();

  const result = await window.streamApp.startTvShowDownload(destination);
  if (!result.ok) {
    tvShowActive = false;
    appendActivityLog("error", result.error);
    return;
  }

  const target = destination === "nas" ? "NAS" : "PC";
  appendActivityLog("info", `TV show download started → ${target}`);
  if (progressHideTimer) clearTimeout(progressHideTimer);
  progressDock.hidden = false;
}

startTvShowLocalButton.addEventListener("click", () => startTvShowDownload("local"));
startTvShowNasButton.addEventListener("click", () => startTvShowDownload("nas"));

stopTvShowButton.addEventListener("click", async () => {
  await window.streamApp.stopTvShowDownload();
  appendActivityLog("info", "Stopping TV show download...");
});

window.streamApp.onTvShowUpdated((payload) => {
  handleTvShowUpdate(payload);
  if (payload.processing === false) {
    tvShowActive = false;
  }
});

window.streamApp.onStreamCaptureReset(() => {
  downloadStatus.textContent = "";
  streamStatus.textContent =
    "Stream capture reset — pause/play or seek the video to refresh, then download again.";
  downloadButton.disabled = true;
  saveNasButton.disabled = true;
});

searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await runSearch(searchInput.value, searchInput);
});

toolbarSearchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await runSearch(toolbarSearchInput.value, toolbarSearchInput);
});

openAnimeWindowButton?.addEventListener("click", async () => {
  const result = await window.streamApp.openAnimeWindow();
  if (!result.ok) {
    appendActivityLog("error", result.error || "Could not open anime window.");
    return;
  }
  appendActivityLog("info", "Opened Anime Stream Downloader in a new window.");
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
