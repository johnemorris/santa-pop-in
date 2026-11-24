// Santa Pop-In content script: Scheduler, settings sync, and popup messages. Loads last and starts Santa.
// Content scripts share one isolated world, so top-level names here are
// visible to the other content/*.js files (see manifest.json for load order).

// ---------------------------------------------------------------- scheduler
let timerId = null;
let snoozeWakeId = null;
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
  if (!isActiveHere() || document.visibilityState !== "visible") return;
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

function armSnoozeWake() {
  clearTimeout(snoozeWakeId);
  snoozeWakeId = null;
  if (!settings.santaEnabled || isSitePaused()) return;
  const wait = Number(settings.santaSnoozeUntil) - Date.now();
  if (wait > 0) {
    snoozeWakeId = setTimeout(() => {
      snoozeWakeId = null;
      if (isActiveHere()) {
        Decor.render();
        schedule();
      }
    }, Math.min(wait + 250, 2147483647));
  }
}

const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");

let waitingForFocus = false;
function mayShow() {
  const [lo] = FREQ_MINUTES[settings.santaFreq] || FREQ_MINUTES[3];
  return new Promise((res) => {
    try {
      chrome.runtime.sendMessage({ type: "santa-may-show", gapMs: lo * 60 * 1000 * 0.8 }, (r) => {
        if (chrome.runtime.lastError) return res(false);
        res(Boolean(r?.ok));
      });
    } catch (e) {
      res(false);
    }
  });
}

async function fire() {
  timerId = null;
  if (!isActiveHere()) return;
  if (!document.hasFocus()) {
    waitingForFocus = true;
    return;
  }
  waitingForFocus = false;
  const quiet = document.fullscreenElement || reducedMotion?.matches || current;
  const act = quiet ? null : pickAct();
  if (act && (await mayShow())) await run(act);
  if (isActiveHere()) schedule();
}

window.addEventListener("focus", () => {
  if (!waitingForFocus || !isActiveHere()) return;
  waitingForFocus = false;
  remaining = rand(2, 5) * 1000;
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
  waitingForFocus = false;
  current?.abort();
  current = null;
  blowerCtl?.abort();
  blowerCtl = null;
  for (const rec of [...activeCanes]) rec.cleanup();
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
  chrome.storage.sync.get(SANTA_DEFAULTS, (data) => {
    settings = mergeSantaSettings(data);
    cb?.();
  });
}

load(() => {
  armSnoozeWake();
  Decor.render();
  if (isActiveHere()) schedule();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  const keys = Object.keys(changes);
  if (keys.length === 1 && keys[0] === "santaCanesCaught") {
    settings.santaCanesCaught = Number(changes.santaCanesCaught.newValue) || 0;
    return;
  }
  const wasActive = isActiveHere();
  const oldFreq = settings.santaFreq;
  load(() => {
    armSnoozeWake();
    const nowActive = isActiveHere();
    if (!nowActive) return stopAll();
    Decor.render();
    if (!wasActive || oldFreq !== settings.santaFreq) schedule();
  });
});

// "Try it now" buttons in the popup.
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type !== "santa-summon") return;
  if (!isActiveHere()) return reply({ ok: false, paused: true });
  if (msg.act === "blower") {
    if (!Snow.hasPile()) Snow.seed();
    onPileClick(null);
  } else if (msg.act === "cane") {
    ensureStage();
    dropCane(rand(window.innerWidth * 0.25, window.innerWidth * 0.75), rand(60, 140));
  } else if (ACTS[msg.act]) {
    run(msg.act);
  }
  reply({ ok: true });
});
