const KEY = "santaEnabled";

function setBadge(enabled) {
  chrome.action.setBadgeText({ text: enabled ? "ON" : "OFF" });
  chrome.action.setBadgeBackgroundColor({ color: enabled ? "#16a34a" : "#dc2626" });
}

function refreshBadge() {
  chrome.storage.sync.get({ [KEY]: true }, (data) => setBadge(Boolean(data[KEY])));
}

chrome.runtime.onInstalled.addListener(refreshBadge);
chrome.runtime.onStartup?.addListener(refreshBadge);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes[KEY]) setBadge(Boolean(changes[KEY].newValue));
});

// Only one window shows Santa: the focused one, and not again in another
// window until the minimum gap has passed.
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type !== "santa-may-show") return;
  const tab = sender.tab;
  if (!tab || !tab.active || sender.frameId) return reply({ ok: false });
  chrome.windows.get(tab.windowId, async (win) => {
    if (chrome.runtime.lastError || !win?.focused || win.state === "minimized") return reply({ ok: false });
    const { santaLastShown = 0 } = await chrome.storage.session.get("santaLastShown");
    const now = Date.now();
    if (now - santaLastShown < (msg.gapMs || 0)) return reply({ ok: false });
    await chrome.storage.session.set({ santaLastShown: now });
    reply({ ok: true });
  });
  return true;
});
