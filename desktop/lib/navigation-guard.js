const fs = require("fs");
const path = require("path");

const DEFAULTS = {
  allowedDomains: [],
  blockPopups: true
};

const TRUSTED_THIRD_PARTY_DOMAINS = [
  "google.com",
  "gstatic.com",
  "googleapis.com",
  "recaptcha.net",
  "googleusercontent.com",
  "loadshare.org"
];

function configPath() {
  const resourceConfig = path.join(process.resourcesPath || "", "nav-config.json");
  if (process.resourcesPath && fs.existsSync(resourceConfig)) {
    return resourceConfig;
  }

  return path.join(__dirname, "..", "nav-config.json");
}

function loadNavConfig() {
  const merged = { ...DEFAULTS };

  try {
    const raw = fs.readFileSync(configPath(), "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.allowedDomains)) {
      merged.allowedDomains = parsed.allowedDomains.map((domain) => domain.toLowerCase());
    }
    if (typeof parsed.blockPopups === "boolean") {
      merged.blockPopups = parsed.blockPopups;
    }
  } catch {
    // Use defaults when config file is missing or invalid.
  }

  return merged;
}

function rootDomain(hostname) {
  const host = String(hostname || "").toLowerCase();
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return host;
  return parts.slice(-2).join(".");
}

function buildAllowedDomains(startUrl, config = loadNavConfig(), extraDomains = []) {
  const allowed = new Set([...config.allowedDomains, ...TRUSTED_THIRD_PARTY_DOMAINS, ...extraDomains]);

  try {
    allowed.add(rootDomain(new URL(startUrl).hostname));
  } catch {
    // Ignore invalid start URL.
  }

  return {
    allowedDomains: [...allowed],
    blockPopups: config.blockPopups
  };
}

function hostMatchesAllowed(hostname, allowedDomains) {
  const host = String(hostname || "").toLowerCase();
  return allowedDomains.some((root) => host === root || host.endsWith(`.${root}`));
}

function isAllowedNavigation(url, allowedDomains) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "about:" || parsed.protocol === "data:" || parsed.protocol === "blob:") {
      return true;
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return false;
    }
    return hostMatchesAllowed(parsed.hostname, allowedDomains);
  } catch {
    return false;
  }
}

function safeBlockedUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return "unknown site";
  }
}

function injectPopupGuards(contents) {
  contents.executeJavaScript(`
    (() => {
      if (window.__movieStreamGuardInstalled) return;
      window.__movieStreamGuardInstalled = true;
      window.open = function blockedOpen() { return null; };
      window.showModalDialog = function blockedDialog() { return null; };
    })();
  `).catch(() => {
    // Ignore injection failures on restricted pages.
  });
}

function setupNavigationGuard(contents, session, startUrl, onBlocked, extraDomains = []) {
  const { allowedDomains, blockPopups } = buildAllowedDomains(startUrl, loadNavConfig(), extraDomains);

  const blockIfNeeded = (url, isMainFrame, prevent) => {
    if (!isMainFrame || isAllowedNavigation(url, allowedDomains)) {
      return false;
    }

    prevent();
    if (typeof onBlocked === "function") {
      onBlocked({ url, displayUrl: safeBlockedUrl(url) });
    }
    return true;
  };

  contents.on("will-navigate", (event, url, isSameDocument, isMainFrame) => {
    if (isSameDocument) return;
    blockIfNeeded(url, isMainFrame, () => event.preventDefault());
  });

  contents.on("will-redirect", (event, url, isSameDocument, isMainFrame) => {
    blockIfNeeded(url, isMainFrame, () => event.preventDefault());
  });

  contents.on("dom-ready", () => injectPopupGuards(contents));

  if (blockPopups) {
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
  }

  return { allowedDomains, blockPopups };
}

module.exports = {
  loadNavConfig,
  buildAllowedDomains,
  isAllowedNavigation,
  setupNavigationGuard
};
