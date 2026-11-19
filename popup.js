const $ = (s) => document.querySelector(s);
const enabled = $("#enabled");
const freq = $("#freq");
const freqText = $("#freqText");
const body = $("#body");
const actBoxes = [...document.querySelectorAll("[data-act]")];
let acts = { ...SANTA_DEFAULTS.santaActs };

function paint(data) {
  enabled.checked = Boolean(data.santaEnabled);
  body.classList.toggle("off", !data.santaEnabled);
  freq.value = data.santaFreq;
  freqText.textContent = SANTA_FREQ_TEXT[data.santaFreq] || "";
  acts = { ...SANTA_DEFAULTS.santaActs, ...(data.santaActs || {}) };
  actBoxes.forEach((b) => (b.checked = Boolean(acts[b.dataset.act])));
}

chrome.storage.sync.get(SANTA_DEFAULTS, paint);

enabled.addEventListener("change", () => {
  chrome.storage.sync.set({ santaEnabled: enabled.checked });
  body.classList.toggle("off", !enabled.checked);
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
