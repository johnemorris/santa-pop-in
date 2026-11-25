// Shared defaults for the popup, content script, and background worker.
const SANTA_DEFAULTS = {
  santaEnabled: true,
  santaFreq: 3,
  santaSize: 2, // 1 = Small, 2 = Normal, 3 = Large
  santaSound: false,
  santaPausedSites: [],
  santaSnoozeUntil: 0,
  santaCanesCaught: 0,
  santaActs: {
    peek: true,
    walk: true,
    sleigh: true,
    cloud: true,
    sign: true,
    drop: true,
    canes: true,
    dance: true,
    quotes: true,
    blower: true,
    cardSnow: true,
    elves: true,
  },
  santaDecor: {
    lights: false,
    blink: true,
    lightStyle: "classic", // classic | warm | icy | candy
    lightMode: "twinkle", // twinkle | chase | steady
    trees: false,
    ornaments: true,
  },
};

// Popup wording for each slider step (minutes of visible tab time).
const SANTA_FREQ_TEXT = {
  1: "every 10–20 min",
  2: "every 5–10 min",
  3: "every 3–6 min",
  4: "every 1–3 min",
  5: "about every minute",
};

const SANTA_SIZE_TEXT = {
  1: "Small",
  2: "Normal",
  3: "Large",
};

function mergeSantaSettings(data = {}) {
  const santaDecor = { ...SANTA_DEFAULTS.santaDecor, ...(data.santaDecor || {}) };
  // Preserve the pre-lightMode "don't blink" preference across upgrades.
  if (!data.santaDecor?.lightMode && data.santaDecor?.blink === false) santaDecor.lightMode = "steady";
  return {
    ...SANTA_DEFAULTS,
    ...data,
    santaPausedSites: Array.isArray(data.santaPausedSites) ? [...data.santaPausedSites] : [],
    santaActs: { ...SANTA_DEFAULTS.santaActs, ...(data.santaActs || {}) },
    santaDecor,
  };
}

// Accurate local calendar days until Dec 25 based on the browser's clock.
function santaDaysUntilChristmas(now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let target = new Date(now.getFullYear(), 11, 25);
  if (today > target) target = new Date(now.getFullYear() + 1, 11, 25);
  return Math.round((target - today) / 86400000);
}

// Tip jar (jem6 Ko-fi). Set to "" to hide the candy-cane tip link.
const SANTA_TIP_URL = "https://ko-fi.com/jem6com";
const SANTA_BRAND_URL = "https://jem6.com/extensions/santa-pop-in";
