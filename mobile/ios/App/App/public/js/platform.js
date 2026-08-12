(function initPlatform() {
  const capacitor = window.Capacitor;
  const isIOS = capacitor?.getPlatform?.() === "ios";
  document.body.classList.toggle("platform-ios", isIOS);

  if (capacitor?.registerPlugin) {
    window.MovieEngine = capacitor.registerPlugin("MovieEngine");
  }

  if (isIOS && window.Capacitor?.Plugins?.StatusBar) {
    window.Capacitor.Plugins.StatusBar.setStyle({ style: "DARK" }).catch(() => {});
    window.Capacitor.Plugins.StatusBar.setBackgroundColor({ color: "#10131a" }).catch(() => {});
  }
})();
