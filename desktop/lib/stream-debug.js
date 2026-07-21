const fs = require("fs");
const path = require("path");
const { app } = require("electron");

const MAX_ENTRIES = 300;

function safeDisplayUrl(url) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const fileName = parts[parts.length - 1] || "";
    return `${parsed.hostname}/.../${fileName}${parsed.search ? "?..." : ""}`;
  } catch {
    return String(url || "").slice(0, 80);
  }
}

class StreamDebug {
  constructor() {
    this.entries = [];
  }

  logPath() {
    return path.join(app.getPath("userData"), "stream-debug.log");
  }

  log(type, message, data = {}) {
    const entry = {
      ts: new Date().toISOString(),
      type,
      message,
      data
    };
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    }

    try {
      fs.appendFileSync(this.logPath(), `${JSON.stringify(entry)}\n`, "utf8");
    } catch {
      // Best effort file logging.
    }
  }

  clear() {
    this.entries = [];
    try {
      fs.writeFileSync(this.logPath(), "", "utf8");
    } catch {
      // Best effort file logging.
    }
  }

  recent(limit = 80) {
    return this.entries.slice(-limit);
  }

  formatStreams(streams = []) {
    if (!streams.length) return "(no streams reported)";
    return streams
      .map((stream) => {
        const size =
          stream.width && stream.height ? `${stream.width}x${stream.height}` : "no size";
        return `#${stream.index} ${stream.codec_type || "?"}:${stream.codec_name || "?"} ${size}`;
      })
      .join("\n");
  }

  formatProbeLine(probe) {
    const target = probe.mediaDisplayUrl || probe.mediaUrl || probe.candidate || "?";
    if (probe.status === "ok") {
      return `OK  ${target} -> ${probe.codec} ${probe.width}x${probe.height} (stream #${probe.streamIndex})`;
    }
    if (probe.status === "fetch-ok") {
      return `OK  ${target} -> playlist fetch validated (ffprobe failed)`;
    }
    if (probe.status === "invalid") {
      return `SKIP ${target} -> image/invalid (${probe.codec || "png/thumbnail"})`;
    }
    if (probe.error) {
      return `FAIL ${target} -> ${probe.error}`;
    }
    return `??  ${target} -> probe inconclusive`;
  }

  formatReport(report) {
    const lines = [];
    lines.push(`Stream diagnosis @ ${report.generatedAt || new Date().toISOString()}`);
    lines.push(`Page: ${report.pageUrl || "(none)"}`);
    lines.push(`Captured playlists: ${report.playlistCount || 0}`);
    lines.push(`ffprobe: ${report.ffprobePath || "not found"}`);
    lines.push("");

    if (report.captures?.length) {
      lines.push("Captured .m3u8 URLs:");
      for (const capture of report.captures) {
        lines.push(
          `  - [${capture.kind}] hits=${capture.hits} headers=${capture.headerCount} ${capture.displayUrl}`
        );
      }
      lines.push("");
    }

    if (report.probes?.length) {
      lines.push("ffprobe results:");
      for (const probe of report.probes) {
        lines.push(`  ${this.formatProbeLine(probe)}`);
        if (probe.streams?.length) {
          for (const streamLine of this.formatStreams(probe.streams).split("\n")) {
            lines.push(`      ${streamLine}`);
          }
        }
      }
      lines.push("");
    }

    if (report.selected) {
      const method = report.selected.validatedByFetch ? " (via playlist fetch)" : "";
      lines.push(
        `Selected: ${report.selected.qualityLabel || "?"} ${report.selected.codec || "?"} ${report.selected.width}x${report.selected.height}${method}`
      );
      lines.push(`  ${safeDisplayUrl(report.selected.url)}`);
    } else {
      lines.push("Selected: none (only thumbnails/previews or no probe match)");
    }

    if (report.summary) {
      lines.push("");
      lines.push(`Summary: ${report.summary}`);
    }

    return lines.join("\n");
  }
}

const streamDebug = new StreamDebug();

module.exports = {
  streamDebug,
  safeDisplayUrl
};
