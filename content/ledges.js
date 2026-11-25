// Santa Pop-In content script: Snow that settles on top of page cards, and the elves who sweep it off.
// Content scripts share one isolated world, so top-level names here are
// visible to the other content/*.js files (see manifest.json for load order).

// Flakes from a cloud can land on the top edge of a card (a box with a shadow,
// rounded corners, or a border) and pile up there instead of reaching the
// ground. The caps ride along when the page scrolls. Clicking one, or the
// cloud leaving, sends a little elf or two to pop up and sweep it away.
const Ledges = (() => {
  const COL = 3; // px per height column
  const MAX = 14; // cards watched at once
  const CAP = 90; // safety ceiling only; the real limit is the slope snow can hold
  const SLOPE = 1.9; // px of rise per column (~32 degrees, snow's angle of repose)
  const LIP = 1.5; // snow right at a card edge slides off
  const ELF_RATIO = 227 / 200; // elf sprite width / height
  let list = []; // { el, h, rect, hit, sweeping }
  let lastScan = 0;
  let sweeps = 0;
  let gen = 0;
  let scrollQueued = false;

  const on = () => settings.santaActs.cardSnow !== false;

  function cardRect(e) {
    if (e === document.body || e === document.documentElement || e === host) return null;
    const r = e.getBoundingClientRect();
    const W = window.innerWidth, H = window.innerHeight;
    if (r.width < 140 || r.width > W - 8 || r.height < 48 || r.height > H * 0.95) return null;
    if (r.top < 40 || r.top > H - 60 || r.right < 0 || r.left > W) return null;
    const cs = getComputedStyle(e);
    if (cs.visibility === "hidden" || Number(cs.opacity) < 0.5 || cs.position === "fixed") return null;
    if (e.tagName === "IMG") return r.width >= 160 ? r : null;
    const radius = parseFloat(cs.borderTopLeftRadius) || 0;
    const shadow = cs.boxShadow && cs.boxShadow !== "none";
    const border = (parseFloat(cs.borderTopWidth) || 0) > 0 && cs.borderTopStyle !== "none";
    const bg = cs.backgroundColor && !/^transparent$|rgba\([^)]*,\s*0\)$/.test(cs.backgroundColor);
    return shadow || (radius >= 4 && (bg || border)) || (border && bg) ? r : null;
  }

  // Look for cards by sampling the visible page on a coarse grid.
  function scan() {
    const W = window.innerWidth, H = window.innerHeight;
    const seen = new Set(list.map((l) => l.el));
    for (let y = 70; y < H - 60 && list.length < MAX; y += 70) {
      for (let x = 30; x < W - 30 && list.length < MAX; x += 70) {
        let e = document.elementFromPoint(x, y);
        for (let k = 0; e && k < 8; k++, e = e.parentElement) {
          if (e === host || seen.has(e)) break;
          if (cardRect(e)) {
            seen.add(e);
            list.push({ el: e, h: null, rect: null, hit: null, sweeping: false });
            break;
          }
        }
      }
    }
  }

  function measure(l) {
    if (!l.el.isConnected) return (l.rect = null);
    const r = l.el.getBoundingClientRect();
    const n = Math.ceil(r.width / COL) + 1;
    if (!l.h) l.h = new Float32Array(n);
    else if (l.h.length !== n) {
      const old = l.h, next = new Float32Array(n);
      for (let i = 0; i < n; i++) next[i] = old[Math.floor((i / n) * old.length)];
      l.h = next;
    }
    l.rect = r;
    return r;
  }

  const snowy = (l) => l.h && l.h.some((v) => v > 0.4);
  const any = () => list.some(snowy);
  const busy = () => sweeps > 0;

  // Called every snow frame: keep card positions fresh, look for new cards while it snows.
  function frame(snowing) {
    if (!on()) return;
    const now = performance.now();
    if (snowing && now - lastScan > 900) {
      lastScan = now;
      scan();
    }
    list = list.filter((l) => l.el.isConnected || snowy(l));
    list.forEach(measure);
  }

  // Natural pile: no flat lid. Snow heaps up until a side gets steeper than it can
  // hold, then slides to the neighbours (and off the card's edges).
  function capAt(l, i) {
    const n = l.h.length;
    const fromEnd = Math.min(i, n - 1 - i);
    return Math.min(CAP, LIP + fromEnd * SLOPE);
  }
  function settle(l, i) {
    const h = l.h, n = h.length;
    const a = Math.max(0, i - 40), b = Math.min(n - 1, i + 40);
    for (let pass = 0; pass < 6; pass++) {
      let moved = false;
      for (let j = a; j < b; j++) {
        const d = h[j] - h[j + 1];
        if (Math.abs(d) > SLOPE) {
          const m = (Math.abs(d) - SLOPE) / 2;
          if (d > 0) { h[j] -= m; h[j + 1] += m; } else { h[j] += m; h[j + 1] -= m; }
          moved = true;
        }
      }
      if (!moved) break;
    }
    for (let j = a; j <= b; j++) h[j] = Math.min(h[j], capAt(l, j));
  }

  function catchFlake(f, prevY) {
    if (!on()) return false;
    for (const l of list) {
      const r = l.rect;
      if (!r || l.sweeping || f.x < r.left + 1 || f.x > r.right - 1) continue;
      const i = Math.floor((f.x - r.left) / COL);
      const top = r.top - l.h[i];
      if (prevY < top && f.y >= top) {
        const spread = [0.3, 0.7, 1, 0.7, 0.3];
        for (let k = -2; k <= 2; k++) {
          const j = i + k;
          if (j < 0 || j >= l.h.length) continue;
          l.h[j] = l.h[j] + f.r * 0.55 * spread[k + 2];
        }
        settle(l, i);
        return true;
      }
    }
    return false;
  }

  function draw(ctx) {
    const H = window.innerHeight;
    for (const l of list) {
      const r = l.rect;
      if (!r || !snowy(l) || r.bottom < 0 || r.top > H + CAP) {
        if (l.hit) l.hit.style.display = "none";
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(r.left, r.top + 1);
      let peak = 0;
      for (let i = 0; i < l.h.length; i++) {
        ctx.lineTo(Math.min(r.right, r.left + i * COL), r.top - l.h[i]);
        peak = Math.max(peak, l.h[i]);
      }
      ctx.lineTo(r.right, r.top + 1);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, r.top - peak, 0, r.top + 1);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(1, "#e3ebf6");
      ctx.fillStyle = grad;
      ctx.save();
      ctx.shadowColor = "rgba(70,100,150,.45)";
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = -1;
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = "rgba(110,140,185,.7)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      placeHit(l, r, peak);
    }
  }

  // A thin clickable strip over the cap, just the snow, so the card itself stays usable.
  function placeHit(l, r, peak) {
    if (!layer || !layer.isConnected) return;
    if (!l.hit) {
      l.hit = el("div", {
        className: "ledgehit",
        title: settings.santaActs.elves ? "Click and the elves will sweep it off" : "Click to clear the snow",
      });
      l.hit.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        sweep(l);
      });
    }
    const hgt = Math.max(6, peak + 3);
    Object.assign(l.hit.style, {
      display: l.sweeping ? "none" : "block",
      left: r.left + "px",
      width: r.width + "px",
      top: r.top - hgt + 1 + "px",
      height: hgt + "px",
    });
  }

  function onScroll() {
    if (scrollQueued || !any()) return;
    scrollQueued = true;
    requestAnimationFrame(() => {
      scrollQueued = false;
      list.forEach(measure);
      Snow.redraw();
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true, capture: true });

  function burst(x, y, n = 7) {
    for (let k = 0; k < n; k++) sparkle(x + rand(-14, 14), y + rand(-18, 6), true);
  }

  // Without elves the cap just melts away.
  function melt(l) {
    l.sweeping = true;
    const g = gen;
    const step = () => {
      if (g !== gen || !l.h) return;
      let left = 0;
      for (let i = 0; i < l.h.length; i++) {
        l.h[i] = Math.max(0, l.h[i] - 0.3 - l.h[i] * 0.05);
        left += l.h[i];
      }
      Snow.redraw();
      if (left > 0) setTimeout(step, 40);
      else l.sweeping = false;
    };
    step();
  }

  async function sweep(l) {
    if (l.sweeping || !snowy(l)) return;
    if (!settings.santaActs.elves) return melt(l);
    const r = measure(l);
    if (!r) return;
    l.sweeping = true;
    sweeps++;
    Snow.wake();
    const g = gen;
    // One elf per card surface, sweeping the whole top in the direction it faces.
    const dir = Math.random() < 0.5 ? 1 : -1;
    const jobs = [elfSweep(l, dir > 0 ? 0 : r.width, dir > 0 ? r.width : 0, dir, Math.random() < 0.5, 0, g)];
    try {
      await Promise.all(jobs);
    } finally {
      if (l.h) l.h.fill(0);
      l.sweeping = false;
      sweeps = Math.max(0, sweeps - 1);
      Snow.redraw();
    }
  }

  // Several snowy cards: each elf pops out at its own random moment within 2 seconds.
  function sweepAll() {
    const g = gen;
    list.filter(snowy).forEach((l) => setTimeout(() => g === gen && sweep(l), Math.random() * 2000));
  }

  // One elf: sparkle, pop up from behind the card's top edge, sweep a stretch, sparkle away.
  async function elfSweep(l, x0, x1, dir, girl, delay, g) {
    await sleep(delay);
    if (g !== gen || !l.rect) return;
    const hgt = Math.round(92 * sizeScale());
    const wid = Math.round(hgt * ELF_RATIO);
    // The broom tip sits near the sprite's right edge when facing right.
    const tip = wid * 0.46;
    const box = el("div", { className: "elfbox", style: `width:${wid}px;height:${hgt}px;` });
    const elf = el("div", { className: "elf", style: `width:${wid}px;` }, box);
    // Facing is on its own wrapper so the pop-up and stride animations can't undo the flip.
    const face = el("div", { className: "elf-face", style: dir < 0 ? "transform:scaleX(-1)" : "" }, elf);
    const kid = girl ? "elf-girl" : "elf-boy";
    for (const [part, cls] of [["leg", "leg far"], ["leg", "leg"], ["body", "body"], ["arms", "arms"]]) {
      el("img", { src: url(`images/${kid}-${part}.webp`), alt: "", className: cls }, face);
    }
    // Start a little in from the edge, where there's snow to come up out of.
    let x = x0 + dir * wid * 0.4;
    // Columns under the elf's feet (the back half of the sprite, behind the broom).
    const feet = () => {
      const a = Math.floor((dir > 0 ? x - wid * 0.5 : x) / COL), b = Math.ceil((dir > 0 ? x : x + wid * 0.5) / COL);
      return [Math.max(0, a), Math.min(l.h.length - 1, b)];
    };
    const surface = () => {
      const [a, b] = feet();
      let m = 0;
      for (let i = a; i <= b; i++) m = Math.max(m, l.h[i]);
      return m;
    };
    // The box's bottom edge is the snow surface, so the elf is hidden below it: it comes up out of the snow.
    const place = () => {
      const r = l.rect;
      if (!r) return false;
      box.style.left = r.left + x - wid / 2 - dir * wid * 0.08 + "px";
      box.style.top = r.top - hgt + "px";
      box.style.height = Math.max(0, hgt - surface()) + "px";
      return true;
    };
    place();
    const r0 = l.rect;
    burst(r0.left + x, r0.top - surface() - 6);
    try {
      await elf.animate([{ transform: "translateY(100%)" }, { transform: "translateY(0)" }],
        { duration: 650, easing: "cubic-bezier(.25,1.3,.45,1)", fill: "forwards" }).finished;
      // Shake off the snow it came up through.
      {
        const [a, b] = feet();
        let lifted = 0;
        for (let i = a; i <= b; i++) { lifted += l.h[i]; l.h[i] = 0; }
        if (lifted > 0.5 && l.rect) {
          Snow.kick(l.rect.left + x - dir * wid * 0.25, l.rect.top - 4, -dir, Math.min(5, 2 + Math.floor(lifted / 20)));
          Snow.kick(l.rect.left + x, l.rect.top - 4, dir, 2);
        }
        Snow.redraw();
        place();
      }
      const speed = Math.max(120, Math.abs(x1 - x0) / 3.5); // one elf does the whole card in a few seconds
      let last = performance.now();
      await new Promise((resolve) => {
        const step = (now) => {
          if (g !== gen || !place()) return resolve();
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          const nx = x + dir * speed * dt;
          const done = dir > 0 ? nx >= x1 : nx <= x1;
          x = done ? x1 : nx;
          const r = l.rect;
          const front = x + dir * tip;
          const a = Math.floor(Math.min(x, front) / COL), b = Math.ceil(Math.max(x, front) / COL);
          let moved = 0;
          for (let i = Math.max(0, a); i <= Math.min(l.h.length - 1, b); i++) {
            moved += l.h[i];
            l.h[i] = 0;
          }
          if (moved > 0.5 || Math.random() < 0.25) {
            Snow.kick(r.left + front, r.top - 3, -dir, Math.min(4, 1 + Math.floor(moved / 6)));
          }
          Snow.redraw();
          if (done) resolve();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
      if (g !== gen) return;
      await sleep(180);
      if (l.rect) burst(l.rect.left + x, l.rect.top - hgt * 0.5, 9);
      await elf.animate([{ transform: "scale(1)", opacity: 1 }, { transform: "scale(.2) translateY(30%)", opacity: 0 }],
        { duration: 320, easing: "ease-in", fill: "forwards" }).finished;
    } catch (_) {
      // Aborted when the stage was torn down.
    } finally {
      box.remove();
    }
  }

  function clear() {
    gen++;
    sweeps = 0;
    list.forEach((l) => l.hit?.remove());
    list = [];
  }

  return { frame, catchFlake, draw, any, busy, sweepAll, clear };
})();
