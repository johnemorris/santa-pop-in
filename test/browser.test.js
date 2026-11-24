// Real unpacked MV3 extension, real Chrome APIs, isolated temporary profile.
// Set PLAYWRIGHT_MODULE and CHROME_EXECUTABLE when using an existing toolchain.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { execFileSync } = require("node:child_process");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const ROOT = path.resolve(__dirname, "..");
const EXTENSION_ROOT = path.resolve(process.env.EXTENSION_PATH || ROOT);
const fixture = `<!doctype html><html lang="en"><title>Santa release fixture</title>
<style>body{margin:30px;font:16px system-ui;background:#edf4ff;color:#123}#feed{max-width:900px}.card{padding:8px;border:1px solid #aab;margin:8px}input{font:inherit}</style>
<h1>Santa release fixture</h1><button id="host-button" onclick="this.textContent='Clicked'">Host action</button>
<label>Host input <input id="host-input"></label><button id="full" onclick="document.documentElement.requestFullscreen()">Fullscreen</button>
<div id="feed"></div><script>if(location.pathname==='/complex'){for(let i=0;i<600;i++){let e=document.createElement('div');e.className='card';e.textContent='Dynamic card '+i;feed.append(e)}setInterval(()=>{feed.firstChild.textContent='Updated '+Date.now()},100)}</script></html>`;

test("unpacked extension release browser verification", { timeout: 230000 }, async (t) => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "santa-browser-"));
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "text/html");
    if (req.url === "/strict") res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'; media-src 'none'; require-trusted-types-for 'script'");
    res.end(fixture);
  });
  let context;
  const errors = [];
  fs.mkdirSync(path.join(ROOT, "dist/audit"), { recursive: true });
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    context = await chromium.launchPersistentContext(profile, {
      headless: process.env.HEADED !== "1", executablePath: process.env.CHROME_EXECUTABLE || undefined,
      ignoreDefaultArgs: ["--disable-extensions"],
      args: [`--disable-extensions-except=${EXTENSION_ROOT}`, `--load-extension=${EXTENSION_ROOT}`],
      viewport: { width: 1280, height: 800 },
    });
    context.on("page", (page) => page.on("pageerror", (e) => errors.push(e.message)));
    let worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker", { timeout: 15000 });
    const extensionId = new URL(worker.url()).host;
    console.log(`Chrome ${context.browser().version()}, extension ${extensionId}`);
    // --load-extension loads initially with developer mode off, but Chrome
    // disables it on reload unless developer mode is enabled in this profile.
    const manager = await context.newPage();
    await manager.goto("chrome://extensions");
    await manager.locator("extensions-toolbar #devMode").evaluate((toggle) => {
      if (!toggle.checked) toggle.click();
    });
    await manager.close();
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    await page.goto(base);
    await page.bringToFront();
    const settings = (values) => worker.evaluate((v) => chrome.storage.sync.set(v), values);
    const summon = (act) => worker.evaluate(async (act) => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return chrome.tabs.sendMessage(tab.id, { type: "santa-summon", act });
    }, act);
    let cdp, isolatedId;
    async function connectWorld() {
      await cdp?.detach();
      cdp = await context.newCDPSession(page);
      const worlds = [];
      cdp.on("Runtime.executionContextCreated", ({ context }) => worlds.push(context));
      await cdp.send("Runtime.enable");
      for (let i = 0; i < 30; i++) {
        for (const world of worlds.filter((w) => w.auxData?.isDefault === false)) {
          const r = await cdp.send("Runtime.evaluate", { expression: "typeof chrome !== 'undefined' && chrome.runtime?.id", contextId: world.id, returnByValue: true });
          if (r.result.value === extensionId) { isolatedId = world.id; return; }
        }
        await page.waitForTimeout(100);
      }
      throw new Error("Manifest content script isolated world was not injected");
    }
    async function world(expression) {
      const r = await cdp.send("Runtime.evaluate", { expression, contextId: isolatedId, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    }
    const clean = () => world("stopAll()");
    await connectWorld();

    await t.test("all eight popup summon acts, images, rig movement and click dance", async () => {
      for (const act of ["peek", "walk", "sleigh", "cloud", "sign", "drop", "cane", "blower"]) {
        await clean();
        assert.equal((await summon(act)).ok, true, act);
        await page.locator("santa-pop-in").waitFor();
        await page.waitForTimeout(300);
        assert.ok(await world("layer.children.length > 0"), act);
        assert.ok(await world("[...root.querySelectorAll('img')].every(i=>i.complete && i.naturalWidth>0)"), `${act} images decode`);
        if (["walk", "sleigh", "blower"].includes(act)) {
          const selector = ".rig-part.leg-front";
          const first = await page.locator(selector).evaluate((e) => getComputedStyle(e).transform);
          await page.waitForTimeout(130);
          const second = await page.locator(selector).evaluate((e) => getComputedStyle(e).transform);
          assert.notEqual(first, second, `${act} rig animates`);
          const actor = page.locator(".actor.click");
          await actor.dispatchEvent("click");
          assert.ok(await world("root.querySelector('.speech') !== null"), `${act} speech bubble`);
        }
      }
      await page.screenshot({ path: path.join(ROOT, "dist/audit/blower.png") });
      await clean();
    });

    await t.test("candy cane pops and persistent counter; single and multiple cloud clicks", async () => {
      await summon("cane");
      const before = await worker.evaluate(async () => (await chrome.storage.sync.get({ santaCanesCaught: 0 })).santaCanesCaught);
      await page.locator(".cane-actor").dispatchEvent("click");
      await page.waitForTimeout(150);
      const after = await worker.evaluate(async () => (await chrome.storage.sync.get("santaCanesCaught")).santaCanesCaught);
      assert.equal(after, before + 1);
      assert.equal(await page.locator(".glitter").count(), 30);
      await clean();
      await summon("cloud");
      await page.locator(".actor.click").dispatchEvent("click");
      await page.waitForTimeout(950);
      assert.equal(await page.locator(".actor.click").count(), 0);
      await clean();
      await summon("cloud");
      await page.locator(".actor.click").dispatchEvent("click");
      await page.locator(".actor.click").dispatchEvent("click");
      await page.waitForTimeout(600);
      assert.equal(await page.locator(".actor.click").count(), 1);
      await page.screenshot({ path: path.join(ROOT, "dist/audit/cloud.png") });
      await clean();
    });

    await t.test("all light palettes and modes keep bulbs on the window edges; trees hover; host input", async () => {
      for (const lightStyle of ["classic", "warm", "icy", "candy"]) {
        for (const lightMode of ["twinkle", "chase", "steady"]) {
          await settings({ santaDecor: { lights: true, trees: true, ornaments: true, lightStyle, lightMode } });
          await page.waitForTimeout(70);
          const boxes = await page.locator(".bulb").evaluateAll((els) => els.map((el) => { const b=el.getBoundingClientRect(); return {x:b.x,y:b.y}; }));
          assert.ok(boxes.length > 50);
          assert.ok(boxes.every((b) => b.x < 25 || b.x > 1240 || b.y < 25 || b.y > 760), `${lightStyle}/${lightMode}`);
        }
      }
      await page.mouse.move(10, 775);
      await page.waitForTimeout(100);
      assert.equal(await page.locator(".tree-wrap.l").evaluate((e) => e.classList.contains("back")), true);
      await page.locator("#host-button").click();
      assert.equal(await page.locator("#host-button").innerText(), "Clicked");
      await page.locator("#host-input").fill("Keyboard works");
      assert.equal(await page.locator("#host-input").inputValue(), "Keyboard works");
      await page.screenshot({ path: path.join(ROOT, "dist/audit/decor.png") });
    });

    await t.test("snow pile hover and melting with the blower disabled", async () => {
      await summon("blower");
      await world("blowerCtl?.abort()");
      await page.waitForTimeout(350);
      assert.equal(await world("Snow.hasPile()"), true);
      await page.mouse.move(15, 790);
      await page.waitForTimeout(100);
      assert.equal(await page.locator("canvas.snow").evaluate((e) => e.classList.contains("back")), true);
      await settings({ santaActs: { blower: false } });
      await page.waitForTimeout(100);
      await page.locator(".pilehit").first().click();
      for (let i = 0; i < 50 && await world("Snow.hasPile()"); i++) await page.waitForTimeout(100);
      assert.equal(await world("Snow.hasPile()"), false);
      await settings({ santaActs: { blower: true } });
      await clean();
    });

    await t.test("real popup settings, accessible size selection, sound files and disable cleanup", async () => {
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup.html`);
      assert.equal(await popup.title(), "Santa Pop-In settings");
      await popup.locator('[data-size="3"]').click();
      assert.equal(await popup.locator('[data-size="3"]').getAttribute("aria-pressed"), "true");
      await popup.locator("#sound").check();
      await popup.screenshot({ path: path.join(ROOT, "dist/audit/popup.png"), fullPage: true });
      const sounds = await popup.evaluate(async () => {
        const files = chrome.runtime.getManifest().web_accessible_resources.flatMap((v) => v.resources).filter((p) => p.endsWith(".ogg"));
        return Promise.all(files.map(async (file) => {
          const audio = new Audio(chrome.runtime.getURL(file));
          await new Promise((resolve, reject) => { audio.onloadedmetadata = resolve; audio.onerror = reject; });
          return { file, duration: audio.duration };
        }));
      });
      assert.equal(sounds.length, 7);
      assert.ok(sounds.every((s) => s.duration > 0 && Number.isFinite(s.duration)));
      await page.bringToFront();
      await summon("walk");
      await page.waitForTimeout(100);
      await settings({ santaEnabled: false });
      await page.waitForTimeout(150);
      assert.equal(await page.locator("santa-pop-in").count(), 0);
      await settings({ santaEnabled: true, santaSound: false, santaSize: 2 });
      await popup.close();
      await page.bringToFront();
    });

    await t.test("site pause, snooze expiry and badge alarm", async () => {
      await settings({ santaPausedSites: ["127.0.0.1"] });
      await page.waitForTimeout(100);
      assert.equal((await summon("walk")).paused, true);
      assert.equal(await page.locator("santa-pop-in").count(), 0);
      await settings({ santaPausedSites: [], santaSnoozeUntil: Date.now() + 800 });
      await page.waitForTimeout(100);
      assert.equal((await summon("walk")).paused, true);
      const alarm = await worker.evaluate(() => chrome.alarms.get("santa-snooze-end"));
      assert.ok(alarm?.scheduledTime > Date.now());
      assert.equal(await worker.evaluate(() => chrome.action.getBadgeText({})), "ZZZ");
      await page.waitForTimeout(1100);
      assert.equal(await worker.evaluate(() => chrome.action.getBadgeText({})), "ON");
      assert.equal((await summon("walk")).ok, true);
      await clean();
      await settings({ santaSnoozeUntil: 0 });
    });

    await t.test("active animations disappear in fullscreen and hidden tabs, and focus gating denies background tab", async () => {
      await summon("sleigh");
      await page.locator("#full").click();
      await page.waitForTimeout(150);
      assert.equal(await page.evaluate(() => !!document.fullscreenElement), true);
      assert.equal(await page.locator("santa-pop-in").count(), 0);
      await page.evaluate(() => document.exitFullscreen());
      await page.waitForTimeout(100);
      // Playwright otherwise reports document.hasFocus() in background tabs.
      await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: false });
      await summon("blower");
      const other = await context.newPage();
      await other.goto(base + "/complex");
      const otherCdp = await context.newCDPSession(other);
      await otherCdp.send("Emulation.setFocusEmulationEnabled", { enabled: false });
      await other.bringToFront();
      await page.waitForTimeout(550);
      assert.equal(await page.locator("santa-pop-in .actor").count(), 0, "Hidden tab has no active actors");
      assert.equal(await world("new Promise(resolve=>chrome.runtime.sendMessage({type:'santa-may-show',gapMs:0},resolve))").then((r) => r.ok), false);
      await other.close();
      await page.bringToFront();
      await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
      const anotherWindow = await worker.evaluate((url) => chrome.windows.create({ url, focused: true }), base);
      try {
        assert.equal(await world("new Promise(resolve=>chrome.runtime.sendMessage({type:'santa-may-show',gapMs:0},resolve))").then((r) => r.ok), false,
          "An active tab in an unfocused window must be denied");
      } finally {
        await worker.evaluate((id) => chrome.windows.remove(id), anotherWindow.id);
        await page.bringToFront();
      }
    });

    await t.test("dynamic complex page, scroll, navigation and reload keep one stage and settings", async () => {
      await page.goto(base + "/complex");
      await connectWorld();
      await page.bringToFront();
      await page.waitForTimeout(150);
      assert.equal(await page.locator("santa-pop-in").count(), 1);
      await summon("walk");
      await page.mouse.wheel(0, 1200);
      await page.waitForTimeout(100);
      assert.ok(await page.evaluate(() => window.scrollY > 0));
      await page.screenshot({ path: path.join(ROOT, "dist/audit/complex.png") });
      await page.reload();
      await connectWorld();
      await page.waitForTimeout(150);
      assert.equal(await page.locator("santa-pop-in").count(), 1);
      assert.equal(await world("settings.santaDecor.lightStyle"), "candy");
      await page.emulateMedia({ reducedMotion: "reduce" });
      await worker.evaluate(() => chrome.storage.session.remove("santaLastShown"));
      await world("void fire()");
      await page.waitForTimeout(100);
      assert.equal(await page.locator(".actor").count(), 0);
      await page.emulateMedia({ reducedMotion: "no-preference" });
    });

    await t.test("strict host CSP and Trusted Types do not prevent any visual act", async () => {
      await page.goto(base + "/strict");
      await connectWorld();
      await page.bringToFront();
      for (const act of ["peek", "walk", "sleigh", "cloud", "sign", "drop", "cane", "blower"]) {
        await clean();
        await summon(act);
        await page.waitForTimeout(100);
        assert.ok(await page.locator(".actor, .cane-actor").count(), `${act} works on a CSP-restricted host`);
      }
      await clean();
    });

    await t.test("repeated rapid enable/disable cycles release actor, cane, snow and blower state", async () => {
      await cdp.send("HeapProfiler.collectGarbage");
      await cdp.send("Performance.enable");
      const before = await cdp.send("Performance.getMetrics");
      for (let batch = 0; batch < 3; batch++) {
        await world("for(let i=0;i<20;i++){void run('sleigh');stopAll();onPileClick(null);stopAll();dropCane(100,100);stopAll()}");
        await page.waitForTimeout(100);
      }
      assert.deepEqual(await world("({canes:activeCanes.size,active:!!current,stage:!!host,blowing,pile:Snow.hasPile()})"),
        { canes: 0, active: false, stage: false, blowing: false, pile: false });
      await cdp.send("HeapProfiler.collectGarbage");
      const after = await cdp.send("Performance.getMetrics");
      const metric = (m, name) => m.metrics.find((v) => v.name === name)?.value;
      console.log("60 lifecycle cycles, JS heap bytes before/after GC:", metric(before, "JSHeapUsedSize"), metric(after, "JSHeapUsedSize"));
      const taskBefore = metric(after, "TaskDuration");
      await page.waitForTimeout(1000);
      const idle = await cdp.send("Performance.getMetrics");
      console.log("Idle task duration in one second:", metric(idle, "TaskDuration") - taskBefore);
    });

    await t.test("extension reload preserves settings; reloaded page receives exactly one content-script stage", async () => {
      const nextWorker = context.waitForEvent("serviceworker", { timeout: 15000 });
      nextWorker.catch(() => {});
      // Reload destroys the execution context; its evaluate promise need not settle.
      void worker.evaluate(() => chrome.runtime.reload()).catch(() => {});
      await page.waitForTimeout(300);
      await world("resume()");
      assert.equal(await page.locator("santa-pop-in").count(), 0, "Invalidated old content script cleans up on focus");
      await page.reload();
      await connectWorld();
      // A reloaded MV3 worker is lazy; an actual content message wakes it.
      await world("void mayShow()");
      worker = await nextWorker;
      assert.equal((await worker.evaluate(() => chrome.storage.sync.get("santaCanesCaught"))).santaCanesCaught, 1);
      await page.waitForTimeout(150);
      assert.equal(await page.locator("santa-pop-in").count(), 1);
      await clean();
    });
    assert.deepEqual(errors, [], "No browser page errors");
  } finally {
    await context?.close();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(profile, { recursive: true, force: true });
  }
});

test("real v1.4.0 to release ZIP upgrade preserves existing settings", { timeout: 40000 }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "santa-upgrade-"));
  const extension = path.join(temp, "extension");
  fs.mkdirSync(extension);
  let context;
  try {
    const archive = execFileSync("git", ["archive", "1a912b8"], { cwd: ROOT, timeout: 10000, maxBuffer: 64 * 1024 * 1024 });
    execFileSync("tar", ["-x", "-C", extension], { input: archive, timeout: 10000 });
    context = await chromium.launchPersistentContext(path.join(temp, "profile"), {
      headless: process.env.HEADED !== "1", executablePath: process.env.CHROME_EXECUTABLE || undefined,
      ignoreDefaultArgs: ["--disable-extensions"],
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    const oldWorker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker", { timeout: 10000 });
    assert.equal(await oldWorker.evaluate(() => chrome.runtime.getManifest().version), "1.4.0");
    const saved = { santaEnabled: true, santaFreq: 5, santaSize: 1, santaSound: false,
      santaPausedSites: ["kept.example"], santaSnoozeUntil: 0, santaCanesCaught: 42,
      santaActs: { peek: false, walk: true }, santaDecor: { trees: true, lights: true, blink: false } };
    await oldWorker.evaluate((data) => chrome.storage.sync.set(data), saved);
    const id = new URL(oldWorker.url()).host;
    const manager = await context.newPage();
    await manager.goto("chrome://extensions");
    await manager.locator("extensions-toolbar #devMode").evaluate((el) => { if (!el.checked) el.click(); });
    const version = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"))).version;
    execFileSync("unzip", ["-oq", path.join(ROOT, "dist", `santa-pop-in-${version}.zip`), "-d", extension], { timeout: 10000 });
    const nextWorker = context.waitForEvent("serviceworker", { timeout: 10000 });
    nextWorker.catch(() => {});
    void oldWorker.evaluate(() => chrome.runtime.reload()).catch(() => {});
    await manager.waitForTimeout(300);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await popup.evaluate(() => chrome.runtime.sendMessage({ type: "audit-wake" })).catch(() => {});
    const worker = await nextWorker;
    assert.equal(await worker.evaluate(() => chrome.runtime.getManifest().version), version);
    const actual = await worker.evaluate(() => chrome.storage.sync.get());
    for (const key of Object.keys(saved)) assert.deepEqual(actual[key], saved[key], `Preserved ${key}`);
    await popup.locator('[data-size="1"][aria-pressed="true"]').waitFor({ timeout: 5000 });
    assert.equal(await popup.locator("#lightMode").inputValue(), "steady");
    assert.equal(await popup.locator('[data-size="1"]').getAttribute("aria-pressed"), "true");
    assert.equal(await popup.locator('[data-act="peek"]').isChecked(), false);
  } finally {
    await context?.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
