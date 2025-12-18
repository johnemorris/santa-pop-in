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

  function createPeekSanta() {
    const SANTA_ID = "santa-peek";

    let santa = document.getElementById(SANTA_ID);
    if (!santa) {
      santa = document.createElement("img");
      santa.id = SANTA_ID;
      santa.src = chrome.runtime.getURL("images/peek-santa.png");
      document.body.appendChild(santa);
    }
    return santa;
  }

  function walkSantaAcrossScreen() {
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

  function createPeekSanta() {
    let santa = document.getElementById("santa-peek");
    if (!santa) {
      santa = document.createElement("img");
      santa.id = "santa-peek";
      santa.src = chrome.runtime.getURL("images/peek-santa.png");
      santa.style.position = "fixed";
      santa.style.bottom = "15%";
      santa.style.right = "-220px"; // start off-screen
      santa.style.width = "200px";
      santa.style.height = "auto";
      santa.style.zIndex = "2147483647";
      santa.style.pointerEvents = "none";
      document.body.appendChild(santa);
    }
    return santa;
  }
  function createPeekSanta() {
    let santa = document.getElementById("santa-peek");
    if (!santa) {
      santa = document.createElement("img");
      santa.id = "santa-peek";
      santa.src = chrome.runtime.getURL("images/peek_santa.png");
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

  function peekSantaFromSide() {
    const santa = createPeekSanta();

    // prevent the "barely appears then retreats" issue
    santa.getAnimations().forEach((a) => a.cancel());

    const duration = 6500;

    // Tune these two numbers (you already like shownRight = -50)
    const hidden = -220; // fully off-screen
    const shown = -50; // hugs the edge (compensates for PNG padding)

    const fromLeft = Math.random() < 0.5;

    if (fromLeft) {
      // LEFT side: animate LEFT property
      santa.style.left = hidden + "px";
      santa.style.right = "auto";

      // Flip so he faces into the page (optional but looks better)
      santa.style.transform = "scaleX(-1)";

      santa.animate(
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

      santa.animate(
        [
          { right: hidden + "px" },
          { right: shown + "px" },
          { right: shown + "px" },
          { right: hidden + "px" },
        ],
        { duration, easing: "ease-in-out", fill: "forwards" }
      );
    }
  }

  function scheduleSanta() {
    const min = 10_000; // 1 minute
    const max = 20_000; // 5 minutes
    const delay = Math.random() * (max - min) + min;
    console.log(`Sant will be walking in ${delay} ms`);

    setTimeout(() => {
      if (document.visibilityState === "visible") {
        console.log("Here comes Santa!");
        // 50/50 chance to walk or peek
        //   if (Math.random() < 0.1) {
        //     walkSantaAcrossScreen();
        //   } else {
        peekSantaFromSide();
        //   }
      }
      scheduleSanta();
    }, delay);
  }

  scheduleSanta();
})();
