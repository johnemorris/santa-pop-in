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
      blower: true,
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
    .actor { position: fixed; left: 0; will-change: transform; z-index: 2; }
    img, svg { display: block; max-width: none; max-height: none; user-select: none;
               -webkit-user-drag: none; border: 0; }
    .click { pointer-events: auto; cursor: pointer; }
    .waddle { animation: waddle 0.62s cubic-bezier(.45,0,.55,1) infinite; transform-origin: 50% 100%; }
    .gallop { animation: gallop 0.36s ease-in-out infinite; transform-origin: 60% 80%; }
    .bob    { animation: bob 3.4s ease-in-out infinite; }
    .rumble { animation: rumble 0.09s linear infinite; }
    @keyframes waddle {
      0%, 100% { transform: translateY(0) rotate(-3deg) scale(1.01, .99); }
      25%      { transform: translateY(-7px) rotate(0deg) scale(.99, 1.02); }
      50%      { transform: translateY(0) rotate(3deg) scale(1.01, .99); }
      75%      { transform: translateY(-7px) rotate(0deg) scale(.99, 1.02); }
    }
    @keyframes gallop {
      0%, 100% { transform: translateY(0) rotate(0); }
      50%      { transform: translateY(-5px) rotate(-1deg); }
    }
    @keyframes bob {
      0%, 100% { transform: translateY(0) scale(1); }
      50%      { transform: translateY(-6px) scale(1.03, .98); }
    }
    @keyframes rumble {
      0%, 100% { transform: translate(0, 0); }
      50%      { transform: translate(.6px, -.5px); }
    }
    .shadow { position: absolute; left: 12%; right: 12%; bottom: -5px; height: 10px;
              border-radius: 50%; background: radial-gradient(closest-side, rgba(20,30,50,.28), transparent);
              pointer-events: none; }
    .note { position: fixed; font: 700 20px/1 system-ui, sans-serif; color: #c1121f;
            text-shadow: 0 1px 2px rgba(0,0,0,.25); pointer-events: none; z-index: 3; }
    .spark { position: fixed; width: 6px; height: 6px; pointer-events: none; z-index: 1;
             background: radial-gradient(closest-side, #fff8d6, rgba(255,215,90,.8) 45%, transparent);
             border-radius: 50%; }
    canvas.snow { position: fixed; left: 0; top: 0; pointer-events: none; z-index: 1; }
    .pilehit { position: fixed; bottom: 0; pointer-events: auto; cursor: pointer; z-index: 1; }
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

  // A soft contact shadow so walkers feel planted on the ground.
  const addShadow = (actor) => el("div", { className: "shadow" }, actor);

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
            { transform: "translate(0,0) rotate(0) scale(.6)", opacity: 0 },
            { transform: "translate(0,-12px) rotate(0) scale(1)", opacity: 1, offset: 0.15 },
            {
              transform: `translate(${rand(-40, 40)}px,-95px) rotate(${rand(-30, 30)}deg) scale(1.1)`,
              opacity: 0,
            },
          ],
          { duration: 1500, easing: "ease-out" }
        ).onfinish = () => n.remove();
      }, i * 240);
    }
  }

  const DANCE_FRAMES = [
    { transform: "translateY(0) rotate(0) scale(1,1)" },
    { transform: "translateY(2px) rotate(0) scale(1.06,.92)", offset: 0.05 },
    { transform: "translateY(-16px) rotate(-12deg) scale(.97,1.04)", offset: 0.13 },
    { transform: "translateY(0) rotate(12deg) scale(1.04,.96)", offset: 0.23 },
    { transform: "translateY(-16px) rotate(-12deg) scale(.97,1.04)", offset: 0.33 },
    { transform: "translateY(0) rotate(12deg) scale(1.04,.96)", offset: 0.43 },
    { transform: "translateY(3px) rotate(0) scale(1.08,.9)", offset: 0.48 },
    { transform: "translateY(-38px) rotate(0) scale(.96,1.05)", offset: 0.58 },
    { transform: "translateY(-38px) rotate(0) scale(-.96,1.05)", offset: 0.66 },
    { transform: "translateY(0) rotate(0) scale(-1.06,.93)", offset: 0.76 },
    { transform: "translateY(-12px) rotate(0) scale(.98,1.02)", offset: 0.87 },
    { transform: "translateY(0) rotate(0) scale(1,1)" },
  ];

  const HOP_FRAMES = [
    { transform: "translateY(0) scale(1,1)" },
    { transform: "translateY(2px) scale(1.05,.94)", offset: 0.1 },
    { transform: "translateY(-24px) scale(.97,1.04)", offset: 0.3 },
    { transform: "translateY(0) scale(1.04,.96)", offset: 0.5 },
    { transform: "translateY(-12px) scale(1,1)", offset: 0.72 },
    { transform: "translateY(0) scale(1,1)" },
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
    const drift = rand(-30, 30);
    cane
      .animate(
        [
          { transform: "translate(0,0) rotate(0)", easing: "cubic-bezier(.5,0,1,1)" },
          { transform: `translate(${drift}px,${fall}px) rotate(${land + 140 * spin}deg)`, offset: 0.6, easing: "ease-out" },
          { transform: `translate(${drift * 1.1}px,${fall - 18}px) rotate(${land + 40 * spin}deg)`, offset: 0.75, easing: "ease-in" },
          { transform: `translate(${drift * 1.2}px,${fall}px) rotate(${land}deg)`, offset: 0.9 },
          { transform: `translate(${drift * 1.2}px,${fall - 4}px) rotate(${land}deg)`, offset: 0.95 },
          { transform: `translate(${drift * 1.2}px,${fall}px) rotate(${land}deg)` },
        ],
        { duration: 1500, fill: "forwards" }
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
    const body = el("img", { src: url("images/peek-santa.webp"), alt: "", style: "width:200px;height:auto;transform-origin:50% 90%;" }, actor);
    const flip = fromLeft ? " scaleX(-1)" : "";
    const hidden = fromLeft ? -220 : 220;
    const shown = fromLeft ? -50 : 50;
    const peekOut = fromLeft ? -150 : 150; // first, a cautious half-peek
    const trip = actor.animate(
      [
        { transform: `translateX(${hidden}px)${flip}`, easing: "ease-out" },
        { transform: `translateX(${peekOut}px)${flip}`, offset: 0.1, easing: "ease-in" },
        { transform: `translateX(${peekOut}px)${flip}`, offset: 0.18, easing: "cubic-bezier(.34,1.56,.64,1)" },
        { transform: `translateX(${shown}px)${flip}`, offset: 0.3 },
        { transform: `translateX(${shown}px)${flip}`, offset: 0.78, easing: "cubic-bezier(.55,0,.75,.2)" },
        { transform: `translateX(${hidden}px)${flip}` },
      ],
      { duration: 7000, fill: "forwards" }
    );
    // A little curious head-tilt while he's out.
    sleep(3000, signal).then(() => {
      if (signal.aborted || !body.isConnected || body.getAnimations().length) return;
      body.animate(
        [
          { transform: "rotate(0)" },
          { transform: "rotate(-7deg)", offset: 0.3 },
          { transform: "rotate(4deg)", offset: 0.65 },
          { transform: "rotate(0)" },
        ],
        { duration: 1400, easing: "ease-in-out" }
      );
    });
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
    addShadow(actor);
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

  // Twinkling trail behind the sleigh.
  function sparkle(x, y) {
    const s = el("div", { className: "spark", style: `left:${x}px;top:${y}px;` });
    s.animate(
      [
        { transform: "scale(.4)", opacity: 0.95 },
        { transform: `translate(${rand(-6, 6)}px,${rand(8, 22)}px) scale(${rand(0.8, 1.4)})`, opacity: 0 },
      ],
      { duration: rand(700, 1200), easing: "ease-out" }
    ).onfinish = () => s.remove();
  }

  async function actSleigh(signal) {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const width = Math.round(Math.min(320, W * 0.28));
    const ltr = Math.random() < 0.5;
    const dir = ltr ? 1 : -1;
    const flip = ltr ? "" : " scaleX(-1)";
    const from = ltr ? -width - 10 : W + 10;
    const to = ltr ? W + 10 : -width - 10;
    const duration = ((W + width + 20) / 210) * 1000; // reindeer are quick
    const lift = Math.min(170, H * 0.24) * rand(0.7, 1);

    // Run along the ground, take off in a gentle arc, glide back down.
    const N = 24;
    const frames = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const x = from + (to - from) * t;
      const arc = t < 0.12 ? 0 : Math.sin(Math.PI * Math.min(1, (t - 0.12) / 0.8));
      const y = -lift * Math.pow(Math.max(0, arc), 1.4);
      const slope = Math.cos(Math.PI * Math.min(1, Math.max(0, (t - 0.12) / 0.8)));
      const tilt = t < 0.12 || t > 0.92 ? 0 : -dir * 7 * slope;
      frames.push({ transform: `translate(${x}px,${y}px) rotate(${tilt}deg)${flip}`, offset: t });
    }

    const actor = el("div", { className: "actor", style: `bottom:${6 + Snow.heightAt(W / 2) * 0.5}px;` });
    const body = el("img", { className: "gallop", src: url("images/sleigh.webp"), alt: "", style: `width:${width}px;height:auto;` }, actor);
    const trip = actor.animate(frames, { duration, easing: "linear", fill: "forwards" });
    makeDanceable(actor, body, () => trip, HOP_FRAMES, 1100);
    scheduleCanes(actor, () => (ltr ? 0.08 : 0.92), duration, signal, Math.random() < 0.5 ? 1 : 0);

    const trail = setInterval(() => {
      if (!actor.isConnected || trip.playState !== "running") return;
      const r = actor.getBoundingClientRect();
      if (r.bottom > H - 8 - 0.05 * r.height && trip.currentTime < duration * 0.14) return; // still on the ground
      const bx = ltr ? r.left + r.width * 0.06 : r.right - r.width * 0.06;
      if (Math.random() < 0.35) sparkle(bx, r.top + r.height * rand(0.55, 0.8));
    }, 70);
    // Snow flying off the runners the whole way, a big spray on take-off.
    const powder = setInterval(() => {
      if (!actor.isConnected || trip.playState !== "running") return;
      const r = actor.getBoundingClientRect();
      const bx = ltr ? r.left + r.width * 0.12 : r.right - r.width * 0.12;
      const grounded = trip.currentTime < duration * 0.14 || trip.currentTime > duration * 0.9;
      Snow.kick(bx, r.bottom - 6, dir, grounded ? 8 : 5);
    }, 40);
    await played(trip, signal);
    clearInterval(trail);
    clearInterval(powder);
    actor.remove();
  }

  // A soft, layered cloud with a slightly grey underside.
  let cloudSeq = 0;
  function cloudSVG() {
    const id = `cg${++cloudSeq}`;
    return `<svg width="120" height="70" viewBox="0 0 120 70" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#f1f5fb"/><stop offset="1" stop-color="#c9d6e6"/>
        </linearGradient>
      </defs>
      <g fill="url(#${id})">
        <circle cx="34" cy="40" r="20"/><circle cx="58" cy="30" r="25"/><circle cx="84" cy="38" r="20"/>
        <circle cx="20" cy="50" r="13"/><circle cx="100" cy="50" r="13"/>
        <rect x="20" y="42" width="80" height="21" rx="10.5"/>
      </g>
      <g fill="#ffffff" opacity=".8"><circle cx="52" cy="20" r="9"/><circle cx="30" cy="31" r="6"/></g>
    </svg>`;
  }

  async function actCloud(signal) {
    const W = window.innerWidth;
    const ltr = Math.random() < 0.5;
    const from = ltr ? -130 : W + 10;
    const to = ltr ? W + 10 : -130;
    const actor = el("div", {
      className: "actor click",
      title: "Click for a flurry",
      style: `top:${rand(6, 14)}vh;filter:drop-shadow(0 4px 6px rgba(40,60,90,.16));opacity:.96;`,
    });
    const body = el("div", { className: "bob" }, actor);
    body.innerHTML = cloudSVG();
    const trip = actor.animate(
      [{ transform: `translateX(${from}px)` }, { transform: `translateX(${to}px)` }],
      { duration: ((W + 140) / 30) * 1000, easing: "linear", fill: "forwards" } // a lazy drift
    );

    // Light snow falls only from under the cloud, for as long as it's on screen.
    const span = () => {
      if (!actor.isConnected) return null;
      const r = actor.getBoundingClientRect();
      return { x0: r.left + r.width * 0.18, x1: r.right - r.width * 0.18, y: r.bottom - 10 };
    };
    const emitter = Snow.emit(span, 7);

    let flurry = false;
    actor.addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (flurry) return;
      flurry = true;
      emitter.rate = 26;
      trip.updatePlaybackRate(0.5);
      body.animate([{ filter: "brightness(1)" }, { filter: "brightness(.9)" }], { duration: 600, fill: "forwards" });
      await sleep(10000, signal);
      emitter.rate = 7;
      trip.updatePlaybackRate(1);
      body.animate([{ filter: "brightness(.9)" }, { filter: "brightness(1)" }], { duration: 800, fill: "forwards" });
      flurry = false;
    });
    await played(trip, signal);
    emitter.stop();
    actor.remove();
  }

  // Santa wanders out with a (silent!) leaf blower and clears the snow.
  let blowing = false;
  async function actBlower(signal, fromX) {
    if (blowing) return;
    blowing = true;
    try {
      const W = window.innerWidth;
      const width = Math.round(150 * rand(0.95, 1.08));
      // Start from the side nearest the click so that pile goes first.
      const ltr = fromX == null ? Math.random() < 0.5 : fromX < W / 2;
      const flip = ltr ? "" : " scaleX(-1)";
      const from = ltr ? -width - 10 : W + 10;
      const to = ltr ? W + 40 : -width - 40;
      const duration = ((W + width + 50) / 120) * 1000;

      const actor = el("div", { className: "actor", style: "bottom:2px;" });
      addShadow(actor);
      const shaker = el("div", { className: "rumble" }, actor);
      const body = el("img", { className: "waddle", src: url("images/santa-blower.webp"), alt: "", style: `width:${width}px;height:auto;` }, shaker);
      const trip = actor.animate(
        [{ transform: `translateX(${from}px)${flip}` }, { transform: `translateX(${to}px)${flip}` }],
        { duration, easing: "linear", fill: "forwards" }
      );
      makeDanceable(actor, body, () => trip, HOP_FRAMES, 1200);

      // The nozzle trails behind him (image's left edge, 86% down when facing right).
      Snow.setBlower(() => {
        if (!actor.isConnected || trip.playState !== "running") return null;
        const r = body.getBoundingClientRect();
        return { x: ltr ? r.left : r.right, y: r.top + r.height * 0.86, dir: ltr ? -1 : 1 };
      });
      await played(trip, signal);
      Snow.setBlower(null);
      Snow.fadePile(); // tidy any crumbs he missed
      actor.remove();
    } finally {
      blowing = false;
    }
  }

  const ACTS = { peek: actPeek, walk: actWalk, sleigh: actSleigh, cloud: actCloud, blower: actBlower };

  // Clicking the snow pile: Santa comes to clear it (or it just melts away).
  function onPileClick(x) {
    if (blowing) return;
    if (settings.santaActs.blower) {
      // Runs alongside whatever else is on screen; it isn't a scheduled act.
      actBlower(new AbortController().signal, x).catch(() => {});
    } else {
      Snow.fadePile();
    }
  }

  // --------------------------------------------------------------------- snow
  // Faint flakes fall only from under a passing cloud, land, and pile up along
  // the bottom, deeper toward the corners. The pile stays until it's clicked.
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
    let fading = false;
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
      // Falling flakes: small and see-through so they don't pull your eye.
      for (const f of flakes) {
        ctx.globalAlpha = f.a;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = f.a * 0.35;
        ctx.strokeStyle = "#8ea3c0";
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
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
          if (Math.random() < n && flakes.length < 220) {
            flakes.push({
              x: rand(s.x0, s.x1), y: s.y, r: rand(0.8, 2), a: rand(0.35, 0.65),
              vy: rand(30, 55), phase: Math.random() * 6.28, sway: rand(8, 20),
            });
          }
          n -= 1;
        }
      }

      for (let i = flakes.length - 1; i >= 0; i--) {
        const f = flakes[i];
        f.phase += dt * 1.5;
        f.y += f.vy * dt;
        f.x += Math.sin(f.phase) * f.sway * dt;
        if (f.y >= H - heightAt(f.x) - f.r) {
          if (f.x >= 0 && f.x <= W) deposit(f.x, f.r * 1.6 * weight(f.x));
          flakes.splice(i, 1);
        }
      }

      const b = blower && blower();
      if (b) {
        // Blast the snow just behind the nozzle and toss it away.
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

    // A source of falling snow. span() returns {x0, x1, y} or null.
    function emit(span, rate) {
      const em = { span, rate, stop: () => (emitters = emitters.filter((e) => e !== em)) };
      emitters.push(em);
      fading = false;
      wake();
      return em;
    }

    function setBlower(fn) {
      blower = fn;
      if (fn) wake();
    }

    // Gently melt whatever is left (used after the blower, or when it's off).
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
        if (left > 0) setTimeout(step, 40);
        else fading = false;
      };
      step();
    }

    // Seed a pile instantly (for the popup's "Try" button when there's no snow yet).
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
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      heights.fill(0);
      clearTimeout(hitsTimer);
      hitsTimer = null;
      hits.forEach((h) => h.remove());
      hits = [];
      canvas?.remove();
      canvas = ctx = null;
    }

    window.addEventListener("resize", resize);
    // Powder thrown up behind the sleigh: drifts back, sinks and fades.
    function kick(x, y, dir, n = 3) {
      for (let k = 0; k < n && puffs.length < 260; k++) {
        puffs.push({
          x: x + rand(-8, 8), y: y + rand(-8, 6), r: rand(1.4, 3.4), a: rand(0.6, 0.95), powder: true,
          vx: -dir * rand(60, 200), vy: rand(-70, 5), age: 0, life: rand(1.1, 2.0),
        });
      }
      wake();
    }

    return { emit, setBlower, fadePile, seed, clear, heightAt, hasPile, kick };
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

  // Only the window you're actually using gets Santa. If this one isn't
  // focused when its turn comes, wait until you come back to it, then ask the
  // background whether another window had Santa recently.
  let waitingForFocus = false;
  function mayShow() {
    const [lo] = FREQ_MINUTES[settings.santaFreq] || FREQ_MINUTES[3];
    return new Promise((res) => {
      try {
        chrome.runtime.sendMessage({ type: "santa-may-show", gapMs: lo * 60 * 1000 * 0.8 }, (r) => {
          if (chrome.runtime.lastError) return res(document.hasFocus());
          res(Boolean(r?.ok));
        });
      } catch (e) {
        res(false); // extension was reloaded; this old copy stays quiet
      }
    });
  }

  async function fire() {
    timerId = null;
    if (!document.hasFocus()) {
      waitingForFocus = true;
      return;
    }
    waitingForFocus = false;
    const quiet = document.fullscreenElement || reducedMotion?.matches || current;
    const act = quiet ? null : pickAct();
    if (act && (await mayShow())) await run(act);
    schedule();
  }

  window.addEventListener("focus", () => {
    if (!waitingForFocus || !settings.santaEnabled) return;
    waitingForFocus = false;
    remaining = rand(2, 5) * 1000; // a beat after you return, not instantly
    armTimer();
  });

  // Click into another window mid-act and Santa leaves this one.
  window.addEventListener("blur", () => {
    setTimeout(() => {
      if (!document.hasFocus() && current) current.abort();
    }, 400);
  });

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
    if (msg.act === "blower") {
      if (!Snow.hasPile()) Snow.seed();
      onPileClick(null);
    } else if (ACTS[msg.act]) run(msg.act);
    reply({ ok: true });
  });
})();
