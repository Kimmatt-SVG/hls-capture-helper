function formatQueueDebugDetail(data) {
  if (!data || typeof data !== "object") return null;
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

function createQueueDebugger(streamDebug, sendToRenderer) {
  return function queueDebug(step, message, data = {}) {
    const entry = {
      ts: new Date().toISOString(),
      step: String(step || "queue"),
      message: String(message || ""),
      data
    };

    streamDebug.log("queue", entry.message, {
      step: entry.step,
      ...data
    });

    if (typeof sendToRenderer === "function") {
      sendToRenderer("queue-debug", entry);
    }

    return entry;
  };
}

function recentQueueDebugEntries(streamDebug, limit = 40) {
  return streamDebug
    .recent(limit)
    .filter((entry) => entry.type === "queue")
    .map((entry) => ({
      ts: entry.ts,
      step: entry.data?.step || "queue",
      message: entry.message,
      data: entry.data
    }));
}

module.exports = {
  createQueueDebugger,
  formatQueueDebugDetail,
  recentQueueDebugEntries
};
