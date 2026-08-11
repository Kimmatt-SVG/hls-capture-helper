function buildTornadoSearchScraperScript() {
  return `
(() => {
  if (window.__tornadoSearchScraperInstalledV2) return;
  window.__tornadoSearchScraperInstalledV2 = true;
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

  const classify = (url) => {
    try {
      const parsed = new URL(url, window.location.href);
      const pathname = parsed.pathname || "";
      const movieMatch = pathname.match(/\\/movie\\/([^/]+)\\/([^/]+)/i);
      if (movieMatch) {
        return {
          kind: "movie",
          canonical: parsed.origin + "/movie/" + movieMatch[1] + "/" + movieMatch[2]
        };
      }
      const tvMatch = pathname.match(/\\/(?:tv-series|tv|serie|series)\\/([^/]+)\\/([^/]+)/i);
      if (tvMatch) {
        const segments = pathname.replace(/\\/+$/, "").split("/").filter(Boolean);
        const keep = segments.slice(0, Math.min(segments.length, 4));
        return {
          kind: "tv",
          canonical: parsed.origin + "/" + keep.join("/")
        };
      }
      return null;
    } catch {
      return null;
    }
  };

  const titleFromUrl = (url, kind) => {
    const movieMatch = String(url).match(/\\/movie\\/([^/]+)\\//i);
    const tvMatch = String(url).match(/\\/(?:tv-series|tv|serie|series)\\/([^/]+)\\//i);
    const slug = (movieMatch || tvMatch)?.[1];
    if (!slug) return kind === "tv" ? "TV Show" : "Movie";
    return slug
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
    const anchors = document.querySelectorAll(
      "a[href*='/movie/'], a[href*='/tv-series/'], a[href*='/tv/'], a[href*='/serie/'], a[href*='/series/']"
    );

    for (const element of anchors) {
      const rawHref = element.href || element.getAttribute("href") || "";
      const classified = classify(rawHref);
      if (!classified?.canonical) continue;
      const href = classified.canonical;
      const kind = classified.kind;

      if (kind === "movie" && !/\\/movie\\/[^/]+\\/[^/?#]+/i.test(href)) continue;
      if (kind === "tv" && !/\\/(?:tv-series|tv|serie|series)\\/[^/]+\\/[^/?#]+/i.test(href)) continue;

      const card =
        element.closest(
          ".poster, article, .item, .flw-item, .film-poster, .movie-item, .card, li, .col, .grid-item, .movie, .tv, .series"
        ) || element.parentElement;
      const dataName = cleanTitle(card?.getAttribute?.("data-name") || "");
      const text = cleanTitle(element.textContent || "");
      const titleAttr = cleanTitle(element.getAttribute("title") || element.getAttribute("aria-label") || "");
      const imgAlt = cleanTitle(card?.querySelector?.("img")?.alt || "");
      const fallbackTitle = titleFromUrl(href, kind);
      const title =
        (dataName && dataName.length < 120 ? dataName : "") ||
        (text && text.length < 80 ? text : "") ||
        (titleAttr && titleAttr.length < 100 ? titleAttr : "") ||
        (imgAlt && imgAlt.length < 100 ? imgAlt : "") ||
        fallbackTitle;
      const posterUrl = pickPoster(element) || pickPoster(card);
      const year = yearFromText(card?.getAttribute?.("data-name") || card?.textContent || text || titleAttr);

      const existing = found.get(href);
      if (!existing) {
        found.set(href, {
          kind,
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
      if ((!existing.title || existing.title === fallbackTitle) && title && title !== fallbackTitle) {
        existing.title = title;
      }
      if (!existing.year && year) existing.year = year;
      if (!existing.kind) existing.kind = kind;
    }

    const movies = [...found.values()];
    return {
      ok: true,
      movies,
      counts: {
        total: movies.length,
        movies: movies.filter((item) => item.kind !== "tv").length,
        tv: movies.filter((item) => item.kind === "tv").length
      }
    };
  };

  window.__tornadoScrapeMovieDetail = () => {
    const classified = classify(location.href);
    const href = classified?.canonical || normalize(location.href);
    if (!href || !classified) {
      return { ok: false, error: "Not on a movie or TV page." };
    }

    const kind = classified.kind;
    const pathMatch =
      kind === "movie"
        ? location.pathname.match(/\\/movie\\/([^/]+)\\/([^/]+)/i)
        : location.pathname.match(/\\/(?:tv-series|tv|serie|series)\\/([^/]+)\\/([^/]+)/i);
    const slug = pathMatch?.[1] || "";
    const contentId = pathMatch?.[2] || "";

    const matchingPoster =
      (contentId && document.querySelector('.poster[data-id="' + contentId + '"]')) ||
      (slug &&
        [...document.querySelectorAll(".poster[data-href], .poster[data-name]")].find((node) => {
          const dataHref = String(node.getAttribute("data-href") || "");
          return dataHref.includes("/" + slug + "/");
        })) ||
      null;

    const title = cleanTitle(
      matchingPoster?.getAttribute("data-name") ||
        document.querySelector('meta[property="og:title"]')?.content ||
        document.querySelector("h1")?.textContent ||
        document.title ||
        titleFromUrl(href, kind)
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
        kind,
        movieUrl: href,
        title: title || titleFromUrl(href, kind),
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
