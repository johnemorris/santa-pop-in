const $ = (s) => document.querySelector(s);
const enabled = $("#enabled");
const freq = $("#freq");
const freqText = $("#freqText");
const body = $("#body");
const actBoxes = [...document.querySelectorAll("[data-act]")];
let acts = { ...SANTA_DEFAULTS.santaActs };
const decorBoxes = [...document.querySelectorAll("[data-decor]")];
let decor = { ...SANTA_DEFAULTS.santaDecor };

function paint(data) {
  const merged = mergeSantaSettings(data);
  enabled.checked = Boolean(merged.santaEnabled);
  body.classList.toggle("off", !merged.santaEnabled);
  body.inert = !merged.santaEnabled;
  freq.value = merged.santaFreq;
  freqText.textContent = SANTA_FREQ_TEXT[merged.santaFreq] || "";
  acts = merged.santaActs;
  actBoxes.forEach((b) => (b.checked = Boolean(acts[b.dataset.act])));
  decor = merged.santaDecor;
  decorBoxes.forEach((b) => (b.checked = Boolean(decor[b.dataset.decor])));
  syncBlink();
}

function syncBlink() {
  const blink = decorBoxes.find((b) => b.dataset.decor === "blink");
  blink.disabled = !decor.lights;
  blink.parentElement.classList.toggle("dim", !decor.lights);
}

decorBoxes.forEach((b) =>
  b.addEventListener("change", () => {
    decor[b.dataset.decor] = b.checked;
    chrome.storage.sync.set({ santaDecor: decor });
    syncBlink();
  })
);

chrome.storage.sync.get(SANTA_DEFAULTS, paint);

enabled.addEventListener("change", () => {
  chrome.storage.sync.set({ santaEnabled: enabled.checked });
  body.classList.toggle("off", !enabled.checked);
  body.inert = !enabled.checked;
});

freq.addEventListener("input", () => {
  freqText.textContent = SANTA_FREQ_TEXT[freq.value] || "";
});
freq.addEventListener("change", () => {
  chrome.storage.sync.set({ santaFreq: Number(freq.value) });
});

actBoxes.forEach((b) =>
  b.addEventListener("change", () => {
    acts[b.dataset.act] = b.checked;
    chrome.storage.sync.set({ santaActs: acts });
  })
);

document.querySelectorAll("[data-try]").forEach((btn) =>
  btn.addEventListener("click", async () => {
    const msg = $("#tryMsg");
    msg.textContent = "";
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, { type: "santa-summon", act: btn.dataset.try }, () => {
      if (chrome.runtime.lastError) {
        msg.textContent = "Santa can't visit this page. Try a regular website (reload it if it was open before the update).";
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
