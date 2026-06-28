const list = document.getElementById("list");
const empty = document.getElementById("empty");
const status = document.getElementById("status");
const rowTemplate = document.getElementById("playlist-row");
const refreshButton = document.getElementById("refresh");
const clearButton = document.getElementById("clear");
let extensionId = "unknown";
const activePolls = new Map();
const SENSITIVE_COPIED_HEADER_NAMES = new Set(["authorization", "cookie"]);

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

function safeLogText(text) {
  return String(text || "").replace(/https?:\/\/[^\s'"<>]+/gi, (url) => safePlaylistUrl(url));
}

function isSensitiveCopiedHeader(name) {
  const lower = String(name || "").toLowerCase();
  return SENSITIVE_COPIED_HEADER_NAMES.has(lower) || lower.startsWith("x-");
}

function sensitiveCopiedHeaderNames(headers = []) {
  return [
    ...new Set(
      headers
        .filter((header) => header && isSensitiveCopiedHeader(header.name))
        .map((header) => header.name)
    )
  ];
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function shellAnsiCQuote(value) {
  return `$'${String(value)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")}'`;
}

function ffmpegHeaderArgs(headers = []) {
  const args = [];
  const headerLines = [];

  for (const header of headers) {
    if (isSensitiveCopiedHeader(header.name)) {
      continue;
    }

    const name = header.name.toLowerCase();
    if (name === "user-agent") {
      args.push("-user_agent", shellQuote(header.value));
    } else if (name === "referer") {
      args.push("-referer", shellQuote(header.value));
    } else {
      headerLines.push(`${header.name}: ${header.value}`);
    }
  }

  if (headerLines.length) {
    args.push("-headers", shellAnsiCQuote(`${headerLines.join("\r\n")}\r\n`));
  }

  return args;
}

function outputNameFor(url, kind) {
  let host = "stream";
  try {
    host = new URL(url).hostname.replace(/^www\./, "").replace(/[^a-z0-9.-]/gi, "_");
  } catch {
    // Keep the fallback.
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${host}-${kind}-${stamp}.mp4`;
}

function ffmpegCommand(url, kind, headers = []) {
  const outputName = outputNameFor(url, kind);
  return [
    "ffmpeg",
    "-hide_banner",
    "-loglevel",
    "warning",
    "-protocol_whitelist",
    "file,http,https,tcp,tls,crypto",
    "-allowed_extensions",
    "ALL",
    ...ffmpegHeaderArgs(headers),
    "-seg_max_retry",
    "3",
    "-i",
    shellQuote(url),
    "-map",
    "0:v?",
    "-map",
    "0:a?",
    "-dn",
    "-c",
    "copy",
    "-bsf:a",
    "aac_adtstoasc",
    shellQuote(outputName)
  ].join(" ");
}

function relativeTime(timestamp) {
  const seconds = Math.max(1, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

async function copyText(text, message = "Copied to clipboard.") {
  await navigator.clipboard.writeText(text);
  status.textContent = message;
}

function updateJobProgress(row, response) {
  const panel = row.querySelector(".job-progress");
  const jobStatus = row.querySelector(".job-status");
  const jobLog = row.querySelector(".job-log");
  const runButton = row.querySelector(".native-save");
  const stopButton = row.querySelector(".native-stop");
  const state = response.state || "running";
  const details = [
    state,
    response.outTime ? `time ${response.outTime}` : null,
    response.speed ? `speed ${response.speed}` : null,
    `size ${formatBytes(response.outputSize || response.totalSize)}`
  ].filter(Boolean);

  panel.hidden = false;
  panel.dataset.state = state;
  jobStatus.textContent = details.join(" · ");
  jobLog.textContent = response.lastLogLines && response.lastLogLines.length
    ? safeLogText(response.lastLogLines[response.lastLogLines.length - 1])
    : response.outputPath || "";

  if (response.jobId) {
    row.dataset.jobId = response.jobId;
  }

  const isActive = state === "running" || state === "stopping";
  runButton.disabled = isActive;
  stopButton.hidden = !isActive;
  stopButton.disabled = state === "stopping";
  stopButton.textContent = state === "stopping" ? "Stopping..." : "Stop";
}

async function pollJob(row, jobId, url = null) {
  const response = await browser.runtime.sendMessage({
    type: "native-helper-status",
    jobId,
    url
  });

  if (!response || !response.ok) {
    throw new Error((response && response.error) || "Could not read helper status.");
  }

  updateJobProgress(row, response);
  if (!["running", "stopping"].includes(response.state)) {
    const interval = activePolls.get(jobId);
    if (interval) clearInterval(interval);
    activePolls.delete(jobId);
  }
}

function startPollingJob(row, jobId, url = null) {
  if (!jobId || activePolls.has(jobId)) return;

  pollJob(row, jobId, url).catch((error) => {
    row.querySelector(".job-log").textContent = safeLogText(error.message);
  });

  const interval = setInterval(() => {
    pollJob(row, jobId, url).catch((error) => {
      row.querySelector(".job-log").textContent = safeLogText(error.message);
    });
  }, 1500);
  activePolls.set(jobId, interval);
}

async function runNativeHelper(item, row) {
  status.textContent = "Sending playlist to native helper...";
  const response = await browser.runtime.sendMessage({
    type: "archive-with-native-helper",
    url: item.url,
    outputName: outputNameFor(item.url, item.kind),
    headers: item.requestHeaders || []
  });

  if (!response || !response.ok) {
    const reason = (response && response.error) || "Native helper failed.";
    throw new Error(`${safeLogText(reason)} Extension ID: ${extensionId}`);
  }

  updateJobProgress(row, {
    ...response,
    state: "running",
    outputSize: 0,
    lastLogLines: [`Output: ${response.outputPath}`]
  });
  startPollingJob(row, response.jobId, item.url);
  status.textContent = `Started FFmpeg as process ${response.pid}.`;
}

async function stopNativeHelper(row, url = null) {
  const jobId = row.dataset.jobId;
  if (!jobId) {
    throw new Error("No helper job is attached to this row.");
  }

  updateJobProgress(row, {
    jobId,
    state: "stopping",
    lastLogLines: ["Stopping FFmpeg..."]
  });
  status.textContent = "Stopping helper...";

  const response = await browser.runtime.sendMessage({
    type: "native-helper-stop",
    jobId,
    url
  });

  if (!response || !response.ok) {
    const reason = (response && response.error) || "Could not stop helper.";
    throw new Error(`${safeLogText(reason)} Extension ID: ${extensionId}`);
  }

  updateJobProgress(row, response);
  if (!["running", "stopping"].includes(response.state)) {
    const interval = activePolls.get(jobId);
    if (interval) clearInterval(interval);
    activePolls.delete(jobId);
  }
  status.textContent = `Helper ${response.state}.`;
}

function render(playlists) {
  list.textContent = "";
  empty.hidden = playlists.length !== 0;
  status.textContent = playlists.length
    ? `${playlists.length} playlist${playlists.length === 1 ? "" : "s"} detected in this tab.`
    : "Start playback, then refresh if needed.";

  for (const item of playlists) {
    const row = rowTemplate.content.firstElementChild.cloneNode(true);
    row.querySelector(".badge").textContent = item.kind;
    const headerCount = item.headerNames ? item.headerNames.length : 0;
    const headerText = headerCount ? ` · ${headerCount} header${headerCount === 1 ? "" : "s"}` : "";
    row.querySelector(".seen").textContent = `${relativeTime(item.lastSeenAt)} · ${item.hits} hit${item.hits === 1 ? "" : "s"}${headerText}`;
    row.querySelector(".url").textContent = item.displayUrl || safePlaylistUrl(item.url);

    row.querySelector(".copy-url").addEventListener("click", () => copyText(item.url));
    row.querySelector(".copy-command").addEventListener("click", () => {
      const omitted = sensitiveCopiedHeaderNames(item.requestHeaders || []);
      const message = omitted.length
        ? `Copied FFmpeg command. Omitted sensitive headers: ${omitted.join(", ")}.`
        : "Copied FFmpeg command.";
      copyText(ffmpegCommand(item.url, item.kind, item.requestHeaders || []), message);
    });
    row.querySelector(".native-save").addEventListener("click", async () => {
      try {
        await runNativeHelper(item, row);
      } catch (error) {
        status.textContent = safeLogText(error.message);
      }
    });
    row.querySelector(".native-stop").addEventListener("click", async () => {
      try {
        await stopNativeHelper(row, item.url);
      } catch (error) {
        status.textContent = safeLogText(error.message);
      }
    });

    if (item.job) {
      updateJobProgress(row, item.job);
      if (["running", "stopping"].includes(item.job.state || "running")) {
        startPollingJob(row, item.job.jobId, item.url);
      }
    }

    list.append(row);
  }
}

async function loadPlaylists() {
  try {
    const response = await browser.runtime.sendMessage({ type: "get-playlists" });
    extensionId = response.extensionId || extensionId;
    render(response.playlists || []);
  } catch (error) {
    status.textContent = safeLogText(error.message);
  }
}

refreshButton.addEventListener("click", loadPlaylists);
clearButton.addEventListener("click", async () => {
  await browser.runtime.sendMessage({ type: "clear-playlists" });
  await loadPlaylists();
});

window.addEventListener("unload", () => {
  for (const interval of activePolls.values()) {
    clearInterval(interval);
  }
});

loadPlaylists();
