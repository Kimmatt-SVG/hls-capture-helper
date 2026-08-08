(() => {
  const api = globalThis.anime || null;
  const reduceMotion = () =>
    Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);

  function ready() {
    return Boolean(api?.animate) && !reduceMotion();
  }

  function freeze(targets, props) {
    if (!targets) return;
    const nodes = [...(targets.length != null && !targets.tagName ? targets : [targets])].filter(Boolean);
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

  function animateCatalogHome(root) {
    if (!ready() || !root) return;
    freeze(root, { opacity: 0, y: 14 });
    api.animate(root, {
      opacity: 1,
      y: 0,
      duration: 480,
      ease: "outCubic"
    });
  }

  function animateCatalogGrid(cards) {
    const list = [...(cards || [])];
    if (!list.length) return;
    if (!ready()) {
      list.forEach((card) => {
        card.style.opacity = "1";
        card.style.transform = "";
      });
      return;
    }

    freeze(list, { opacity: 0, y: 18, scale: 0.98 });
    api.animate(list, {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: 420,
      delay: api.stagger(48, { start: 60 }),
      ease: "outCubic"
    });
  }

  function animateCatalogDetail(root) {
    if (!root) return;
    const poster = root.querySelector(".catalog-detail-poster");
    const meta = root.querySelector(".catalog-detail-meta");
    const actions = root.querySelector(".catalog-detail-actions");

    if (!ready()) {
      [poster, meta, actions].forEach((node) => {
        if (!node) return;
        node.style.opacity = "1";
        node.style.transform = "";
      });
      return;
    }

    if (poster) freeze(poster, { opacity: 0, x: -18, scale: 0.97 });
    if (meta) freeze(meta, { opacity: 0, y: 14 });
    if (actions) freeze(actions, { opacity: 0, y: 10 });

    const timeline = api.createTimeline({ defaults: { ease: "outCubic" } });
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
    api.animate(target, {
      scale: [1, 1.06, 1],
      duration: 420,
      ease: "outQuad"
    });
  }

  window.shellMotion = {
    ready,
    animateCatalogHome,
    animateCatalogGrid,
    animateCatalogDetail,
    pulseQueueChrome
  };
})();
