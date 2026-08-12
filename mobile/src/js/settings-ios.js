(function createSettingsApp() {
  const { Preferences } = window.Capacitor?.Plugins || {};
  const MovieEngine = window.MovieEngine;

  async function saveSiteCredentials(payload) {
    await Preferences?.set({
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
          localSubfolder: settings.localSubfolder || "Movies",
          nasHost: settings.nasHost || "",
          nasShare: settings.nasShare || "",
          nasPath: settings.nasPath || "",
          nasVideoFolder: settings.nasVideoFolder || "",
          nasUsername: settings.nasUsername || ""
        };
      } catch (error) {
        return {
          localVideoFolder: "On My iPhone > Movie Stream Downloader > Movies",
          localSubfolder: "Movies",
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
      await MovieEngine.ensureLocalFolder({ subfolder: payload.localSubfolder || "Movies" });
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
        username: payload?.username,
        password: payload?.password
      }),
    getSiteCredentials,
    saveSiteCredentials,
    siteLogin: async () => ({ ok: true }),
    closeWindow: () => {
      window.location.href = "index.html";
    },
    testNasWrite: (payload) => MovieEngine.testNasWrite(payload || {})
  };
})();
