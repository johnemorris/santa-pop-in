(function () {
  function createSanta() {
    const SANTA_ID = "santa-walker";
    let santa = document.getElementById(SANTA_ID);
    if (!santa) {
      santa = document.createElement("img");
      santa.style.position = "fixed";
      santa.style.zIndex = "2147483647";
      santa.style.pointerEvents = "none";

      santa.id = SANTA_ID;

      const url = chrome.runtime.getURL("images/santa.png");

      santa.src = url;
      document.body.appendChild(santa);
    }
    return santa;
  }

  let santaBusy = false;

  let walkAnimating = false;

  function walkSantaAcrossScreen(onDone) {
    if (walkAnimating) return;
    walkAnimating = true;

    let doneCalled = false;
    const doneOnce = () => {
      if (doneCalled) return;
      doneCalled = true;
      walkAnimating = false;
      onDone?.();
    };

    const santa = createSanta();

    // Make walker reliable on any site
    santa.style.position = "fixed";
    santa.style.zIndex = "2147483647";
    santa.style.pointerEvents = "none";

    const rect = santa.getBoundingClientRect();
    const santaWidth = rect.width || 120;
    const santaHeight = rect.height || 120;

    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    // Random vertical position (near bottom → up to ~80% of usable height)
    const maxBottom = Math.max(0, screenHeight - santaHeight - 20);
    const bottomOffset = Math.floor(Math.random() * (maxBottom * 0.8));
    santa.style.bottom = `${bottomOffset}px`;

    // Random direction
    const leftToRight = Math.random() > 0.5;

    let startX = -santaWidth;
    let endX = screenWidth + santaWidth;

    // Random size (tune as you like)
    const scale = 0.8 + Math.random() * 0.4; // 0.8–1.2

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
        santa.style.left = "-300px";
        doneOnce();
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

    // cancel any previous peek animation
    santa.getAnimations().forEach((a) => a.cancel());

    let doneCalled = false;
    const doneOnce = () => {
      if (doneCalled) return;
      doneCalled = true;
      onDone?.();
    };

    const duration = 6500;
    const hidden = -220;
    const shown = -50;

    const fromLeft =
      lastPeekSide === "left"
        ? false
        : lastPeekSide === "right"
        ? true
        : Math.random() < 0.5;

    lastPeekSide = fromLeft ? "left" : "right";

    let anim;

    if (fromLeft) {
      santa.style.left = hidden + "px";
      santa.style.right = "auto";
      santa.style.transform = "scaleX(-1)";

      anim = santa.animate(
        [
          { left: hidden + "px" },
          { left: shown + "px" },
          { left: shown + "px" },
          { left: hidden + "px" },
        ],
        { duration, easing: "ease-in-out", fill: "forwards" }
      );
    } else {
      santa.style.right = hidden + "px";
      santa.style.left = "auto";
      santa.style.transform = "scaleX(1)";

      anim = santa.animate(
        [
          { right: hidden + "px" },
          { right: shown + "px" },
          { right: shown + "px" },
          { right: hidden + "px" },
        ],
        { duration, easing: "ease-in-out", fill: "forwards" }
      );
    }

    if (anim) {
      anim.onfinish = doneOnce;
      anim.oncancel = doneOnce;
    } else {
      doneOnce();
    }
  }

  function scheduleSanta() {
    const walkMin = 36_000,
      walkMax = 90_000;
    const peekMin = 12_000,
      peekMax = 36_000;

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
        setTimeout(scheduleSanta, 3000);
        return;
      }

      santaBusy = true;

      const done = () => {
        santaBusy = false;
        scheduleSanta(); // ✅ schedule next only AFTER completion
      };

      if (planWalk) {
        walkSantaAcrossScreen(done);
      } else {
        peekSantaFromSide(done);
      }
    }, delay);
  }

  scheduleSanta();
})();
