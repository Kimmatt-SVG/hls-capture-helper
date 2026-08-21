(function bootMobileShell() {
  if (!document.body.classList.contains("platform-ios")) return;

  function applyMobileChrome(view) {
    document.body.dataset.catalogView = view;
    const chromeHidden = view === "library" || view === "detail";
    document.body.classList.toggle("catalog-subview", chromeHidden);
    const searchForm = document.getElementById("toolbar-search-form");
    if (searchForm) searchForm.hidden = chromeHidden;
    const openLibrary = document.getElementById("open-library");
    if (openLibrary) openLibrary.hidden = view === "library";
    const toolbar = document.querySelector(".mobile-toolbar");
    if (toolbar) toolbar.hidden = chromeHidden;
  }

  function showCatalogViewFallback(view) {
    const home = document.getElementById("catalog-home");
    const library = document.getElementById("catalog-library");
    const results = document.getElementById("catalog-results");
    const detail = document.getElementById("catalog-detail");
    const panel = document.getElementById("search-panel");
    panel?.classList.add("catalog-mode");
    panel && (panel.hidden = false);
    if (home) home.hidden = view !== "home";
    if (library) library.hidden = view !== "library";
    if (results) results.hidden = view !== "results";
    if (detail) detail.hidden = view !== "detail";
    applyMobileChrome(view);
  }

  function syncCatalogViewFromDom() {
    const library = document.getElementById("catalog-library");
    const results = document.getElementById("catalog-results");
    const detail = document.getElementById("catalog-detail");
    let view = "home";
    if (library && !library.hidden) view = "library";
    else if (detail && !detail.hidden) view = "detail";
    else if (results && !results.hidden) view = "results";
    applyMobileChrome(view);
  }

  function bindNavigation() {
    document.getElementById("open-settings")?.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        window.location.href = "settings.html";
      },
      true
    );

    document.getElementById("open-library")?.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        showCatalogViewFallback("library");
        const status = document.getElementById("stream-status");
        if (status) status.textContent = "Your downloaded movies and TV shows.";
      },
      true
    );

    document.getElementById("catalog-back-library-home")?.addEventListener("click", () => {
      showCatalogViewFallback("home");
      const status = document.getElementById("stream-status");
      if (status) status.textContent = "Search for a movie to begin.";
    });

    document.getElementById("catalog-back-home")?.addEventListener("click", () => {
      showCatalogViewFallback("home");
    });

    document.getElementById("catalog-back-results")?.addEventListener("click", () => {
      const resultsVisible = document.getElementById("catalog-grid")?.children?.length;
      showCatalogViewFallback(resultsVisible ? "results" : "home");
    });
  }

  bindNavigation();

  ["catalog-library", "catalog-results", "catalog-detail", "catalog-home"].forEach((id) => {
    const node = document.getElementById(id);
    if (!node || typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(syncCatalogViewFromDom);
    observer.observe(node, { attributes: true, attributeFilter: ["hidden"] });
  });

  syncCatalogViewFromDom();

  window.addEventListener("unhandledrejection", (event) => {
    const message = event.reason?.message || String(event.reason || "Unknown error");
    if (/scrape timed out|unsupported type|cancelled/i.test(message)) {
      event.preventDefault?.();
      return;
    }
    const log = document.getElementById("activity-log");
    if (!log) return;
    const empty = log.querySelector(".activity-log-empty");
    if (empty) empty.remove();
    const item = document.createElement("li");
    item.className = "log-entry error";
    item.textContent = message;
    log.appendChild(item);
  });

  setTimeout(() => {
    const panel = document.getElementById("search-panel");
    if (!panel?.classList.contains("catalog-mode")) {
      panel?.classList.add("catalog-mode");
      showCatalogViewFallback("home");
    }
  }, 300);
})();
