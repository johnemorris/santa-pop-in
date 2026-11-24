const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const CONTENT_FILES = ["core", "stage", "effects", "acts", "snow", "decor", "main"].map((f) => `content/${f}.js`);

test("manifest.json and package.json versions and scripts are consistent", () => {
  const manifest = JSON.parse(read("manifest.json"));
  const pkg = JSON.parse(read("package.json"));
  assert.equal(manifest.manifest_version, 3);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(pkg.version, manifest.version);
  assert.deepEqual(manifest.content_scripts[0].js, ["settings.js", ...CONTENT_FILES]);
  for (const f of manifest.content_scripts[0].js) assert.ok(fs.existsSync(path.join(ROOT, f)), `Missing content script: ${f}`);
  assert.ok(manifest.permissions.includes("storage"));
  assert.ok(manifest.permissions.includes("alarms"));
  for (const res of manifest.web_accessible_resources[0].resources) {
    assert.ok(fs.existsSync(path.join(ROOT, res)), `Missing web_accessible_resource: ${res}`);
  }
  for (const iconPath of Object.values(manifest.icons)) {
    assert.ok(fs.existsSync(path.join(ROOT, iconPath)), `Missing icon: ${iconPath}`);
  }
});

test("settings.js mergeSantaSettings and santaDaysUntilChristmas", () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(read("settings.js"), ctx);

  const merged = ctx.mergeSantaSettings({
    santaFreq: 5,
    santaActs: { peek: false },
    santaDecor: { trees: true },
    santaPausedSites: ["example.com"],
  });
  assert.equal(merged.santaFreq, 5);
  assert.equal(merged.santaActs.peek, false);
  assert.equal(merged.santaActs.walk, true);
  assert.equal(merged.santaDecor.trees, true);
  assert.equal(merged.santaDecor.ornaments, true);
  assert.deepEqual(Array.from(merged.santaPausedSites), ["example.com"]);

  assert.equal(ctx.santaDaysUntilChristmas(new Date(2026, 11, 25)), 0);
  assert.equal(ctx.santaDaysUntilChristmas(new Date(2026, 11, 24)), 1);
  assert.equal(ctx.santaDaysUntilChristmas(new Date(2026, 11, 26)), 364);
});

test("background.js badge states, snooze alarm, and santa-may-show gating", async () => {
  let badgeText = "";
  let badgeColor = "";
  let createdAlarm = null;
  let clearedAlarm = false;
  let windowState = { id: 1, focused: true, state: "normal" };
  const sessionStore = {};
  let syncData = { santaEnabled: true, santaSnoozeUntil: 0 };

  const ctx = {
    importScripts: (p) => vm.runInContext(read(p), ctx),
    chrome: {
      action: {
        setBadgeText: ({ text }) => { badgeText = text; },
        setBadgeBackgroundColor: ({ color }) => { badgeColor = color; },
      },
      alarms: {
        clear: () => { clearedAlarm = true; },
        create: (name, opts) => { createdAlarm = { name, opts }; },
        onAlarm: { addListener: (fn) => { ctx._onAlarm = fn; } },
      },
      storage: {
        sync: { get: (defaults, cb) => cb({ ...defaults, ...syncData }) },
        session: {
          async get(k) { return { [k]: sessionStore[k] }; },
          async set(obj) { Object.assign(sessionStore, obj); },
        },
        onChanged: { addListener: (fn) => { ctx._onStorageChanged = fn; } },
      },
      runtime: {
        onInstalled: { addListener: () => {} },
        onStartup: { addListener: () => {} },
        onMessage: { addListener: (fn) => { ctx._onMsg = fn; } },
      },
      windows: {
        get: async () => windowState,
      },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(read("background.js"), ctx);

  ctx.refreshBadge();
  assert.equal(badgeText, "ON");
  assert.equal(badgeColor, "#16a34a");
  assert.equal(clearedAlarm, true);

  syncData = { santaEnabled: true, santaSnoozeUntil: Date.now() + 60000 };
  ctx.refreshBadge();
  assert.equal(badgeText, "ZZZ");
  assert.equal(createdAlarm.name, "santa-snooze-end");

  syncData = { santaEnabled: false, santaSnoozeUntil: 0 };
  ctx.refreshBadge();
  assert.equal(badgeText, "OFF");
  assert.equal(badgeColor, "#dc2626");

  const ask = (sender, gapMs = 60000) =>
    new Promise((res) => ctx._onMsg({ type: "santa-may-show", gapMs }, sender, res));

  assert.equal((await ask({ tab: { active: true, windowId: 1 }, frameId: 0 })).ok, true);
  assert.equal((await ask({ tab: { active: true, windowId: 1 }, frameId: 0 })).ok, false);
  assert.equal((await ask({ tab: { active: false, windowId: 1 }, frameId: 0 }, 0)).ok, false);
  assert.equal((await ask({ tab: { active: true, windowId: 1 }, frameId: 2 }, 0)).ok, false);

  windowState = { id: 1, focused: false, state: "normal" };
  assert.equal((await ask({ tab: { active: true, windowId: 1 }, frameId: 0 }, 0)).ok, false);

  windowState = { id: 1, focused: true, state: "minimized" };
  assert.equal((await ask({ tab: { active: true, windowId: 1 }, frameId: 0 }, 0)).ok, false);
});

test("popup.js inert state, pause/snooze controls, and settings persistence", async () => {
  const elements = new Map();
  function makeEl(id, extra = {}) {
    const classes = new Set();
    const listeners = {};
    const el = {
      id,
      value: "",
      textContent: "",
      checked: false,
      disabled: false,
      hidden: false,
      inert: false,
      href: "",
      title: "",
      dataset: {},
      parentElement: { classList: { toggle: () => {} } },
      classList: {
        add: (c) => classes.add(c),
        remove: (c) => classes.delete(c),
        toggle: (c, force) => (force === undefined ? (classes.has(c) ? classes.delete(c) : classes.add(c)) : force ? classes.add(c) : classes.delete(c)),
        contains: (c) => classes.has(c),
      },
      addEventListener: (ev, fn) => { (listeners[ev] ||= []).push(fn); },
      dispatch: (ev) => (listeners[ev] || []).forEach((fn) => fn({ target: el })),
      ...extra,
    };
    elements.set(`#${id}`, el);
    return el;
  }

  const enabled = makeEl("enabled");
  const freq = makeEl("freq");
  const freqText = makeEl("freqText");
  const body = makeEl("body");
  const sound = makeEl("sound");
  const countdown = makeEl("countdown");
  const pauseSiteBtn = makeEl("pauseSiteBtn");
  const snoozeBtn = makeEl("snoozeBtn");
  const pauseNote = makeEl("pauseNote");
  const caneStat = makeEl("caneStat");
  const lightOpts = makeEl("lightOpts");
  const lightStyle = makeEl("lightStyle");
  const lightMode = makeEl("lightMode");
  const tryMsg = makeEl("tryMsg");
  const tipLink = makeEl("tipLink");
  const brandLink = makeEl("brandLink");

  const actBoxes = ["peek", "walk", "sleigh"].map((act) => makeEl(`act-${act}`, { dataset: { act } }));
  const decorBoxes = ["lights", "trees", "ornaments"].map((decor) => makeEl(`decor-${decor}`, { dataset: { decor } }));
  const sizeButtons = ["1", "2", "3"].map((size) => makeEl(`size-${size}`, { dataset: { size } }));

  const stored = {};
  const ctx = {
    document: {
      querySelector: (s) => elements.get(s),
      querySelectorAll: (s) => {
        if (s === "[data-size]") return sizeButtons;
        if (s === "[data-act]") return actBoxes;
        if (s === "[data-decor]") return decorBoxes;
        if (s === "[data-try]") return [];
        return [];
      },
    },
    window: { close: () => {} },
    URL,
    chrome: {
      tabs: {
        query: async () => [{ id: 1, url: "https://example.com/page" }],
        sendMessage: (_id, _msg, cb) => cb({ ok: true }),
      },
      storage: {
        sync: {
          get: (defaults, cb) => cb({ ...defaults, santaEnabled: false, santaCanesCaught: 3 }),
          set: (obj) => Object.assign(stored, obj),
        },
        onChanged: { addListener: () => {} },
      },
      runtime: {},
    },
  };
  vm.createContext(ctx);
  vm.runInContext(read("settings.js"), ctx);
  vm.runInContext(read("popup.js"), ctx);

  await new Promise((r) => setTimeout(r, 10));

  // body.inert must disable #body without disabling #enabled
  assert.equal(enabled.checked, false);
  assert.equal(body.inert, true);
  assert.equal(body.classList.contains("off"), true);
  assert.equal(enabled.disabled, false);
  assert.equal(caneStat.hidden, false);
  assert.match(caneStat.textContent, /3 candy canes/);

  // Re-enabling clears body.inert
  enabled.checked = true;
  enabled.dispatch("change");
  assert.equal(stored.santaEnabled, true);
  assert.equal(body.inert, false);
  assert.equal(body.classList.contains("off"), false);

  // Per-site pause & snooze
  pauseSiteBtn.dispatch("click");
  assert.deepEqual(Array.from(stored.santaPausedSites), ["example.com"]);
  snoozeBtn.dispatch("click");
  assert.ok(stored.santaSnoozeUntil > Date.now());
});

test("content scripts lifecycle: stopAll during blower, hover translucency, cloud single-click, and cane-pop decor stability", async () => {
  const animations = [];
  const docListeners = {};
  const winListeners = {};
  let syncSettings = {};
  let onStorageChanged = null;
  let onRuntimeMsg = null;

  class FakeClassList {
    constructor(el) { this.el = el; this.set = new Set(); }
    _sync() { this.set = new Set((this.el.className || "").split(/\s+/).filter(Boolean)); }
    add(...cls) { cls.forEach((c) => this.set.add(c)); this.el.className = [...this.set].join(" "); }
    remove(...cls) { cls.forEach((c) => this.set.delete(c)); this.el.className = [...this.set].join(" "); }
    contains(c) { return this.set.has(c); }
    toggle(c, force) {
      const on = force === undefined ? !this.set.has(c) : Boolean(force);
      if (on) this.set.add(c); else this.set.delete(c);
      this.el.className = [...this.set].join(" ");
      return on;
    }
  }

  function makeNode(tag) {
    const listeners = {};
    const node = {
      tagName: tag.toUpperCase(),
      children: [],
      parentNode: null,
      style: { cssText: "" },
      _className: "",
      get className() { return this._className; },
      set className(v) { this._className = v; this.classList._sync(); },
      get isConnected() {
        let cur = this;
        while (cur) {
          if (cur === doc.body || cur === doc.documentElement) return true;
          cur = cur.parentNode;
        }
        return false;
      },
      appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
      },
      append(...nodes) { nodes.forEach((n) => this.appendChild(n)); },
      prepend(...nodes) {
        nodes.forEach((n) => { n.parentNode = this; });
        this.children.unshift(...nodes);
      },
      remove() {
        if (!this.parentNode) return;
        this.parentNode.children = this.parentNode.children.filter((c) => c !== this);
        this.parentNode = null;
      },
      attachShadow() {
        const sr = makeNode("shadow-root");
        sr.parentNode = this;
        Object.defineProperty(sr, "isConnected", { get: () => this.isConnected });
        this.shadowRoot = sr;
        return sr;
      },
      setAttribute() {},
      addEventListener(ev, fn) { (listeners[ev] ||= []).push(fn); },
      dispatch(ev, eventObj = {}) {
        (listeners[ev] || []).forEach((fn) =>
          fn({ stopPropagation() {}, preventDefault() {}, ...eventObj })
        );
      },
      getBoundingClientRect() {
        return { left: 10, top: 650, right: 110, bottom: 800, width: 100, height: 150 };
      },
      getAnimations() { return []; },
      getContext() {
        return {
          setTransform() {}, clearRect() {}, createLinearGradient: () => ({ addColorStop() {} }),
          beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, stroke() {},
          save() {}, restore() {}, arc() {}, rotate() {}, drawImage() {},
        };
      },
      animate(_frames, _opts) {
        const anim = {
          playState: "running",
          currentTime: 0,
          onfinish: null,
          oncancel: null,
          pause() { this.playState = "paused"; },
          play() { this.playState = "running"; },
          updatePlaybackRate() {},
          cancel() {
            this.playState = "idle";
            this.oncancel?.();
          },
          finish() {
            this.playState = "finished";
            this.onfinish?.();
          },
        };
        animations.push(anim);
        return anim;
      },
    };
    node.classList = new FakeClassList(node);
    return node;
  }

  const doc = {
    visibilityState: "visible",
    fullscreenElement: null,
    documentElement: makeNode("html"),
    body: makeNode("body"),
    createElement: (t) => makeNode(t),
    createElementNS: (_ns, t) => makeNode(t),
    hasFocus: () => true,
    addEventListener: (ev, fn) => { (docListeners[ev] ||= []).push(fn); },
  };
  doc.body.parentNode = doc.documentElement;
  doc.documentElement.isConnected = true;

  const win = {
    innerWidth: 1000,
    innerHeight: 800,
    devicePixelRatio: 1,
    location: { hostname: "example.com" },
    matchMedia: () => ({ matches: false }),
    addEventListener: (ev, fn) => { (winListeners[ev] ||= []).push(fn); },
  };
  Object.assign(win, { document: doc, window: win });

  const ctx = {
    ...win,
    document: doc,
    window: win,
    performance,
    AbortController,
    Float32Array,
    structuredClone,
    setTimeout: (...a) => { const t = setTimeout(...a); t.unref?.(); return t; },
    clearTimeout,
    setInterval: (...a) => { const t = setInterval(...a); t.unref?.(); return t; },
    clearInterval,
    requestAnimationFrame: (fn) => { const t = setTimeout(() => fn(performance.now()), 16); t.unref?.(); return t; },
    cancelAnimationFrame: (id) => clearTimeout(id),
    chrome: {
      runtime: {
        getURL: (p) => `chrome-extension://id/${p}`,
        sendMessage: (_m, cb) => cb({ ok: true }),
        onMessage: { addListener: (fn) => { onRuntimeMsg = fn; } },
      },
      storage: {
        sync: {
          get: (defaults, cb) => cb({ ...defaults, ...syncSettings }),
          set: () => {},
        },
        onChanged: { addListener: (fn) => { onStorageChanged = fn; } },
      },
    },
  };

  vm.createContext(ctx);
  vm.runInContext(read("settings.js"), ctx);
  for (const f of CONTENT_FILES) vm.runInContext(read(f), ctx, { filename: f });

  // Enable trees to verify hover translucency + decor stability on santaCanesCaught
  syncSettings = { santaEnabled: true, santaDecor: { lights: true, trees: true, ornaments: true } };
  onStorageChanged({ santaDecor: { newValue: syncSettings.santaDecor } }, "sync");

  const host = doc.body.children.find((c) => c.tagName === "SANTA-POP-IN");
  assert.ok(host, "Stage host should be mounted");
  const layer = host.shadowRoot.children[1];
  const initialDecor = layer.children.find((c) => c.className === "decor");
  assert.ok(initialDecor, "Decor should be rendered");

  // Popping a candy cane must NOT tear down and rebuild .decor
  onStorageChanged({ santaCanesCaught: { newValue: 5 } }, "sync");
  const sameDecor = layer.children.find((c) => c.className === "decor");
  assert.equal(sameDecor, initialDecor);

  // Trigger blower via santa-summon (seeds snow + starts blower), then verify snow hover & stopAll
  onRuntimeMsg({ type: "santa-summon", act: "blower" }, {}, () => {});
  const snowCanvas = layer.children.find((c) => c.tagName === "CANVAS");
  assert.ok(snowCanvas, "Snow canvas should be created");

  // Mouse over bottom snow pile -> .back added
  docListeners.mousemove.forEach((fn) => fn({ clientX: 50, clientY: 795 }));
  await new Promise((r) => setTimeout(r, 25));
  assert.equal(snowCanvas.classList.contains("back"), true);
  // Mouse away -> .back removed
  docListeners.mouseleave.forEach((fn) => fn({}));
  await new Promise((r) => setTimeout(r, 25));
  assert.equal(snowCanvas.classList.contains("back"), false);

  // Disable Santa mid-blower -> host removed cleanly
  syncSettings = { santaEnabled: false };
  onStorageChanged({ santaEnabled: { newValue: false } }, "sync");
  assert.equal(doc.body.children.some((c) => c.tagName === "SANTA-POP-IN"), false);

  // Re-enable and summon cloud, then single-click to dissipate
  syncSettings = { santaEnabled: true, santaDecor: { lights: false, trees: false } };
  onStorageChanged({ santaEnabled: { newValue: true } }, "sync");
  onRuntimeMsg({ type: "santa-summon", act: "cloud" }, {}, () => {});
  const host2 = doc.body.children.find((c) => c.tagName === "SANTA-POP-IN");
  const layer2 = host2.shadowRoot.children[1];
  const cloudActor = layer2.children.find((c) => c.classList.contains("click"));
  assert.ok(cloudActor, "Cloud actor should be mounted");

  cloudActor.dispatch("click");
  await new Promise((r) => setTimeout(r, 400));
  // Finish the fade-out animation (last pushed animation) -> finishes trip & removes cloud
  const fadeAnim = animations[animations.length - 1];
  fadeAnim.finish();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(cloudActor.isConnected, false, "Cloud should be removed after single-click dissipation");
});
