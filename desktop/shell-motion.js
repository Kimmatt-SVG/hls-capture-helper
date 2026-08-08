(() => {
  const api = globalThis.anime || null;

  function motionLevel() {
    if (!api?.animate) return "off";
    const stored = String(localStorage.getItem("streamMotion") || "").toLowerCase();
    if (stored === "reduce" || stored === "off") return stored === "off" ? "off" : "reduce";
    if (stored === "full") return "full";
    // Default to full catalog motion in the desktop app.
    // OS "prefers-reduced-motion" often mirrors Windows animation settings and was
    // skipping every entrance effect; set localStorage.streamMotion = "reduce" to soften.
    return "full";
  }

  function ready() {
    return motionLevel() !== "off";
  }

  function nodesFrom(targets) {
    if (!targets) return [];
    return [...(targets.length != null && !targets.tagName ? targets : [targets])].filter(Boolean);
  }

  function freeze(targets, props) {
    const nodes = nodesFrom(targets);
    if (!nodes.length) return;
    if (api?.set) {
      api.set(nodes, props);
      return;
    }
    if (api?.utils?.set) {
      api.utils.set(nodes, props);
      return;
    }
    for (const node of nodes) {
      if (props.opacity != null) node.style.opacity = String(props.opacity);
      const x = props.x || 0;
      const y = props.y || 0;
      const scale = props.scale != null ? props.scale : 1;
      node.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    }
  }

  function clearInline(targets) {
    for (const node of nodesFrom(targets)) {
      node.style.opacity = "";
      node.style.transform = "";
    }
  }

  function animateCatalogHome(root) {
    if (!ready() || !root) return;
    const level = motionLevel();
    const hero = root.querySelector(".catalog-home-hero") || root;
    const library = root.querySelector(".home-library");
    freeze(hero, { opacity: 0, y: level === "full" ? 14 : 0 });
    if (library) freeze(library, { opacity: 0, y: level === "full" ? 18 : 0 });
    api.animate(hero, {
      opacity: 1,
      y: 0,
      duration: level === "full" ? 480 : 180,
      ease: "outCubic",
      onComplete: () => clearInline(hero)
    });
    if (library) {
      api.animate(library, {
        opacity: 1,
        y: 0,
        duration: level === "full" ? 520 : 180,
        delay: level === "full" ? 120 : 0,
        ease: "outCubic",
        onComplete: () => clearInline(library)
      });
    }
  }

  function animateCatalogGrid(cards) {
    const list = nodesFrom(cards);
    if (!list.length) return;
    if (!ready()) {
      clearInline(list);
      return;
    }

    const level = motionLevel();
    freeze(list, {
      opacity: 0,
      y: level === "full" ? 18 : 0,
      scale: level === "full" ? 0.98 : 1
    });
    api.animate(list, {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: level === "full" ? 420 : 160,
      delay: level === "full" ? api.stagger(48, { start: 60 }) : 0,
      ease: "outCubic",
      onComplete: () => clearInline(list)
    });
  }

  function animateCatalogDetail(root) {
    if (!root) return;
    const poster = root.querySelector(".catalog-detail-poster");
    const meta = root.querySelector(".catalog-detail-meta");
    const actions = root.querySelector(".catalog-detail-actions");
    const parts = [poster, meta, actions].filter(Boolean);

    if (!ready()) {
      clearInline(parts);
      return;
    }

    const level = motionLevel();
    if (level === "reduce") {
      freeze(parts, { opacity: 0 });
      api.animate(parts, {
        opacity: 1,
        duration: 180,
        ease: "outQuad",
        onComplete: () => clearInline(parts)
      });
      return;
    }

    if (poster) freeze(poster, { opacity: 0, x: -18, scale: 0.97 });
    if (meta) freeze(meta, { opacity: 0, y: 14 });
    if (actions) freeze(actions, { opacity: 0, y: 10 });

    const timeline = api.createTimeline({
      defaults: { ease: "outCubic" },
      onComplete: () => clearInline(parts)
    });
    if (poster) {
      timeline.add(poster, {
        opacity: 1,
        x: 0,
        scale: 1,
        duration: 420
      });
    }
    if (meta) {
      timeline.add(
        meta,
        {
          opacity: 1,
          y: 0,
          duration: 360
        },
        poster ? "-=260" : 0
      );
    }
    if (actions) {
      timeline.add(
        actions,
        {
          opacity: 1,
          y: 0,
          duration: 320
        },
        "-=220"
      );
    }
  }

  function pulseQueueChrome() {
    const target =
      document.querySelector("#download-queue-summary") ||
      document.querySelector(".download-queue-head strong");
    if (!ready() || !target) return;
    const level = motionLevel();
    api.animate(target, {
      scale: level === "full" ? [1, 1.06, 1] : [1, 1.02, 1],
      duration: level === "full" ? 420 : 180,
      ease: "outQuad",
      onComplete: () => clearInline(target)
    });
  }

  window.shellMotion = {
    ready,
    motionLevel,
    animateCatalogHome,
    animateCatalogGrid,
    animateCatalogDetail,
    pulseQueueChrome
  };
})();
