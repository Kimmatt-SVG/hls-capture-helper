const {
  canonicalMoviePageUrl,
  extractMovieIdFromUrl,
  normalizeMovieUrl
} = require("./movie-url-utils");

function titleFromMovieUrl(url) {
  try {
    const match = String(url).match(/\/movie\/([^/]+)\//i);
    if (!match) return "Movie";
    return match[1]
      .replace(/-/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  } catch {
    return "Movie";
  }
}

class DownloadQueue {
  constructor() {
    this.items = [];
    this.running = false;
    this.cancelRequested = false;
    this.currentId = null;
  }

  list() {
    return this.items.map((item) => ({ ...item }));
  }

  snapshot() {
    const pending = this.items.filter((item) => item.status === "pending").length;
    const done = this.items.filter((item) => item.status === "done").length;
    const failed = this.items.filter((item) => item.status === "failed").length;

    return {
      running: this.running,
      cancelRequested: this.cancelRequested,
      currentId: this.currentId,
      items: this.list(),
      counts: {
        total: this.items.length,
        pending,
        done,
        failed
      }
    };
  }

  add(movieUrl, options = {}) {
    const normalizedUrl = normalizeMovieUrl(movieUrl);
    if (!/\/movie\/[^/]+\/[^/?#]+/i.test(normalizedUrl)) {
      return {
        ok: false,
        error: "Not a valid movie page URL. Use a full link like /movie/title/movieId."
      };
    }

    if (this.items.some((item) => item.movieUrl === normalizedUrl && item.status === "pending")) {
      return { ok: false, error: "Movie is already in the queue." };
    }

    const item = {
      id: `q-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      title: options.title || titleFromMovieUrl(normalizedUrl),
      movieUrl: normalizedUrl,
      destination: options.destination === "nas" ? "nas" : "local",
      status: "pending",
      error: null,
      addedAt: Date.now()
    };

    this.items.push(item);
    return { ok: true, item };
  }

  addMany(entries = [], destination = "local") {
    const added = [];
    const skipped = [];

    for (const entry of entries) {
      const movieUrl = typeof entry === "string" ? entry : entry?.movieUrl;
      const title = typeof entry === "object" ? entry?.title : null;
      const result = this.add(movieUrl, { title, destination });
      if (result.ok) added.push(result.item);
      else skipped.push({ movieUrl, error: result.error });
    }

    return { ok: true, added, skipped };
  }

  remove(id) {
    if (this.running && this.currentId === id) {
      return { ok: false, error: "Cannot remove the movie that is downloading." };
    }

    const before = this.items.length;
    this.items = this.items.filter((item) => item.id !== id);
    return { ok: true, removed: before - this.items.length };
  }

  clear() {
    if (this.running) {
      return { ok: false, error: "Stop the queue before clearing it." };
    }

    this.items = [];
    this.currentId = null;
    this.cancelRequested = false;
    return { ok: true };
  }

  setPendingDestination(destination = "local") {
    const normalized = destination === "nas" ? "nas" : "local";
    for (const item of this.items) {
      if (item.status === "pending") item.destination = normalized;
    }
    return { ok: true, destination: normalized };
  }

  beginRun() {
    if (this.running) {
      return { ok: false, error: "Queue is already running." };
    }

    const pending = this.items.filter((item) => item.status === "pending");
    if (!pending.length) {
      return { ok: false, error: "Queue is empty." };
    }

    this.running = true;
    this.cancelRequested = false;
    this.currentId = null;
    return { ok: true, pending: pending.length };
  }

  requestCancel() {
    this.cancelRequested = true;
    return { ok: true };
  }

  finishRun() {
    this.running = false;
    this.currentId = null;
    this.cancelRequested = false;
  }

  setCurrent(id) {
    this.currentId = id;
    const item = this.items.find((entry) => entry.id === id);
    if (item) item.status = "loading";
  }

  markDownloading(id) {
    const item = this.items.find((entry) => entry.id === id);
    if (item) item.status = "downloading";
  }

  markDone(id) {
    const item = this.items.find((entry) => entry.id === id);
    if (item) {
      item.status = "done";
      item.error = null;
    }
    if (this.currentId === id) this.currentId = null;
  }

  markFailed(id, error) {
    const item = this.items.find((entry) => entry.id === id);
    if (item) {
      item.status = "failed";
      item.error = error || "Download failed";
    }
    if (this.currentId === id) this.currentId = null;
  }

  markSkipped(id, reason) {
    const item = this.items.find((entry) => entry.id === id);
    if (item) {
      item.status = "failed";
      item.error = reason || "Skipped";
    }
    if (this.currentId === id) this.currentId = null;
  }

  nextPending() {
    return this.items.find((item) => item.status === "pending") || null;
  }
}

module.exports = {
  DownloadQueue,
  titleFromMovieUrl,
  normalizeMovieUrl,
  canonicalMoviePageUrl,
  extractMovieIdFromUrl
};
