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
