const localFolderPath = document.getElementById("local-folder-path");
const nasHostInput = document.getElementById("nas-host");
const nasShareInput = document.getElementById("nas-share");
const nasPathInput = document.getElementById("nas-path");
const nasFolderPath = document.getElementById("nas-folder-path");
const settingsStatus = document.getElementById("settings-status");
const nasConnectForm = document.getElementById("nas-connect-form");
const nasUsernameInput = document.getElementById("nas-username");
const nasPasswordInput = document.getElementById("nas-password");
const nasConnectStatus =
  document.getElementById("nas-connect-status") || document.getElementById("nas-connect-error");
const connectNasButton = document.getElementById("connect-nas");
const testNasWriteButton = document.getElementById("test-nas-write");
const siteConnectForm = document.getElementById("site-connect-form");
const siteUsernameInput = document.getElementById("site-username");
const sitePasswordInput = document.getElementById("site-password");
const siteAutoLoginInput = document.getElementById("site-auto-login");
const siteConnectError = document.getElementById("site-connect-error");

function setStatus(message, tone = "error") {
  settingsStatus.textContent = message || "";
  settingsStatus.classList.toggle("success", tone === "success");
  if (message && tone !== "pending") {
    window.uiFeedback?.play(tone === "success" ? "success" : "error");
  }
}

function setNasStatus(message, tone = "error") {
  if (nasConnectStatus) {
    nasConnectStatus.hidden = !message;
    nasConnectStatus.textContent = message || "";
    nasConnectStatus.classList.toggle("success", tone === "success");
    nasConnectStatus.classList.toggle("pending", tone === "pending");
    if (message) {
      nasConnectStatus.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }
  settingsStatus.textContent = message || "";
  settingsStatus.classList.toggle("success", tone === "success");
  if (message && tone !== "pending") {
    window.uiFeedback?.play(tone === "success" ? "success" : "error");
  }
}

function nasTargetPath(extraPath) {
  if (extraPath) return extraPath;
  const host = nasHostInput.value.trim();
  const share = nasShareInput.value.trim();
  const remote = nasPathInput.value.trim().replace(/^\/+|\/+$/g, "");
  if (!host || !share) return "";
  return remote ? `smb://${host}/${share}/${remote}` : `smb://${host}/${share}`;
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
  nasPasswordInput.placeholder = creds.hasPassword ? "Leave blank to keep the saved password" : "NAS password";
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

function setNasBusy(busy, label) {
  if (connectNasButton) {
    connectNasButton.disabled = busy;
    connectNasButton.textContent = busy ? label || "Connecting…" : "Connect NAS";
  }
  if (testNasWriteButton) testNasWriteButton.disabled = busy;
}

document.getElementById("open-movies-folder").addEventListener("click", async () => {
  await window.settingsApp.openOutputFolder();
});

testNasWriteButton.addEventListener("click", async () => {
  setNasBusy(true, "Testing…");
  setNasStatus("Testing write access to the NAS…", "pending");
  try {
    const result = await window.settingsApp.testNasWrite(await collectSettingsPayload(true));
    if (!result.ok) {
      setNasStatus(result.error || "NAS write test failed.", "error");
      return;
    }
    const path = nasTargetPath(result.path);
    setNasStatus(path ? `Write test succeeded. Files can be saved to ${path}.` : "Write test succeeded.", "success");
  } catch (error) {
    setNasStatus(error.message || "NAS write test failed.", "error");
  } finally {
    setNasBusy(false);
  }
});

nasConnectForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!nasHostInput.value.trim() || !nasShareInput.value.trim()) {
    setNasStatus("Enter the NAS host and share name, then try Connect NAS again.", "error");
    return;
  }
  if (!nasUsernameInput.value.trim()) {
    setNasStatus("Enter your NAS username, then try Connect NAS again.", "error");
    return;
  }

  setNasBusy(true, "Connecting…");
  setNasStatus("Connecting to the NAS…", "pending");
  try {
    await window.settingsApp.saveSettings(await collectSettingsPayload(true));
    const result = await window.settingsApp.saveNasCredentials({
      ...(await collectSettingsPayload(true)),
      username: nasUsernameInput.value.trim(),
      password: nasPasswordInput.value
    });
    if (!result.ok) {
      setNasStatus(result.error || "Could not connect to NAS.", "error");
      return;
    }
    const path = nasTargetPath(result.path);
    updateNasDisplayPath({
      nasHost: nasHostInput.value.trim(),
      nasShare: nasShareInput.value.trim(),
      nasPath: nasPathInput.value.trim()
    });
    setNasStatus(path ? `Connected to NAS at ${path}.` : "Connected to NAS.", "success");
  } catch (error) {
    setNasStatus(error.message || "Could not connect to NAS.", "error");
  } finally {
    setNasBusy(false);
  }
});

siteConnectForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  siteConnectError.textContent = "";
  const username = siteUsernameInput.value.trim();
  const password = sitePasswordInput.value;
  if (!username || !password) {
    siteConnectError.textContent = "Enter both username and password.";
    window.uiFeedback?.play("error");
    return;
  }
  const submitButton = document.getElementById("connect-site");
  const previousLabel = submitButton?.textContent || "Sign In on Tornado";
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Opening Tornado...";
  }
  try {
    if (typeof window.settingsApp?.siteLogin !== "function") {
      const message = "Settings login is not ready. Rebuild the app in Xcode.";
      siteConnectError.textContent = message;
      setStatus(message);
      return;
    }
    const login = await window.settingsApp.siteLogin({
      username,
      password,
      autoLogin: siteAutoLoginInput.checked
    });
    if (!login?.ok) {
      const message = login?.error || "Could not sign in. Complete Tornado’s captcha, then try again.";
      siteConnectError.textContent = message;
      setStatus(message);
      return;
    }
    await window.settingsApp.saveSiteCredentials({
      username,
      password,
      autoLogin: siteAutoLoginInput.checked
    });
    setStatus("Signed in on Tornado. Downloads can use this session.", "success");
  } catch (error) {
    siteConnectError.textContent = error.message || "Could not verify login.";
    setStatus(error.message || "Could not verify login.");
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = previousLabel;
    }
  }
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

document.getElementById("settings-back")?.addEventListener("click", () => {
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
