(function initPlatform() {
  const capacitor = window.Capacitor;
  const isIOS = capacitor?.getPlatform?.() === "ios";
  document.body.classList.toggle("platform-ios", isIOS);

  function createMovieEngineFallback() {
    const defaults = {
      localSubfolder: "Downloads",
      nasHost: "",
      nasShare: "",
      nasPath: "Videos",
      nasUsername: "",
      nasPassword: "",
      nasVideoFolder: "",
      localDisplayPath: "On My iPhone > Movie Stream Downloader > Downloads"
    };

    return {
      async getStorageSettings() {
        return { ...defaults };
      },
      async getLocalMoviesPath() {
        return { path: "", displayPath: defaults.localDisplayPath };
      },
      async ensureLocalFolder() {
        return { ok: true, path: "", displayPath: defaults.localDisplayPath };
      },
      async listLocalDownloads() {
        return {
          location: "local",
          folderPath: "",
          displayPath: defaults.localDisplayPath,
          exists: true,
          accessible: true,
          movies: [],
          entries: [],
          movieCount: 0,
          showCount: 0,
          episodeCount: 0
        };
      },
      async saveStorageSettings(payload = {}) {
        return { ok: true, ...payload };
      },
      async connectNas() {
        return { ok: false, error: "Native storage plugin is not ready yet. Rebuild the app in Xcode." };
      },
      async testNasWrite() {
        return { ok: false, error: "Native storage plugin is not ready yet. Rebuild the app in Xcode." };
      },
      async openLocalFolder() {
        return { ok: true };
      },
      async scrapePage() {
        return { ok: false, error: "Native scraper is not ready yet. Rebuild the app in Xcode." };
      }
    };
  }

  if (capacitor?.registerPlugin) {
    try {
      window.MovieEngine = capacitor.registerPlugin("MovieEngine");
    } catch (error) {
      console.warn("MovieEngine plugin registration failed", error);
      window.MovieEngine = createMovieEngineFallback();
    }
  } else {
    window.MovieEngine = createMovieEngineFallback();
  }

  if (isIOS && window.Capacitor?.Plugins?.StatusBar) {
    window.Capacitor.Plugins.StatusBar.setStyle({ style: "DARK" }).catch(() => {});
    window.Capacitor.Plugins.StatusBar.setBackgroundColor({ color: "#10131a" }).catch(() => {});
  }
})();
