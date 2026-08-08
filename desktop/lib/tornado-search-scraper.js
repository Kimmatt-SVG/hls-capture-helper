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

  const pickPoster = (root) => {
    if (!root) return "";
    const img =
      root.querySelector("img[src], img[data-src], img[data-original], img[data-lazy-src]") ||
      (root.closest("article, .item, .flw-item, .film-poster, .movie-item, .card, li, .col, .grid-item") || root)
        ?.querySelector?.("img[src], img[data-src], img[data-original], img[data-lazy-src]");
    if (!img) return "";
    const raw =
      img.currentSrc ||
      img.getAttribute("src") ||
      img.getAttribute("data-src") ||
      img.getAttribute("data-original") ||
      img.getAttribute("data-lazy-src") ||
      "";
    if (!raw || raw.startsWith("data:")) return "";
    try {
      return new URL(raw, window.location.href).href;
    } catch {
      return "";
    }
  };

  const yearFromText = (text) => {
    const match = String(text || "").match(/\\b(19|20)\\d{2}\\b/);
    return match ? match[0] : "";
  };

  window.__tornadoScrapeSearchMovies = () => {
    const found = new Map();

    for (const element of document.querySelectorAll("a[href*='/movie/']")) {
      const rawHref = element.href || element.getAttribute("href") || "";
      const href = canonical(rawHref) || normalize(rawHref);
      if (!href || !/\\/movie\\/[^/]+\\/[^/?#]+/i.test(href)) continue;

      const card =
        element.closest("article, .item, .flw-item, .film-poster, .movie-item, .card, li, .col, .grid-item, .movie") ||
        element.parentElement;
      const text = String(element.textContent || "").trim();
      const titleAttr = String(element.getAttribute("title") || element.getAttribute("aria-label") || "").trim();
      const imgAlt = String(card?.querySelector?.("img")?.alt || "").trim();
      const title =
        (text && text.length < 80 ? text : "") ||
        (titleAttr && titleAttr.length < 100 ? titleAttr : "") ||
        (imgAlt && imgAlt.length < 100 ? imgAlt : "") ||
        titleFromUrl(href);
      const posterUrl = pickPoster(element) || pickPoster(card);
      const year = yearFromText(card?.textContent || text || titleAttr);

      const existing = found.get(href);
      if (!existing) {
        found.set(href, {
          movieUrl: href,
          title,
          posterUrl: posterUrl || undefined,
          year: year || undefined
        });
        continue;
      }

      if ((!existing.posterUrl || existing.posterUrl.length < 8) && posterUrl) {
        existing.posterUrl = posterUrl;
      }
      if ((!existing.title || existing.title === titleFromUrl(href)) && title && title !== titleFromUrl(href)) {
        existing.title = title;
      }
      if (!existing.year && year) existing.year = year;
    }

    return {
      ok: true,
      movies: [...found.values()]
    };
  };

  window.__tornadoScrapeMovieDetail = () => {
    const href = canonical(location.href) || normalize(location.href);
    if (!href || !/\\/movie\\//i.test(href)) {
      return { ok: false, error: "Not on a movie page." };
    }

    const title = (
      document.querySelector('meta[property="og:title"]')?.content ||
      document.querySelector("h1")?.textContent ||
      document.title ||
      titleFromUrl(href)
    )
      .replace(/\\s*[|\\-–].*$/, "")
      .trim();

    const posterCandidates = [
      document.querySelector('meta[property="og:image"]')?.content,
      document.querySelector('meta[name="twitter:image"]')?.content,
      document.querySelector(".film-poster img, .movie-poster img, .poster img, img.poster")?.src
    ].filter(Boolean);

    let posterUrl = "";
    for (const raw of posterCandidates) {
      try {
        posterUrl = new URL(raw, location.href).href;
        if (posterUrl && !posterUrl.startsWith("data:")) break;
      } catch {
        // keep looking
      }
    }

    const year = yearFromText(
      document.querySelector(".film-stats, .movie-info, .detail, .description, h1")?.textContent ||
        document.body?.innerText?.slice(0, 800) ||
        ""
    );

    return {
      ok: true,
      movie: {
        movieUrl: href,
        title: title || titleFromUrl(href),
        posterUrl: posterUrl || undefined,
        year: year || undefined
      }
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

async function scrapeMovieDetail(contents) {
  if (!contents || contents.isDestroyed()) {
    return { ok: false, error: "Browser is not ready." };
  }

  await contents.executeJavaScript(buildTornadoSearchScraperScript()).catch(() => {});
  try {
    return await contents.executeJavaScript("window.__tornadoScrapeMovieDetail?.() || { ok: false }");
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

module.exports = {
  buildTornadoSearchScraperScript,
  scrapeSearchMovieLinks,
  scrapeMovieDetail
};
