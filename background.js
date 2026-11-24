importScripts("settings.js");

const KEY = "santaEnabled";
const SNOOZE_KEY = "santaSnoozeUntil";
const SNOOZE_ALARM = "santa-snooze-end";

function setBadge(enabled, snoozeUntil = 0) {
  chrome.alarms?.clear(SNOOZE_ALARM);
  const now = Date.now();
  if (!enabled) {
    chrome.action.setBadgeText({ text: "OFF" });
    chrome.action.setBadgeBackgroundColor({ color: "#dc2626" });
    return;
  }
  if (snoozeUntil > now) {
    chrome.action.setBadgeText({ text: "ZZZ" });
    chrome.action.setBadgeBackgroundColor({ color: "#d97706" });
    chrome.alarms?.create(SNOOZE_ALARM, { when: snoozeUntil + 250 });
    return;
  }
  chrome.action.setBadgeText({ text: "ON" });
  chrome.action.setBadgeBackgroundColor({ color: "#16a34a" });
}

function refreshBadge() {
  chrome.storage.sync.get({ [KEY]: SANTA_DEFAULTS.santaEnabled, [SNOOZE_KEY]: 0 }, (data) =>
    setBadge(Boolean(data[KEY]), Number(data[SNOOZE_KEY]) || 0)
  );
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
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type !== "santa-may-show") return;
  const tab = sender.tab;
  if (!tab || !tab.active || sender.frameId) {
    reply({ ok: false });
    return;
  }
  (async () => {
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
  })();
  return true;
});
