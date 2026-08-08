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

  const resolveUrl = (raw) => {
    if (!raw || raw.startsWith("data:")) return "";
    try {
      return new URL(raw, window.location.href).href;
    } catch {
      return "";
    }
  };

  const pickPoster = (root) => {
    if (!root) return "";
    const posterNode =
      (root.matches?.(".poster, [data-img]") ? root : null) ||
      root.closest?.(".poster, [data-img]") ||
      root.querySelector?.(".poster, [data-img]");
    const dataImg = posterNode?.getAttribute?.("data-img") || "";
    if (dataImg) return resolveUrl(dataImg);

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
    return resolveUrl(raw);
  };

  const cleanTitle = (value) =>
    String(value || "")
      .replace(/\\s+/g, " ")
      .replace(/^watch\\s+/i, "")
      .replace(/\\s+online\\b.*$/i, "")
      .replace(/\\s+in\\s+hd\\b.*$/i, "")
      .replace(/\\s+[|–]\\s+.*$/i, "")
      .replace(/\\s+-\\s+.*$/i, "")
      .trim();

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
        element.closest(
          ".poster, article, .item, .flw-item, .film-poster, .movie-item, .card, li, .col, .grid-item, .movie"
        ) || element.parentElement;
      const dataName = cleanTitle(card?.getAttribute?.("data-name") || "");
      const text = cleanTitle(element.textContent || "");
      const titleAttr = cleanTitle(element.getAttribute("title") || element.getAttribute("aria-label") || "");
      const imgAlt = cleanTitle(card?.querySelector?.("img")?.alt || "");
      const title =
        (dataName && dataName.length < 120 ? dataName : "") ||
        (text && text.length < 80 ? text : "") ||
        (titleAttr && titleAttr.length < 100 ? titleAttr : "") ||
        (imgAlt && imgAlt.length < 100 ? imgAlt : "") ||
        titleFromUrl(href);
      const posterUrl = pickPoster(element) || pickPoster(card);
      const year = yearFromText(card?.getAttribute?.("data-name") || card?.textContent || text || titleAttr);

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

    const pathMatch = location.pathname.match(/\\/movie\\/([^/]+)\\/([^/]+)/i);
    const slug = pathMatch?.[1] || "";
    const movieId = pathMatch?.[2] || "";

    const matchingPoster =
      (movieId && document.querySelector('.poster[data-id="' + movieId + '"]')) ||
      (slug &&
        [...document.querySelectorAll(".poster[data-href], .poster[data-name]")].find((node) => {
          const dataHref = String(node.getAttribute("data-href") || "");
          return dataHref.includes("/movie/" + slug + "/");
        })) ||
      null;

    const title = cleanTitle(
      matchingPoster?.getAttribute("data-name") ||
        document.querySelector('meta[property="og:title"]')?.content ||
        document.querySelector("h1")?.textContent ||
        document.title ||
        titleFromUrl(href)
    );

    const posterCandidates = [
      matchingPoster?.getAttribute("data-img"),
      document.querySelector('meta[property="og:image"]')?.content,
      document.querySelector('meta[name="twitter:image"]')?.content,
      matchingPoster?.querySelector("img")?.src,
      document.querySelector(".film-poster img, .movie-poster img, img.poster")?.src
    ].filter(Boolean);

    let posterUrl = "";
    for (const raw of posterCandidates) {
      posterUrl = resolveUrl(raw);
      if (posterUrl) break;
    }

    const year = yearFromText(
      matchingPoster?.getAttribute("data-name") ||
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
