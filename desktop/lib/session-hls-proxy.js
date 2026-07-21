const http = require("http");
const fetch = require("cross-fetch");
const { net } = require("electron");
const { enrichRequestHeaders, isEmbedCdnUrl } = require("./session-headers");

function isPlaylistBody(text) {
  return typeof text === "string" && text.trimStart().startsWith("#EXTM3U");
}

function isPlaylistResponse(url, contentType = "", bodyText = "") {
  const lower = String(url).toLowerCase();
  if (/\.m3u8(?:$|[?#])/.test(lower)) return true;
  if (/mpegurl|application\/vnd\.apple\.mpegurl/i.test(contentType)) return true;
  return isPlaylistBody(bodyText);
}

function rewritePlaylist(text, playlistUrl, proxyPathPrefix) {
  const lines = text.split(/\r?\n/);
  const rewritten = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      const uriMatch = trimmed.match(/URI="([^"]+)"/i);
      if (uriMatch?.[1]) {
        try {
          const absolute = new URL(uriMatch[1], playlistUrl).toString();
          return trimmed.replace(uriMatch[1], `${proxyPathPrefix}${encodeURIComponent(absolute)}`);
        } catch {
          return line;
        }
      }
      return line;
    }

    try {
      const absolute = new URL(trimmed, playlistUrl).toString();
      return `${proxyPathPrefix}${encodeURIComponent(absolute)}`;
    } catch {
      return line;
    }
  });

  return rewritten.join("\n");
}

class SessionHlsProxy {
  constructor() {
    this.server = null;
    this.port = 0;
    this.context = null;
  }

  isRunning() {
    return Boolean(this.server && this.port);
  }

  localUrl(remoteUrl) {
    if (!this.isRunning()) return remoteUrl;
    return `http://127.0.0.1:${this.port}/p?u=${encodeURIComponent(remoteUrl)}`;
  }

  async ensureRunning(context = {}) {
    if (this.isRunning() && this.context?.session === context.session) {
      this.context = { ...this.context, ...context };
      return this.port;
    }

    await this.stop();
    this.context = context;

    await new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res).catch((error) => {
          if (!res.headersSent) {
            res.writeHead(502, { "Content-Type": "text/plain" });
          }
          res.end(error.message || "Proxy fetch failed");
        });
      });

      this.server.on("error", reject);
      this.server.listen(0, "127.0.0.1", () => {
        this.port = this.server.address().port;
        resolve();
      });
    });

    return this.port;
  }

  async stop() {
    if (!this.server) return;

    await new Promise((resolve) => {
      this.server.close(() => resolve());
    });

    this.server = null;
    this.port = 0;
    this.context = null;
  }

  async handleRequest(req, res) {
    let remoteUrl;
    try {
      const parsed = new URL(req.url || "/", `http://127.0.0.1:${this.port}`);
      remoteUrl = parsed.searchParams.get("u");
      if (!remoteUrl) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Missing u parameter");
        return;
      }
    } catch {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Bad request");
      return;
    }

    const {
      session = null,
      pageUrl = "",
      embedUrl = "",
      requestHeaders = []
    } = this.context || {};

    const headers = await enrichRequestHeaders(requestHeaders, {
      pageUrl,
      embedUrl,
      targetUrl: remoteUrl,
      session
    });

    const headerObject = {};
    for (const header of headers) {
      if (header?.name && header?.value) {
        headerObject[header.name] = header.value;
      }
    }

    const response = session
      ? await net.fetch(remoteUrl, { session, headers: headerObject, redirect: "follow" })
      : await fetch(remoteUrl, { headers: headerObject, redirect: "follow" });

    const contentType = response.headers.get("content-type") || "application/octet-stream";
    let body = Buffer.from(await response.arrayBuffer());

    if (response.ok && isPlaylistResponse(remoteUrl, contentType, body.toString("utf8"))) {
      const proxyPrefix = `http://127.0.0.1:${this.port}/p?u=`;
      const rewritten = rewritePlaylist(body.toString("utf8"), remoteUrl, proxyPrefix);
      body = Buffer.from(rewritten, "utf8");
    }

    res.writeHead(response.status, {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*"
    });
    res.end(body);
  }
}

const sessionHlsProxy = new SessionHlsProxy();

function shouldProxyStreamUrl(url) {
  return isEmbedCdnUrl(url);
}

module.exports = {
  SessionHlsProxy,
  sessionHlsProxy,
  shouldProxyStreamUrl,
  isPlaylistResponse
};
