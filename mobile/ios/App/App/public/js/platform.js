(function initPlatform() {
  const capacitor = window.Capacitor;
  const isIOS =
    capacitor?.getPlatform?.() === "ios" ||
    capacitor?.isNativePlatform?.() === true ||
    document.body.classList.contains("platform-ios");
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
      localDisplayPath: "On My iPhone > Cinarip > Downloads"
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
      },
      async abortScrape() {
        return { ok: true };
      },
      async fetchDirectLinks() {
        return { ok: false, links: [], error: "Native downloader is not ready yet. Rebuild the app in Xcode." };
      },
      async siteLogin() {
        return { ok: false, error: "Native login is not ready yet. Rebuild the app in Xcode." };
      },
      async openSiteLogin() {
        return { ok: false, error: "Native login is not ready yet. Rebuild the app in Xcode." };
      },
      async rememberSiteCredentials() {
        return { ok: true, status: "stored" };
      },
      async downloadFile() {
        return { ok: false, error: "Native downloader is not ready yet. Rebuild the app in Xcode." };
      },
      async getDownloadStatus() {
        return { state: "idle" };
      },
      async stopDownload() {
        return { ok: true };
      },
      async clearDownloadJob() {
        return { ok: true };
      },
      async downloadArtwork() {
        return { ok: false, error: "Artwork download is not ready yet. Rebuild the app in Xcode." };
      },
      async fetchMoviePoster() {
        return { ok: false, error: "Poster scrape is not ready yet. Rebuild the app in Xcode." };
      },
      async playVideo() {
        return { ok: false, error: "In-app player is not ready yet. Rebuild the app in Xcode." };
      },
      async playFeedback() {
        return { ok: true };
      }
    };
  }

  function resolveMovieEnginePlugin() {
    const cap = window.Capacitor;
    const nativePlugin = cap?.Plugins?.MovieEngine;
    if (nativePlugin && typeof nativePlugin.scrapePage === "function") {
      return nativePlugin;
    }

    if (typeof cap?.registerPlugin === "function") {
      try {
        const registered = cap.registerPlugin("MovieEngine");
        if (registered && typeof registered.scrapePage === "function") {
          return registered;
        }
      } catch (error) {
        console.warn("MovieEngine registerPlugin failed", error);
      }
    }

    console.warn("MovieEngine native plugin unavailable; using fallback stub.");
    return createMovieEngineFallback();
  }

  window.MovieEngine = resolveMovieEnginePlugin();

  if (isIOS && window.Capacitor?.Plugins?.StatusBar) {
    const statusBar = window.Capacitor.Plugins.StatusBar;
    statusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
    statusBar.setStyle({ style: "DARK" }).catch(() => {});
    statusBar.setBackgroundColor({ color: "#0a0a12" }).catch(() => {});
  }

  function installKeyboardAvoidance() {
    if (!isIOS) return;
    const Keyboard = window.Capacitor?.Plugins?.Keyboard;
    const root = document.documentElement;

    function setInset(px) {
      root.style.setProperty("--keyboard-inset", `${Math.max(0, Math.round(Number(px) || 0))}px`);
    }

    function scrollFocusedField() {
      const el = document.activeElement;
      if (!(el instanceof HTMLElement)) return;
      if (!/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    }

    Keyboard?.setAccessoryBarVisible?.({ isVisible: false }).catch(() => {});
    Keyboard?.setScroll?.({ isDisabled: true }).catch(() => {});
    Keyboard?.addListener?.("keyboardWillShow", (info) => {
      setInset(info?.keyboardHeight || 0);
      requestAnimationFrame(scrollFocusedField);
    });
    Keyboard?.addListener?.("keyboardDidShow", () => {
      scrollFocusedField();
    });
    Keyboard?.addListener?.("keyboardWillHide", () => setInset(0));

    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", () => {
      if (Keyboard) return;
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      setInset(inset);
    });

    document.addEventListener("focusin", (event) => {
      if (!(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        return;
      }
      window.setTimeout(scrollFocusedField, 350);
    });
  }

  installKeyboardAvoidance();
})();
