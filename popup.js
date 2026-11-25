const $ = (s) => document.querySelector(s);
const enabled = $("#enabled");
const freq = $("#freq");
const freqText = $("#freqText");
const body = $("#body");
const sound = $("#sound");
const countdownEl = $("#countdown");
const pauseSiteBtn = $("#pauseSiteBtn");
const snoozeBtn = $("#snoozeBtn");
const pauseNote = $("#pauseNote");
const caneStat = $("#caneStat");
const lightOpts = $("#lightOpts");
const lightStyle = $("#lightStyle");
const lightMode = $("#lightMode");
const sizeButtons = [...document.querySelectorAll("[data-size]")];
const actBoxes = [...document.querySelectorAll("[data-act]")];
const decorBoxes = [...document.querySelectorAll("[data-decor]")];

let acts = { ...SANTA_DEFAULTS.santaActs };
let decor = { ...SANTA_DEFAULTS.santaDecor };
let pausedSites = [];
let snoozeUntil = 0;
let activeHost = "";

function saveSettings(values) {
  chrome.storage.sync.set(values, () => {
    if (chrome.runtime.lastError) {
      $("#tryMsg").textContent = "Settings could not be saved. Please try again.";
    }
  });
}

function selectSize(size) {
  sizeButtons.forEach((btn) => {
    const selected = Number(btn.dataset.size) === size;
    btn.classList.toggle("active", selected);
    btn.setAttribute("aria-pressed", String(selected));
  });
}

function renderCountdown() {
  const days = santaDaysUntilChristmas();
  if (days === 0) {
    countdownEl.textContent = "🎄 Merry Christmas! It's Christmas Day!";
    countdownEl.classList.add("holiday");
  } else if (days === 1) {
    countdownEl.textContent = "🎄 1 day until Christmas! (Christmas Eve)";
    countdownEl.classList.add("holiday");
  } else {
    countdownEl.textContent = `🎄 ${days} days until Christmas`;
    countdownEl.classList.remove("holiday");
  }
}

function renderPauseState() {
  const now = Date.now();
  const snoozed = snoozeUntil > now;
  const sitePaused = Boolean(activeHost) && pausedSites.includes(activeHost);

  if (!activeHost) {
    pauseSiteBtn.disabled = true;
    pauseSiteBtn.textContent = "Pause site";
    pauseSiteBtn.classList.remove("active");
  } else {
    pauseSiteBtn.disabled = false;
    pauseSiteBtn.textContent = sitePaused ? `Resume site` : `Pause site`;
    pauseSiteBtn.title = sitePaused ? `Resume Santa on ${activeHost}` : `Pause Santa on ${activeHost}`;
    pauseSiteBtn.classList.toggle("active", sitePaused);
  }

  if (snoozed) {
    const mins = Math.max(1, Math.ceil((snoozeUntil - now) / 60000));
    snoozeBtn.textContent = `Wake (${mins}m)`;
    snoozeBtn.title = "Cancel snooze and wake Santa";
    snoozeBtn.classList.add("active");
  } else {
    snoozeBtn.textContent = "Snooze 1h";
    snoozeBtn.title = "Pause Santa everywhere for 1 hour";
    snoozeBtn.classList.remove("active");
  }

  if (snoozed) {
    const mins = Math.max(1, Math.ceil((snoozeUntil - now) / 60000));
    pauseNote.textContent = `Santa is snoozing for ${mins} more min. Click Wake to resume early.`;
    pauseNote.hidden = false;
  } else if (sitePaused) {
    pauseNote.textContent = `Paused on ${activeHost}. Click Resume site to bring Santa back.`;
    pauseNote.hidden = false;
  } else {
    pauseNote.hidden = true;
  }
}

function renderCanes(count) {
  const n = Number(count) || 0;
  if (n > 0) {
    caneStat.textContent = `🍬 ${n} candy ${n === 1 ? "cane" : "canes"} glitter-popped`;
    caneStat.hidden = false;
  } else {
    caneStat.hidden = true;
  }
}

function syncSubDecor() {
  const lightsOn = Boolean(decor.lights);
  lightOpts.classList.toggle("dim", !lightsOn);
  lightStyle.disabled = !lightsOn;
  lightMode.disabled = !lightsOn;

  const orn = decorBoxes.find((b) => b.dataset.decor === "ornaments");
  if (orn) {
    const treesOn = Boolean(decor.trees);
    orn.disabled = !treesOn;
    orn.parentElement.classList.toggle("dim", !treesOn);
  }
}

function paint(data) {
  const merged = mergeSantaSettings(data);
  enabled.checked = Boolean(merged.santaEnabled);
  body.classList.toggle("off", !merged.santaEnabled);
  body.inert = !merged.santaEnabled;
  freq.value = merged.santaFreq;
  freqText.textContent = SANTA_FREQ_TEXT[merged.santaFreq] || "";
  sound.checked = Boolean(merged.santaSound);

  const sz = Number(merged.santaSize) || 2;
  selectSize(sz);

  acts = merged.santaActs;
  actBoxes.forEach((b) => (b.checked = Boolean(acts[b.dataset.act])));

  decor = merged.santaDecor;
  if (!decor.lightMode) decor.lightMode = decor.blink === false ? "steady" : "twinkle";
  decorBoxes.forEach((b) => (b.checked = Boolean(decor[b.dataset.decor])));
  lightStyle.value = decor.lightStyle || "classic";
  lightMode.value = decor.lightMode || "twinkle";
  syncSubDecor();

  pausedSites = merged.santaPausedSites;
  snoozeUntil = Number(merged.santaSnoozeUntil) || 0;
  renderPauseState();
  renderCanes(merged.santaCanesCaught);
}

renderCountdown();

// Detect current tab hostname for per-site pause.
chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  try {
    if (tab?.url && /^https?:/i.test(tab.url)) {
      activeHost = new URL(tab.url).hostname.toLowerCase();
    }
  } catch {
    activeHost = "";
  }
  renderPauseState();
}).catch(() => {});

chrome.storage.sync.get(null, (data) => {
  if (chrome.runtime.lastError) {
    $("#tryMsg").textContent = "Settings could not be loaded. Please reopen the popup.";
    return;
  }
  paint(data);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if (changes.santaCanesCaught) renderCanes(changes.santaCanesCaught.newValue);
  if (changes.santaSnoozeUntil) {
    snoozeUntil = Number(changes.santaSnoozeUntil.newValue) || 0;
    renderPauseState();
  }
  if (changes.santaPausedSites) {
    pausedSites = Array.isArray(changes.santaPausedSites.newValue) ? [...changes.santaPausedSites.newValue] : [];
    renderPauseState();
  }
});

enabled.addEventListener("change", () => {
  saveSettings({ santaEnabled: enabled.checked });
  body.classList.toggle("off", !enabled.checked);
  body.inert = !enabled.checked;
});

pauseSiteBtn.addEventListener("click", () => {
  if (!activeHost) return;
  if (pausedSites.includes(activeHost)) {
    pausedSites = pausedSites.filter((h) => h !== activeHost);
  } else {
    pausedSites = [...pausedSites, activeHost];
  }
  saveSettings({ santaPausedSites: pausedSites });
  renderPauseState();
});

snoozeBtn.addEventListener("click", () => {
  snoozeUntil = snoozeUntil > Date.now() ? 0 : Date.now() + 60 * 60 * 1000;
  saveSettings({ santaSnoozeUntil: snoozeUntil });
  renderPauseState();
});

freq.addEventListener("input", () => {
  freqText.textContent = SANTA_FREQ_TEXT[freq.value] || "";
});
freq.addEventListener("change", () => {
  saveSettings({ santaFreq: Number(freq.value) });
});

sizeButtons.forEach((btn) =>
  btn.addEventListener("click", () => {
    const val = Number(btn.dataset.size);
    selectSize(val);
    saveSettings({ santaSize: val });
  })
);

sound.addEventListener("change", () => {
  saveSettings({ santaSound: sound.checked });
});

actBoxes.forEach((b) =>
  b.addEventListener("change", () => {
    acts[b.dataset.act] = b.checked;
    saveSettings({ santaActs: acts });
  })
);

decorBoxes.forEach((b) =>
  b.addEventListener("change", () => {
    decor[b.dataset.decor] = b.checked;
    saveSettings({ santaDecor: decor });
    syncSubDecor();
  })
);

lightStyle.addEventListener("change", () => {
  decor.lightStyle = lightStyle.value;
  saveSettings({ santaDecor: decor });
});

lightMode.addEventListener("change", () => {
  decor.lightMode = lightMode.value;
  decor.blink = lightMode.value !== "steady";
  saveSettings({ santaDecor: decor });
});

document.querySelectorAll("[data-try]").forEach((btn) =>
  btn.addEventListener("click", async () => {
    const msg = $("#tryMsg");
    msg.textContent = "";
    let tab;
    try {
      [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    } catch {
      msg.textContent = "Santa can't access this tab. Please try again.";
      return;
    }
    if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, { type: "santa-summon", act: btn.dataset.try }, (resp) => {
      if (chrome.runtime.lastError) {
        msg.textContent = "Santa can't visit this page. Try a regular website (reload it if it was open before the update).";
      } else if (resp && resp.paused) {
        msg.textContent = "Santa is paused or snoozing right now. Resume first to try!";
      } else if (resp && resp.noCards && !resp.ok) {
        msg.textContent = "No cards on this page for the elves to sweep. Try a page with boxes or cards.";
      } else {
        window.close();
      }
    });
  })
);

if (SANTA_TIP_URL) {
  $("#tipLink").href = SANTA_TIP_URL;
  $("#tipLink").hidden = false;
}
$("#brandLink").href = SANTA_BRAND_URL;
