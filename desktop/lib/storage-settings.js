const fs = require("fs");
const path = require("path");
const { app } = require("electron");

const DEFAULTS = {
  localVideoFolder: ""
};

function settingsPath() {
  return path.join(app.getPath("userData"), "storage-settings.json");
}

function loadStorageSettings() {
  const merged = { ...DEFAULTS };

  try {
    const raw = fs.readFileSync(settingsPath(), "utf8");
    const parsed = JSON.parse(raw);
    if (parsed.localVideoFolder) {
      merged.localVideoFolder = path.resolve(parsed.localVideoFolder);
    }
  } catch {
    // Use defaults when settings file is missing or invalid.
  }

  if (process.env.HLS_CAPTURE_OUTPUT_DIR) {
    merged.localVideoFolder = path.resolve(process.env.HLS_CAPTURE_OUTPUT_DIR);
  }

  return merged;
}

function saveStorageSettings(settings = {}) {
  const current = loadStorageSettings();
  const next = {
    localVideoFolder: settings.localVideoFolder
      ? path.resolve(String(settings.localVideoFolder).trim())
      : current.localVideoFolder
  };

  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2));
  return next;
}

function localVideoFolder() {
  return loadStorageSettings().localVideoFolder || "";
}

module.exports = {
  loadStorageSettings,
  saveStorageSettings,
  localVideoFolder
};
