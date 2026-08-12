const localFolderPath = document.getElementById("local-folder-path");
const nasHostInput = document.getElementById("nas-host");
const nasShareInput = document.getElementById("nas-share");
const nasPathInput = document.getElementById("nas-path");
const nasFolderPath = document.getElementById("nas-folder-path");
const settingsStatus = document.getElementById("settings-status");
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

function updateNasDisplayPath(settings) {
  if (!nasFolderPath) return;
  if (settings.nasHost && settings.nasShare) {
    const remote = String(settings.nasPath || "").replace(/^\/+|\/+$/g, "");
    nasFolderPath.textContent = remote
      ? `SMB target: smb://${settings.nasHost}/${settings.nasShare}/${remote}`
      : `SMB target: smb://${settings.nasHost}/${settings.nasShare}`;
  } else {
    nasFolderPath.textContent = "";
  }
}

async function loadSettings() {
  const settings = await window.settingsApp.getSettings();
  const creds = await window.settingsApp.getNasCredentials();
  const siteCreds = await window.settingsApp.getSiteCredentials();

  localFolderPath.value = settings.localVideoFolder || settings.localDisplayPath || "";
  nasHostInput.value = settings.nasHost || "";
  nasShareInput.value = settings.nasShare || "";
  nasPathInput.value = settings.nasPath || "Videos";
  nasUsernameInput.value = creds.username || "";
  nasPasswordInput.value = "";
  siteUsernameInput.value = siteCreds.username || "";
  sitePasswordInput.value = "";
  siteAutoLoginInput.checked = siteCreds.autoLogin !== false;
  updateNasDisplayPath(settings);
}

async function collectSettingsPayload(includePassword = false) {
  const payload = {
    localSubfolder: "Downloads",
    nasHost: nasHostInput.value.trim(),
    nasShare: nasShareInput.value.trim(),
    nasPath: nasPathInput.value.trim(),
    nasUsername: nasUsernameInput.value.trim()
  };
  if (includePassword) payload.nasPassword = nasPasswordInput.value;
  return payload;
}

document.getElementById("open-movies-folder").addEventListener("click", async () => {
  await window.settingsApp.openOutputFolder();
});

document.getElementById("test-nas-write").addEventListener("click", async () => {
  nasConnectError.textContent = "";
  const result = await window.settingsApp.testNasWrite(await collectSettingsPayload(true));
  if (!result.ok) {
    nasConnectError.textContent = result.error || "NAS write test failed.";
    return;
  }
  setStatus("NAS write test succeeded.", "success");
});

nasConnectForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  nasConnectError.textContent = "";
  await window.settingsApp.saveSettings(await collectSettingsPayload(true));
  const result = await window.settingsApp.saveNasCredentials({
    username: nasUsernameInput.value.trim(),
    password: nasPasswordInput.value
  });
  if (!result.ok) {
    nasConnectError.textContent = result.error || "Could not connect to NAS.";
    return;
  }
  setStatus("Connected to NAS.", "success");
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
  setStatus("Site login saved on this device.", "success");
});

document.getElementById("settings-save").addEventListener("click", async () => {
  const result = await window.settingsApp.saveSettings(await collectSettingsPayload(true));
  if (!result.ok) {
    setStatus(result.error || "Could not save settings.");
    return;
  }
  await loadSettings();
  setStatus("Settings saved.", "success");
});

document.getElementById("settings-close").addEventListener("click", () => {
  window.settingsApp.closeWindow();
});

[nasHostInput, nasShareInput, nasPathInput].forEach((input) => {
  input?.addEventListener("input", () => {
    updateNasDisplayPath({
      nasHost: nasHostInput.value.trim(),
      nasShare: nasShareInput.value.trim(),
      nasPath: nasPathInput.value.trim()
    });
  });
});

loadSettings().catch((error) => {
  setStatus(error.message || "Could not load settings.");
});
