// Santa Pop-In content script: Shared settings, helpers, and the Sound player. Loads first.
// Content scripts share one isolated world, so top-level names here are
// visible to the other content/*.js files (see manifest.json for load order).

// ---------------------------------------------------------------- settings
// SANTA_DEFAULTS, mergeSantaSettings, and santaDaysUntilChristmas are loaded from settings.js.

// Minutes of *visible* tab time between appearances, per slider step.
const FREQ_MINUTES = {
  1: [10, 20],
  2: [5, 10],
  3: [3, 6],
  4: [1.5, 3],
  5: [0.66, 1.5],
};

const SIZE_SCALES = { 1: 0.78, 2: 1.0, 3: 1.28 };

// How often each scheduled act is picked (among the ones switched on).
// Countdown sign and top-edge rope drop are occasional treats.
const ACT_WEIGHTS = { peek: 44, walk: 22, sleigh: 11, cloud: 12, sign: 6, drop: 5 };

let settings = mergeSantaSettings();

const url = (p) => chrome.runtime.getURL(p);
const rand = (a, b) => a + Math.random() * (b - a);
const sizeScale = () => SIZE_SCALES[settings.santaSize] || 1;
const sleep = (ms, signal) =>
  new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    });
  });

function isChristmasHoliday() {
  const now = new Date();
  return now.getMonth() === 11 && (now.getDate() === 24 || now.getDate() === 25);
}

function currentHost() {
  return (window.location.hostname || "").toLowerCase();
}

function isSitePaused() {
  const hostName = currentHost();
  if (!hostName) return false;
  return Array.isArray(settings.santaPausedSites) && settings.santaPausedSites.includes(hostName);
}

function isSnoozed() {
  return Number(settings.santaSnoozeUntil) > Date.now();
}

function isActiveHere() {
  return Boolean(settings.santaEnabled) && !isSitePaused() && !isSnoozed();
}

// ------------------------------------------------------------------ audio
// Optional soft sounds (off by default): real sleigh-bell and ho-ho-ho
// recordings (CC0, see sounds/CREDITS.md). Santa's leaf blower is a real backpack blower recording.
const Sound = (() => {
  const BASE_VOL = 0.35;
  const cache = {};
  let loop = null;

  function audio(name) {
    if (!cache[name]) {
      const a = new Audio(url(`sounds/${name}.ogg`));
      a.preload = "auto";
      cache[name] = a;
    }
    return cache[name];
  }

  function play(name, vol = 1) {
    if (!settings.santaSound) return;
    try {
      const a = audio(name).cloneNode();
      a.volume = Math.min(1, BASE_VOL * vol);
      a.play().catch(() => {}); // the page may not allow sound yet
    } catch {
      // ignore audio errors
    }
  }

  // A quiet looping sound tied to an act; returns a stop function that fades it out.
  function loopFor(name, vol, signal) {
    stopLoop();
    if (!settings.santaSound) return () => {};
    const a = audio(name).cloneNode();
    a.loop = true;
    a.volume = Math.min(1, BASE_VOL * vol);
    a.play().catch(() => {});
    let stopped = false;
    const me = { a, stop() {
      if (stopped) return;
      stopped = true;
      if (loop === me) loop = null;
      const v0 = a.volume, t0 = performance.now();
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / 400);
        a.volume = v0 * (1 - k);
        if (k < 1) requestAnimationFrame(step); else a.pause();
      };
      step();
    } };
    loop = me;
    signal?.addEventListener("abort", () => me.stop(), { once: true });
    return () => me.stop();
  }
  function stopLoop() { loop?.stop(); }

  return {
    canePop: () => play("cane-pop", 0.8),
    dance: () => play("dance", 1),
    sleigh: (signal) => loopFor("sleigh-bells", 0.7, signal),
    walk: (signal) => loopFor("walk-bells", 0.45, signal),
    sign: () => play("sign", 0.7),
    cloud: (level) => play("cloud", 0.4 + Math.min(level, 6) * 0.08),
    blower: (signal) => loopFor("blower", 0.075, signal), // real petrol leaf blower, 10% of 1.4.4 level
    stop: stopLoop,
  };
})();
