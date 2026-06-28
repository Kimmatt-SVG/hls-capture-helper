const playlistsByTab = new Map();
const jobsByPlaylistUrl = new Map();
const MAX_PLAYLISTS_PER_TAB = 40;
const HLS_URL_PATTERN = /\.m3u8(?:$|[?#])/i;
const FORWARDED_HEADER_NAMES = new Set([
  "accept",
  "accept-language",
  "authorization",
  "cookie",
  "origin",
  "referer",
  "user-agent"
]);

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

function safePlaylistUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    const fileName = pathParts[pathParts.length - 1] || "";
    const safePath = fileName ? `/.../${fileName}` : "/";
    const suffix = parsed.search ? "?[redacted]" : "";
    return `${parsed.origin}${safePath}${suffix}`;
  } catch {
    return "[redacted playlist URL]";
  }
}

function classifyPlaylist(url) {
  const lower = url.toLowerCase();
  if (lower.includes("master.m3u8")) return "master";
  if (lower.includes("playlist.m3u8")) return "media";
  return "playlist";
}

function shouldForwardHeader(name) {
  const lower = name.toLowerCase();
  return FORWARDED_HEADER_NAMES.has(lower) || lower.startsWith("x-");
}

function captureHeaders(requestHeaders = []) {
  return requestHeaders
    .filter((header) => {
      if (!header || typeof header.name !== "string" || typeof header.value !== "string") {
        return false;
      }
      if (!shouldForwardHeader(header.name)) return false;
      return !/[\r\n]/.test(header.name) && !/[\r\n]/.test(header.value);
    })
    .map((header) => ({ name: header.name, value: header.value }));
}

function rememberPlaylist(tabId, url, initiator, requestHeaders = []) {
  if (tabId < 0 || !HLS_URL_PATTERN.test(url)) return;

  const normalizedUrl = normalizeUrl(url);
  const current = playlistsByTab.get(tabId) || [];
  const existing = current.find((item) => item.url === normalizedUrl);
  const now = Date.now();
  const capturedHeaders = captureHeaders(requestHeaders);

  if (existing) {
    existing.lastSeenAt = now;
    existing.hits += 1;
    if (capturedHeaders.length) {
      existing.requestHeaders = capturedHeaders;
      existing.headerNames = capturedHeaders.map((header) => header.name);
    }
    return;
  }

  current.unshift({
    url: normalizedUrl,
    kind: classifyPlaylist(normalizedUrl),
    initiator: initiator ? safePlaylistUrl(initiator) : null,
    requestHeaders: capturedHeaders,
    headerNames: capturedHeaders.map((header) => header.name),
    firstSeenAt: now,
    lastSeenAt: now,
    hits: 1
  });

  playlistsByTab.set(tabId, current.slice(0, MAX_PLAYLISTS_PER_TAB));
  browser.browserAction.setBadgeText({ tabId, text: String(Math.min(current.length, 99)) });
  browser.browserAction.setBadgeBackgroundColor({ tabId, color: "#2563eb" });
}

browser.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    rememberPlaylist(
      details.tabId,
      details.url,
      details.initiator || details.originUrl || details.documentUrl,
      details.requestHeaders
    );
  },
  { urls: ["<all_urls>"], types: ["xmlhttprequest", "media", "other"] },
  ["requestHeaders"]
);

browser.tabs.onRemoved.addListener((tabId) => {
  playlistsByTab.delete(tabId);
});

browser.runtime.onMessage.addListener(async (message, sender) => {
  if (!message || typeof message.type !== "string") return undefined;

  if (message.type === "get-playlists") {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const tabId = tab && typeof tab.id === "number" ? tab.id : sender.tab && sender.tab.id;
    const playlists = tabId ? playlistsByTab.get(tabId) || [] : [];
    return {
      tabId,
      extensionId: browser.runtime.id,
      playlists: playlists.map((item) => ({
        url: item.url,
        displayUrl: safePlaylistUrl(item.url),
        kind: item.kind,
        requestHeaders: item.requestHeaders,
        headerNames: item.headerNames,
        firstSeenAt: item.firstSeenAt,
        lastSeenAt: item.lastSeenAt,
        hits: item.hits,
        job: jobsByPlaylistUrl.get(item.url) || null
      }))
    };
  }

  if (message.type === "clear-playlists") {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab && typeof tab.id === "number") {
      playlistsByTab.delete(tab.id);
      browser.browserAction.setBadgeText({ tabId: tab.id, text: "" });
    }
    return { ok: true };
  }

  if (message.type === "archive-with-native-helper") {
    try {
      const response = await browser.runtime.sendNativeMessage("hls_capture_helper", {
        action: "start",
        url: message.url,
        outputName: message.outputName || null,
        headers: message.headers || []
      });
      if (response && response.ok) {
        jobsByPlaylistUrl.set(normalizeUrl(message.url), response);
      }
      return response || { ok: false, error: "Native helper returned no response." };
    } catch (error) {
      return { ok: false, error: error.message || String(error) };
    }
  }

  if (message.type === "native-helper-status") {
    try {
      const response = await browser.runtime.sendNativeMessage("hls_capture_helper", {
        action: "status",
        jobId: message.jobId
      });
      if (response && response.ok && message.url) {
        jobsByPlaylistUrl.set(normalizeUrl(message.url), response);
      }
      return response || { ok: false, error: "Native helper returned no response." };
    } catch (error) {
      return { ok: false, error: error.message || String(error) };
    }
  }

  if (message.type === "native-helper-stop") {
    try {
      const response = await browser.runtime.sendNativeMessage("hls_capture_helper", {
        action: "stop",
        jobId: message.jobId
      });
      if (response && response.ok && message.url) {
        jobsByPlaylistUrl.set(normalizeUrl(message.url), response);
      }
      return response || { ok: false, error: "Native helper returned no response." };
    } catch (error) {
      return { ok: false, error: error.message || String(error) };
    }
  }

  return undefined;
});
