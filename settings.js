// Shared defaults for the popup and background worker.
// (content.js keeps its own copy because content scripts can't import modules.)
const SANTA_DEFAULTS = {
  santaEnabled: true,
  santaFreq: 3,
  santaActs: { peek: true, walk: true, sleigh: true, cloud: true, canes: true, dance: true },
};

// Popup wording for each slider step (minutes of visible tab time).
const SANTA_FREQ_TEXT = {
  1: "every 10–20 min",
  2: "every 5–10 min",
  3: "every 3–6 min",
  4: "every 1–3 min",
  5: "about every minute",
};

// Tip jar (jem6 Ko-fi). Set to "" to hide the coffee link.
const SANTA_TIP_URL = "https://ko-fi.com/jem6com";
const SANTA_BRAND_URL = "https://jem6.com";
