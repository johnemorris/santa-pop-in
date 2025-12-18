(function () {
  function createSanta() {
    const SANTA_ID = "santa-walker";
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

  let santaBusy = false;

  function walkSantaAcrossScreen(onDone) {
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
        onDone?.(); // 🔓
      }
    }

    requestAnimationFrame(step);
  }

  function createPeekSanta() {
    let santa = document.getElementById("santa-peek");
    if (!santa) {
      santa = document.createElement("img");
      santa.id = "santa-peek";
      santa.src = chrome.runtime.getURL("images/peek-santa.png");
      santa.style.position = "fixed";
      santa.style.bottom = "15%";
      santa.style.width = "200px";
      santa.style.height = "auto";
      santa.style.zIndex = "2147483647";
      santa.style.pointerEvents = "none";
      document.body.appendChild(santa);
    }
    return santa;
  }

  let lastPeekSide = null; // "left" | "right"

  function peekSantaFromSide(onDone) {
    const santa = createPeekSanta();

    // prevent the "barely appears then retreats" issue
    santa.getAnimations().forEach((a) => a.cancel());

    const duration = 6500;

    // Tune these two numbers (you already like shownRight = -50)
    const hidden = -220; // fully off-screen
    const shown = -50; // hugs the edge (compensates for PNG padding)

    // Keep alternating sides if possible. Avoid too many same-side peeks in a row.
    const fromLeft =
      lastPeekSide === "left"
        ? false
        : lastPeekSide === "right"
        ? true
        : Math.random() < 0.5;

    lastPeekSide = fromLeft ? "left" : "right";

    let animate;
    if (fromLeft) {
      // LEFT side: animate LEFT property
      santa.style.left = hidden + "px";
      santa.style.right = "auto";

      // Flip so he faces into the page (optional but looks better)
      santa.style.transform = "scaleX(-1)";

      animate = santa.animate(
        [
          { left: hidden + "px" },
          { left: shown + "px" },
          { left: shown + "px" },
          { left: hidden + "px" },
        ],
        { duration, easing: "ease-in-out", fill: "forwards" }
      );
    } else {
      // RIGHT side: animate RIGHT property
      santa.style.right = hidden + "px";
      santa.style.left = "auto";

      santa.style.transform = "scaleX(1)";

      animate = santa.animate(
        [
          { right: hidden + "px" },
          { right: shown + "px" },
          { right: shown + "px" },
          { right: hidden + "px" },
        ],
        { duration, easing: "ease-in-out", fill: "forwards" }
      );
    }
    if (animate) {
      animate.onfinish = () => onDone?.();
      animate.oncancel = () => onDone?.(); // safety: if canceled, still unlock
    } else {
      onDone?.();
    }
  }

  function scheduleSanta() {
    const walkMin = 360_000,
      walkMax = 900_000;
    const peekMin = 120_000,
      peekMax = 360_000;

    // choose a delay *type* now, but choose the action later only if free
    const planWalk = Math.random() < 0.2;
    const min = planWalk ? walkMin : peekMin;
    const max = planWalk ? walkMax : peekMax;

    const delay = Math.random() * (max - min) + min;

    setTimeout(() => {
      if (document.visibilityState !== "visible") {
        scheduleSanta();
        return;
      }

      if (santaBusy) {
        setTimeout(scheduleSanta, 3000); // try again in 3s
        return;
      }

      santaBusy = true;

      // use the planned type (so timing matches behavior)
      if (planWalk) {
        walkSantaAcrossScreen(() => {
          santaBusy = false;
        });
      } else {
        peekSantaFromSide(() => {
          santaBusy = false;
        });
      }

      scheduleSanta();
    }, delay);
  }

  scheduleSanta();
})();
