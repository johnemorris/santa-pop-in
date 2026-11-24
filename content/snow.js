// Santa Pop-In content script: Snowflakes and the snow pile that builds along the bottom of the page.
// Content scripts share one isolated world, so top-level names here are
// visible to the other content/*.js files (see manifest.json for load order).

// --------------------------------------------------------------------- snow
// Faint flakes fall only from under a passing cloud, land, and pile up along
// the bottom, deeper toward the corners. The pile stays until it's clicked.
// Pre-drawn snowflake crystals: white arms with a soft blue-grey edge so
// they read on light and dark pages. Drawn once, then stamped per flake.
const FLAKE_KINDS = 3;
let flakeSpriteCache = null;
function flakeSprites() {
  if (flakeSpriteCache) return flakeSpriteCache;
  flakeSpriteCache = [];
  const S = 64, c = S / 2, L = 27;
  for (let kind = 0; kind < FLAKE_KINDS; kind++) {
    const cv = document.createElement("canvas");
    cv.width = cv.height = S;
    const g = cv.getContext("2d");
    g.lineCap = "round";
    const arms = () => {
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3, ux = Math.cos(a), uy = Math.sin(a);
        g.moveTo(c, c);
        g.lineTo(c + ux * L, c + uy * L);
        const branches = kind === 0 ? [[0.52, 0.34]] : kind === 1 ? [[0.68, 0.3]] : [];
        for (const [at, len] of branches) {
          const bx = c + ux * L * at, by = c + uy * L * at;
          for (const s of [-1, 1]) {
            const ba = a + s * (Math.PI / 3.2);
            g.moveTo(bx, by);
            g.lineTo(bx + Math.cos(ba) * L * len, by + Math.sin(ba) * L * len);
          }
        }
      }
    };
    g.strokeStyle = "rgba(74,106,156,.92)";
    g.lineWidth = 10;
    arms(); g.stroke();
    g.strokeStyle = "#f2f8ff";
    g.lineWidth = 5.5;
    arms(); g.stroke();
    if (kind === 2) { // small hexagon hub
      g.beginPath();
      for (let i = 0; i < 6; i++) g.lineTo(c + Math.cos((i * Math.PI) / 3) * 9, c + Math.sin((i * Math.PI) / 3) * 9);
      g.closePath(); g.fillStyle = "#f2f8ff"; g.fill();
      g.strokeStyle = "rgba(74,106,156,.92)"; g.lineWidth = 2.5; g.stroke();
    }
    flakeSpriteCache.push(cv);
  }
  return flakeSpriteCache;
}

const Snow = (() => {
  const COL = 4; // px per height column
  const HIT = 40; // px per clickable pile segment
  let canvas, ctx, W = 0, H = 0, dpr = 1;
  let heights = new Float32Array(0);
  let flakes = [];
  let puffs = [];
  let emitters = [];
  let blower = null;
  let raf = null, last = 0;
  let fading = false, fadeTimer = null;
  let hits = [], hitsDirty = false, hitsTimer = null;

  function edge(x) {
    const e = Math.min(1, Math.abs(x / W - 0.5) * 2);
    return e * e * e;
  }
  const cap = (x) => 8 + 44 * edge(x);
  const weight = (x) => 0.45 + 3.6 * edge(x);

  function ensure() {
    if (canvas && canvas.isConnected) return;
    canvas = el("canvas", { className: "snow" });
    ctx = canvas.getContext("2d");
    resize();
  }

  function resize() {
    if (!canvas) return;
    const nW = window.innerWidth, nH = window.innerHeight;
    dpr = window.devicePixelRatio || 1;
    canvas.width = nW * dpr;
    canvas.height = nH * dpr;
    canvas.style.width = nW + "px";
    canvas.style.height = nH + "px";
    const n = Math.ceil(nW / COL) + 1;
    if (heights.length && heights.length !== n) {
      const old = heights, next = new Float32Array(n);
      for (let i = 0; i < n; i++) next[i] = old[Math.floor((i / n) * old.length)];
      heights = next;
    } else if (!heights.length) heights = new Float32Array(n);
    W = nW; H = nH;
    draw();
    markHits();
  }

  function heightAt(x) {
    if (!heights.length || !W) return 0;
    const i = Math.max(0, Math.min(heights.length - 1, Math.floor(x / COL)));
    return heights[i];
  }

  const hasPile = () => heights.some((h) => h > 0.3);

  function deposit(x, amount) {
    const c = Math.floor(x / COL);
    const spread = [0.25, 0.6, 1, 0.6, 0.25];
    for (let k = -2; k <= 2; k++) {
      const i = c + k;
      if (i < 0 || i >= heights.length) continue;
      heights[i] = Math.min(cap(i * COL), heights[i] + amount * spread[k + 2]);
    }
    markHits();
  }

  function settle() {
    for (let i = 0; i < heights.length - 1; i++) {
      const d = heights[i] - heights[i + 1];
      if (Math.abs(d) > 1.2) {
        const m = d * 0.18;
        heights[i] -= m;
        heights[i + 1] += m;
      }
    }
  }

  // Clickable strips over the top of the pile. Only where there's real snow,
  // and only a thin band, so the page underneath stays usable.
  function markHits() {
    hitsDirty = true;
    if (!hitsTimer) hitsTimer = setTimeout(rebuildHits, 300);
  }
  function rebuildHits() {
    hitsTimer = null;
    if (!hitsDirty) return;
    hitsDirty = false;
    hits.forEach((h) => h.remove());
    hits = [];
    if (!layer || !layer.isConnected || !W) return;
    for (let x = 0; x < W; x += HIT) {
      let top = 0;
      for (let i = Math.floor(x / COL); i < Math.min(heights.length, Math.floor((x + HIT) / COL)); i++)
        top = Math.max(top, heights[i]);
      if (top < 4) continue;
      const h = el("div", {
        className: "pilehit",
        title: settings.santaActs.blower ? "Click to call Santa and his leaf blower" : "Click to clear the snow",
        style: `left:${x}px;width:${HIT}px;height:${Math.min(top, 18)}px;bottom:${Math.max(0, top - 18)}px;`,
      });
      h.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        onPileClick(x + HIT / 2);
      });
      hits.push(h);
    }
  }

  function draw() {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (hasPile()) {
      const top = Math.max(...heights);
      const g = ctx.createLinearGradient(0, H - top, 0, H);
      g.addColorStop(0, "rgba(255,255,255,.95)");
      g.addColorStop(1, "rgba(226,234,245,.92)");
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let i = 0; i < heights.length; i++) ctx.lineTo(i * COL, H - heights[i]);
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
      ctx.beginPath();
      for (let i = 0; i < heights.length; i++) {
        const y = H - heights[i];
        i ? ctx.lineTo(i * COL, y) : ctx.moveTo(0, y);
      }
      ctx.save();
      ctx.shadowColor = "rgba(90,120,160,.35)";
      ctx.shadowBlur = 4;
      ctx.strokeStyle = "rgba(130,155,190,.5)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
    // Falling flakes
    const sprites = flakeSprites();
    for (const f of flakes) {
      const size = f.r * 4.6; // six-armed crystal; arms need a little more room than a dot
      ctx.globalAlpha = Math.max(0, f.a);
      ctx.setTransform(dpr, 0, 0, dpr, f.x * dpr, f.y * dpr);
      ctx.rotate(f.rot);
      ctx.drawImage(sprites[f.kind], -size / 2, -size / 2, size, size);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Snow kicked up by the blower, and the wind streaks.
    for (const p of puffs) {
      const k = Math.max(0, 1 - p.age / p.life);
      ctx.globalAlpha = k * p.a;
      if (p.streak) {
        ctx.strokeStyle = "#9fb4cf";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.06, p.y - p.vy * 0.06);
        ctx.stroke();
      } else {
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = p.powder ? "#8fa6c4" : "#a9bbd3";
        ctx.lineWidth = p.powder ? 0.8 : 0.6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (1 + (p.powder ? 0.6 : 1) * p.age), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    for (const em of emitters) {
      const s = em.span();
      if (!s || s.x1 < 0 || s.x0 > W) continue;
      let n = em.rate * dt;
      while (n > 0) {
        if (Math.random() < n && flakes.length < 700) {
          flakes.push({
            x: rand(s.x0, s.x1), y: s.y, r: rand(1.3, 3), a: rand(0.8, 1),
            vy: rand(30, 55), phase: Math.random() * 6.28, sway: rand(8, 20),
            rot: Math.random() * Math.PI, spin: rand(-1.2, 1.2), kind: Math.floor(Math.random() * FLAKE_KINDS),
          });
        }
        n -= 1;
      }
    }

    for (let i = flakes.length - 1; i >= 0; i--) {
      const f = flakes[i];
      if (f.evap) {
        f.a -= dt * 2.2;
        f.r *= 1 - dt * 0.8;
        if (f.a <= 0) { flakes.splice(i, 1); continue; }
      }
      f.phase += dt * 1.5;
      f.rot += f.spin * dt;
      f.y += f.vy * dt;
      f.x += Math.sin(f.phase) * f.sway * dt;
      if (f.y >= H - heightAt(f.x) - f.r) {
        if (!f.evap && f.x >= 0 && f.x <= W) deposit(f.x, f.r * 1.1 * weight(f.x));
        flakes.splice(i, 1);
      }
    }

    const b = blower && blower();
    if (b) {
      // Blast snow + any resting candy canes in front of the nozzle.
      blowCanes(b);
      const reach = 110;
      const a = b.dir < 0 ? b.x - reach : b.x - 8;
      const z = b.dir < 0 ? b.x + 8 : b.x + reach;
      let moved = 0;
      for (let i = Math.max(0, Math.floor(a / COL)); i <= Math.min(heights.length - 1, Math.floor(z / COL)); i++) {
        const take = Math.min(heights[i], 160 * dt + heights[i] * 4 * dt);
        heights[i] -= take;
        moved += take;
      }
      if (moved > 0) markHits();
      const kick = Math.min(14, moved * 0.5);
      for (let k = 0; k < kick; k++) {
        puffs.push({
          x: rand(a, z), y: H - rand(0, 10), r: rand(1, 2.6), a: rand(0.5, 0.85),
          vx: b.dir * rand(140, 380), vy: -rand(40, 170), age: 0, life: rand(0.8, 1.6),
        });
      }
      if (Math.random() < dt * 22) {
        puffs.push({
          streak: true, x: b.x, y: b.y + rand(-4, 6), a: 0.45,
          vx: b.dir * rand(380, 520), vy: rand(-20, 30), age: 0, life: rand(0.25, 0.45),
        });
      }
    }

    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i];
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (!p.streak) { p.vy += 120 * dt; p.vx *= 1 - 1.2 * dt; }
      if (p.age >= p.life) puffs.splice(i, 1);
    }

    settle();
    draw();
    if (emitters.length || flakes.length || puffs.length || blower) {
      raf = requestAnimationFrame(tick);
    } else {
      raf = null;
    }
  }

  function wake() {
    ensure();
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  }

  function emit(span, rate) {
    const em = { span, rate, stop: () => (emitters = emitters.filter((e) => e !== em)) };
    emitters.push(em);
    fading = false;
    clearTimeout(fadeTimer);
    fadeTimer = null;
    wake();
    return em;
  }

  function setBlower(fn) {
    blower = fn;
    if (fn) wake();
  }

  function fadePile() {
    if (fading || !hasPile()) return;
    fading = true;
    const step = () => {
      if (!fading) return;
      let left = 0;
      for (let i = 0; i < heights.length; i++) {
        heights[i] = Math.max(0, heights[i] - 0.25 - heights[i] * 0.03);
        left += heights[i];
      }
      draw();
      markHits();
      if (left > 0) fadeTimer = setTimeout(step, 40);
      else { fading = false; fadeTimer = null; }
    };
    step();
  }

  function seed() {
    ensure();
    for (let i = 0; i < heights.length; i++) heights[i] = Math.max(heights[i], cap(i * COL) * 0.55);
    draw();
    markHits();
  }

  function clear() {
    flakes = [];
    puffs = [];
    emitters = [];
    blower = null;
    fading = false;
    clearTimeout(fadeTimer);
    fadeTimer = null;
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    heights.fill(0);
    clearTimeout(hitsTimer);
    hitsTimer = null;
    hitsDirty = false;
    hits.forEach((h) => h.remove());
    hits = [];
    canvas?.remove();
    canvas = ctx = null;
  }

  window.addEventListener("resize", resize);

  function kick(x, y, dir, n = 3) {
    for (let k = 0; k < n && puffs.length < 260; k++) {
      puffs.push({
        x: x + rand(-8, 8), y: y + rand(-8, 6), r: rand(1.4, 3.4), a: rand(0.6, 0.95), powder: true,
        vx: -dir * rand(60, 200), vy: rand(-70, 5), age: 0, life: rand(1.1, 2.0),
      });
    }
    wake();
  }

  function evaporate() {
    flakes.forEach((f) => (f.evap = true));
    if (flakes.length) wake();
  }

  function setHover(mx, my) {
    if (!canvas) return;
    const over = mx >= 0 && my >= 0 && hasPile() && heightAt(mx) > 2 && my >= H - heightAt(mx) - 10;
    canvas.classList.toggle("back", over);
  }

  return { emit, setBlower, fadePile, seed, clear, heightAt, hasPile, kick, evaporate, setHover };
})();
