// Santa Pop-In content script: Window-edge lights, garland with corner wreaths, a packed-snow base, and snowy pines in the bottom corners.
// Content scripts share one isolated world, so top-level names here are
// visible to the other content/*.js files (see manifest.json for load order).

// ------------------------------------------------------------- decorations
// Lights around the edge of the window and half a snowy pine in each bottom
// corner. Purely decorative: never catches a click, hidden in fullscreen.
const Decor = (() => {
  let box = null, resizeT = null, trees = [], fars = [], drifts = [], wreathing = null, hoverRaf = 0, mx = -1, my = -1;
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
    // With the packed-snow base on, the bottom edge is the ground, so no lights there.
    // With the garland on, the top string is woven into the garland instead.
    const D = settings.santaDecor;
    const sides = [
      D.garland ? null : [m, m, W - m, m],
      [W - m, m, W - m, H - m],
      D.trees ? null : [W - m, H - m, m, H - m],
      [m, H - m, m, m],
    ].filter(Boolean);
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

  // Seeded random so the garland looks the same on every page.
  function seeded(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Pine garland draped loosely across the top, hanging halfway down each side,
  // with a bowed wreath in each upper corner.
  function garland(W, H) {
    const r = seeded(1225);
    const palette = PALETTES[settings.santaDecor.lightStyle] || PALETTES.classic;
    const withLights = !!settings.santaDecor.lights;
    const mode = resolveLightMode();
    const greens = ["#185232", "#1f6a3e", "#2a7d4a", "#3a8f55", "#123d24"];
    const R = Math.min(38, Math.max(26, W * 0.027)); // wreath radius
    const cx0 = R + 10, cx1 = W - R - 10, cy = R + 6;
    const pts = [];
    // Shallow swags hugging the top edge, wreath to wreath (kept tight so it never crowds the page).
    const sx0 = cx0 + R * 0.9, sx1 = cx1 - R * 0.9;
    const n = Math.max(2, Math.round((sx1 - sx0) / 430));
    const sag = Math.min(9, H * 0.012);
    for (let k = 0; k < n; k++) {
      const a = sx0 + ((sx1 - sx0) * k) / n, b = sx0 + ((sx1 - sx0) * (k + 1)) / n;
      const steps = Math.max(4, Math.round((b - a) / 7));
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        pts.push({ x: a + (b - a) * t, y: 9 + 4 * sag * t * (1 - t) });
      }
    }
    // A short tail down each side, about a quarter of the way, with a little sway.
    const drops = [];
    for (const x of [cx0 - R * 0.35, cx1 + R * 0.35]) {
      const y0 = cy + R + 20, y1 = Math.max(y0 + 40, H * 0.26);
      const steps = Math.round((y1 - y0) / 7);
      for (let i = 0; i <= steps; i++) {
        const y = y0 + ((y1 - y0) * i) / steps;
        pts.push({ x: x + Math.sin(i * 0.22) * 2.5, y });
      }
      drops.push({ x, y: y1 });
    }
    let needles = "", berries = "", bulbs = "", k = 0;
    const tuft = (x, y, count, spread, lenA, lenB) => {
      for (let j = 0; j < count; j++) {
        const ang = r() * Math.PI * 2, len = lenA + r() * lenB;
        const ox = (r() - 0.5) * spread, oy = (r() - 0.5) * spread;
        needles += `<line x1="${(x + ox).toFixed(1)}" y1="${(y + oy).toFixed(1)}" x2="${(x + ox + Math.cos(ang) * len).toFixed(1)}" y2="${(y + oy + Math.sin(ang) * len).toFixed(1)}" stroke="${greens[Math.floor(r() * greens.length)]}" stroke-width="${(1.4 + r() * 1.2).toFixed(1)}"/>`;
      }
    };
    pts.forEach((p, i) => {
      tuft(p.x, p.y, 7, 8, 6, 9);
      if (i % 13 === 5) for (let j = 0; j < 3; j++)
        berries += `<circle cx="${(p.x + (r() - 0.5) * 10).toFixed(1)}" cy="${(p.y + (r() - 0.5) * 10).toFixed(1)}" r="${(2 + r()).toFixed(1)}" fill="#c8102e" stroke="#7a0a1c" stroke-width=".7"/>`;
      if (withLights && i % 6 === 2) {
        // The window lights, woven into the garland: same bulbs, colors and mode.
        const c = palette[k % palette.length];
        const delayStyle = mode === "chase" ? ` style="animation-delay:${((k % 12) * -0.15).toFixed(2)}s"` : "";
        bulbs += `<g transform="translate(${(p.x + (r() - 0.5) * 5).toFixed(1)},${(p.y + 4).toFixed(1)}) rotate(${((r() - 0.5) * 30).toFixed(0)})">` +
          `<g class="bulb k${k % 4}"${delayStyle}>` +
          `<rect x="-2.6" y="-6" width="5.2" height="4" rx="1" fill="#3a4a3a"/>` +
          `<ellipse cx="0" cy="3" rx="4" ry="6" fill="${c}" filter="url(#gglow)"/>` +
          `<ellipse cx="-1.3" cy="1" rx="1.1" ry="2" fill="#fff" opacity=".55"/></g></g>`;
        k++;
      } else if (!withLights && i % 9 === 0) {
        const c = palette[k++ % palette.length];
        bulbs += `<circle class="gbulb k${k % 4}" cx="${(p.x + (r() - 0.5) * 6).toFixed(1)}" cy="${(p.y + 3 + r() * 3).toFixed(1)}" r="3" fill="${c}" filter="url(#gglow)"/>`;
      }
    });
    // A pine cone and berries at the bottom of each side drop.
    for (const d of drops) {
      tuft(d.x, d.y + 4, 14, 10, 5, 8);
      berries += `<ellipse cx="${d.x}" cy="${d.y + 14}" rx="4.5" ry="7" fill="#6b4226" stroke="#3f2614" stroke-width="1"/>`;
      for (let j = 0; j < 3; j++) berries += `<circle cx="${d.x - 5 + j * 5}" cy="${d.y + 4 + (j % 2) * 3}" r="2.6" fill="#d4142f" stroke="#7a0a1c" stroke-width=".7"/>`;
    }
    const wreath = (cx) => {
      for (let i = 0; i < 64; i++) {
        const t = (i / 64) * Math.PI * 2;
        tuft(cx + Math.cos(t) * (R - 4), cy + Math.sin(t) * (R - 4), 3, 3, 6, 7);
        tuft(cx + Math.cos(t) * (R + 3), cy + Math.sin(t) * (R + 3), 3, 3, 6, 8);
      }
      for (let i = 0; i < 10; i++) {
        const t = r() * Math.PI * 2, rad = R + (r() - 0.5) * 9;
        berries += `<circle cx="${(cx + Math.cos(t) * rad).toFixed(1)}" cy="${(cy + Math.sin(t) * rad).toFixed(1)}" r="${(2.2 + r()).toFixed(1)}" fill="#d4142f" stroke="#7a0a1c" stroke-width=".7"/>`;
      }
      const s = R / 34;
      berries += `<g transform="translate(${cx} ${cy + R - 2}) scale(${s.toFixed(2)})">` +
        `<path d="M0 0 C-10 -14 -30 -12 -26 0 C-30 12 -10 14 0 0 Z" fill="#c8102e" stroke="#7a0a1c" stroke-width="1.2"/>` +
        `<path d="M0 0 C10 -14 30 -12 26 0 C30 12 10 14 0 0 Z" fill="#c8102e" stroke="#7a0a1c" stroke-width="1.2"/>` +
        `<path d="M-3 2 L-12 26 L-6 22 L-3 28 Z M3 2 L12 26 L6 22 L3 28 Z" fill="#b00d27" stroke="#7a0a1c" stroke-width="1"/>` +
        `<circle r="5" fill="#e01b3a" stroke="#7a0a1c" stroke-width="1.2"/></g>`;
    };
    wreath(cx0);
    wreath(cx1);
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", withLights ? (mode === "chase" ? "garland chase" : mode === "twinkle" ? "garland blink" : "garland") : "garland");
    svg.setAttribute("width", W);
    svg.setAttribute("height", H);
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.innerHTML =
      `<defs><filter id="gglow" x="-150%" y="-150%" width="400%" height="400%">` +
      `<feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>` +
      `<g stroke-linecap="round">${needles}</g>${berries}${bulbs}`;
    return svg;
  }

  // A thin strip of packed snow along the bottom: the ground the scene stands on.
  // Fresh snow piles on top of it and the blower clears only the fresh snow.
  function snowBase(W) {
    const r = seeded(77), Hs = 16;
    let d = `M0,${Hs}`;
    for (let x = 0; x <= W; x += 24) d += ` L${x},${(Hs - 7 - Math.sin(x / 90) * 1.6 - r() * 2.2).toFixed(1)}`;
    d += ` L${W},${Hs} Z`;
    let glints = "";
    for (let i = 0; i < Math.round(W / 70); i++)
      glints += `<circle class="glint k${i % 4}" cx="${(r() * W).toFixed(0)}" cy="${(Hs - 2 - r() * 4).toFixed(1)}" r="${(0.6 + r() * 0.7).toFixed(1)}" fill="#fff"/>`;
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "snowbase");
    svg.setAttribute("width", W);
    svg.setAttribute("height", Hs);
    svg.setAttribute("viewBox", `0 0 ${W} ${Hs}`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.innerHTML =
      `<defs><linearGradient id="sbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/>` +
      `<stop offset=".55" stop-color="#eef4fb"/><stop offset="1" stop-color="#cfdcec"/></linearGradient></defs>` +
      `<path d="${d}" fill="url(#sbg)" stroke="#dbe6f3" stroke-width=".8"/>${glints}`;
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
      (settings.santaDecor.lights || settings.santaDecor.trees || settings.santaDecor.garland);
    clear();
    if (!want) return;
    ensureStage();
    box = el("div", { className: "decor" });
    layer.prepend(box);
    if (settings.santaDecor.trees) box.append(snowBase(window.innerWidth));
    if (settings.santaDecor.garland) box.append((wreathing = garland(window.innerWidth, window.innerHeight)));
    if (settings.santaDecor.lights) box.append(lights(window.innerWidth, window.innerHeight));
    if (settings.santaDecor.trees) {
      // A faint smaller pine behind each corner tree on a soft snow drift, for depth.
      for (const side of ["l", "r"]) {
        const back = el("div", { className: `tree-far ${side}` }, box);
        fars.push(back);
        drifts.push(el("div", { className: `drift ${side}` }, box));
        el("img", { className: "tree-img", src: url("images/pine.webp"), alt: "" }, back);
      }
      trees = [createTree("l"), createTree("r")];
    }
  }

  function clear() {
    clearTimeout(resizeT);
    resizeT = null;
    if (hoverRaf) cancelAnimationFrame(hoverRaf);
    hoverRaf = 0;
    box?.remove();
    box = null;
    trees = [];
    fars = [];
    drifts = [];
    wreathing = null;
    mx = my = -1;
  }

  function overTree(t) {
    const r = t.getBoundingClientRect();
    const sc = t.classList.contains("back") && !t.classList.contains("tree-far") ? 0.9 : 1;
    const fullH = r.height / sc;
    const fullW = r.width / sc;
    const left = t.classList.contains("l") ? r.left : r.right - fullW;
    const top = r.bottom - fullH;
    if (mx < left || mx > left + fullW || my < top || my > r.bottom) return false;
    const cx = left + fullW / 2, depth = (my - top) / fullH;
    return Math.abs(mx - cx) <= (fullW / 2) * Math.min(1, 0.15 + depth * 1.05) + 12;
  }
  function checkHover() {
    hoverRaf = 0;
    // Pointer over either pine on a side: that whole corner (front tree, far tree, drift) steps back.
    for (const side of ["l", "r"]) {
      const group = [...trees, ...fars].filter((t) => t.classList.contains(side));
      const over = mx >= 0 && group.some(overTree);
      for (const t of group) t.classList.toggle("back", over);
      drifts.find((d) => d.classList.contains(side))?.classList.toggle("back", over);
    }
    if (wreathing) {
      // Fade the garland while the pointer is near it, so menus underneath stay easy to see.
      const W = window.innerWidth, H = window.innerHeight;
      const near = mx >= 0 && (my < 80 || (my < H * 0.5 + 30 && (mx < 56 || mx > W - 56)));
      wreathing.classList.toggle("back", near);
    }
    Snow.setHover(mx, my);
  }
  function queueHover() { if ((trees.length || wreathing || Snow.hasPile()) && !hoverRaf) hoverRaf = requestAnimationFrame(checkHover); }
  document.addEventListener("mousemove", (e) => { mx = e.clientX; my = e.clientY; queueHover(); }, { passive: true, capture: true });
  document.addEventListener("mouseleave", () => { mx = my = -1; queueHover(); });
  window.addEventListener("blur", () => { mx = my = -1; queueHover(); });

  window.addEventListener("resize", () => {
    if (!box) return;
    clearTimeout(resizeT);
    resizeT = setTimeout(render, 200);
  });
  document.addEventListener("fullscreenchange", render);
  return { render, clear };
})();
