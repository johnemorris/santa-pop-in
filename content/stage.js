// Santa Pop-In content script: The Shadow DOM stage Santa performs on, its CSS, and element helpers.
// Content scripts share one isolated world, so top-level names here are
// visible to the other content/*.js files (see manifest.json for load order).

// ------------------------------------------------------------------- stage
let host, root, layer;

const CSS = `
  :host { all: initial; }
  .layer { position: fixed; inset: 0; pointer-events: none; overflow: hidden; }
  .actor { position: fixed; left: 0; will-change: transform; z-index: 2; }
  img, svg { display: block; max-width: none; max-height: none; user-select: none;
             -webkit-user-drag: none; border: 0; }
  .click { pointer-events: auto; cursor: pointer; }
  .waddle { animation: waddle 0.62s cubic-bezier(.45,0,.55,1) infinite; transform-origin: 50% 100%; }
  .santa-leg { position: absolute; height: auto; transform-origin: 50% 6%; animation: santaStride .46s ease-in-out infinite; }
  .santa-leg.far { filter: brightness(.72); animation-delay: -.23s; }
  @keyframes santaStride { 0%, 100% { transform: rotate(-38deg); } 50% { transform: rotate(34deg); } }
  .gallop { animation: gallop 0.36s ease-in-out infinite; transform-origin: 60% 80%; }
  .bob    { animation: bob 3.4s ease-in-out infinite; }
  .rumble { animation: rumble 0.09s linear infinite; }
  .sway   { animation: sway 2.2s ease-in-out infinite; transform-origin: 50% 0%; }
  .sign-rock { animation: signRock 2.6s ease-in-out infinite; transform-origin: 50% 100%; }
  @keyframes waddle {
    0%, 100% { transform: translateY(0) rotate(-3deg) scale(1.01, .99); }
    25%      { transform: translateY(-7px) rotate(0deg) scale(.99, 1.02); }
    50%      { transform: translateY(0) rotate(3deg) scale(1.01, .99); }
    75%      { transform: translateY(-7px) rotate(0deg) scale(.99, 1.02); }
  }
  @keyframes gallop {
    0%, 100% { transform: translateY(0) rotate(0); }
    50%      { transform: translateY(-5px) rotate(-1deg); }
  }
  @keyframes bob {
    0%, 100% { transform: translateY(0) scale(1); }
    50%      { transform: translateY(-6px) scale(1.03, .98); }
  }
  @keyframes rumble {
    0%, 100% { transform: translate(0, 0); }
    50%      { transform: translate(.6px, -.5px); }
  }
  @keyframes sway {
    0%, 100% { transform: rotate(-4.5deg); }
    50%      { transform: rotate(4.5deg); }
  }
  @keyframes signRock {
    0%, 100% { transform: rotate(-1.6deg); }
    50%      { transform: rotate(1.6deg); }
  }
  .shadow { position: absolute; left: 12%; right: 12%; bottom: -5px; height: 10px;
            border-radius: 50%; background: radial-gradient(closest-side, rgba(20,30,50,.28), transparent);
            pointer-events: none; }
  .note { position: fixed; font: 700 20px/1 system-ui, sans-serif; color: #c1121f;
          text-shadow: 0 1px 2px rgba(0,0,0,.25); pointer-events: none; z-index: 4; }
  .spark { position: fixed; width: 6px; height: 6px; pointer-events: none; z-index: 1;
           background: radial-gradient(closest-side, #fff8d6, rgba(255,215,90,.8) 45%, transparent);
           border-radius: 50%; }
  .spark.gold { width: 8px; height: 8px;
                background: radial-gradient(closest-side, #fffef0, rgba(255,215,64,.95) 50%, transparent); }
  .glitter { position: fixed; pointer-events: none; z-index: 5; will-change: transform, opacity; }
  .glitter.star { clip-path: polygon(50% 0%, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0% 50%, 38% 38%); }
  .glitter.shard { border-radius: 2px; }
  .glitter.dot { border-radius: 50%; }
  .glitter.stripe {
    border-radius: 2px;
    background: repeating-linear-gradient(45deg, #ffffff 0 3px, #d62828 3px 6px);
  }
  .rig { position: relative; display: block; }
  .rig-sizer { width: 100%; height: auto; visibility: hidden; pointer-events: none; }
  .rig-part { position: absolute; inset: 0; width: 100%; height: 100%; will-change: transform; }

  /* Walking Santa: legs cross front-to-back & back-to-front under the coat hem */
  .rig-walk .leg-back {
    clip-path: polygon(22% 70%, 58.5% 70%, 58.5% 100%, 22% 100%);
    transform-origin: 48% 72%;
  }
  .rig-walk .leg-front {
    clip-path: polygon(58.5% 70%, 100% 70%, 100% 100%, 58.5% 100%);
    transform-origin: 67% 72%;
  }
  .rig-walk .torso {
    clip-path: polygon(0% 0%, 100% 0%, 100% 75.5%, 80% 76%, 58% 74%, 28% 72%, 0% 72%);
  }
  .rig-walk.waddle { animation-duration: 0.72s; }
  .rig-walk.waddle .leg-back  { animation: walkBackToFront 0.72s linear infinite; }
  .rig-walk.waddle .leg-front { animation: walkFrontToBack 0.72s linear infinite; }

  /* Leaf-blower Santa: legs cross beneath coat hem & diagonal blower tube */
  .rig-blower .leg-back {
    clip-path: polygon(0% 69%, 36% 69%, 36% 100%, 0% 100%);
    transform-origin: 22% 71%;
  }
  .rig-blower .leg-front {
    clip-path: polygon(34% 72%, 73% 72%, 73% 100%, 34% 100%);
    transform-origin: 46% 73%;
  }
  .rig-blower .torso {
    clip-path: polygon(0% 0%, 100% 0%, 100% 94%, 74% 83%, 58% 76%, 42% 73%, 0% 71%);
  }
  .rig-blower.waddle { animation-duration: 0.58s; }
  .rig-blower.waddle .leg-back  { animation: blowerBackToFront 0.58s linear infinite; }
  .rig-blower.waddle .leg-front { animation: blowerFrontToBack 0.58s linear infinite; }

  /* Sleigh reindeer: full gallop from extended bound to gathered tuck under the belly */
  .rig-sleigh .leg-back {
    clip-path: polygon(63% 71%, 82.5% 71%, 82.5% 100%, 63% 100%);
    transform-origin: 75% 71%;
  }
  .rig-sleigh .leg-front {
    clip-path: polygon(82.5% 70%, 100% 70%, 100% 100%, 82.5% 100%);
    transform-origin: 87% 70%;
  }
  .rig-sleigh .torso {
    clip-path: polygon(0% 0%, 100% 0%, 100% 72.5%, 82.5% 72.5%, 68% 73.5%, 63% 78%, 62% 100%, 0% 100%);
  }
  .rig-sleigh.gallop .leg-back  { animation: gallopHind 0.42s ease-in-out infinite; }
  .rig-sleigh.gallop .leg-front { animation: gallopFront 0.42s ease-in-out infinite; }

  /* Santa walk cycle: back leg starts behind -> lifts & passes center -> lands in front -> pushes back */
  @keyframes walkBackToFront {
    0%, 100% { transform: translate(0%, 0%) rotate(4deg); }
    25%      { transform: translate(9%, -4%) rotate(-21deg); }
    50%      { transform: translate(17%, -1%) rotate(-42deg); }
    75%      { transform: translate(8%, 1%) rotate(-19deg); }
  }
  /* Front leg starts ahead -> pushes back along ground -> trails behind -> lifts & passes forward */
  @keyframes walkFrontToBack {
    0%, 100% { transform: translate(0%, -1%) rotate(-4deg); }
    25%      { transform: translate(-8%, 1%) rotate(19deg); }
    50%      { transform: translate(-17%, 0%) rotate(42deg); }
    75%      { transform: translate(-9%, -4%) rotate(21deg); }
  }

  @keyframes blowerBackToFront {
    0%, 100% { transform: translate(0%, 0%) rotate(4deg); }
    25%      { transform: translate(9%, -4%) rotate(-18deg); }
    50%      { transform: translate(18%, -1%) rotate(-36deg); }
    75%      { transform: translate(9%, 1%) rotate(-16deg); }
  }
  @keyframes blowerFrontToBack {
    0%, 100% { transform: translate(0%, -1%) rotate(-4deg); }
    25%      { transform: translate(-9%, 1%) rotate(16deg); }
    50%      { transform: translate(-18%, 0%) rotate(36deg); }
    75%      { transform: translate(-9%, -4%) rotate(18deg); }
  }

  /* Reindeer gallop: 0% extended leap (hind back, front forward) -> 50% tucked together under belly */
  @keyframes gallopHind {
    0%, 100% { transform: translate(0%, 0%) rotate(18deg); }
    50%      { transform: translate(4%, -2%) rotate(-34deg); }
  }
  @keyframes gallopFront {
    0%, 100% { transform: translate(0%, -2%) rotate(-18deg); }
    50%      { transform: translate(-4%, 1%) rotate(38deg); }
  }
  .speech { position: fixed; pointer-events: none; z-index: 5; max-width: 190px;
            font: 700 12px/1.25 system-ui, -apple-system, sans-serif; color: #1e293b;
            background: #ffffff; border: 1.5px solid #fca5a5; border-radius: 12px;
            padding: 6px 10px; box-shadow: 0 6px 18px rgba(15,23,42,.16);
            text-align: center; white-space: nowrap; }
  .speech::after { content: ""; position: absolute; left: 50%; bottom: -6px;
                   width: 10px; height: 10px; background: #ffffff;
                   border-right: 1.5px solid #fca5a5; border-bottom: 1.5px solid #fca5a5;
                   transform: translateX(-50%) rotate(45deg); }
  .cane-actor { position: fixed; left: 0; will-change: transform; z-index: 3;
                padding: 6px; margin: -6px; transition: filter .15s ease; }
  .cane-actor:hover { filter: drop-shadow(0 0 6px rgba(214,40,40,.65)) brightness(1.06); }
  .sign-wrap { display: flex; align-items: flex-end; gap: 0; position: relative; }
  .sign-board { filter: drop-shadow(0 6px 12px rgba(15,23,42,.22)); }
  canvas.snow { position: fixed; left: 0; top: 0; pointer-events: none; z-index: 1;
                transition: opacity .3s ease, filter .3s ease; }
  canvas.snow.back { opacity: .16; filter: blur(1.5px); }
  .ledgehit { position: fixed; pointer-events: auto; cursor: pointer; z-index: 1; }
  .elfbox { position: fixed; overflow: hidden; pointer-events: none; z-index: 3; }
  .elfbox .elf { position: absolute; left: 0; top: 0; will-change: transform; }
  /* Rigged elf: arms + broom swing side to side from the shoulders, two legs stride front to back. */
  .elfbox .elf-face { position: relative; width: 100%; }
  .elfbox .elf-face img { position: absolute; left: 0; top: 0; width: 100%; height: auto; }
  .elfbox .elf-face img.body { position: relative; display: block; }
  .elfbox .elf-face img.arms { transform-origin: 24% 50%; animation: elfBroom .56s ease-in-out infinite; }
  .elfbox .elf-face img.leg { transform-origin: 37% 75%; animation: elfStride .56s ease-in-out infinite; }
  .elfbox .elf-face img.leg.far { left: -9%; filter: brightness(.78); animation-delay: -.28s; }
  @keyframes elfBroom {
    0%, 100% { transform: translate(-7%, 1%) rotate(-6deg); }
    50%      { transform: translate(7%, -1%) rotate(6deg); }
  }
  @keyframes elfStride {
    0%, 100% { transform: rotate(-32deg); }
    50%      { transform: rotate(32deg); }
  }
  .pilehit { position: fixed; bottom: 0; pointer-events: auto; cursor: pointer; z-index: 1; }
  .decor { position: fixed; inset: 0; pointer-events: none; z-index: 0; }
  svg.garland { position: fixed; inset: 0; pointer-events: none; transition: opacity .35s, filter .35s;
                filter: drop-shadow(0 2px 2px rgba(0,0,0,.25)); }
  svg.snowbase { position: fixed; left: 0; bottom: 0; width: 100%; height: 16px; pointer-events: none;
                 filter: drop-shadow(0 -1px 2px rgba(90,120,160,.18)); }
  .glint { animation: gtw 3.2s ease-in-out infinite; }
  .glint.k1 { animation-delay: -.8s; } .glint.k2 { animation-delay: -1.6s; } .glint.k3 { animation-delay: -2.4s; }
  svg.garland.back { opacity: .16; filter: blur(1.5px); }
  .gbulb { animation: gtw 2.4s ease-in-out infinite; }
  .gbulb.k1 { animation-delay: -.6s; } .gbulb.k2 { animation-delay: -1.2s; } .gbulb.k3 { animation-delay: -1.8s; }
  @keyframes gtw { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }
  .tree-wrap { position: fixed; bottom: -6px; height: min(230px, 30vh); opacity: .97;
               filter: drop-shadow(0 2px 4px rgba(30,50,70,.18));
               transition: opacity .3s ease, filter .3s ease, transform .3s ease; }
  .tree-wrap.l { left: 0; transform: translateX(-50%); transform-origin: 0 100%; }
  .tree-wrap.r { right: 0; transform: translateX(50%); transform-origin: 100% 100%; }
  /* Mouse over a tree: it steps back into the background so the page shows through. */
  .tree-wrap.back { opacity: .16; filter: blur(1.5px) saturate(.6); }
  .tree-wrap.l.back { transform: translateX(-50%) scale(.9); }
  .tree-wrap.r.back { transform: translateX(50%) scale(.9); }
  .tree-img { height: 100%; width: auto; display: block; }
  .tree-far { position: fixed; bottom: 24px; height: min(140px, 18vh); opacity: .5;
              filter: blur(.5px) saturate(.6) brightness(1.1); pointer-events: none; }
  .tree-far.l { left: clamp(8px, 2.2vw, 34px); }
  .tree-far.r { right: clamp(8px, 2.2vw, 34px); }
  .drift { position: fixed; bottom: -8px; width: clamp(150px, 14vw, 200px); height: 50px; pointer-events: none;
           border-radius: 50% 50% 0 0 / 100% 100% 0 0;
           background: radial-gradient(ellipse at 50% 0%, #ffffff 0%, #f1f6fc 45%, #dde8f5 100%);
           box-shadow: 0 -1px 6px rgba(255,255,255,.35); opacity: .9; }
  .drift.l { left: -40px; }
  .drift.r { right: -40px; }
  .tree-ornaments { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
  .orn { animation: ornGlow 2.8s ease-in-out infinite; }
  .orn.d1 { animation-delay: -.7s; } .orn.d2 { animation-delay: -1.4s; } .orn.d3 { animation-delay: -2.1s; }
  @keyframes ornGlow { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }
  svg.lights { position: fixed; left: 0; top: 0; overflow: visible; }
  .bulb { transform-box: fill-box; transform-origin: center; }
  .blink .bulb { animation: twinkle 2.4s ease-in-out infinite; }
  .blink .k1 { animation-delay: -.6s; } .blink .k2 { animation-delay: -1.2s; } .blink .k3 { animation-delay: -1.8s; }
  .chase .bulb { animation: chase 1.8s ease-in-out infinite; }
  @keyframes twinkle { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
  @keyframes chase {
    0%, 100% { opacity: .32; transform: scale(.92); }
    22%      { opacity: 1; transform: scale(1.12); }
    48%      { opacity: .45; transform: scale(.96); }
  }
  @media (prefers-reduced-motion: reduce) {
    .blink .bulb, .chase .bulb, .orn, .rig-part { animation: none !important; }
  }
`;

function ensureStage() {
  if (host && host.isConnected) return layer;
  host = document.createElement("santa-pop-in");
  host.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;pointer-events:none;display:block;";
  root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = CSS;
  layer = document.createElement("div");
  layer.className = "layer";
  root.append(style, layer);
  (document.body || document.documentElement).appendChild(host);
  return layer;
}

function el(tag, props = {}, parent) {
  const n = document.createElement(tag);
  Object.assign(n, props);
  if (props.style) n.style.cssText = props.style;
  (parent || ensureStage()).appendChild(n);
  return n;
}

// Resolve when an animation finishes or the act is aborted.
function played(anim, signal) {
  return new Promise((resolve) => {
    const done = () => {
      signal?.removeEventListener("abort", abort);
      anim.onfinish = anim.oncancel = null;
      resolve();
    };
    const abort = () => { anim.cancel(); done(); };
    anim.onfinish = anim.oncancel = done;
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}

// A soft contact shadow so walkers feel planted on the ground.
const addShadow = (actor) => el("div", { className: "shadow" }, actor);

// Moves an actor straight across the window, entering and leaving just off
// screen (pad px), optionally running overrun px further out on the far side.
// Facing follows the direction of travel. speed is in px per second.
function crossScreen(actor, ltr, width, { speed, pad = 10, overrun = 0 }) {
  const W = window.innerWidth;
  const flip = ltr ? "" : " scaleX(-1)";
  const from = ltr ? -width - pad : W + pad;
  const to = ltr ? W + pad + overrun : -width - pad - overrun;
  const duration = (Math.abs(to - from) / speed) * 1000;
  const trip = actor.animate(
    [{ transform: `translateX(${from}px)${flip}` }, { transform: `translateX(${to}px)${flip}` }],
    { duration, easing: "linear", fill: "forwards" }
  );
  return { trip, duration };
}
