// Santa Pop-In content script: Santa's acts: peek, walk, sleigh, countdown sign, rope drop, snow cloud, blower.
// Content scripts share one isolated world, so top-level names here are
// visible to the other content/*.js files (see manifest.json for load order).

// --------------------------------------------------------------------- acts
let lastPeekSide = null;

async function actPeek(signal) {
  const sc = sizeScale();
  const fromLeft =
    lastPeekSide === "left" ? false : lastPeekSide === "right" ? true : Math.random() < 0.5;
  lastPeekSide = fromLeft ? "left" : "right";

  const w = Math.round(200 * sc);
  const actor = el("div", {
    className: "actor",
    style: `bottom:15%;${fromLeft ? "left:0" : "left:auto;right:0"};`,
  });
  const body = el(
    "img",
    { src: url("images/peek-santa.webp"), alt: "", style: `width:${w}px;height:auto;transform-origin:50% 90%;` },
    actor
  );
  const flip = fromLeft ? " scaleX(-1)" : "";
  const hidden = Math.round((fromLeft ? -220 : 220) * sc);
  const shown = Math.round((fromLeft ? -50 : 50) * sc);
  const peekOut = Math.round((fromLeft ? -150 : 150) * sc); // first, a cautious half-peek
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
  makeDanceable(actor, body, () => trip, signal, HOP_FRAMES, 1300);
  await played(trip, signal);
  actor.remove();
}

async function actWalk(signal) {
  const W = window.innerWidth;
  const width = Math.round(120 * sizeScale() * rand(0.9, 1.15));
  const ltr = Math.random() < 0.5;

  const actor = el("div", { className: "actor", style: `bottom:${4 + Snow.heightAt(W / 2) * 0.5}px;` });
  addShadow(actor);
  const body = createRiggedSprite(url("images/santa-walk.webp"), width, "rig-walk", "waddle", actor);
  const { trip, duration } = crossScreen(actor, ltr, width, { speed: 85 }); // ~85 px/s stroll
  makeDanceable(actor, body, () => trip, signal);
  // The sack is on Santa's back: left side when walking right.
  scheduleCanes(actor, () => (ltr ? 0.18 : 0.82), duration, signal, Math.floor(rand(1, 4)));
  const stopBells = Sound.walk(signal);
  try {
    await played(trip, signal);
  } finally {
    stopBells();
    actor.remove();
  }
}

// Twinkling trail behind the sleigh.
function sparkle(x, y, golden = false) {
  const s = el("div", { className: "spark" + (golden ? " gold" : ""), style: `left:${x}px;top:${y}px;` });
  s.animate(
    [
      { transform: "scale(.4)", opacity: 0.95 },
      { transform: `translate(${rand(-8, 8)}px,${rand(8, 24)}px) scale(${rand(0.8, 1.5)})`, opacity: 0 },
    ],
    { duration: rand(700, 1250), easing: "ease-out" }
  ).onfinish = () => s.remove();
}

async function actSleigh(signal) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const holiday = isChristmasHoliday();
  const width = Math.round(Math.min(340, W * 0.28) * sizeScale());
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
  const body = createRiggedSprite(url("images/sleigh.webp"), width, "rig-sleigh", "gallop", actor);
  const trip = actor.animate(frames, { duration, easing: "linear", fill: "forwards" });
  const stopBells = Sound.sleigh(signal);
  makeDanceable(actor, body, () => trip, signal, HOP_FRAMES, 1100);
  scheduleCanes(actor, () => (ltr ? 0.08 : 0.92), duration, signal, holiday ? 2 : Math.random() < 0.5 ? 1 : 0);

  const trail = setInterval(() => {
    if (!actor.isConnected || trip.playState !== "running") return;
    const r = actor.getBoundingClientRect();
    if (r.bottom > H - 8 - 0.05 * r.height && trip.currentTime < duration * 0.14) return; // still on the ground
    const bx = ltr ? r.left + r.width * 0.06 : r.right - r.width * 0.06;
    if (Math.random() < (holiday ? 0.72 : 0.35)) {
      sparkle(bx, r.top + r.height * rand(0.5, 0.82), holiday);
    }
  }, 65);
  // Snow flying off the runners the whole way, a big spray on take-off.
  const powder = setInterval(() => {
    if (!actor.isConnected || trip.playState !== "running") return;
    const r = actor.getBoundingClientRect();
    const bx = ltr ? r.left + r.width * 0.12 : r.right - r.width * 0.12;
    const grounded = trip.currentTime < duration * 0.14 || trip.currentTime > duration * 0.9;
    Snow.kick(bx, r.bottom - 6, dir, grounded ? 8 : 5);
  }, 40);
  try {
    await played(trip, signal);
  } finally {
    stopBells();
    clearInterval(trail);
    clearInterval(powder);
    actor.remove();
  }
}

// Handcrafted festive countdown sign held by Santa (accurate to browser local date).
let signSeq = 0;
function countdownSignSVG(days) {
  const id = `sg${++signSeq}`;
  const isDay = days === 0;
  const isEve = days === 1;
  const headline = isDay ? "MERRY" : String(days);
  const sub1 = isDay ? "CHRISTMAS!" : isEve ? "day until" : "days to";
  const sub2 = isDay ? "Ho Ho Ho!" : "Christmas!";
  const headlineSize = isDay ? 22 : days >= 100 ? 34 : 40;

  return `<svg class="sign-board" width="154" height="148" viewBox="0 0 154 148" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <pattern id="${id}" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="10" height="10" fill="#ffffff"/>
        <rect width="5" height="10" fill="#c1121f"/>
      </pattern>
      <linearGradient id="${id}p" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fffdf8"/>
        <stop offset="1" stop-color="#fef3c7"/>
      </linearGradient>
    </defs>
    <!-- Wooden handle post -->
    <rect x="70" y="96" width="14" height="52" rx="4" fill="#8b5a2b" stroke="#5c3a1d" stroke-width="2"/>
    <!-- Candy-cane border frame -->
    <rect x="6" y="10" width="142" height="94" rx="14" fill="url(#${id})" stroke="#991b1b" stroke-width="2"/>
    <!-- Warm snow-cream sign board -->
    <rect x="13" y="17" width="128" height="80" rx="9" fill="url(#${id}p)" stroke="#e5c799" stroke-width="1.5"/>
    <!-- Holly corner accent -->
    <g transform="translate(126,18)">
      <ellipse cx="-8" cy="2" rx="9" ry="4.5" transform="rotate(-24)" fill="#15803d"/>
      <ellipse cx="6" cy="5" rx="9" ry="4.5" transform="rotate(28)" fill="#16a34a"/>
      <circle cx="-1" cy="3" r="3.6" fill="#dc2626"/>
      <circle cx="4" cy="0" r="3" fill="#ef4444"/>
      <circle cx="-2" cy="-2" r="2.6" fill="#b91c1c"/>
    </g>
    <!-- Countdown text -->
    <text x="77" y="${isDay ? 50 : 57}" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif"
          font-weight="900" font-size="${headlineSize}" fill="#c1121f">${headline}</text>
    <text x="77" y="${isDay ? 72 : 74}" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif"
          font-weight="700" font-size="13.5" fill="#1e293b">${sub1}</text>
    <text x="77" y="89" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif"
          font-weight="800" font-size="13.5" fill="#15803d">${sub2}</text>
  </svg>`;
}

// Santa pops up from the bottom holding the live Christmas countdown sign.
async function actSign(signal) {
  const sc = sizeScale();
  const W = window.innerWidth;
  const days = santaDaysUntilChristmas();
  const onRight = Math.random() < 0.6;
  const xPos = onRight
    ? Math.max(20, W - Math.round(285 * sc) - rand(16, 48))
    : rand(16, Math.min(64, Math.max(20, W - 300)));

  const actor = el("div", {
    className: "actor",
    style: `left:${xPos}px;bottom:0;`,
  });
  const wrap = el("div", { className: "sign-wrap" }, actor);

  const signHolder = el("div", {
    className: "sign-rock",
    style: `transform-origin:50% 100%;margin-right:${Math.round(-22 * sc)}px;margin-bottom:${Math.round(14 * sc)}px;transform:scale(${sc});`,
  }, wrap);
  signHolder.innerHTML = countdownSignSVG(days);

  const santaW = Math.round(118 * sc);
  const body = el(
    "img",
    {
      src: url("images/santa-walk.webp"),
      alt: "",
      style: `width:${santaW}px;height:auto;transform:scaleX(-1);`,
    },
    wrap
  );

  const hiddenY = Math.round(220 * sc);
  const trip = actor.animate(
    [
      { transform: `translateY(${hiddenY}px)`, easing: "cubic-bezier(.22,1.28,.36,1)" },
      { transform: "translateY(4px)", offset: 0.16 },
      { transform: "translateY(4px)", offset: 0.84, easing: "cubic-bezier(.55,0,.75,.2)" },
      { transform: `translateY(${hiddenY}px)` },
    ],
    { duration: 7400, fill: "forwards" }
  );

  Sound.sign();
  if (days <= 1) {
    sleep(900, signal).then(() => {
      if (signal.aborted || !signHolder.isConnected) return;
      const r = signHolder.getBoundingClientRect();
      for (let i = 0; i < 10; i++) {
        setTimeout(() => {
          if (signal.aborted || !signHolder.isConnected) return;
          sparkle(r.left + rand(0, r.width), r.top + rand(0, r.height * 0.6), true);
        }, i * 110);
      }
    });
  }

  makeDanceable(actor, wrap, () => trip, signal, HOP_FRAMES, 1200);
  await played(trip, signal);
  actor.remove();
}

// Santa rappels down briefly from the top edge on a peppermint-striped rope!
let ropeSeq = 0;
function ropeSVG(height) {
  const id = `rp${++ropeSeq}`;
  return `<svg width="16" height="${height}" viewBox="0 0 16 ${height}" xmlns="http://www.w3.org/2000/svg" style="margin:0 auto;">
    <defs>
      <pattern id="${id}" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="10" height="10" fill="#ffffff"/>
        <rect width="5" height="10" fill="#d62828"/>
      </pattern>
    </defs>
    <rect x="5" y="0" width="6" height="${height}" rx="3" fill="url(#${id})" stroke="#991b1b" stroke-width="1"/>
  </svg>`;
}

async function actDrop(signal) {
  const sc = sizeScale();
  const W = window.innerWidth;
  const santaW = Math.round(115 * sc);
  const ropeH = Math.round(120 * sc);
  const xPos = rand(Math.max(24, W * 0.14), Math.max(40, W * 0.86 - santaW));

  const actor = el("div", {
    className: "actor",
    style: `left:${xPos}px;top:0;`,
  });
  const swinger = el("div", { className: "sway", style: "display:flex;flex-direction:column;align-items:center;" }, actor);
  const rope = el("div", {}, swinger);
  rope.innerHTML = ropeSVG(ropeH);
  const body = el(
    "img",
    {
      src: url("images/santa-walk.webp"),
      alt: "",
      style: `width:${santaW}px;height:auto;margin-top:${Math.round(-12 * sc)}px;`,
    },
    swinger
  );

  const hiddenY = -(ropeH + Math.round(160 * sc));
  const shownY = Math.round(-22 * sc);
  const trip = actor.animate(
    [
      { transform: `translateY(${hiddenY}px)`, easing: "cubic-bezier(.22,1.25,.36,1)" },
      { transform: `translateY(${shownY}px)`, offset: 0.2 },
      { transform: `translateY(${shownY + 8}px)`, offset: 0.5 },
      { transform: `translateY(${shownY}px)`, offset: 0.8, easing: "cubic-bezier(.55,0,.75,.2)" },
      { transform: `translateY(${hiddenY}px)` },
    ],
    { duration: 6800, fill: "forwards" }
  );

  sleep(1800, signal).then(() => {
    if (signal.aborted || !body.isConnected) return;
    if (Math.random() < 0.7) spawnSpeechBubble(body);
  });

  makeDanceable(actor, body, () => trip, signal, HOP_FRAMES, 1200);
  await played(trip, signal);
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

// Snow per second for each click count: 1 click hides the cloud, then the
// more you click before stopping, the harder it snows (light ... blizzard).
const CLOUD_RATES = [7, 0, 16, 28, 45, 70, 100, 140];

async function actCloud(signal) {
  const W = window.innerWidth;
  const ltr = Math.random() < 0.5;
  const from = ltr ? -130 : W + 10;
  const to = ltr ? W + 10 : -130;
  const actor = el("div", {
    className: "actor click",
    title: "Click once to send the cloud away. Click several times for more snow!",
    style: `top:${rand(6, 14)}vh;filter:drop-shadow(0 4px 6px rgba(40,60,90,.16));opacity:.97;`,
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
    return { x0: r.left + r.width * 0.15, x1: r.right - r.width * 0.15, y: r.bottom - 10 };
  };
  const emitter = Snow.emit(span, CLOUD_RATES[0]);

  let clicks = 0, burst = null, level = 0, dismissed = false;
  actor.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (dismissed) return;
    clicks++;
    body.animate([{ transform: "scale(1)" }, { transform: "scale(.94)" }, { transform: "scale(1)" }], { duration: 180 });
    clearTimeout(burst);
    burst = setTimeout(() => {
      const n = clicks;
      clicks = 0;
      if (n === 1 && level === 0) {
        // One click: it's in the way, so it fades off.
        dismissed = true;
        emitter.stop();
        actor.style.pointerEvents = "none";
        Snow.evaporate();
        body.animate(
          [{ opacity: 1, transform: "scale(1)", filter: "blur(0)" },
           { opacity: 0, transform: "scale(1.35, 1.15)", filter: "blur(6px)" }],
          { duration: 450, easing: "ease-out", fill: "forwards" }
        ).onfinish = () => {
          if (trip.playState !== "idle" && !signal.aborted) trip.finish();
        };
        return;
      }
      // Several clicks: snow harder (each new burst adds on), and keep dumping all the way across.
      level = Math.min(CLOUD_RATES.length - 1, level ? level + n : n);
      emitter.rate = CLOUD_RATES[level];
      Sound.cloud(level);
      // Heavier snow also lingers longer: the cloud slows down as it dumps.
      trip.updatePlaybackRate(Math.max(0.28, 0.85 - level * 0.09));
      const dark = 1 - level * 0.04;
      body.animate([{ filter: `brightness(${dark})` }], { duration: 600, fill: "forwards" });
    }, 350);
  });
  try {
    await played(trip, signal);
  } finally {
    clearTimeout(burst);
    emitter.stop();
    actor.remove();
  }

  // Santa always comes next to clear whatever fell.
  if (!signal.aborted && settings.santaActs.blower) {
    await sleep(1500, signal);
    if (!signal.aborted && Snow.hasPile()) await actBlower(signal, null);
  }
}

// Santa wanders out with a (silent or soft-whoosh!) leaf blower and clears the snow + canes.
let blowing = false;
let blowerCtl = null;

async function actBlower(signal, fromX) {
  if (blowing) return;
  blowing = true;
  try {
    const W = window.innerWidth;
    const width = Math.round(150 * sizeScale() * rand(0.95, 1.08));
    // Start from the side nearest the click so that pile goes first.
    const ltr = fromX == null ? Math.random() < 0.5 : fromX < W / 2;

    const actor = el("div", { className: "actor", style: "bottom:2px;" });
    addShadow(actor);
    const shaker = el("div", { className: "rumble" }, actor);
    const body = createRiggedSprite(url("images/santa-blower.webp"), width, "rig-blower", "waddle", shaker);
    const { trip, duration } = crossScreen(actor, ltr, width, { speed: 120, overrun: 30 });
    const stopHum = Sound.blower(signal);
    makeDanceable(actor, body, () => trip, signal, HOP_FRAMES, 1200);

    // The nozzle points ahead of him (image's right edge, 84% down when facing right),
    // so he pushes the snow and any resting candy canes away in front of him.
    Snow.setBlower(() => {
      if (!actor.isConnected || trip.playState !== "running") return null;
      const r = body.getBoundingClientRect();
      return { x: ltr ? r.right : r.left, y: r.top + r.height * 0.84, dir: ltr ? 1 : -1 };
    });
    try {
      await played(trip, signal);
    } finally {
      stopHum();
      Snow.setBlower(null);
      Snow.fadePile(); // tidy any crumbs he missed
      actor.remove();
    }
  } finally {
    blowing = false;
    blowerCtl = null;
  }
}

const ACTS = {
  peek: actPeek,
  walk: actWalk,
  sleigh: actSleigh,
  cloud: actCloud,
  sign: actSign,
  drop: actDrop,
  blower: actBlower,
};

// Clicking the snow pile: Santa comes to clear it (or it just melts away).
function onPileClick(x) {
  if (blowing) return;
  if (settings.santaActs.blower) {
    blowerCtl?.abort();
    blowerCtl = new AbortController();
    actBlower(blowerCtl.signal, x).catch(() => {});
  } else {
    Snow.fadePile();
  }
}
