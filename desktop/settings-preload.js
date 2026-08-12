const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("settingsApp", {
  getSettings: () => ipcRenderer.invoke("get-storage-settings"),
  getEnvironment: () => ipcRenderer.invoke("get-environment"),
  saveSettings: (payload) => ipcRenderer.invoke("save-storage-settings", payload),
  pickLocalFolder: () => ipcRenderer.invoke("pick-local-video-folder"),
  pickNasFolder: () => ipcRenderer.invoke("pick-nas-video-folder"),
  openFolder: (folderPath) => ipcRenderer.invoke("open-storage-folder", folderPath),
  openOutputFolder: () => ipcRenderer.invoke("open-output-folder"),
  openAnimeWindow: () => ipcRenderer.invoke("open-anime-window"),
  getNasCredentials: () => ipcRenderer.invoke("get-nas-credentials"),
  saveNasCredentials: (payload) => ipcRenderer.invoke("save-nas-credentials", payload),
  getSiteCredentials: () => ipcRenderer.invoke("get-site-credentials"),
  saveSiteCredentials: (payload) => ipcRenderer.invoke("save-site-credentials", payload),
  siteLogin: () => ipcRenderer.invoke("site-login"),
  closeWindow: () => ipcRenderer.invoke("close-settings-window")
});
