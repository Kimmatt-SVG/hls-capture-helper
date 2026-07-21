function buildTornadoSearchScraperScript() {
  return `
(() => {
  if (window.__tornadoSearchScraperInstalled) return;
  window.__tornadoSearchScraperInstalled = true;

  const normalize = (url) => {
    try {
      const parsed = new URL(url, window.location.href);
      parsed.hash = "";
      return parsed.toString().replace(/\\/$/, "");
    } catch {
      return "";
    }
  };

  const canonical = (url) => {
    try {
      const parsed = new URL(url, window.location.href);
      const match = parsed.pathname.match(/\\/movie\\/([^/]+)\\/([^/]+)/i);
      if (!match) return "";
      return parsed.origin + "/movie/" + match[1] + "/" + match[2];
    } catch {
      return "";
    }
  };

  const titleFromUrl = (url) => {
    const match = String(url).match(/\\/movie\\/([^/]+)\\//i);
    if (!match) return "Movie";
    return match[1]
      .replace(/-/g, " ")
      .replace(/\\b\\w/g, (char) => char.toUpperCase());
  };

  window.__tornadoScrapeSearchMovies = () => {
    const found = new Map();

    for (const element of document.querySelectorAll("a[href*='/movie/']")) {
      const rawHref = element.href || element.getAttribute("href") || "";
      const href = canonical(rawHref) || normalize(rawHref);
      if (!href || !/\\/movie\\/[^/]+\\/[^/?#]+/i.test(href)) continue;
      if (!found.has(href)) {
        const text = String(element.textContent || "").trim();
        found.set(href, {
          movieUrl: href,
          title: text && text.length < 80 ? text : titleFromUrl(href)
        });
      }
    }

    return {
      ok: true,
      movies: [...found.values()]
    };
  };
})();
`;
}

async function scrapeSearchMovieLinks(contents) {
  if (!contents || contents.isDestroyed()) {
    return { ok: false, error: "Browser is not ready." };
  }

  await contents.executeJavaScript(buildTornadoSearchScraperScript()).catch(() => {});
  try {
    return await contents.executeJavaScript("window.__tornadoScrapeSearchMovies?.() || { ok: false }");
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

module.exports = {
  buildTornadoSearchScraperScript,
  scrapeSearchMovieLinks
};
