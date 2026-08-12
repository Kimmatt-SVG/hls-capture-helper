(function ensureMobileShellStubs() {
  if (document.body.classList.contains("platform-ios") === false && window.Capacitor?.getPlatform?.() !== "ios") {
    return;
  }

  const stubIds = [
    "download",
    "save-nas",
    "refresh-detect",
    "stream-debug",
    "go-back",
    "go-forward",
    "reload-site",
    "sync-to-nas",
    "nas-connect-panel",
    "nas-connect-form",
    "nas-username",
    "nas-password",
    "nas-connect-error",
    "nas-connect-cancel",
    "site-connect-panel",
    "site-connect-form",
    "site-username",
    "site-password",
    "site-auto-login",
    "site-connect-error",
    "site-connect-cancel",
    "blocked-panel",
    "blocked-detail",
    "install-status",
    "install-warp",
    "retry-load",
    "warp-download-link",
    "adblock-status",
    "redirect-status",
    "browse-home",
    "catalog-queue-all",
    "landing-title",
    "landing-lead",
    "catalog-brand",
    "refresh-library",
    "add-search-to-queue",
    "add-current-to-queue",
    "queue-debug-copy",
    "search-features",
    "tv-show-lead",
    "tv-show-title",
    "tv-show-section",
    "tv-show-summary",
    "tv-show-episode-list",
    "scan-tv-show",
    "add-tv-to-queue",
    "clear-tv-show-plan",
    "browse-site-for-tv",
    "back-to-catalog"
  ];

  const container = document.createElement("div");
  container.hidden = true;
  container.setAttribute("aria-hidden", "true");

  for (const id of stubIds) {
    if (document.getElementById(id)) continue;
    let element;
    if (id.endsWith("-form")) {
      element = document.createElement("form");
    } else if (
      id.includes("button") ||
      id === "download" ||
      id === "save-nas" ||
      id === "refresh-detect" ||
      id === "stream-debug" ||
      id.startsWith("go-") ||
      id.startsWith("scan-") ||
      id.startsWith("add-") ||
      id.startsWith("clear-") ||
      id.startsWith("browse-") ||
      id.startsWith("back-") ||
      id.startsWith("retry-") ||
      id.startsWith("install-") ||
      id.startsWith("queue-debug")
    ) {
      element = document.createElement("button");
      element.type = "button";
    } else if (id.includes("input") || id.includes("username") || id.includes("password")) {
      element = document.createElement("input");
    } else {
      element = document.createElement("div");
    }
    element.id = id;
    container.appendChild(element);
  }

  document.body.appendChild(container);
})();
