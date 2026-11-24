const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("finished sleeps and animations release abort listeners; pre-aborted waits settle", async () => {
  const ctx = vm.createContext({ setTimeout, clearTimeout, chrome: {}, window: {} });
  vm.runInContext(read("settings.js") + read("content/core.js") + read("content/stage.js"), ctx);
  const signal = new EventTarget();
  let listeners = 0;
  signal.addEventListener = (...args) => { listeners++; EventTarget.prototype.addEventListener.call(signal, ...args); };
  signal.removeEventListener = (...args) => { listeners--; EventTarget.prototype.removeEventListener.call(signal, ...args); };
  const sleep = vm.runInContext("sleep", ctx);
  await sleep(1, signal);
  assert.equal(listeners, 0);
  const anim = { cancel() {} };
  const finished = ctx.played(anim, signal);
  anim.onfinish();
  await finished;
  assert.equal(listeners, 0);
  const ctl = new AbortController();
  ctl.abort();
  let canceled = false;
  await ctx.played({ cancel() { canceled = true; } }, ctl.signal);
  assert.equal(canceled, true);
  await sleep(10000, ctl.signal);
});

test("sound off stops one-shots, loops and pending fades immediately, even without animation frames", () => {
  const tracks = [];
  class Audio {
    cloneNode() { const a = new Audio(); tracks.push(a); return a; }
    play() { return Promise.resolve(); }
    pause() { this.paused = true; }
  }
  const ctx = vm.createContext({ Audio, performance, requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    chrome: { runtime: { getURL: (s) => s } }, window: {} });
  vm.runInContext(read("settings.js") + read("content/core.js"), ctx);
  vm.runInContext("settings.santaSound = true", ctx);
  const sound = vm.runInContext("Sound", ctx);
  const ctl = new AbortController();
  const stop = sound.walk(ctl.signal);
  stop(); // Leave the fade pending, as in a background tab.
  sound.dance();
  sound.stop();
  assert.equal(tracks.length, 2);
  assert.ok(tracks.every((a) => a.paused));
  sound.walk(AbortSignal.abort());
  assert.equal(tracks.length, 2, "A pre-aborted act must not start sound");
});

function scheduler() {
  let approval;
  const tasks = new Map();
  let id = 0, starts = 0;
  const ctx = vm.createContext({
    setTimeout: (fn) => { tasks.set(++id, fn); return id; }, clearTimeout: (id) => tasks.delete(id),
    performance, AbortController, Object,
    window: { addEventListener() {}, matchMedia: () => ({ matches: false }) },
    document: { visibilityState: "visible", fullscreenElement: null, hasFocus: () => true, addEventListener() {} },
    FREQ_MINUTES: { 3: [3, 6] }, ACT_WEIGHTS: { walk: 1 }, rand: (a) => a,
    isActiveHere() { return ctx.enabled; }, isSitePaused: () => false, enabled: true,
    Decor: { render() {}, clear() {} }, Sound: { stop() {} }, Snow: { clear() {} }, activeCanes: [],
    ACTS: { walk: async () => { starts++; } },
    chrome: {
      runtime: { id: "test-extension", sendMessage(_m, cb) { approval = cb; }, onMessage: { addListener() {} } },
      storage: { sync: { get(_d, cb) { cb({}); } }, onChanged: { addListener() {} } },
    },
  });
  vm.runInContext(read("settings.js"), ctx);
  vm.runInContext("let settings=mergeSantaSettings(); let blowerCtl=null; let host=null,root=null,layer=null;", ctx);
  vm.runInContext(read("content/main.js"), ctx);
  return { ctx, tasks, starts: () => starts, approve: () => approval({ ok: true }) };
}

for (const change of ["disable", "disable and re-enable", "fullscreen", "blur", "hidden", "new schedule"]) {
  test(`worker approval arriving after ${change} must not resurrect Santa`, async () => {
    const s = scheduler();
    const pending = s.ctx.fire();
    if (change.startsWith("disable")) {
      s.ctx.enabled = false;
      s.ctx.stopAll();
      if (change.includes("re-enable")) s.ctx.enabled = true;
    } else if (change === "fullscreen") s.ctx.document.fullscreenElement = {};
    else if (change === "blur") s.ctx.document.hasFocus = () => false;
    else if (change === "hidden") s.ctx.document.visibilityState = "hidden";
    else s.ctx.schedule();
    s.approve();
    await pending;
    assert.equal(s.starts(), 0);
  });
}

test("normal worker approval starts one act and leaves one scheduled timer", async () => {
  const s = scheduler();
  // fire normally consumes the outstanding timeout before entering this function.
  s.tasks.clear();
  const pending = s.ctx.fire();
  s.approve();
  await pending;
  assert.equal(s.starts(), 1);
  assert.equal(s.tasks.size, 1);
});

test("simultaneous multi-tab worker requests reserve only one appearance", async () => {
  const store = {};
  let onMessage;
  const event = { addListener() {} };
  const ctx = vm.createContext({ importScripts() {}, chrome: {
    runtime: { onMessage: { addListener(fn) { onMessage = fn; } }, onInstalled: event, onStartup: event },
    storage: { onChanged: event, session: { async get() { return { ...store }; }, async set(v) { Object.assign(store, v); } } },
    windows: { async get() { return { focused: true }; } }, alarms: { onAlarm: event },
  } });
  vm.runInContext(read("background.js"), ctx);
  const ask = () => new Promise((resolve) => onMessage({ type: "santa-may-show", gapMs: 60000 }, { tab: { active: true, windowId: 1 }, frameId: 0 }, resolve));
  const replies = await Promise.all([ask(), ask(), ask()]);
  assert.equal(replies.filter((r) => r.ok).length, 1);
});

test("multi-tab candy clicks increment from stored state without losing updates", async () => {
  const store = { santaCanesCaught: 7 };
  let onMessage;
  const event = { addListener() {} };
  const ctx = vm.createContext({ importScripts() {}, chrome: {
    runtime: { onMessage: { addListener(fn) { onMessage = fn; } }, onInstalled: event, onStartup: event },
    storage: { onChanged: event, sync: { async get() { return { ...store }; }, async set(v) { Object.assign(store, v); } } },
    alarms: { onAlarm: event },
  } });
  vm.runInContext(read("background.js"), ctx);
  const ask = () => new Promise((resolve) => onMessage({ type: "santa-cane-pop" }, { tab: { id: 1 }, frameId: 0 }, resolve));
  const replies = await Promise.all([ask(), ask(), ask()]);
  assert.deepEqual(replies.map((r) => r.count), [8, 9, 10]);
  assert.equal(store.santaCanesCaught, 10);
});

test("aborted blower cleanup cannot clear the replacement blower's ownership", async () => {
  let nozzle, fades = 0;
  const actor = () => ({ remove() {} });
  const ctx = vm.createContext({
    window: { innerWidth: 1000 }, sizeScale: () => 1, rand: (a) => a, url: (p) => p,
    el: actor, addShadow() {}, createRiggedSprite: actor,
    crossScreen: () => ({ trip: {}, duration: 1 }), makeDanceable() {}, HOP_FRAMES: [],
    Sound: { blower: () => () => {} }, Snow: { setBlower(fn) { nozzle = fn; }, fadePile() { fades++; } },
    played: (_trip, signal) => new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true })),
  });
  vm.runInContext(read("content/acts.js"), ctx);
  const first = new AbortController(), second = new AbortController();
  const oldAct = ctx.actBlower(first.signal);
  first.abort();
  const newAct = ctx.actBlower(second.signal);
  await oldAct;
  assert.equal(vm.runInContext("blowing", ctx), true);
  assert.equal(typeof nozzle, "function");
  second.abort();
  await newAct;
  assert.equal(nozzle, null);
  assert.equal(fades, 0, "Abort never starts a new melting timer");
});
