const fs = require("fs");
const path = require("path");
const fetch = require("cross-fetch");
const { app } = require("electron");
const { ElectronBlocker } = require("@ghostery/adblocker-electron");

let blocker = null;
let adblockerSession = null;

function cachePath() {
  return path.join(app.getPath("userData"), "adblocker-engine.bin");
}

async function setupAdblocker(session) {
  if (!session) {
    throw new Error("Browser session is required for ad blocking.");
  }

  blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch, {
    path: cachePath(),
    read: fs.promises.readFile.bind(fs.promises),
    write: fs.promises.writeFile.bind(fs.promises)
  });

  adblockerSession = session;
  blocker.enableBlockingInSession(session);

  if (typeof blocker.updateFromDiff === "function") {
    blocker.updateFromDiff({
      added: ["@@||loadshare.org^$important", "@@||loadshare.org^"]
    });
  }

  return blocker;
}

function setAdblockerEnabled(session, enabled) {
  if (!blocker || !session) return;

  const currentlyEnabled = blocker.isBlockingEnabled(session);
  if (enabled === currentlyEnabled) return;

  if (enabled) {
    blocker.enableBlockingInSession(session);
  } else if (currentlyEnabled) {
    blocker.disableBlockingInSession(session);
  }
}

function syncAdblockerForUrl(url) {
  if (!adblockerSession) return;
  const text = String(url || "");
  const allowUnblocked =
    /tornadomovies\.co/i.test(text) ||
    /loadshare\.org\/download\//i.test(text) ||
    /aniwaves\.ru/i.test(text) ||
    /vidplay\.|megacloud\.|rabbitstream\.|streamwish\.|mp4upload\.|echovideo\.|gn1r5n\.|myvidplay\./i.test(text);
  setAdblockerEnabled(adblockerSession, !allowUnblocked);
}

function isAdblockerEnabled(session) {
  return Boolean(blocker && session && blocker.isBlockingEnabled(session));
}

module.exports = {
  setupAdblocker,
  isAdblockerEnabled,
  setAdblockerEnabled,
  syncAdblockerForUrl
};
