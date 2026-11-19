// Santa Pop-In content script
// Everything lives in one fixed, click-through layer inside a Shadow DOM so
// page CSS can't bend Santa and Santa's CSS can't leak into the page.
(function () {
  if (window.__santaPopInLoaded) return;
  window.__santaPopInLoaded = true;

  // ---------------------------------------------------------------- settings
  const DEFAULTS = {
    santaEnabled: true,
    santaFreq: 3, // 1 = rare ... 5 = often
    santaActs: {
      peek: true,
      walk: true,
      sleigh: true,
      cloud: true,
      canes: true,
      dance: true,
    },
  };

  // Minutes of *visible* tab time between appearances, per slider step.
  const FREQ_MINUTES = {
    1: [10, 20],
    2: [5, 10],
    3: [3, 6],
    4: [1.5, 3],
    5: [0.66, 1.5],
  };

  // How often each scheduled act is picked (among the ones switched on).
  const ACT_WEIGHTS = { peek: 50, walk: 25, sleigh: 12, cloud: 13 };

  let settings = structuredClone(DEFAULTS);

  const url = (p) => chrome.runtime.getURL(p);
  const rand = (a, b) => a + Math.random() * (b - a);
  const sleep = (ms, signal) =>
    new Promise((resolve) => {
      const t = setTimeout(resolve, ms);
      signal?.addEventListener("abort", () => {
        clearTimeout(t);
        resolve();
      });
    });

  // ------------------------------------------------------------------- stage
  let host, root, layer;

  const CSS = `
    :host { all: initial; }
    .layer { position: fixed; inset: 0; pointer-events: none; overflow: hidden; }
    .actor { position: fixed; left: 0; will-change: transform; }
    img, svg { display: block; max-width: none; max-height: none; user-select: none;
               -webkit-user-drag: none; border: 0; }
    .click { pointer-events: auto; cursor: pointer; }
    .waddle { animation: waddle 0.55s ease-in-out infinite; transform-origin: 50% 100%; }
    .gallop { animation: gallop 0.32s ease-in-out infinite; }
    .bob    { animation: bob 3s ease-in-out infinite; }
    @keyframes waddle {
      0%, 100% { transform: translateY(0) rotate(-2.5deg); }
      50%      { transform: translateY(-6px) rotate(2.5deg); }
    }
    @keyframes gallop {
      0%, 100% { transform: translateY(0) rotate(0); }
      50%      { transform: translateY(-4px) rotate(-0.6deg); }
    }
    @keyframes bob {
      0%, 100% { transform: translateY(0); }
      50%      { transform: translateY(-5px); }
    }
    .note { position: fixed; font: 700 20px/1 system-ui, sans-serif; color: #c1121f;
            text-shadow: 0 1px 2px rgba(0,0,0,.25); pointer-events: none; }
    canvas.snow { position: fixed; left: 0; top: 0; pointer-events: none; }
  `;

  function ensureStage() {
    if (host && host.isConnected) return layer;
    host = document.createElement("santa-pop-in");
    host.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;pointer-events:none;display:block;";
    root = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = CSS;
    layer = document.createElement("div");
    layer.className = "layer";
    root.append(style, layer);
    (document.body || document.documentElement).appendChild(host);
    return layer;
  }

  function el(tag, props = {}, parent) {
    const n = document.createElement(tag);
    Object.assign(n, props);
    if (props.style) n.style.cssText = props.style;
    (parent || ensureStage()).appendChild(n);
    return n;
  }

  // Resolve when an animation finishes or the act is aborted.
  function played(anim, signal) {
    return new Promise((resolve) => {
      anim.onfinish = resolve;
      anim.oncancel = resolve;
      signal?.addEventListener("abort", () => anim.cancel());
    });
  }

  // ------------------------------------------------------------ click dance
  const NOTES = ["♪", "♫", "♬"];

  function spawnNotes(target, count = 6) {
    const r = target.getBoundingClientRect();
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        const n = el("div", {
          className: "note",
          textContent: NOTES[i % NOTES.length],
          style: `left:${r.left + r.width * rand(0.2, 0.8)}px;top:${r.top + r.height * 0.2}px;`,
        });
        n.animate(
          [
            { transform: "translate(0,0) rotate(0)", opacity: 1 },
            {
              transform: `translate(${rand(-40, 40)}px,-90px) rotate(${rand(-30, 30)}deg)`,
              opacity: 0,
            },
          ],
          { duration: 1400, easing: "ease-out" }
        ).onfinish = () => n.remove();
      }, i * 260);
    }
  }

  const DANCE_FRAMES = [
    { transform: "translateY(0) rotate(0) scaleX(1)" },
    { transform: "translateY(-14px) rotate(-12deg) scaleX(1)", offset: 0.1 },
    { transform: "translateY(0) rotate(12deg) scaleX(1)", offset: 0.2 },
    { transform: "translateY(-14px) rotate(-12deg) scaleX(1)", offset: 0.3 },
    { transform: "translateY(0) rotate(12deg) scaleX(1)", offset: 0.4 },
    { transform: "translateY(-34px) rotate(0) scaleX(1)", offset: 0.52 },
    { transform: "translateY(-34px) rotate(0) scaleX(-1)", offset: 0.62 },
    { transform: "translateY(0) rotate(0) scaleX(-1)", offset: 0.72 },
    { transform: "translateY(-12px) rotate(0) scaleX(1)", offset: 0.84 },
    { transform: "translateY(0) rotate(0) scaleX(1)" },
  ];

  const HOP_FRAMES = [
    { transform: "translateY(0)" },
    { transform: "translateY(-22px)", offset: 0.25 },
    { transform: "translateY(0)", offset: 0.5 },
    { transform: "translateY(-12px)", offset: 0.75 },
    { transform: "translateY(0)" },
  ];

  // Clicking an actor pauses its trip, plays a little routine, then carries on.
  function makeDanceable(actor, body, getTrip, frames = DANCE_FRAMES, duration = 2600) {
    let dancing = false;
    actor.classList.add("click");
    actor.title = "Click me!";
    actor.addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (dancing || !settings.santaActs.dance) return;
      dancing = true;
      const trip = getTrip();
      trip?.pause();
      const idle = body.className;
      body.className = "";
      spawnNotes(body);
      await played(body.animate(frames, { duration, easing: "ease-in-out" }));
      body.className = idle;
      if (trip && trip.playState === "paused") trip.play();
      dancing = false;
    });
  }

  // -------------------------------------------------------------- candy canes
  let caneSeq = 0;
  function caneSVG() {
    const id = `cs${++caneSeq}`;
    return `<svg width="18" height="36" viewBox="0 0 24 48" xmlns="http://www.w3.org/2000/svg">
      <defs><pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="8" height="8" fill="#fff"/><rect width="4" height="8" fill="#d62828"/></pattern></defs>
      <path d="M17 45 V14 a7 7 0 0 0 -14 0" fill="none" stroke="#9b1c1c" stroke-width="7.5" stroke-linecap="round" opacity=".35"/>
      <path d="M17 45 V14 a7 7 0 0 0 -14 0" fill="none" stroke="url(#${id})" stroke-width="6" stroke-linecap="round"/>
    </svg>`;
  }

  function dropCane(x, y) {
    const cane = el("div", { className: "actor", style: `left:${x}px;top:${y}px;` });
    cane.innerHTML = caneSVG();
    const ground = window.innerHeight - 6 - Snow.heightAt(x) - 30;
    const fall = Math.max(0, ground - y);
    const spin = Math.random() < 0.5 ? -1 : 1;
    const land = 80 * spin;
    cane
      .animate(
        [
          { transform: "translateY(0) rotate(0)" },
          { transform: `translateY(${fall}px) rotate(${land + 140 * spin}deg)`, offset: 0.6 },
          { transform: `translateY(${fall - 18}px) rotate(${land + 40 * spin}deg)`, offset: 0.75 },
          { transform: `translateY(${fall}px) rotate(${land}deg)`, offset: 0.9 },
          { transform: `translateY(${fall - 4}px) rotate(${land}deg)`, offset: 0.95 },
          { transform: `translateY(${fall}px) rotate(${land}deg)` },
        ],
        { duration: 1300, easing: "ease-in", fill: "forwards" }
      )
      .onfinish = () => {
        setTimeout(() => {
          cane.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 1200, fill: "forwards" })
            .onfinish = () => cane.remove();
        }, 7000);
      };
  }

  function scheduleCanes(actor, sackAtBack, total, signal, howMany) {
    if (!settings.santaActs.canes) return;
    for (let i = 0; i < howMany; i++) {
      sleep(rand(0.2, 0.8) * total, signal).then(() => {
        if (signal.aborted || !actor.isConnected) return;
        const r = actor.getBoundingClientRect();
        if (r.right < 0 || r.left > window.innerWidth) return;
        const x = r.left + r.width * sackAtBack();
        dropCane(x, r.top + r.height * 0.45);
      });
    }
  }

  // --------------------------------------------------------------------- acts
  let lastPeekSide = null;

  async function actPeek(signal) {
    const fromLeft =
      lastPeekSide === "left" ? false : lastPeekSide === "right" ? true : Math.random() < 0.5;
    lastPeekSide = fromLeft ? "left" : "right";

    const actor = el("div", {
      className: "actor",
      style: `bottom:15%;${fromLeft ? "left:0" : "left:auto;right:0"};`,
    });
    const body = el("img", { src: url("images/peek-santa.webp"), alt: "", style: "width:200px;height:auto;" }, actor);
    const flip = fromLeft ? " scaleX(-1)" : "";
    const hidden = fromLeft ? -220 : 220;
    const shown = fromLeft ? -50 : 50;
    const trip = actor.animate(
      [
        { transform: `translateX(${hidden}px)${flip}` },
        { transform: `translateX(${shown}px)${flip}`, offset: 0.22 },
        { transform: `translateX(${shown}px)${flip}`, offset: 0.78 },
        { transform: `translateX(${hidden}px)${flip}` },
      ],
      { duration: 6500, easing: "ease-in-out", fill: "forwards" }
    );
    makeDanceable(actor, body, () => trip, HOP_FRAMES, 1300);
    await played(trip, signal);
    actor.remove();
  }

  async function actWalk(signal) {
    const W = window.innerWidth;
    const width = Math.round(120 * rand(0.9, 1.15));
    const ltr = Math.random() < 0.5;
    const flip = ltr ? "" : " scaleX(-1)";
    const from = ltr ? -width - 10 : W + 10;
    const to = ltr ? W + 10 : -width - 10;
    const duration = ((W + width + 20) / 85) * 1000; // ~85 px/s stroll

    const actor = el("div", { className: "actor", style: `bottom:${4 + Snow.heightAt(W / 2) * 0.5}px;` });
    const body = el("img", { className: "waddle", src: url("images/santa-walk.webp"), alt: "", style: `width:${width}px;height:auto;` }, actor);
    const trip = actor.animate(
      [{ transform: `translateX(${from}px)${flip}` }, { transform: `translateX(${to}px)${flip}` }],
      { duration, easing: "linear", fill: "forwards" }
    );
    makeDanceable(actor, body, () => trip);
    // The sack is on Santa's back: left side when walking right.
    scheduleCanes(actor, () => (ltr ? 0.18 : 0.82), duration, signal, Math.floor(rand(1, 4)));
    await played(trip, signal);
    actor.remove();
  }

  async function actSleigh(signal) {
    const W = window.innerWidth;
    const width = Math.round(Math.min(320, W * 0.28));
    const ltr = Math.random() < 0.5;
    const flip = ltr ? "" : " scaleX(-1)";
    const from = ltr ? -width - 10 : W + 10;
    const to = ltr ? W + 10 : -width - 10;
    const duration = ((W + width + 20) / 210) * 1000; // reindeer are quick

    const actor = el("div", { className: "actor", style: `bottom:${6 + Snow.heightAt(W / 2) * 0.5}px;` });
    const body = el("img", { className: "gallop", src: url("images/sleigh.webp"), alt: "", style: `width:${width}px;height:auto;` }, actor);
    const trip = actor.animate(
      [{ transform: `translateX(${from}px)${flip}` }, { transform: `translateX(${to}px)${flip}` }],
      { duration, easing: "linear", fill: "forwards" }
    );
    makeDanceable(actor, body, () => trip, HOP_FRAMES, 1100);
    scheduleCanes(actor, () => (ltr ? 0.08 : 0.92), duration, signal, Math.random() < 0.5 ? 1 : 0);
    await played(trip, signal);
    actor.remove();
  }

  const CLOUD_SVG = `<svg width="96" height="58" viewBox="0 0 96 58" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d9e4f2"/></linearGradient></defs>
    <path d="M22 52 C8 52 4 40 12 34 C8 22 22 14 32 20 C36 6 58 4 64 18 C76 12 90 22 84 34 C94 38 90 52 78 52 Z"
      fill="url(#cg)" stroke="#9fb3cc" stroke-width="2"/>
  </svg>`;

  async function actCloud(signal) {
    const W = window.innerWidth;
    const ltr = Math.random() < 0.5;
    const from = ltr ? -110 : W + 10;
    const to = ltr ? W + 10 : -110;
    const actor = el("div", {
      className: "actor",
      style: `top:${rand(6, 16)}vh;filter:drop-shadow(0 3px 4px rgba(40,60,90,.18));`,
    });
    const body = el("div", { className: "bob", title: "Let it snow!" }, actor);
    body.innerHTML = CLOUD_SVG;
    actor.classList.add("click");
    const trip = actor.animate(
      [{ transform: `translateX(${from}px)` }, { transform: `translateX(${to}px)` }],
      { duration: ((W + 120) / 28) * 1000, easing: "linear", fill: "forwards" } // a lazy drift
    );
    actor.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (trip.playState !== "running") {
        Snow.start(12000);
        return;
      }
      trip.pause();
      actor.style.filter = "drop-shadow(0 3px 4px rgba(40,60,90,.18)) saturate(.6) brightness(.93)";
      await Snow.start(22000);
      actor.style.filter = "drop-shadow(0 3px 4px rgba(40,60,90,.18))";
      if (trip.playState === "paused") trip.play();
    });
    await played(trip, signal);
    actor.remove();
  }

  const ACTS = { peek: actPeek, walk: actWalk, sleigh: actSleigh, cloud: actCloud };

  // --------------------------------------------------------------------- snow
  // Flakes fall, land, and pile up along the bottom: deeper toward the
  // corners. The pile melts away a few minutes after the snow stops.
  const Snow = (() => {
    const COL = 4; // px per height column
    let canvas, ctx, W = 0, H = 0, dpr = 1;
    let heights = new Float32Array(0);
    let flakes = [];
    let snowUntil = 0;
    let raf = null, last = 0;
    let meltTimer = null, melting = false;
    let waiters = [];

    function edge(x) {
      const e = Math.min(1, Math.abs(x / W - 0.5) * 2);
      return e * e * e;
    }
    const cap = (x) => 14 + 70 * edge(x);
    const weight = (x) => 0.5 + 4 * edge(x);

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
    }

    function heightAt(x) {
      if (!heights.length || !W) return 0;
      const i = Math.max(0, Math.min(heights.length - 1, Math.floor(x / COL)));
      return heights[i];
    }

    function deposit(x, amount) {
      const c = Math.floor(x / COL);
      const spread = [0.25, 0.6, 1, 0.6, 0.25];
      for (let k = -2; k <= 2; k++) {
        const i = c + k;
        if (i < 0 || i >= heights.length) continue;
        const lim = cap(i * COL);
        heights[i] = Math.min(lim, heights[i] + amount * spread[k + 2]);
      }
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

    function draw() {
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      let any = false;
      for (let i = 0; i < heights.length; i++) if (heights[i] > 0.3) { any = true; break; }
      if (any) {
        const top = Math.max(...heights);
        const g = ctx.createLinearGradient(0, H - top, 0, H);
        g.addColorStop(0, "#ffffff");
        g.addColorStop(1, "#dde8f4");
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
        ctx.strokeStyle = "rgba(120,150,190,.45)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "rgba(120,145,180,.55)";
      ctx.lineWidth = 0.8;
      for (const f of flakes) {
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    function tick(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (now < snowUntil && flakes.length < 260) {
        const rate = W / 9; // flakes per second
        let n = rate * dt;
        while (n > 0) {
          if (Math.random() < n) {
            flakes.push({
              x: Math.random() * W, y: -6, r: rand(1.4, 3.4),
              vy: rand(45, 85), phase: Math.random() * 6.28, sway: rand(10, 28),
            });
          }
          n -= 1;
        }
      }
      for (let i = flakes.length - 1; i >= 0; i--) {
        const f = flakes[i];
        f.phase += dt * 1.6;
        f.y += f.vy * dt;
        f.x += Math.sin(f.phase) * f.sway * dt;
        if (f.y >= H - heightAt(f.x) - f.r) {
          if (f.x >= 0 && f.x <= W) deposit(f.x, f.r * 1.0 * weight(f.x));
          flakes.splice(i, 1);
        }
      }
      settle();
      draw();
      if (now < snowUntil || flakes.length) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = null;
        waiters.splice(0).forEach((w) => w());
        scheduleMelt();
      }
    }

    function scheduleMelt() {
      clearTimeout(meltTimer);
      meltTimer = setTimeout(melt, 3 * 60 * 1000);
    }

    function melt() {
      melting = true;
      const step = () => {
        if (!melting) return;
        let left = 0;
        for (let i = 0; i < heights.length; i++) {
          heights[i] = Math.max(0, heights[i] - 0.12 - heights[i] * 0.004);
          left += heights[i];
        }
        draw();
        if (left > 0) meltTimer = setTimeout(step, 120);
        else melting = false;
      };
      step();
    }

    function start(ms) {
      ensure();
      melting = false;
      clearTimeout(meltTimer);
      snowUntil = Math.max(snowUntil, performance.now() + ms);
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
      return new Promise((resolve) => waiters.push(resolve));
    }

    function clear() {
      snowUntil = 0;
      flakes = [];
      melting = false;
      clearTimeout(meltTimer);
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      heights.fill(0);
      waiters.splice(0).forEach((w) => w());
      canvas?.remove();
      canvas = ctx = null;
    }

    window.addEventListener("resize", resize);
    return { start, clear, heightAt };
  })();

  // ---------------------------------------------------------------- scheduler
  // The countdown only runs while this tab is visible, so background tabs
  // never "save up" a Santa and nothing fires on a page you aren't looking at.
  let timerId = null;
  let remaining = 0;
  let timerStartedAt = 0;
  let current = null; // AbortController for the act on screen

  function nextDelay() {
    const [lo, hi] = FREQ_MINUTES[settings.santaFreq] || FREQ_MINUTES[3];
    return rand(lo, hi) * 60 * 1000;
  }

  function pickAct() {
    const on = Object.keys(ACT_WEIGHTS).filter((k) => settings.santaActs[k]);
    if (!on.length) return null;
    let r = Math.random() * on.reduce((s, k) => s + ACT_WEIGHTS[k], 0);
    for (const k of on) if ((r -= ACT_WEIGHTS[k]) < 0) return k;
    return on[0];
  }

  function armTimer() {
    clearTimeout(timerId);
    timerId = null;
    if (!settings.santaEnabled || document.visibilityState !== "visible") return;
    timerStartedAt = performance.now();
    timerId = setTimeout(fire, remaining);
  }

  function pauseTimer() {
    if (!timerId) return;
    clearTimeout(timerId);
    timerId = null;
    remaining = Math.max(0, remaining - (performance.now() - timerStartedAt));
  }

  function schedule() {
    remaining = nextDelay();
    armTimer();
  }

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");

  async function fire() {
    timerId = null;
    const quiet = document.fullscreenElement || reducedMotion?.matches || current;
    const act = quiet ? null : pickAct();
    if (act) await run(act);
    schedule();
  }

  async function run(name) {
    current?.abort();
    const ctl = new AbortController();
    current = ctl;
    try {
      await ACTS[name](ctl.signal);
    } catch (e) {
      // Never let a page quirk break the schedule.
    } finally {
      if (current === ctl) current = null;
    }
  }

  function stopAll() {
    clearTimeout(timerId);
    timerId = null;
    current?.abort();
    current = null;
    Snow.clear();
    host?.remove();
    host = root = layer = null;
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") armTimer();
    else pauseTimer();
  });

  // ---------------------------------------------------------------- settings
  function load(cb) {
    chrome.storage.sync.get(DEFAULTS, (data) => {
      settings = {
        ...DEFAULTS,
        ...data,
        santaActs: { ...DEFAULTS.santaActs, ...(data.santaActs || {}) },
      };
      cb?.();
    });
  }

  load(() => settings.santaEnabled && schedule());

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    const wasEnabled = settings.santaEnabled;
    const oldFreq = settings.santaFreq;
    load(() => {
      if (!settings.santaEnabled) return stopAll();
      if (!wasEnabled || oldFreq !== settings.santaFreq) schedule();
    });
  });

  // "Try it now" buttons in the popup.
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg?.type !== "santa-summon") return;
    if (msg.act === "snow") Snow.start(15000);
    else if (ACTS[msg.act]) run(msg.act);
    reply({ ok: true });
  });
})();
