function movieSlugFromUrl(pageUrl) {
  try {
    const match = new URL(pageUrl).pathname.match(/\/movie\/([^/]+)\/?$/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function outputNameFromPageUrl(pageUrl) {
  const slug = movieSlugFromUrl(pageUrl);
  if (!slug) return null;

  const safe = slug.replace(/[^A-Za-z0-9._ -]+/g, "_").trim();
  return safe ? `${safe}.mp4` : null;
}

module.exports = {
  movieSlugFromUrl,
  outputNameFromPageUrl
};
