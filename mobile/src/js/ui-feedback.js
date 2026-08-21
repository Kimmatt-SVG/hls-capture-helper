(function initUiFeedback() {
  const isIOS =
    document.body.classList.contains("platform-ios") ||
    window.Capacitor?.getPlatform?.() === "ios" ||
    window.Capacitor?.isNativePlatform?.() === true;

  const THROTTLE_MS = 70;
  let lastAt = 0;
  let lastKind = "";

  function play(kind = "tap") {
    if (!isIOS) return;
    const next = String(kind || "tap").toLowerCase();
    const now = Date.now();
    const important = next === "success" || next === "error" || next === "warning" || next === "start" || next === "play";
    if (!important && next === lastKind && now - lastAt < THROTTLE_MS) return;
    lastAt = now;
    lastKind = next;

    const engine = window.MovieEngine;
    if (typeof engine?.playFeedback === "function") {
      engine.playFeedback({ kind: next }).catch(() => {});
      return;
    }
    try {
      if (next === "error" || next === "warning") navigator.vibrate?.(40);
      else navigator.vibrate?.(10);
    } catch {
      // WKWebView does not support vibration.
    }
  }

  function kindForControl(control) {
    if (!control || control.disabled || control.getAttribute("aria-disabled") === "true") return null;
    const id = control.id || "";
    const className = control.className || "";

    if (control.matches("input[type=checkbox]")) return "toggle";
    if (control.closest(".catalog-card, .library-item-movie, .library-poster-card")) return "select";
    if (control.classList.contains("danger") || /stop|clear|remove/i.test(id)) return "warning";
    if (control.classList.contains("catalog-back") || /back|close/i.test(id)) return "close";
    if (/open-library|open-settings|refresh-library/i.test(id) || /\bprimary\b|\baccent\b/.test(className)) {
      return "open";
    }
    return "tap";
  }

  function onClick(event) {
    if (!isIOS) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("input:not([type=checkbox]):not([type=button]):not([type=submit]), textarea, select, option")) {
      return;
    }

    const control = target.closest(
      "button, a[href], [role=button], input[type=checkbox], .catalog-card, .library-item, .library-show-header, .library-poster-card"
    );
    if (!control) return;
    if (control.closest("[hidden], [aria-hidden=true]")) return;

    const kind = kindForControl(control);
    if (kind) play(kind);
  }

  document.addEventListener("click", onClick, true);

  document.addEventListener(
    "change",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement) && !(target instanceof HTMLInputElement)) return;
      if (target instanceof HTMLInputElement && target.type !== "checkbox") return;
      play(target instanceof HTMLSelectElement ? "select" : "toggle");
    },
    true
  );

  window.uiFeedback = { play };
})();
