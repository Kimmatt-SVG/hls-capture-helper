const localFolderPath = document.getElementById("local-folder-path");
const nasFolderPath = document.getElementById("nas-folder-path");
const settingsStatus = document.getElementById("settings-status");
const openAnimeWindowButton = document.getElementById("open-anime-window");
const openMoviesFolderButton = document.getElementById("open-movies-folder");
const nasConnectForm = document.getElementById("nas-connect-form");
const nasUsernameInput = document.getElementById("nas-username");
const nasPasswordInput = document.getElementById("nas-password");
const nasConnectError = document.getElementById("nas-connect-error");
const siteConnectForm = document.getElementById("site-connect-form");
const siteUsernameInput = document.getElementById("site-username");
const sitePasswordInput = document.getElementById("site-password");
const siteAutoLoginInput = document.getElementById("site-auto-login");
const siteConnectError = document.getElementById("site-connect-error");

function setStatus(message, tone = "error") {
  settingsStatus.textContent = message || "";
  settingsStatus.classList.toggle("success", tone === "success");
}

async function loadSettings() {
  const [settings, env, nasCreds, siteCreds] = await Promise.all([
    window.settingsApp.getSettings(),
    window.settingsApp.getEnvironment(),
    window.settingsApp.getNasCredentials(),
    window.settingsApp.getSiteCredentials()
  ]);

  localFolderPath.value = settings.localVideoFolder || "";
  nasFolderPath.value = settings.nasVideoFolder || "";
  nasUsernameInput.value = nasCreds.username || "";
  nasPasswordInput.value = "";
  siteUsernameInput.value = siteCreds.username || "";
  sitePasswordInput.value = "";
  siteAutoLoginInput.checked = siteCreds.autoLogin !== false;

  if (openAnimeWindowButton) {
    openAnimeWindowButton.hidden = !env.openAnimeButton;
  }
  if (openMoviesFolderButton && env.profileId === "anime") {
    openMoviesFolderButton.textContent = "Open Anime Folder";
  }
}

document.getElementById("pick-local-folder").addEventListener("click", async () => {
  const result = await window.settingsApp.pickLocalFolder();
  if (result?.canceled) return;
  if (result?.path) {
    localFolderPath.value = result.path;
    setStatus("");
  } else if (result?.error) {
    setStatus(result.error);
  }
});

document.getElementById("pick-nas-folder").addEventListener("click", async () => {
  const result = await window.settingsApp.pickNasFolder();
  if (result?.canceled) return;
  if (result?.path) {
    nasFolderPath.value = result.path;
    setStatus("");
  } else if (result?.error) {
    setStatus(result.error);
  }
});

document.getElementById("open-local-folder").addEventListener("click", async () => {
  const result = await window.settingsApp.openFolder(localFolderPath.value.trim());
  if (!result.ok) setStatus(result.error || "Could not open local folder.");
});

document.getElementById("open-nas-folder").addEventListener("click", async () => {
  const result = await window.settingsApp.openFolder(nasFolderPath.value.trim());
  if (!result.ok) setStatus(result.error || "Could not open NAS folder.");
});

openMoviesFolderButton.addEventListener("click", async () => {
  await window.settingsApp.openOutputFolder();
});

openAnimeWindowButton?.addEventListener("click", async () => {
  const result = await window.settingsApp.openAnimeWindow();
  if (!result.ok) {
    setStatus(result.error || "Could not open anime window.");
    return;
  }
  setStatus("Opened Anime Stream Downloader in a new window.", "success");
});

nasConnectForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  nasConnectError.textContent = "";

  const username = nasUsernameInput.value.trim();
  const password = nasPasswordInput.value;
  if (!username) {
    nasConnectError.textContent = "Enter your NAS username.";
    return;
  }

  const saveResult = await window.settingsApp.saveSettings({
    localVideoFolder: localFolderPath.value.trim(),
    nasVideoFolder: nasFolderPath.value.trim()
  });
  if (!saveResult.ok) {
    nasConnectError.textContent = saveResult.error || "Could not save NAS folder.";
    return;
  }

  const result = await window.settingsApp.saveNasCredentials({ username, password });
  if (!result.ok) {
    nasConnectError.textContent = result.error || "Could not connect to NAS.";
    return;
  }

  setStatus(
    result.createdFolder
      ? `Connected to NAS as ${username}. Created Videos folder on the share.`
      : `Connected to NAS as ${username}.`,
    "success"
  );
});

siteConnectForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  siteConnectError.textContent = "";

  const username = siteUsernameInput.value.trim();
  const password = sitePasswordInput.value;
  if (!username || !password) {
    siteConnectError.textContent = "Enter both username and password.";
    return;
  }

  await window.settingsApp.saveSiteCredentials({
    username,
    password,
    autoLogin: siteAutoLoginInput.checked
  });

  setStatus("Opening Tornado Movies sign-in page...", "success");
  const result = await window.settingsApp.siteLogin();
  if (!result.ok) {
    siteConnectError.textContent = result.error || "Could not start site login.";
    setStatus(result.error || "Site login failed.");
    return;
  }

  setStatus("Submitting sign-in on premium page...", "success");
});

document.getElementById("settings-save").addEventListener("click", async () => {
  const result = await window.settingsApp.saveSettings({
    localVideoFolder: localFolderPath.value.trim(),
    nasVideoFolder: nasFolderPath.value.trim()
  });

  if (!result.ok) {
    setStatus(result.error || "Could not save settings.");
    return;
  }

  setStatus("Settings saved.", "success");
});

document.getElementById("settings-close").addEventListener("click", () => {
  window.settingsApp.closeWindow();
});

loadSettings().catch((error) => {
  setStatus(error.message || "Could not load settings.");
});
