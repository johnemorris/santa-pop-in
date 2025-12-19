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
      santa.style.width = "120px"; // ✅ force size even if PNG is huge
      santa.style.height = "auto";
      santa.style.left = "-9999px";
      document.body.appendChild(santa);
    }
    return santa;
  }

  const KEY = "santaEnabled";
  let santaEnabled = true;
  let santaTimerId = null;
  let santaBusy = false;
  let walkAnimating = false;
  let walkAbortToken = 0; // increments to cancel an in-flight walk
  let walkRafId = null; // current requestAnimationFrame id
  let walkFailsafeId = null; // current failsafe timeout id

  function walkSantaAcrossScreen(onDone) {
    if (walkAnimating) return;
    walkAnimating = true;

    // capture a token for THIS run
    const myToken = ++walkAbortToken;

    let doneCalled = false;
    const doneOnce = () => {
      if (doneCalled) return;
      doneCalled = true;

      // cleanup timers/raf
      if (walkRafId) cancelAnimationFrame(walkRafId);
      walkRafId = null;

      if (walkFailsafeId) clearTimeout(walkFailsafeId);
      walkFailsafeId = null;

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

    const maxBottom = Math.max(0, screenHeight - santaHeight - 20);
    const bottomOffset = Math.floor(Math.random() * (maxBottom * 0.8));
    santa.style.bottom = `${bottomOffset}px`;

    const leftToRight = Math.random() > 0.5;

    let startX = -santaWidth;
    let endX = screenWidth + santaWidth;

    const scale = 0.8 + Math.random() * 0.4;

    if (!leftToRight) {
      [startX, endX] = [endX, startX];
      santa.style.transform = `scale(-${scale}, ${scale})`;
    } else {
      santa.style.transform = `scale(${scale}, ${scale})`;
    }

    santa.style.left = `${startX}px`;

    const duration = 15000;
    const startTime = performance.now();

    // ✅ failsafe stored globally so stopSantaNow can clear it too
    walkFailsafeId = setTimeout(() => {
      santa.style.left = "-9999px";
      doneOnce();
    }, duration + 1000);

    function step(now) {
      // ✅ if toggle happened, abort immediately
      if (myToken !== walkAbortToken || !santaEnabled) {
        santa.style.left = "-9999px";
        doneOnce();
        return;
      }

      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);

      const currentX = startX + (endX - startX) * t;
      santa.style.left = `${currentX}px`;

      if (t < 1) {
        walkRafId = requestAnimationFrame(step);
      } else {
        santa.style.left = "-9999px";
        doneOnce();
      }
    }

    walkRafId = requestAnimationFrame(step);
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
    let failsafe;
    const doneOnce = () => {
      if (doneCalled) return;
      doneCalled = true;

      if (failsafe) clearTimeout(failsafe);

      // ✅ hide regardless of whether left or right was used
      santa.style.left = "-9999px";
      santa.style.right = "auto";

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

  function stopSantaNow() {
    // ✅ abort any in-flight walk loop
    walkAbortToken++;

    if (walkRafId) {
      cancelAnimationFrame(walkRafId);
      walkRafId = null;
    }
    if (walkFailsafeId) {
      clearTimeout(walkFailsafeId);
      walkFailsafeId = null;
    } // stop future scheduling
    if (santaTimerId) {
      clearTimeout(santaTimerId);
      santaTimerId = null;
    }

    santaBusy = false;

    // cancel animations + hide any existing Santas
    const walker = document.getElementById("santa-walker");
    if (walker) {
      walker.getAnimations().forEach((a) => a.cancel());

      // Force fully hidden + neutral state
      walker.style.left = "-9999px";
      walker.style.right = "auto";
      walker.style.top = "auto";
      walker.style.bottom = "0px";
      walker.style.transform = "none";
    }

    const peek = document.getElementById("santa-peek");
    if (peek) {
      peek.getAnimations().forEach((a) => a.cancel());
      peek.style.left = "-9999px";
      peek.style.right = "auto";
    }
  }

  function scheduleSanta() {
    // ✅ prevent duplicate schedules
    if (santaTimerId) {
      clearTimeout(santaTimerId);
      santaTimerId = null;
    }

    if (!santaEnabled) {
      stopSantaNow();
      return;
    }

    const walkMin = 36_000,
      walkMax = 90_000;
    const peekMin = 12_000,
      peekMax = 36_000;

    const planWalk = Math.random() < 0.2;
    const min = planWalk ? walkMin : peekMin;
    const max = planWalk ? walkMax : peekMax;

    const delay = Math.random() * (max - min) + min;

    santaTimerId = setTimeout(() => {
      santaTimerId = null; // timer fired

      // re-check enabled at execution time
      if (!santaEnabled) {
        stopSantaNow();
        return;
      }

      if (document.visibilityState !== "visible") {
        scheduleSanta();
        return;
      }

      if (santaBusy) {
        santaTimerId = setTimeout(() => {
          santaTimerId = null;
          scheduleSanta();
        }, 3000);
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

  chrome.storage.sync.get({ [KEY]: true }, (data) => {
    santaEnabled = Boolean(data[KEY]);
    if (santaEnabled) scheduleSanta();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (!changes[KEY]) return;

    santaEnabled = Boolean(changes[KEY].newValue);

    stopSantaNow();
    if (santaEnabled) {
      scheduleSanta(); // start a clean schedule
    }
  });
})();
