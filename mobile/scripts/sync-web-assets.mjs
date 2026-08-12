import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

  const bundle = `window.mobileScrapers = {
  installSearch() {
    ${searchInstall}
  },
  installTv() {
    ${tvInstall}
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
copyFile(path.join(root, "src", "js", "stream-app-ios.js"), path.join(www, "js", "stream-app-ios.js"));
copyFile(path.join(root, "src", "js", "settings-ios.js"), path.join(www, "js", "settings-ios.js"));
copyFile(path.join(root, "src", "js", "settings-page.js"), path.join(www, "js", "settings-page.js"));
copyFile(path.join(root, "src", "js", "shell-ios-shim.js"), path.join(www, "js", "shell-ios-shim.js"));
copyFile(path.join(desktop, "shell.js"), path.join(www, "js", "shell.js"));
writeScraperBundle();

console.log("Synced mobile web assets to", www);
