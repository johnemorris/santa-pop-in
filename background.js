importScripts("settings.js");

const KEY = "santaEnabled";
const SNOOZE_KEY = "santaSnoozeUntil";
const SNOOZE_ALARM = "santa-snooze-end";
const ignoreFailure = (promise) => promise?.catch?.(() => {});

function setBadge(enabled, snoozeUntil = 0) {
  ignoreFailure(chrome.alarms?.clear(SNOOZE_ALARM));
  const now = Date.now();
  if (!enabled) {
    ignoreFailure(chrome.action.setBadgeText({ text: "OFF" }));
    ignoreFailure(chrome.action.setBadgeBackgroundColor({ color: "#dc2626" }));
    return;
  }
  if (snoozeUntil > now) {
    ignoreFailure(chrome.action.setBadgeText({ text: "ZZZ" }));
    ignoreFailure(chrome.action.setBadgeBackgroundColor({ color: "#d97706" }));
    ignoreFailure(chrome.alarms?.create(SNOOZE_ALARM, { when: snoozeUntil + 250 }));
    return;
  }
  ignoreFailure(chrome.action.setBadgeText({ text: "ON" }));
  ignoreFailure(chrome.action.setBadgeBackgroundColor({ color: "#16a34a" }));
}

function refreshBadge() {
  chrome.storage.sync.get({ [KEY]: SANTA_DEFAULTS.santaEnabled, [SNOOZE_KEY]: 0 }, (data) => {
    if (chrome.runtime.lastError) return;
    setBadge(Boolean(data[KEY]), Number(data[SNOOZE_KEY]) || 0);
  });
}

chrome.runtime.onInstalled.addListener(refreshBadge);
chrome.runtime.onStartup?.addListener(refreshBadge);
chrome.alarms?.onAlarm.addListener((alarm) => {
  if (alarm.name === SNOOZE_ALARM) refreshBadge();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && (changes[KEY] || changes[SNOOZE_KEY])) refreshBadge();
});

// Only one window shows Santa: the focused one, and not again in another
// window until the minimum gap has passed.
// Serialize read/check/write across messages: simultaneous requests must not
// both read the old timestamp before either has reserved the next appearance.
let appearanceQueue = Promise.resolve();
let caneQueue = Promise.resolve();
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type === "santa-cane-pop") {
    if (!sender.tab || sender.frameId) { reply({ ok: false }); return; }
    caneQueue = caneQueue.then(async () => {
      try {
        const data = await chrome.storage.sync.get({ santaCanesCaught: 0 });
        const count = (Number(data.santaCanesCaught) || 0) + 1;
        await chrome.storage.sync.set({ santaCanesCaught: count });
        reply({ ok: true, count });
      } catch { reply({ ok: false }); }
    });
    return true;
  }
  if (msg?.type !== "santa-may-show") return;
  const tab = sender.tab;
  if (!tab || !tab.active || sender.frameId) {
    reply({ ok: false });
    return;
  }
  appearanceQueue = appearanceQueue.then(async () => {
    try {
      const win = await chrome.windows.get(tab.windowId);
      if (!win?.focused || win.state === "minimized") return reply({ ok: false });
      const { santaLastShown = 0 } = await chrome.storage.session.get("santaLastShown");
      const now = Date.now();
      if (now - santaLastShown < (msg.gapMs || 0)) return reply({ ok: false });
      await chrome.storage.session.set({ santaLastShown: now });
      reply({ ok: true });
    } catch {
      reply({ ok: false });
    }
  });
  return true;
});
