const EMBED_CDN_HOST_PATTERN =
  /echovideo\.|dpopdrop|roburnt|hlsxst|vidplay\.|megacloud\.|rabbitstream\.|gn1r5n\.|myvidplay\.|streamwish\.|filemoon\./i;

function isEmbedCdnUrl(url) {
  try {
    return EMBED_CDN_HOST_PATTERN.test(new URL(String(url)).hostname);
  } catch {
    return false;
  }
}

function uniqueUrls(urls = []) {
  const seen = new Set();
  const result = [];
  for (const url of urls) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.push(url);
  }
  return result;
}

async function cookieHeaderForUrls(session, urls = []) {
  if (!session) return null;

  const pairs = new Map();
  for (const url of urls) {
    if (!url) continue;
    try {
      const cookies = await session.cookies.get({ url });
      for (const cookie of cookies) {
        pairs.set(cookie.name, cookie.value);
      }
    } catch {
      // Best effort cookie lookup.
    }
  }

  if (!pairs.size) return null;
  return [...pairs.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function allSessionCookieHeader(session) {
  if (!session) return null;
  try {
    const cookies = await session.cookies.get({});
    if (!cookies.length) return null;
    return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  } catch {
    return null;
  }
}

function refererForStream(options = {}) {
  const { embedUrl = "", pageUrl = "", targetUrl = "" } = options;
  if (embedUrl && isEmbedCdnUrl(targetUrl)) return embedUrl;
  return pageUrl || embedUrl || "";
}

async function enrichRequestHeaders(requestHeaders = [], options = {}) {
  const { pageUrl = "", targetUrl = "", embedUrl = "", session = null } = options;
  const headers = Array.isArray(requestHeaders) ? [...requestHeaders] : [];
  const hasHeader = (name) =>
    headers.some((header) => header.name?.toLowerCase() === name.toLowerCase());
  const refererUrl = refererForStream({ embedUrl, pageUrl, targetUrl });

  if (targetUrl) {
    try {
      const targetOrigin = new URL(targetUrl).origin;
      if (/animanga\.fun/i.test(targetUrl) && !hasHeader("referer")) {
        headers.push({ name: "Referer", value: `${targetOrigin}/` });
      }
      if (
        !isEmbedCdnUrl(targetUrl) &&
        !/loadshare\.org/i.test(targetUrl) &&
        !hasHeader("origin")
      ) {
        headers.push({ name: "Origin", value: targetOrigin });
      }
    } catch {
      // Ignore invalid target URLs.
    }
  }

  if (refererUrl && !hasHeader("referer")) {
    headers.push({ name: "Referer", value: refererUrl });
  }

  if (refererUrl && !hasHeader("origin") && (!targetUrl || !/loadshare\.org/i.test(targetUrl))) {
    try {
      headers.push({ name: "Origin", value: new URL(refererUrl).origin });
    } catch {
      // Ignore invalid referer URLs.
    }
  }

  const cookieUrls = uniqueUrls([targetUrl, embedUrl, refererUrl, pageUrl]);
  let cookieHeader = await cookieHeaderForUrls(session, cookieUrls);
  if (!cookieHeader && session && isEmbedCdnUrl(targetUrl)) {
    cookieHeader = await allSessionCookieHeader(session);
  }
  if (cookieHeader && !hasHeader("cookie")) {
    headers.push({ name: "Cookie", value: cookieHeader });
  }

  if (!hasHeader("accept")) {
    headers.push({ name: "Accept", value: "*/*" });
  }

  if (!hasHeader("accept-language")) {
    headers.push({ name: "Accept-Language", value: "en-US,en;q=0.9" });
  }

  return headers;
}

module.exports = {
  enrichRequestHeaders,
  cookieHeaderForUrls,
  allSessionCookieHeader,
  isEmbedCdnUrl,
  refererForStream
};
