const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const { prepareNasAccess } = require("./nas-auth");

const DEFAULTS = {
  portalUrl: "",
  videoFolder: ""
};

function configPath() {
  try {
    const userConfig = path.join(app.getPath("userData"), "nas-config.json");
    if (fs.existsSync(userConfig)) return userConfig;
  } catch {
    // app may not be ready yet
  }

  const projectConfig = path.join(__dirname, "..", "nas-config.json");
  if (fs.existsSync(projectConfig)) return projectConfig;

  const resourceConfig = path.join(process.resourcesPath || "", "nas-config.json");
  if (process.resourcesPath && fs.existsSync(resourceConfig)) return resourceConfig;

  return projectConfig;
}

function loadNasConfig() {
  const merged = { ...DEFAULTS };

  try {
    const raw = fs.readFileSync(configPath(), "utf8");
    const parsed = JSON.parse(raw);
    if (parsed.portalUrl) merged.portalUrl = parsed.portalUrl;
    if (parsed.videoFolder) merged.videoFolder = parsed.videoFolder;
  } catch {
    // Use defaults when config file is missing or invalid.
  }

  if (process.env.NAS_PORTAL_URL) merged.portalUrl = process.env.NAS_PORTAL_URL;
  if (process.env.NAS_VIDEO_FOLDER) merged.videoFolder = process.env.NAS_VIDEO_FOLDER;

  return merged;
}

function isUncPath(folderPath) {
  return typeof folderPath === "string" && folderPath.startsWith("\\\\");
}

function ensureNasFolder(folderPath) {
  if (!folderPath || typeof folderPath !== "string") {
    return {
      ok: false,
      path: folderPath || "",
      error:
        "No NAS video folder is configured. Set NAS_VIDEO_FOLDER or create desktop/nas-config.json."
    };
  }

  if (isUncPath(folderPath)) {
    return prepareNasAccess(folderPath);
  }

  try {
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    fs.accessSync(folderPath, fs.constants.W_OK);
    return { ok: true, path: folderPath };
  } catch (error) {
    return {
      ok: false,
      path: folderPath,
      error: `Could not write to folder "${folderPath}". (${error.message})`
    };
  }
}

module.exports = {
  loadNasConfig,
  ensureNasFolder
};
