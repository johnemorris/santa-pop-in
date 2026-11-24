// Santa Pop-In content script: Window-edge lights and snowy pines in the bottom corners.
// Content scripts share one isolated world, so top-level names here are
// visible to the other content/*.js files (see manifest.json for load order).

// ------------------------------------------------------------- decorations
// Lights around the edge of the window and half a snowy pine in each bottom
// corner. Purely decorative: never catches a click, hidden in fullscreen.
const Decor = (() => {
  let box = null, resizeT = null, trees = [], hoverRaf = 0, mx = -1, my = -1;
  const PALETTES = {
    classic: ["#ff3b3b", "#2ecc40", "#ffd23f", "#3b8bff"],
    warm: ["#ffe8a3", "#ffd166", "#ffb703", "#fff4cc"],
    icy: ["#e0f2fe", "#7dd3fc", "#38bdf8", "#ffffff"],
    candy: ["#ef233c", "#ffffff", "#ff4d6d", "#f8fafc"],
  };
  const NS = "http://www.w3.org/2000/svg";

  function resolveLightMode() {
    if (settings.santaDecor.lightMode) return settings.santaDecor.lightMode;
    return settings.santaDecor.blink ? "twinkle" : "steady";
  }

  function lights(W, H) {
    const mode = resolveLightMode();
    const palette = PALETTES[settings.santaDecor.lightStyle] || PALETTES.classic;
    const svg = document.createElementNS(NS, "svg");
    const cls = mode === "chase" ? "lights chase" : mode === "twinkle" ? "lights blink" : "lights";
    svg.setAttribute("class", cls);
    svg.setAttribute("width", W);
    svg.setAttribute("height", H);
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const m = 1.5, gap = 44, sag = 4;
    const sides = [[m, m, W - m, m], [W - m, m, W - m, H - m], [W - m, H - m, m, H - m], [m, H - m, m, m]];
    let d = "", bulbs = "", k = 0;
    for (const [x0, y0, x1, y1] of sides) {
      const len = Math.hypot(x1 - x0, y1 - y0);
      const n = Math.max(1, Math.round(len / gap));
      const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
      const nx = -uy, ny = ux;
      d += `M${x0},${y0}`;
      for (let i = 1; i <= n; i++) {
        const ax = x0 + ((x1 - x0) * i) / n, ay = y0 + ((y1 - y0) * i) / n;
        const bmx = x0 + ((x1 - x0) * (i - 0.5)) / n, bmy = y0 + ((y1 - y0) * (i - 0.5)) / n;
        d += ` Q${bmx + nx * sag * 2},${bmy + ny * sag * 2} ${ax},${ay}`;
        const bx = bmx + nx * (sag + 2), by = bmy + ny * (sag + 2);
        const ang = (Math.atan2(ny, nx) * 180) / Math.PI - 90;
        const c = palette[k % palette.length];
        const delayStyle = mode === "chase" ? ` style="animation-delay:${((k % 12) * -0.15).toFixed(2)}s"` : "";
        // Position lives on the outer group; the animated inner group may
        // scale freely without a CSS transform wiping out the placement.
        bulbs += `<g transform="translate(${bx.toFixed(1)},${by.toFixed(1)}) rotate(${ang.toFixed(0)})">` +
          `<g class="bulb k${k % 4}"${delayStyle}>` +
          `<rect x="-2.6" y="-6" width="5.2" height="4" rx="1" fill="#3a4a3a"/>` +
          `<ellipse cx="0" cy="3" rx="4" ry="6" fill="${c}" filter="url(#glow)"/>` +
          `<ellipse cx="-1.3" cy="1" rx="1.1" ry="2" fill="#fff" opacity=".55"/></g></g>`;
        k++;
      }
    }
    svg.innerHTML =
      `<defs><filter id="glow" x="-150%" y="-150%" width="400%" height="400%">` +
      `<feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>` +
      `<path d="${d}" fill="none" stroke="#24362a" stroke-width="1.6" stroke-linecap="round"/>` + bulbs;
    return svg;
  }

  function treeOrnamentsSVG(side) {
    const palette = PALETTES[settings.santaDecor.lightStyle] || PALETTES.classic;
    // Place baubles on the visible inward half of each corner pine.
    const pts =
      side === "l"
        ? [
            [58, 30], [66, 46], [56, 56], [74, 65], [62, 74], [80, 82], [68, 88],
          ]
        : [
            [42, 30], [34, 46], [44, 56], [26, 65], [38, 74], [20, 82], [32, 88],
          ];
    const dots = pts
      .map(([x, y], i) => {
        const c = palette[i % palette.length];
        return `<circle class="orn d${i % 4}" cx="${x}" cy="${y}" r="3.4" fill="${c}" filter="url(#oglow)"/>` +
          `<circle cx="${x - 1}" cy="${y - 1}" r="1.1" fill="#ffffff" opacity=".75"/>`;
      })
      .join("");
    return `<svg class="tree-ornaments" viewBox="0 0 100 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <defs><filter id="oglow" x="-150%" y="-150%" width="400%" height="400%">
        <feGaussianBlur stdDeviation="1.8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter></defs>${dots}</svg>`;
  }

  function createTree(side) {
    const wrap = el("div", { className: `tree-wrap ${side}` }, box);
    el("img", { className: "tree-img", src: url("images/pine.webp"), alt: "" }, wrap);
    if (settings.santaDecor.ornaments) {
      const orn = el("div", { style: "position:absolute;inset:0;pointer-events:none;" }, wrap);
      orn.innerHTML = treeOrnamentsSVG(side);
    }
    return wrap;
  }

  function render() {
    const want =
      isActiveHere() &&
      !document.fullscreenElement &&
      (settings.santaDecor.lights || settings.santaDecor.trees);
    box?.remove();
    box = null;
    trees = [];
    if (!want) return;
    ensureStage();
    box = el("div", { className: "decor" });
    layer.prepend(box);
    if (settings.santaDecor.lights) box.append(lights(window.innerWidth, window.innerHeight));
    if (settings.santaDecor.trees) {
      trees = [createTree("l"), createTree("r")];
    }
  }

  function overTree(t) {
    const r = t.getBoundingClientRect();
    const fullH = r.height / (t.classList.contains("back") ? 0.9 : 1);
    const fullW = r.width / (t.classList.contains("back") ? 0.9 : 1);
    const left = t.classList.contains("l") ? r.left : r.right - fullW;
    const top = r.bottom - fullH;
    if (mx < left || mx > left + fullW || my < top || my > r.bottom) return false;
    const cx = left + fullW / 2, depth = (my - top) / fullH;
    return Math.abs(mx - cx) <= (fullW / 2) * Math.min(1, 0.15 + depth * 1.05) + 12;
  }
  function checkHover() {
    hoverRaf = 0;
    for (const t of trees) t.classList.toggle("back", mx >= 0 && overTree(t));
    Snow.setHover(mx, my);
  }
  function queueHover() { if ((trees.length || Snow.hasPile()) && !hoverRaf) hoverRaf = requestAnimationFrame(checkHover); }
  document.addEventListener("mousemove", (e) => { mx = e.clientX; my = e.clientY; queueHover(); }, { passive: true, capture: true });
  document.addEventListener("mouseleave", () => { mx = my = -1; queueHover(); });
  window.addEventListener("blur", () => { mx = my = -1; queueHover(); });

  window.addEventListener("resize", () => {
    if (!box) return;
    clearTimeout(resizeT);
    resizeT = setTimeout(render, 200);
  });
  document.addEventListener("fullscreenchange", render);
  return { render };
})();
