// Santa Pop-In content script: Speech bubbles, the click dance, and candy canes with their glitter pop.
// Content scripts share one isolated world, so top-level names here are
// visible to the other content/*.js files (see manifest.json for load order).

// ----------------------------------------------------------- speech bubbles
function pickQuote() {
  const days = santaDaysUntilChristmas();
  if (days === 0) return "Merry Christmas!";
  if (days === 1) return "Santa's on the way!";
  const pool = [
    "Ho ho ho!",
    "Stay on the Nice List!",
    "Nice browsing!",
    `${days} days to Christmas!`,
    "Cookies nearby?",
    "Jingle all the way!",
  ];
  return pool[Math.floor(Math.random() * pool.length)];
}

function spawnSpeechBubble(target, customText) {
  if (!settings.santaActs.quotes && !customText) return;
  if (!target || !target.isConnected) return;
  const r = target.getBoundingClientRect();
  const text = customText || pickQuote();
  const x = Math.max(95, Math.min(window.innerWidth - 95, r.left + r.width / 2));
  const y = Math.max(46, r.top - 10);
  const bubble = el("div", {
    className: "speech",
    textContent: text,
    style: `left:${x}px;top:${y}px;transform:translate(-50%,-100%);`,
  });
  bubble
    .animate(
      [
        { transform: "translate(-50%,-85%) scale(.75)", opacity: 0 },
        { transform: "translate(-50%,-102%) scale(1.03)", opacity: 1, offset: 0.14 },
        { transform: "translate(-50%,-100%) scale(1)", opacity: 1, offset: 0.82 },
        { transform: "translate(-50%,-115%) scale(.96)", opacity: 0 },
      ],
      { duration: 2400, easing: "ease-out", fill: "forwards" }
    )
    .onfinish = () => bubble.remove();
}

// Layered sprite rig: splits legs behind torso/coat using CSS clip-path
// so Santa and the reindeer visibly stride/gallop with zero extra image files.
function createRiggedSprite(src, width, rigClass, motionClass, parent) {
  const rig = el("div", { className: `rig ${rigClass} ${motionClass}`, style: `width:${width}px;` }, parent);
  el("img", { className: "rig-sizer", src, alt: "" }, rig);
  el("img", { className: "rig-part leg-back", src, alt: "" }, rig);
  el("img", { className: "rig-part leg-front", src, alt: "" }, rig);
  el("img", { className: "rig-part torso", src, alt: "" }, rig);
  return rig;
}

// ------------------------------------------------------------ click dance
const NOTES = ["♪", "♫", "♬"];

function spawnNotes(target, count = 6) {
  const r = target.getBoundingClientRect();
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      if (!target.isConnected) return;
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
function makeDanceable(actor, body, getTrip, signal, frames = DANCE_FRAMES, duration = 2600) {
  if (!settings.santaActs.dance) return;
  let dancing = false;
  actor.classList.add("click");
  actor.title = "Click Santa!";
  actor.addEventListener("click", async (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (dancing || !settings.santaActs.dance) return;
    dancing = true;
    const trip = getTrip();
    trip?.pause();
    const hadWaddle = body.classList.contains("waddle");
    const hadGallop = body.classList.contains("gallop");
    body.classList.remove("waddle", "gallop");
    Sound.dance();
    spawnNotes(body);
    spawnSpeechBubble(body);
    await played(body.animate(frames, { duration, easing: "ease-in-out" }), signal);
    if (hadWaddle) body.classList.add("waddle");
    if (hadGallop) body.classList.add("gallop");
    if (trip && trip.playState === "paused" && !signal?.aborted) trip.play();
    dancing = false;
  });
}

// ------------------------------------------------ candy canes & glitter pop
let caneSeq = 0;
const activeCanes = new Set();

function caneSVG() {
  const id = `cs${++caneSeq}`;
  return `<svg width="20" height="40" viewBox="0 0 24 48" xmlns="http://www.w3.org/2000/svg">
    <defs><pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="8" height="8" fill="#fff"/><rect width="4" height="8" fill="#d62828"/></pattern></defs>
    <path d="M17 45 V14 a7 7 0 0 0 -14 0" fill="none" stroke="#9b1c1c" stroke-width="7.5" stroke-linecap="round" opacity=".35"/>
    <path d="M17 45 V14 a7 7 0 0 0 -14 0" fill="none" stroke="url(#${id})" stroke-width="6" stroke-linecap="round"/>
  </svg>`;
}

// Peppermint candy-cane glitter burst when a user clicks a candy cane!
function spawnCandyGlitter(cx, cy) {
  const COLORS = ["#d62828", "#ffffff", "#ff4d6d", "#ffe5ec", "#ffd23f", "#ef233c"];
  const count = 30;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + rand(-0.22, 0.22);
    const speed = rand(38, 125);
    const dx = Math.cos(angle) * speed;
    const dy = Math.sin(angle) * speed - rand(18, 48);
    const drop = rand(25, 75);
    const roll = Math.random();
    const shape = roll < 0.34 ? "star" : roll < 0.62 ? "stripe" : roll < 0.84 ? "shard" : "dot";
    const size =
      shape === "star" ? rand(9, 15) : shape === "stripe" ? rand(7, 12) : rand(4, 8);
    const color = COLORS[i % COLORS.length];
    const bgStyle =
      shape === "stripe"
        ? ""
        : `background:${color};box-shadow:0 0 ${shape === "star" ? 8 : 5}px ${color};`;

    const p = el("div", {
      className: `glitter ${shape}`,
      style: `left:${cx}px;top:${cy}px;width:${size}px;height:${shape === "shard" ? size * 0.55 : size}px;${bgStyle}`,
    });

    const spin = rand(-420, 420);
    p.animate(
      [
        { transform: "translate(-50%,-50%) scale(.25) rotate(0deg)", opacity: 1 },
        {
          transform: `translate(calc(-50% + ${dx * 0.62}px), calc(-50% + ${dy * 0.62}px)) scale(1.2) rotate(${spin * 0.5}deg)`,
          opacity: 1,
          offset: 0.35,
        },
        {
          transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + drop * 0.45}px)) scale(.85) rotate(${spin * 0.8}deg)`,
          opacity: 0.85,
          offset: 0.68,
        },
        {
          transform: `translate(calc(-50% + ${dx * 1.12}px), calc(-50% + ${dy + drop}px)) scale(.1) rotate(${spin}deg)`,
          opacity: 0,
        },
      ],
      { duration: rand(680, 1180), easing: "cubic-bezier(.16,.84,.44,1)", fill: "forwards" }
    ).onfinish = () => p.remove();
  }
}

function recordCanePop() {
  const next = (Number(settings.santaCanesCaught) || 0) + 1;
  settings.santaCanesCaught = next;
  try {
    // The worker serializes increments from different tabs so sync lag cannot
    // make two clicks overwrite one another's counter update.
    chrome.runtime.sendMessage({ type: "santa-cane-pop" }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response?.ok) settings.santaCanesCaught = response.count;
    });
  } catch {
    // ignore if extension context reloaded
  }
  return next;
}

function dropCane(x, y) {
  const cane = el("div", {
    className: "cane-actor click",
    title: "Click to pop into candy cane glitter!",
    style: `left:${x}px;top:${y}px;`,
  });
  cane.innerHTML = caneSVG();
  const ground = window.innerHeight - 8 - Snow.heightAt(x) - 34;
  const fall = Math.max(0, ground - y);
  const spin = Math.random() < 0.5 ? -1 : 1;
  const land = 80 * spin;
  const drift = rand(-30, 30);

  let fadeTimer = null;
  let gone = false;

  const record = {
    el: cane,
    blown: false,
    cleanup() {
      if (gone) return;
      gone = true;
      clearTimeout(fadeTimer);
      activeCanes.delete(record);
      cane.remove();
    },
  };
  activeCanes.add(record);

  const fallAnim = cane.animate(
    [
      { transform: "translate(0,0) rotate(0)", easing: "cubic-bezier(.5,0,1,1)" },
      { transform: `translate(${drift}px,${fall}px) rotate(${land + 140 * spin}deg)`, offset: 0.6, easing: "ease-out" },
      { transform: `translate(${drift * 1.1}px,${fall - 18}px) rotate(${land + 40 * spin}deg)`, offset: 0.75, easing: "ease-in" },
      { transform: `translate(${drift * 1.2}px,${fall}px) rotate(${land}deg)`, offset: 0.9 },
      { transform: `translate(${drift * 1.2}px,${fall - 4}px) rotate(${land}deg)`, offset: 0.95 },
      { transform: `translate(${drift * 1.2}px,${fall}px) rotate(${land}deg)` },
    ],
    { duration: 1500, fill: "forwards" }
  );

  fallAnim.onfinish = () => {
    if (gone || record.blown) return;
    fadeTimer = setTimeout(() => {
      if (gone || record.blown) return;
      cane
        .animate([{ opacity: 1 }, { opacity: 0 }], { duration: 1200, fill: "forwards" })
        .onfinish = () => record.cleanup();
    }, 8500);
  };

  cane.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (gone) return;
    const r = cane.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    cane.getAnimations().forEach((a) => a.cancel());
    record.cleanup();
    Sound.canePop();
    spawnCandyGlitter(cx, cy);
    recordCanePop();
  });
}

// Send any candy canes in the leaf blower's path tumbling across the screen!
function blowCanes(b) {
  if (!activeCanes.size) return;
  const reach = 135;
  const minX = b.dir < 0 ? b.x - reach : b.x - 16;
  const maxX = b.dir < 0 ? b.x + 16 : b.x + reach;
  for (const rec of [...activeCanes]) {
    if (rec.blown || !rec.el.isConnected) continue;
    const r = rec.el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    if (cx < minX || cx > maxX || r.bottom < window.innerHeight - 130) continue;
    rec.blown = true;
    rec.el.getAnimations().forEach((a) => a.cancel());
    rec.el.style.left = `${r.left}px`;
    rec.el.style.top = `${r.top}px`;
    const flyX = b.dir * rand(260, 520);
    const flyY = -rand(90, 210);
    rec.el
      .animate(
        [
          { transform: "translate(0,0) rotate(0deg)", opacity: 1 },
          { transform: `translate(${flyX * 0.55}px,${flyY}px) rotate(${b.dir * 380}deg)`, opacity: 1, offset: 0.55 },
          { transform: `translate(${flyX}px,${flyY + 95}px) rotate(${b.dir * 720}deg)`, opacity: 0 },
        ],
        { duration: rand(700, 1050), easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" }
      )
      .onfinish = () => rec.cleanup();
  }
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
