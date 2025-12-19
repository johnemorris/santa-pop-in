const KEY = "santaEnabled";
const toggle = document.getElementById("toggle");

// Load current setting (default: true)
chrome.storage.sync.get({ [KEY]: true }, (data) => {
  toggle.checked = Boolean(data[KEY]);
});

// Save on change
toggle.addEventListener("change", () => {
  chrome.storage.sync.set({ [KEY]: toggle.checked });
});
