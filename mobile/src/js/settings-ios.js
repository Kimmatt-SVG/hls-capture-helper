(function createSettingsApp() {
  const { Preferences } = window.Capacitor?.Plugins || {};
  const MovieEngine = window.MovieEngine;

  async function saveSiteCredentials(payload) {
    if (!Preferences?.set) {
      throw new Error("Storage is not ready. Rebuild the app in Xcode.");
    }
    await Preferences.set({
      key: "site_credentials",
      value: JSON.stringify({
        username: String(payload?.username || "").trim(),
        password: String(payload?.password || ""),
        autoLogin: payload?.autoLogin !== false
      })
    });
    return { ok: true };
  }

  async function getSiteCredentials() {
    try {
      const stored = await Preferences?.get({ key: "site_credentials" });
      const parsed = stored?.value ? JSON.parse(stored.value) : {};
      return {
        username: parsed.username || "",
        autoLogin: parsed.autoLogin !== false,
        hasPassword: Boolean(parsed.password)
      };
    } catch {
      return { username: "", autoLogin: true, hasPassword: false };
    }
  }

  window.settingsApp = {
    async getSettings() {
      try {
        const settings = await MovieEngine.getStorageSettings();
        const local = await MovieEngine.getLocalMoviesPath();
        return {
          localVideoFolder: local.displayPath || local.path,
          localSubfolder: "Downloads",
          nasHost: settings.nasHost || "",
          nasShare: settings.nasShare || "",
          nasPath: settings.nasPath || "",
          nasVideoFolder: settings.nasVideoFolder || "",
          nasUsername: settings.nasUsername || ""
        };
      } catch (error) {
        return {
          localVideoFolder: "On My iPhone > Cinarip > Downloads",
          localSubfolder: "Downloads",
          nasHost: "",
          nasShare: "",
          nasPath: "Videos",
          nasVideoFolder: "",
          nasUsername: ""
        };
      }
    },
    async getEnvironment() {
      return {
        profileId: "movies",
        openAnimeButton: false
      };
    },
    async saveSettings(payload) {
      await MovieEngine.saveStorageSettings({
        localSubfolder: payload.localSubfolder,
        nasHost: payload.nasHost,
        nasShare: payload.nasShare,
        nasPath: payload.nasPath,
        nasUsername: payload.nasUsername,
        nasPassword: payload.nasPassword
      });
      await MovieEngine.ensureLocalFolder();
      return { ok: true };
    },
    async pickLocalFolder() {
      const local = await MovieEngine.ensureLocalFolder();
      return { ok: true, path: local.displayPath || local.path };
    },
    async pickNasFolder() {
      return { canceled: true };
    },
    async openFolder() {
      return { ok: false, error: "Use Open in Files for local storage on iOS." };
    },
    async openOutputFolder() {
      await MovieEngine.openLocalFolder();
      return { ok: true };
    },
    openAnimeWindow: async () => ({ ok: false, error: "Anime mode is desktop-only." }),
    getNasCredentials: async () => {
      const settings = await MovieEngine.getStorageSettings();
      return {
        username: settings.nasUsername || "",
        hasPassword: Boolean(settings.nasPassword)
      };
    },
    saveNasCredentials: async (payload) =>
      MovieEngine.connectNas({
        host: payload?.nasHost || payload?.host,
        share: payload?.nasShare || payload?.share,
        path: payload?.nasPath || payload?.path,
        username: payload?.username || payload?.nasUsername,
        password: payload?.password || payload?.nasPassword
      }),
    getSiteCredentials,
    saveSiteCredentials,
    siteLogin: async (payload = {}) => {
      const stored = await getSiteCredentials();
      const full = await (async () => {
        try {
          const raw = await Preferences?.get({ key: "site_credentials" });
          return raw?.value ? JSON.parse(raw.value) : {};
        } catch {
          return {};
        }
      })();
      const username = String(payload.username || full.username || stored.username || "").trim();
      const password = String(payload.password || full.password || "");
      if (!username || !password) {
        return { ok: false, error: "Enter username and password first." };
      }
      if (typeof MovieEngine.rememberSiteCredentials === "function") {
        await MovieEngine.rememberSiteCredentials({ username, password });
      }

      if (typeof MovieEngine.openSiteLogin === "function") {
        const interactive = await MovieEngine.openSiteLogin({ username, password });
        if (interactive?.ok) return interactive;
        if (interactive?.error && !/not ready|unimplemented/i.test(String(interactive.error))) {
          return interactive;
        }
      }

      return {
        ok: false,
        error: "Rebuild the app in Xcode to open Tornado’s login page and complete the captcha."
      };
    },
    closeWindow: () => {
      window.location.href = "index.html";
    },
    testNasWrite: (payload) =>
      MovieEngine.testNasWrite({
        host: payload?.nasHost || payload?.host,
        share: payload?.nasShare || payload?.share,
        path: payload?.nasPath || payload?.path,
        username: payload?.nasUsername || payload?.username,
        password: payload?.nasPassword || payload?.password
      })
  };
})();
