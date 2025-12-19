const KEY = "santaEnabled";

function setBadge(enabled) {
  chrome.action.setBadgeText({ text: enabled ? "ON" : "OFF" });
  chrome.action.setBadgeBackgroundColor({
    color: enabled ? "#16a34a" : "#dc2626",
  }); // green / red
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get({ [KEY]: true }, (data) => {
    setBadge(Boolean(data[KEY]));
  });
});

// If you change the toggle from the popup, update badge
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if (!changes[KEY]) return;
  setBadge(Boolean(changes[KEY].newValue));
});

// Also refresh badge when Chrome starts the service worker again
chrome.runtime.onStartup?.addListener(() => {
  chrome.storage.sync.get({ [KEY]: true }, (data) => {
    setBadge(Boolean(data[KEY]));
  });
});
