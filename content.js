(function () {
  const SANTA_ID = "santa-walker";

function createSanta() {
  let santa = document.getElementById(SANTA_ID);
  if (!santa) {
    santa = document.createElement("img");
    santa.id = SANTA_ID;

    const url = chrome.runtime.getURL("images/santa.png");
    console.log("Santa image URL:", url); // <-- should NOT be chrome-extension://invalid/

    santa.src = url;
    document.body.appendChild(santa);
  }
  return santa;
}

function walkSanta() {
  const santa = createSanta();
  const rect = santa.getBoundingClientRect();
  const santaWidth = rect.width || 120;
  const santaHeight = rect.height || 120;

  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;

  // Random vertical position: anywhere from bottom up to ~80% of the screen
  const maxBottom = Math.max(0, screenHeight - santaHeight - 20); // leave 20px padding
  const bottomOffset = Math.floor(Math.random() * (maxBottom * 0.8)); // 0 → ~80% of max
  santa.style.bottom = `${bottomOffset}px`;

  // Random direction
  const leftToRight = Math.random() > 0.5;

  let startX = -santaWidth;
  let endX = screenWidth + santaWidth;

  // Random size between 0.8x and 1.2x
  const scale = 0.4 + Math.random() * 1.2;

  if (!leftToRight) {
    [startX, endX] = [endX, startX];
    santa.style.transform = `scale(-${scale}, ${scale})`; // flipped horizontally
  } else {
    santa.style.transform = `scale(${scale}, ${scale})`;
  }

  santa.style.left = `${startX}px`;

  const duration = 15000; // 15s
  const startTime = performance.now();

  function step(now) {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / duration, 1);
    const currentX = startX + (endX - startX) * t;
    santa.style.left = `${currentX}px`;

    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      santa.style.left = "-200px";
    }
  }

  requestAnimationFrame(step);
}



  function scheduleSanta() {
    const min = 10_000;   // 1 minute
    const max = 20_000; // 5 minutes
    const delay = Math.random() * (max - min) + min;
console.log(`Sant will be walking in ${delay} ms`);

    setTimeout(() => {
      if (document.visibilityState === "visible") {
        walkSanta();
      }
      scheduleSanta();
    }, delay);
  }

  scheduleSanta();
})();
