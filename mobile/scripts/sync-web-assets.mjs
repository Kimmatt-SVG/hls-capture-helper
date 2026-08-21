import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const desktop = path.resolve(root, "..", "desktop");
const www = path.join(root, "www");

const copyFiles = [
  "shell.css",
  "settings.css",
  "shell-motion.js",
  "vendor/anime.umd.min.js",
  "anime-config.json",
  "nav-config.json"
];

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function extractTemplateLiteral(source, functionName) {
  const marker = `function ${functionName}(`;
  const start = source.indexOf(marker);
  if (start < 0) return "";
  const tick = source.indexOf("return `", start);
  if (tick < 0) return "";
  let index = tick + "return `".length;
  let result = "";
  while (index < source.length) {
    const char = source[index];
    if (char === "\\") {
      result += source[index + 1] ?? "";
      index += 2;
      continue;
    }
    if (char === "`") break;
    result += char;
    index += 1;
  }
  return result;
}

function writeScraperBundle() {
  const searchSource = fs.readFileSync(path.join(desktop, "lib", "tornado-search-scraper.js"), "utf8");
  const tvSource = fs.readFileSync(path.join(desktop, "lib", "tv-show-scraper.js"), "utf8");
  const searchInstall = extractTemplateLiteral(searchSource, "buildTornadoSearchScraperScript");
  const tvInstall = extractTemplateLiteral(tvSource, "buildTvShowScraperScript");
  const downloadScraper = require(path.join(desktop, "lib", "tornado-download-scraper.js"));
  const downloadInstall = downloadScraper.buildTornadoDownloadScraperScript();

  const bundle = `window.mobileScrapers = {
  installSearch() {
    ${searchInstall}
  },
  installTv() {
    ${tvInstall}
  },
  installDownload() {
    ${downloadInstall}
  },
  async scrapeSearch() {
    this.installSearch();
    return window.__tornadoScrapeSearchMovies?.() || { ok: false, movies: [] };
  },
  async scrapeSeasons() {
    this.installTv();
    return window.__tornadoScrapeSeasons?.() || { ok: false, seasons: [] };
  },
  async scrapeTvSeason() {
    this.installTv();
    return window.__tornadoScanTvShow?.() || { ok: false, episodes: [] };
  },
  async fetchDirectLinks() {
    this.installDownload();
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitStart = Date.now();
    while (Date.now() - waitStart < 5000 && !window.jQuery) {
      await sleep(200);
    }
    const jqueryReady = Boolean(window.jQuery);
    const play = document.querySelector("#player .play_button[data-id], .play_button[data-id]");
    const forced = Array.isArray(window.__forcedDownloadIds) ? window.__forcedDownloadIds.map(String) : [];
    if (window.__forcedDownloadId) forced.unshift(String(window.__forcedDownloadId));
    const playId = play && play.getAttribute("data-id");
    const pathId =
      ((location.pathname || "").match(/\\/([A-Za-z0-9]+)-watching\\.html?/i) || [])[1] ||
      ((location.pathname || "").match(/\\/movie\\/[^/]+\\/([^/]+)/i) || [])[1] ||
      ((location.pathname || "").match(/\\/(?:tv-series|tv|serie|series)\\/[^/]+\\/([^/]+)/i) || [])[1];
    const ids = [...new Set(forced.concat(playId || "", pathId || "").filter(Boolean))];
    const id = ids[0] || "";
    const type = (play && play.getAttribute("data-type")) || "true";
    const hooked = () => Array.from(window.__tornadoCollectedLinks || []);
    const fromDom = () => Array.from(document.querySelectorAll("a[href*='loadshare.org/download/']")).map((a) => a.href);
    const uniqueLinks = () => [...new Set(hooked().concat(fromDom()))].filter((url) => /loadshare\\.org\\/download\\//i.test(String(url)));
    const pageUrl = String(location.href || "");
    const loggedOut =
      /premiummembership/i.test(document.body ? document.body.innerHTML : "") &&
      !document.querySelector('a[href*="logout"], a[href*="signout"]');

    if (!jqueryReady) {
      return { ok: false, reason: "missing-jquery", links: uniqueLinks(), jqueryReady, loggedOut, movieId: id || null, pageUrl };
    }
    if (!id) {
      return { ok: false, reason: "missing-movie-id", links: uniqueLinks(), jqueryReady, loggedOut, movieId: null, pageUrl };
    }

    const loginWaitStart = Date.now();
    while (Date.now() - loginWaitStart < 4500) {
      if (document.querySelector('a[href*="logout"], a[href*="signout"]')) break;
      if (window.__tornadoLoginDone) break;
      if (!window.__tornadoLoginStarted) break;
      await sleep(250);
    }

    if (typeof window.initDownloadButton === "function") {
      try { ids.forEach(function(nextId) { window.initDownloadButton(nextId, type); }); } catch (error) {}
    }

    let html = "";
    for (const nextId of ids) {
      const getDownloadJson = new Promise((resolve) => {
        window.jQuery.ajax({
          url: "/getdownload/" + nextId + "/" + type,
          type: "get",
          dataType: "json",
          timeout: 8000,
          success: (data) => resolve(data),
          error: () => resolve(null)
        });
      });
      const getButtonHtml = new Promise((resolve) => {
        window.jQuery.ajax({
          url: "/getbutton/" + nextId + "/" + type,
          type: "get",
          dataType: "html",
          timeout: 10000,
          success: (data) => resolve(String(data || "")),
          error: () => resolve("")
        });
      });
      const [downloadJson, buttonHtml] = await Promise.all([getDownloadJson, getButtonHtml]);
      if (downloadJson) {
        try {
          const text = typeof downloadJson === "string" ? downloadJson : JSON.stringify(downloadJson);
          const matches = String(text).match(/(?:https?:)?\\/\\/[^\\s"'<>]*loadshare\\.org\\/download\\/[^\\s"'<>]+/gi) || [];
          for (const url of matches) {
            const clean = url.indexOf("//") === 0 ? "https:" + url : url;
            (window.__tornadoCollectedLinks || (window.__tornadoCollectedLinks = new Set())).add(clean);
          }
        } catch (error) {}
      }
      if (buttonHtml) html = buttonHtml;
      if (uniqueLinks().length) break;
      if (buttonHtml && /premiummembership/i.test(buttonHtml) && !document.querySelector('a[href*="logout"], a[href*="signout"]')) {
        return {
          ok: false,
          links: uniqueLinks(),
          jqueryReady,
          loggedOut: true,
          movieId: nextId,
          pageUrl,
          getbutton: true,
          error: "Not signed in on Tornado. Save Site Login, then try again."
        };
      }
      if (buttonHtml) {
        const htmlLinks = String(buttonHtml).match(/(?:https?:)?\\/\\/[^\\s"'<>]*loadshare\\.org\\/download\\/[^\\s"'<>]+/gi) || [];
        for (const url of htmlLinks) {
          const clean = url.indexOf("//") === 0 ? "https:" + url : url;
          (window.__tornadoCollectedLinks || (window.__tornadoCollectedLinks = new Set())).add(clean);
        }
        let mount = document.getElementById("__ios_getbutton_mount");
        if (!mount) {
          mount = document.createElement("div");
          mount.id = "__ios_getbutton_mount";
          mount.style.cssText = "position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;";
          document.body.appendChild(mount);
        }
        mount.innerHTML = buttonHtml;
        const trigger =
          mount.querySelector("#click_to_download") ||
          mount.querySelector("[class*='cloud']") ||
          document.querySelector("#click_to_download");
        if (trigger) {
          try { trigger.click(); } catch (error) {}
        }
        const pollStart = Date.now();
        while (Date.now() - pollStart < 5000) {
          if (uniqueLinks().length) break;
          await sleep(250);
        }
        if (uniqueLinks().length) break;
      }
    }

    const links = uniqueLinks();
    return {
      ok: links.length > 0,
      links,
      jqueryReady,
      loggedOut,
      movieId: id,
      pageUrl,
      getbutton: Boolean(html),
      error: links.length
        ? null
        : loggedOut
          ? "Not signed in on Tornado. Save Site Login, then try again."
          : (html ? "No direct download link found." : "getbutton returned no download button.")
    };
  }
};
`;

  fs.writeFileSync(path.join(www, "js", "scrapers.js"), bundle);
}

fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(path.join(www, "js"), { recursive: true });
fs.mkdirSync(path.join(www, "css"), { recursive: true });

for (const relative of copyFiles) {
  copyFile(path.join(desktop, relative), path.join(www, relative));
}

copyFile(path.join(root, "src", "index.html"), path.join(www, "index.html"));
copyFile(path.join(root, "src", "settings.html"), path.join(www, "settings.html"));
copyFile(path.join(root, "src", "css", "mobile.css"), path.join(www, "css", "mobile.css"));
copyFile(path.join(root, "src", "js", "platform.js"), path.join(www, "js", "platform.js"));
copyFile(path.join(root, "src", "js", "ui-feedback.js"), path.join(www, "js", "ui-feedback.js"));
copyFile(path.join(root, "src", "js", "stream-app-ios.js"), path.join(www, "js", "stream-app-ios.js"));
copyFile(path.join(root, "src", "js", "settings-ios.js"), path.join(www, "js", "settings-ios.js"));
copyFile(path.join(root, "src", "js", "settings-page.js"), path.join(www, "js", "settings-page.js"));
copyFile(path.join(root, "src", "js", "shell-ios-shim.js"), path.join(www, "js", "shell-ios-shim.js"));
copyFile(path.join(root, "src", "js", "shell-mobile-boot.js"), path.join(www, "js", "shell-mobile-boot.js"));
copyFile(path.join(desktop, "shell.js"), path.join(www, "js", "shell.js"));
writeScraperBundle();

console.log("Synced mobile web assets to", www);
