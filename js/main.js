"use strict";

const SETTINGS = {
  particles: {
    count: 94,
    dotSize: 2.2,
    moveSpeed: 0.64,
    lineDistance: 178,
    lineOpacity: 0.22,
    clickBurst: 7
  },
  glyphs: {
    rate: 0.86,
    density: 1,
    ambientNumberBias: 0.18,
    popNumberBias: 0.3
  },
  drift: {
    radius: 80,
    speedBase: 0.035,
    trailWidth: 4,
    trailDecay: 1.2,
    trailLength: 140,
    carSize: 64,
    spriteReferenceSize: 256,
    spriteForwardOffset: -Math.PI * 0.5,
    tireRearFromTopPx: 65,
    tireTopFromLeftPx: 65,
    tireBottomFromRightPx: 60
  },
  layout: {
    gap: 18,
    windowPadding: 8,
    mobileBreakpoint: 720
  }
};

const TRANSITION = {
  reentryIdleMs: 1000,
  nominalFrameMs: 1000 / 60,
  entrySpeedPxPerMs: 0.44,
  exitSpeedPxPerMs: 0.52,
  minPhaseDurationMs: 140,
  maxPhaseDurationMs: 1800,
  entryCornerSweepRadians: 1.12,
  exitCornerSweepRadians: 0.78,
  entryAccelExponent: 1.55,
  exitAccelExponent: 1.45,
  exitPrepBoostScale: 1.58,
  orbitRecoveryMs: 650,
  orbitSpeedWaveAmp: 0.18,
  orbitSpeedWaveFreq: 1.75,
  orbitSpeedWaveAmp2: 0.06,
  orbitSpeedWaveFreq2: 4.3,
  slipExitBlendRadians: 0.55,
  pointerOutsidePadding: 4
};

const CARDINAL_TANGENTS = Object.freeze([
  { theta: -Math.PI * 0.5, edge: "right" },
  { theta: 0, edge: "bottom" },
  { theta: Math.PI * 0.5, edge: "left" },
  { theta: Math.PI, edge: "top" }
]);

const app = document.getElementById("app");
const particlesNode = document.getElementById("particles-js");
const driftCanvas = document.getElementById("driftCanvas");
const driftContext = driftCanvas.getContext("2d");
const glyphLayer = document.getElementById("glyph-layer");
const cursorPointer = document.getElementById("cursorPointer");
const typingWord = document.getElementById("typingWord");

const sdiWindow = document.getElementById("sdiWindow");
const linksWindow = document.getElementById("linksWindow");
const statusWindow = document.getElementById("statusWindow");
const aboutWindow = document.getElementById("aboutWindow");
const emailWindow = document.getElementById("emailWindow");

const aboutOpen = document.getElementById("aboutOpen");
const emailOpen = document.getElementById("emailOpen");
const driftToggle = document.getElementById("driftToggle");
const driftState = document.getElementById("driftState");
const sfTime = document.getElementById("sfTime");

const windows = Array.from(document.querySelectorAll(".win"));
const closers = Array.from(document.querySelectorAll("[data-close-target]"));

const carSprite = new Image();
let carSpriteReady = false;
carSprite.addEventListener("load", () => {
  carSpriteReady = true;
});
carSprite.src = "assets/images/rx7.png";

const state = {
  initializedLayout: false,
  zCounter: 30,
  drag: null,
  pointer: {
    x: window.innerWidth * 0.5,
    y: window.innerHeight * 0.5
  },
  runCenter: {
    x: window.innerWidth * 0.5,
    y: window.innerHeight * 0.5
  },
  runRadius: SETTINGS.drift.radius,
  runEntryEdge: null,
  runEntryTheta: 0,
  runExitTheta: 0,
  runExitEdge: null,
  driftRequested: false,
  driftEnabled: false,
  driftPendingDisable: false,
  driftPhase: "hidden",
  phaseStartedAt: 0,
  phaseDuration: 0,
  phaseStartTheta: 0,
  phaseTargetTheta: 0,
  phaseThetaDelta: 0,
  entryStart: null,
  entryTangentPoint: null,
  entryHeading: 0,
  entryLineLength: 0,
  entryArcSpeedScale: 1,
  exitStart: null,
  exitHeading: 0,
  exitEnd: null,
  exitLineLength: 0,
  transitionFrame: 0,
  driftTime: 0,
  driftAngle: 0,
  orbitSpeedScale: 1,
  trailLeft: [],
  trailRight: [],
  lastCarPose: null,
  lastPointerMovedAt: performance.now(),
  lastFrameAt: performance.now(),
  particlesInteractive: true,
  ambientGlyphs: [],
  nextPopAt: 0,
  typingQueue: [],
  currentTypedWord: "",
  customCursorEnabled: true
};

const sfTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  hour12: false,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit"
});

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothStep(t) {
  const clamped = clamp(t, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function normalizeAngle(angle) {
  const tau = Math.PI * 2;
  let wrapped = angle;
  while (wrapped <= -Math.PI) {
    wrapped += tau;
  }
  while (wrapped > Math.PI) {
    wrapped -= tau;
  }
  return wrapped;
}

function pickRandomEdge() {
  const edges = ["left", "right", "top", "bottom"];
  return edges[Math.floor(Math.random() * edges.length)];
}

function shuffle(list) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function randomNumberToken() {
  return String(Math.floor(Math.random() * 100)).padStart(2, "0");
}

function randomGlyphToken(numberBias) {
  return Math.random() < numberBias ? randomNumberToken() : "+";
}

function bringToFront(win) {
  state.zCounter += 1;
  win.style.zIndex = String(state.zCounter);
}

function isMobileLayout() {
  return window.innerWidth <= SETTINGS.layout.mobileBreakpoint;
}

function enableTouchModeIfNeeded() {
  const coarse = window.matchMedia("(hover: none), (pointer: coarse)").matches;
  const touchPoints = navigator.maxTouchPoints > 0;
  if (coarse || touchPoints) {
    document.documentElement.classList.add("touch-mode");
    state.customCursorEnabled = false;
  }
}

function positionCursor(x, y) {
  state.pointer.x = x;
  state.pointer.y = y;

  if (!state.customCursorEnabled) {
    return;
  }

  cursorPointer.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}

function createParticlesConfig(interactive) {
  return {
    particles: {
      number: {
        value: SETTINGS.particles.count,
        density: { enable: true, value_area: 980 }
      },
      color: { value: "#12181d" },
      shape: { type: "circle" },
      opacity: {
        value: 0.34,
        random: true,
        anim: { enable: false, speed: 0.3, opacity_min: 0.08, sync: false }
      },
      size: {
        value: SETTINGS.particles.dotSize,
        random: true,
        anim: { enable: false, speed: 5, size_min: 0.2, sync: false }
      },
      line_linked: {
        enable: true,
        distance: SETTINGS.particles.lineDistance,
        color: "#8d9298",
        opacity: SETTINGS.particles.lineOpacity,
        width: 1
      },
      move: {
        enable: true,
        speed: SETTINGS.particles.moveSpeed,
        direction: "none",
        random: false,
        straight: false,
        out_mode: "out",
        bounce: false
      }
    },
    interactivity: {
      detect_on: "canvas",
      events: {
        onhover: { enable: interactive, mode: "grab" },
        onclick: { enable: interactive, mode: "push" },
        resize: true
      },
      modes: {
        grab: { distance: 240, line_linked: { opacity: 0.5 } },
        push: { particles_nb: SETTINGS.particles.clickBurst }
      }
    },
    retina_detect: true
  };
}

function initParticles() {
  if (!window.particlesJS || !particlesNode) {
    return;
  }

  if (window.pJSDom && window.pJSDom.length > 0) {
    window.pJSDom[0].pJS.fn.vendors.destroypJS();
    window.pJSDom = [];
  }

  window.particlesJS("particles-js", createParticlesConfig(state.particlesInteractive));
}

function setParticlesInteractive(enabled) {
  state.particlesInteractive = enabled;
  const dom = window.pJSDom && window.pJSDom[0];
  if (!dom) {
    return;
  }

  const pjs = dom.pJS;
  pjs.interactivity.events.onhover.enable = enabled;
  pjs.interactivity.events.onclick.enable = enabled;
  // Don't refresh/rebuild particles; just toggle live interactivity behavior.
  if (!enabled) {
    pjs.interactivity.status = "mouseleave";
  }
}

function resetAmbientGlyph(el, now) {
  const token = randomGlyphToken(SETTINGS.glyphs.ambientNumberBias);
  const numeric = /\d/.test(token);
  el.textContent = token;
  el.classList.toggle("plus-glyph", token === "+");
  el.style.left = `${rand(2, 98).toFixed(2)}%`;
  el.style.top = `${rand(4, 96).toFixed(2)}%`;
  el.style.fontSize = `${numeric ? rand(10, 12) : rand(10, 16)}px`;
  el.style.opacity = rand(0.1, 0.26).toFixed(2);
  el.style.animationDuration = `${rand(3.2, 6.6).toFixed(2)}s`;
  el.style.animationDelay = `${(-rand(0, 6)).toFixed(2)}s`;
  el.dataset.nextShuffle = String(now + rand(2400, 8200));
}

function syncAmbientGlyphCount(now) {
  const areaScale = (window.innerWidth * window.innerHeight) / 76000;
  const target = Math.max(14, Math.min(72, Math.round(areaScale * SETTINGS.glyphs.density)));

  while (state.ambientGlyphs.length < target) {
    const el = document.createElement("span");
    el.className = "glyph ambient";
    glyphLayer.appendChild(el);
    state.ambientGlyphs.push(el);
    resetAmbientGlyph(el, now);
  }

  while (state.ambientGlyphs.length > target) {
    const el = state.ambientGlyphs.pop();
    el.remove();
  }
}

function updateAmbientGlyphs(now) {
  for (const el of state.ambientGlyphs) {
    const at = Number(el.dataset.nextShuffle || 0);
    if (now >= at) {
      resetAmbientGlyph(el, now);
    }
  }
}

function spawnPopGlyph() {
  const el = document.createElement("span");
  const token = randomGlyphToken(SETTINGS.glyphs.popNumberBias);
  const numeric = /\d/.test(token);

  el.className = "glyph pop";
  el.textContent = token;
  el.classList.toggle("plus-glyph", token === "+");
  el.style.left = `${rand(2, 98).toFixed(2)}%`;
  el.style.top = `${rand(6, 95).toFixed(2)}%`;
  el.style.fontSize = `${numeric ? rand(11, 14) : rand(12, 20)}px`;
  el.style.setProperty("--target-opacity", rand(0.16, 0.34).toFixed(2));
  el.style.setProperty("--dx", `${rand(-18, 18).toFixed(1)}px`);
  el.style.setProperty("--dy", `${rand(-14, 14).toFixed(1)}px`);
  el.style.animationDuration = `${rand(0.9, 2.0).toFixed(2)}s`;

  glyphLayer.appendChild(el);
  el.addEventListener("animationend", () => {
    el.remove();
  }, { once: true });
}

function scheduleNextPop(now) {
  const rate = Math.max(0.2, SETTINGS.glyphs.rate);
  const baseGap = 930 / rate;
  state.nextPopAt = now + baseGap * rand(0.7, 1.3);
}

function updatePopGlyphs(now) {
  if (now >= state.nextPopAt) {
    spawnPopGlyph();
    scheduleNextPop(now);
  }
}

function nextTypedName() {
  const options = ["steph", "orion", "onion"];
  if (state.typingQueue.length === 0) {
    state.typingQueue = shuffle(options);
  }
  const next = state.typingQueue.pop();
  if (next === state.currentTypedWord && state.typingQueue.length > 0) {
    return state.typingQueue.pop();
  }
  return next;
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function typeWord(word) {
  for (let i = 0; i < word.length; i += 1) {
    typingWord.textContent += word[i];
    await wait(rand(50, 190));
  }
}

async function eraseWord() {
  while (typingWord.textContent.length > 0) {
    typingWord.textContent = typingWord.textContent.slice(0, -1);
    await wait(rand(34, 120));
  }
}

async function typingLoop() {
  state.currentTypedWord = "sding";
  await typeWord(state.currentTypedWord);
  await wait(rand(760, 1520));

  for (;;) {
    await eraseWord();
    await wait(rand(120, 340));
    state.currentTypedWord = nextTypedName();
    await typeWord(state.currentTypedWord);
    await wait(rand(620, 1720));
  }
}

function setWindowPosition(win, left, top) {
  win.style.left = `${left}px`;
  win.style.top = `${top}px`;
  win.style.right = "auto";
  win.style.bottom = "auto";
  win.style.transform = "none";
}

function clampWindowIntoView(win) {
  if (isMobileLayout() || win.classList.contains("is-hidden")) {
    return;
  }

  const rect = win.getBoundingClientRect();
  const appRect = app.getBoundingClientRect();
  const maxLeft = Math.max(SETTINGS.layout.windowPadding, appRect.width - rect.width - SETTINGS.layout.windowPadding);
  const maxTop = Math.max(SETTINGS.layout.windowPadding, appRect.height - rect.height - SETTINGS.layout.windowPadding);

  const parsedLeft = Number.parseFloat(win.style.left);
  const parsedTop = Number.parseFloat(win.style.top);
  if (Number.isNaN(parsedLeft) || Number.isNaN(parsedTop)) {
    return;
  }

  setWindowPosition(
    win,
    clamp(parsedLeft, SETTINGS.layout.windowPadding, maxLeft),
    clamp(parsedTop, SETTINGS.layout.windowPadding, maxTop)
  );
}

function layoutDesktopWindows() {
  if (isMobileLayout()) {
    return;
  }

  const appRect = app.getBoundingClientRect();
  const gap = SETTINGS.layout.gap;
  const pad = SETTINGS.layout.windowPadding;

  const sdiRect = sdiWindow.getBoundingClientRect();
  const linksRect = linksWindow.getBoundingClientRect();
  const statusRect = statusWindow.getBoundingClientRect();

  const pairWidth = sdiRect.width + gap + linksRect.width;
  const baseX = clamp((appRect.width - pairWidth) * 0.5, pad, Math.max(pad, appRect.width - pairWidth - pad));
  const sdiY = clamp((appRect.height - sdiRect.height) * 0.5 - 26, pad, Math.max(pad, appRect.height - sdiRect.height - pad));

  if (!sdiWindow.dataset.dragged || !state.initializedLayout) {
    setWindowPosition(sdiWindow, baseX, sdiY);
  }

  const linksX = baseX + sdiRect.width + gap;
  const linksY = clamp(sdiY + sdiRect.height - linksRect.height, pad, Math.max(pad, appRect.height - linksRect.height - pad));

  if (!linksWindow.dataset.dragged || !state.initializedLayout) {
    setWindowPosition(linksWindow, linksX, linksY);
  }

  if (!statusWindow.dataset.dragged || !state.initializedLayout) {
    setWindowPosition(statusWindow, pad, appRect.height - statusRect.height - pad);
  }

  state.initializedLayout = true;
}

function placePopupCenter(win) {
  if (isMobileLayout()) {
    return;
  }
  const appRect = app.getBoundingClientRect();
  const rect = win.getBoundingClientRect();
  setWindowPosition(
    win,
    clamp((appRect.width - rect.width) * 0.5, SETTINGS.layout.windowPadding, Math.max(SETTINGS.layout.windowPadding, appRect.width - rect.width - SETTINGS.layout.windowPadding)),
    clamp((appRect.height - rect.height) * 0.55, SETTINGS.layout.windowPadding, Math.max(SETTINGS.layout.windowPadding, appRect.height - rect.height - SETTINGS.layout.windowPadding))
  );
}

function startDrag(event, win, handle) {
  if (isMobileLayout()) {
    return;
  }

  const appRect = app.getBoundingClientRect();
  const rect = win.getBoundingClientRect();

  setWindowPosition(win, rect.left - appRect.left, rect.top - appRect.top);

  state.drag = {
    pointerId: event.pointerId,
    win,
    dx: event.clientX - rect.left,
    dy: event.clientY - rect.top
  };

  win.dataset.dragged = "1";
  bringToFront(win);
  handle.setPointerCapture(event.pointerId);
}

function onDragMove(event) {
  if (!state.drag || event.pointerId !== state.drag.pointerId) {
    return;
  }

  const appRect = app.getBoundingClientRect();
  const rect = state.drag.win.getBoundingClientRect();
  const maxLeft = Math.max(SETTINGS.layout.windowPadding, appRect.width - rect.width - SETTINGS.layout.windowPadding);
  const maxTop = Math.max(SETTINGS.layout.windowPadding, appRect.height - rect.height - SETTINGS.layout.windowPadding);

  setWindowPosition(
    state.drag.win,
    clamp(event.clientX - appRect.left - state.drag.dx, SETTINGS.layout.windowPadding, maxLeft),
    clamp(event.clientY - appRect.top - state.drag.dy, SETTINGS.layout.windowPadding, maxTop)
  );
}

function endDrag(event) {
  if (!state.drag || event.pointerId !== state.drag.pointerId) {
    return;
  }
  state.drag = null;
}

function openWindow(win) {
  win.classList.remove("is-hidden");
  placePopupCenter(win);
  bringToFront(win);
}

function closeWindow(win) {
  win.classList.add("is-hidden");
}

function resizeDriftCanvas() {
  driftCanvas.width = window.innerWidth;
  driftCanvas.height = window.innerHeight;
  if (state.driftEnabled) {
    clampRunCenter(state.runCenter, state.runRadius);
  }
  if (!state.driftEnabled || state.driftPhase === "hidden") {
    driftContext.clearRect(0, 0, driftCanvas.width, driftCanvas.height);
  }
}

function clearTrails() {
  state.trailLeft.length = 0;
  state.trailRight.length = 0;
}

function addTrailPoint(arr, x, y, maxLength, life = 1) {
  arr.push({ x, y, life });
  while (arr.length > maxLength) {
    arr.shift();
  }
}

function drawTrail(arr, width, alphaScale) {
  if (arr.length < 2 || alphaScale <= 0.01) {
    return;
  }

  driftContext.save();
  driftContext.lineCap = "round";
  driftContext.lineJoin = "round";

  for (let i = 1; i < arr.length; i += 1) {
    const a = arr[i - 1];
    const b = arr[i];
    const baseAlpha = clamp((a.life + b.life) * 0.5, 0, 1);
    const alpha = baseAlpha * alphaScale;
    if (alpha <= 0) {
      continue;
    }

    driftContext.strokeStyle = `rgba(88, 95, 103, ${alpha})`;
    driftContext.lineWidth = width;
    driftContext.beginPath();
    driftContext.moveTo(a.x, a.y);
    driftContext.lineTo(b.x, b.y);
    driftContext.stroke();
  }

  driftContext.restore();
}

function getRearTrailPoints(carX, carY, trailHeading) {
  const ref = SETTINGS.drift.spriteReferenceSize;
  const size = SETTINGS.drift.carSize;
  const rearOffset = size * (0.5 - (SETTINGS.drift.tireRearFromTopPx / ref));
  const leftHalf = size * (0.5 - (SETTINGS.drift.tireTopFromLeftPx / ref));
  const rightHalf = size * (0.5 - (SETTINGS.drift.tireBottomFromRightPx / ref));
  const axleHalf = (leftHalf + rightHalf) * 0.5;

  const fx = Math.cos(trailHeading);
  const fy = Math.sin(trailHeading);
  const nx = -fy;
  const ny = fx;
  const rearX = carX - fx * rearOffset;
  const rearY = carY - fy * rearOffset;

  return {
    left: {
      x: rearX + nx * axleHalf,
      y: rearY + ny * axleHalf
    },
    right: {
      x: rearX - nx * axleHalf,
      y: rearY - ny * axleHalf
    }
  };
}

function addTrailsFromPose(pose, lifeScale, stride) {
  state.transitionFrame += 1;
  if (stride > 1 && state.transitionFrame % stride !== 0) {
    return;
  }

  const fallbackHeading = pose.rotation - SETTINGS.drift.spriteForwardOffset;
  const trailHeading = Number.isFinite(pose.trailHeading) ? pose.trailHeading : fallbackHeading;
  const tires = getRearTrailPoints(pose.x, pose.y, trailHeading);
  addTrailPoint(state.trailLeft, tires.left.x, tires.left.y, SETTINGS.drift.trailLength, lifeScale);
  addTrailPoint(state.trailRight, tires.right.x, tires.right.y, SETTINGS.drift.trailLength, lifeScale);
}

function decayTrails(deltaSeconds) {
  const decay = 0.6 * SETTINGS.drift.trailDecay;
  for (const point of state.trailLeft) {
    point.life -= decay * deltaSeconds;
  }
  for (const point of state.trailRight) {
    point.life -= decay * deltaSeconds;
  }

  while (state.trailLeft.length > 0 && state.trailLeft[0].life <= 0) {
    state.trailLeft.shift();
  }
  while (state.trailRight.length > 0 && state.trailRight[0].life <= 0) {
    state.trailRight.shift();
  }
}

function drawCarSprite(x, y, rotation, alpha, scale = 1) {
  if (alpha <= 0.01) {
    return;
  }

  driftContext.save();
  driftContext.globalAlpha = alpha;
  driftContext.translate(x, y);
  driftContext.rotate(rotation);
  driftContext.scale(scale, scale);

  if (carSpriteReady) {
    const size = SETTINGS.drift.carSize;
    driftContext.drawImage(carSprite, -size * 0.5, -size * 0.5, size, size);
  } else {
    driftContext.fillStyle = "#11161b";
    driftContext.fillRect(-12, -7, 24, 14);
  }

  driftContext.restore();
}

function offscreenMargin() {
  return Math.max(SETTINGS.drift.carSize * 1.4, 96);
}

function pointOnCircle(cx, cy, radius, theta) {
  return {
    x: cx + Math.cos(theta) * radius,
    y: cy + Math.sin(theta) * radius
  };
}

function distanceBetween(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function headingVector(heading) {
  return {
    x: Math.cos(heading),
    y: Math.sin(heading)
  };
}

function inwardHeadingForEdge(edge) {
  if (edge === "left") {
    return 0;
  }
  if (edge === "right") {
    return Math.PI;
  }
  if (edge === "top") {
    return Math.PI * 0.5;
  }
  return -Math.PI * 0.5;
}

function entryTangentThetaForEdge(edge) {
  if (edge === "left") {
    return -Math.PI * 0.5;
  }
  if (edge === "right") {
    return Math.PI * 0.5;
  }
  if (edge === "top") {
    return 0;
  }
  return Math.PI;
}

function offscreenPointOnEdge(edge, anchor, margin) {
  if (edge === "left") {
    return { x: -margin, y: anchor.y };
  }
  if (edge === "right") {
    return { x: driftCanvas.width + margin, y: anchor.y };
  }
  if (edge === "top") {
    return { x: anchor.x, y: -margin };
  }
  return { x: anchor.x, y: driftCanvas.height + margin };
}

function clampRunCenter(center, _radius) {
  if (!Number.isFinite(center.x) || !Number.isFinite(center.y)) {
    center.x = Number.isFinite(state.pointer.x) ? state.pointer.x : driftCanvas.width * 0.5;
    center.y = Number.isFinite(state.pointer.y) ? state.pointer.y : driftCanvas.height * 0.5;
  }
}

function positiveAngleDelta(from, to) {
  const tau = Math.PI * 2;
  let delta = to - from;
  while (delta <= 0) {
    delta += tau;
  }
  return delta;
}

function nextCardinalTheta(currentTheta) {
  const tau = Math.PI * 2;
  let bestTheta = currentTheta + tau;
  let bestDelta = tau;

  for (const item of CARDINAL_TANGENTS) {
    const cycles = Math.floor((currentTheta - item.theta) / tau) + 1;
    const candidate = item.theta + cycles * tau;
    const delta = candidate - currentTheta;
    if (delta < bestDelta) {
      bestDelta = delta;
      bestTheta = candidate;
    }
  }

  return bestTheta;
}

function edgeForExitTheta(theta) {
  let bestEdge = CARDINAL_TANGENTS[0].edge;
  let bestDistance = Infinity;
  for (const item of CARDINAL_TANGENTS) {
    const distance = Math.abs(normalizeAngle(theta - item.theta));
    if (distance < bestDistance) {
      bestDistance = distance;
      bestEdge = item.edge;
    }
  }
  return bestEdge;
}

function headingTowardEdge(edge) {
  if (edge === "right") {
    return 0;
  }
  if (edge === "bottom") {
    return Math.PI * 0.5;
  }
  if (edge === "left") {
    return Math.PI;
  }
  return -Math.PI * 0.5;
}

function durationFromDistance(distance, speedPxPerMs) {
  const raw = distance / Math.max(0.001, speedPxPerMs);
  return clamp(raw, TRANSITION.minPhaseDurationMs, TRANSITION.maxPhaseDurationMs);
}

function accelProgress(progress, exponent) {
  const p = clamp(progress, 0, 1);
  return Math.pow(p, Math.max(1, exponent));
}

function inverseAccelProgress(distanceRatio, exponent) {
  const r = clamp(distanceRatio, 0, 1);
  return Math.pow(r, 1 / Math.max(1, exponent));
}

function entryArcSpeedScale() {
  const orbitLinearSpeedPxPerMs = (SETTINGS.drift.speedBase * state.runRadius) / TRANSITION.nominalFrameMs;
  const endLineSpeedPxPerMs = TRANSITION.entrySpeedPxPerMs * TRANSITION.entryAccelExponent;
  const desired = endLineSpeedPxPerMs / Math.max(0.001, orbitLinearSpeedPxPerMs);
  return clamp(desired, 1, 2.4);
}

function donutSpeedScale() {
  const t = state.driftTime;
  const waveA = 1 + Math.sin(t * TRANSITION.orbitSpeedWaveFreq) * TRANSITION.orbitSpeedWaveAmp;
  const waveB = Math.sin(t * TRANSITION.orbitSpeedWaveFreq2) * TRANSITION.orbitSpeedWaveAmp2;
  return clamp(waveA + waveB, 0.72, 1.42);
}

function orbitStep(deltaSeconds, speedScale = 1) {
  const frameScale = (deltaSeconds * 1000) / TRANSITION.nominalFrameMs;
  return SETTINGS.drift.speedBase * frameScale * speedScale;
}

function orbitTravelHeading(theta) {
  return theta + Math.PI * 0.5;
}

function orbitPose(theta, slip) {
  const position = pointOnCircle(state.runCenter.x, state.runCenter.y, state.runRadius, theta);
  const heading = orbitTravelHeading(theta);
  return {
    x: position.x,
    y: position.y,
    trailHeading: heading,
    rotation: heading + slip + SETTINGS.drift.spriteForwardOffset
  };
}

function getCurrentOrbitPose() {
  return orbitPose(state.driftAngle, Math.PI * 0.5);
}

function isPointerOutsideDonutCircle() {
  const dx = state.pointer.x - state.runCenter.x;
  const dy = state.pointer.y - state.runCenter.y;
  const threshold = state.runRadius + TRANSITION.pointerOutsidePadding;
  return (dx * dx + dy * dy) > (threshold * threshold);
}

function buildEntryRoute(center, radius, edge) {
  const margin = offscreenMargin();
  const heading = inwardHeadingForEdge(edge);
  const tangentTheta = entryTangentThetaForEdge(edge);
  const tangentPoint = pointOnCircle(center.x, center.y, radius, tangentTheta);
  const start = offscreenPointOnEdge(edge, tangentPoint, margin);

  return {
    start,
    tangentPoint,
    tangentTheta,
    heading,
    lineLength: distanceBetween(start, tangentPoint)
  };
}

function setDriftPhaseHidden() {
  state.driftPhase = "hidden";
  state.phaseStartedAt = 0;
  state.phaseDuration = 0;
  state.phaseStartTheta = 0;
  state.phaseTargetTheta = 0;
  state.phaseThetaDelta = 0;
  state.entryStart = null;
  state.entryTangentPoint = null;
  state.entryHeading = 0;
  state.entryLineLength = 0;
  state.entryArcSpeedScale = 1;
  state.exitStart = null;
  state.exitHeading = 0;
  state.exitEnd = null;
  state.exitLineLength = 0;
  state.transitionFrame = 0;
  state.orbitSpeedScale = 1;
  state.lastCarPose = null;
  clearTrails();
}

function finalizeDriftDisable() {
  state.driftRequested = false;
  state.driftEnabled = false;
  state.driftPendingDisable = false;
  driftCanvas.classList.remove("drift-front");
  setParticlesInteractive(true);
  setDriftPhaseHidden();
  driftContext.clearRect(0, 0, driftCanvas.width, driftCanvas.height);
}

function startDriftEntry(now) {
  state.runRadius = SETTINGS.drift.radius;
  state.runCenter.x = state.pointer.x;
  state.runCenter.y = state.pointer.y;
  clampRunCenter(state.runCenter, state.runRadius);

  const edge = pickRandomEdge();
  const route = buildEntryRoute(state.runCenter, state.runRadius, edge);
  state.runEntryEdge = edge;
  state.runEntryTheta = route.tangentTheta;

  state.entryStart = route.start;
  state.entryTangentPoint = route.tangentPoint;
  state.entryHeading = route.heading;
  state.entryLineLength = route.lineLength;
  state.entryArcSpeedScale = entryArcSpeedScale();

  state.driftPhase = "entering_line";
  state.phaseStartedAt = now;
  state.phaseDuration = durationFromDistance(route.lineLength, TRANSITION.entrySpeedPxPerMs);
  state.phaseStartTheta = 0;
  state.phaseTargetTheta = 0;
  state.phaseThetaDelta = 0;
  state.orbitSpeedScale = 1;
  state.transitionFrame = 0;
}

function maybeStartDriftEntry(now) {
  if (!state.driftEnabled || !state.driftRequested || state.driftPendingDisable) {
    return;
  }
  if (state.driftPhase !== "hidden") {
    return;
  }
  const pointerIdleMs = now - state.lastPointerMovedAt;
  if (pointerIdleMs >= TRANSITION.reentryIdleMs) {
    startDriftEntry(now);
  }
}

function startOrbitToExitTangent(now) {
  if (state.driftPhase !== "orbiting") {
    return;
  }
  const targetTheta = nextCardinalTheta(state.driftAngle);
  state.runExitTheta = targetTheta;
  state.runExitEdge = edgeForExitTheta(targetTheta);
  state.phaseStartTheta = state.driftAngle;
  state.phaseTargetTheta = targetTheta;
  state.phaseThetaDelta = positiveAngleDelta(state.phaseStartTheta, state.phaseTargetTheta);
  state.phaseStartedAt = now;
  state.phaseDuration = 0;
  state.driftPhase = "orbit_to_exit_tangent";
}

function startExitLine(now, carryDistance = 0) {
  const exitStart = pointOnCircle(state.runCenter.x, state.runCenter.y, state.runRadius, state.runExitTheta);
  const exitEdge = state.runExitEdge || edgeForExitTheta(state.runExitTheta);
  const exitHeading = headingTowardEdge(exitEdge);
  const exitEnd = offscreenPointOnEdge(exitEdge, exitStart, offscreenMargin());
  const lineLength = distanceBetween(exitStart, exitEnd);
  const clampedCarry = clamp(carryDistance, 0, Math.max(0, lineLength - 0.001));
  const carryRatio = clampedCarry / Math.max(0.001, lineLength);

  state.exitStart = exitStart;
  state.exitEnd = exitEnd;
  state.exitHeading = exitHeading;
  state.exitLineLength = lineLength;
  state.driftPhase = "exiting_line";
  state.phaseDuration = durationFromDistance(lineLength, TRANSITION.exitSpeedPxPerMs);
  const carryProgress = inverseAccelProgress(carryRatio, TRANSITION.exitAccelExponent);
  state.phaseStartedAt = now - (state.phaseDuration * carryProgress);
  state.transitionFrame = 0;
}

function advanceOrbitAngle(deltaSeconds, speedScale = 1) {
  state.driftTime += deltaSeconds;
  const step = orbitStep(deltaSeconds, speedScale);
  state.driftAngle += step;
  return step;
}

function startEnteringCornerArc(now, carrySeconds = 0) {
  state.driftPhase = "entering_corner_arc";
  state.phaseStartedAt = now;
  state.phaseDuration = 0;
  state.phaseStartTheta = state.runEntryTheta;
  state.phaseTargetTheta = state.runEntryTheta + TRANSITION.entryCornerSweepRadians;
  state.phaseThetaDelta = positiveAngleDelta(state.phaseStartTheta, state.phaseTargetTheta);
  state.driftAngle = state.phaseStartTheta;
  state.transitionFrame = 0;

  if (carrySeconds > 0) {
    advanceOrbitAngle(carrySeconds, state.entryArcSpeedScale);
  }
}

function onDriftPointerActivity(now) {
  state.lastPointerMovedAt = now;
  if (!state.driftEnabled || !state.driftRequested || state.driftPendingDisable) {
    return;
  }
  if (state.driftPhase === "orbiting" && isPointerOutsideDonutCircle()) {
    startOrbitToExitTangent(now);
  }
}

function setDriftMode(enabled) {
  state.driftRequested = enabled;
  driftState.textContent = enabled ? "on" : "off";
  driftToggle.querySelector("span:last-child").textContent = enabled ? "disable drift mode" : "enable drift mode";

  if (enabled) {
    state.driftPendingDisable = false;
    driftCanvas.classList.add("drift-front");
    setParticlesInteractive(false);

    if (!state.driftEnabled) {
      state.driftEnabled = true;
      clearTrails();
      state.driftTime = 0;
      state.driftAngle = 0;
      setDriftPhaseHidden();
      driftContext.clearRect(0, 0, driftCanvas.width, driftCanvas.height);
    }

    maybeStartDriftEntry(performance.now());
    return;
  }

  if (!state.driftEnabled) {
    finalizeDriftDisable();
    return;
  }

  state.driftPendingDisable = true;
  if (state.driftPhase === "orbiting") {
    startOrbitToExitTangent(performance.now());
  } else if (state.driftPhase === "hidden") {
    finalizeDriftDisable();
  }
}

function updateDrift(now, deltaSeconds) {
  driftContext.clearRect(0, 0, driftCanvas.width, driftCanvas.height);
  if (!state.driftEnabled) {
    return;
  }

  if (state.driftPhase === "hidden") {
    if (!state.driftRequested || state.driftPendingDisable) {
      finalizeDriftDisable();
      return;
    }
    maybeStartDriftEntry(now);
  }

  let activePose = null;
  const trailLife = 0.68;

  if (state.driftPhase === "entering_line" && state.entryStart && state.entryTangentPoint) {
    const elapsedMs = now - state.phaseStartedAt;
    const progress = clamp(elapsedMs / Math.max(1, state.phaseDuration), 0, 1);
    const eased = accelProgress(progress, TRANSITION.entryAccelExponent);
    activePose = {
      x: lerp(state.entryStart.x, state.entryTangentPoint.x, eased),
      y: lerp(state.entryStart.y, state.entryTangentPoint.y, eased),
      trailHeading: state.entryHeading,
      rotation: state.entryHeading + SETTINGS.drift.spriteForwardOffset
    };

    if (progress >= 1) {
      const carryMs = Math.max(0, elapsedMs - state.phaseDuration);
      startEnteringCornerArc(now, carryMs / 1000);
      const arcProgress = clamp(
        (state.driftAngle - state.phaseStartTheta) / Math.max(0.0001, state.phaseThetaDelta),
        0,
        1
      );
      const slip = smoothStep(arcProgress) * (Math.PI * 0.5);
      activePose = orbitPose(state.driftAngle, slip);
    }
  } else if (state.driftPhase === "entering_corner_arc") {
    const progress = clamp(
      (state.driftAngle - state.phaseStartTheta) / Math.max(0.0001, state.phaseThetaDelta),
      0,
      1
    );
    const speedScale = state.entryArcSpeedScale;
    advanceOrbitAngle(deltaSeconds, speedScale);

    if (state.driftAngle >= state.phaseTargetTheta) {
      const overshootTheta = state.driftAngle - state.phaseTargetTheta;
      state.driftAngle = state.phaseTargetTheta + Math.max(0, overshootTheta);
      state.driftPhase = "orbiting";
      state.orbitSpeedScale = state.entryArcSpeedScale;
      state.phaseStartedAt = now;
      state.phaseDuration = 0;
      state.transitionFrame = 0;
      activePose = getCurrentOrbitPose();
      if (state.driftPendingDisable || isPointerOutsideDonutCircle()) {
        startOrbitToExitTangent(now);
      }
    } else {
      const postProgress = clamp(
        (state.driftAngle - state.phaseStartTheta) / Math.max(0.0001, state.phaseThetaDelta),
        0,
        1
      );
      const slip = smoothStep(postProgress) * (Math.PI * 0.5);
      activePose = orbitPose(state.driftAngle, slip);
    }
  } else if (state.driftPhase === "orbiting") {
    if (state.driftPendingDisable || (state.driftRequested && isPointerOutsideDonutCircle())) {
      startOrbitToExitTangent(now);
      activePose = orbitPose(state.driftAngle, Math.PI * 0.5);
    } else {
      const recovery = 1 - Math.exp(-deltaSeconds / Math.max(0.001, TRANSITION.orbitRecoveryMs / 1000));
      state.orbitSpeedScale += (1 - state.orbitSpeedScale) * recovery;
      const nonlinearScale = donutSpeedScale();
      advanceOrbitAngle(deltaSeconds, state.orbitSpeedScale * nonlinearScale);
      activePose = getCurrentOrbitPose();
    }
  } else if (state.driftPhase === "orbit_to_exit_tangent") {
    const remaining = state.phaseTargetTheta - state.driftAngle;
    if (remaining <= 0) {
      startExitLine(now, 0);
    } else {
      let speedScale = 1;
      if (remaining <= TRANSITION.exitCornerSweepRadians) {
        const prepProgress = 1 - (remaining / Math.max(0.0001, TRANSITION.exitCornerSweepRadians));
        speedScale = lerp(1, TRANSITION.exitPrepBoostScale, smoothStep(prepProgress));
      }

      advanceOrbitAngle(deltaSeconds, speedScale);

      if (state.driftAngle >= state.phaseTargetTheta) {
        const overshootTheta = state.driftAngle - state.phaseTargetTheta;
        state.driftAngle = state.phaseTargetTheta;
        startExitLine(now, overshootTheta * state.runRadius);
      } else {
        const remainingAfter = state.phaseTargetTheta - state.driftAngle;
        let slip = Math.PI * 0.5;
        if (remainingAfter <= TRANSITION.slipExitBlendRadians) {
          const blendProgress = 1 - (remainingAfter / Math.max(0.0001, TRANSITION.slipExitBlendRadians));
          slip = lerp(Math.PI * 0.5, 0, smoothStep(blendProgress));
        }
        activePose = orbitPose(state.driftAngle, slip);
      }
    }

    if (!activePose && state.driftPhase === "exiting_line" && state.exitStart && state.exitEnd) {
      const progress = clamp((now - state.phaseStartedAt) / Math.max(1, state.phaseDuration), 0, 1);
      const eased = accelProgress(progress, TRANSITION.exitAccelExponent);
      activePose = {
        x: lerp(state.exitStart.x, state.exitEnd.x, eased),
        y: lerp(state.exitStart.y, state.exitEnd.y, eased),
        trailHeading: state.exitHeading,
        rotation: state.exitHeading + SETTINGS.drift.spriteForwardOffset
      };
    }
  } else if (state.driftPhase === "exiting_line" && state.exitStart && state.exitEnd) {
    const elapsedMs = now - state.phaseStartedAt;
    const progress = clamp(elapsedMs / Math.max(1, state.phaseDuration), 0, 1);
    const eased = accelProgress(progress, TRANSITION.exitAccelExponent);
    activePose = {
      x: lerp(state.exitStart.x, state.exitEnd.x, eased),
      y: lerp(state.exitStart.y, state.exitEnd.y, eased),
      trailHeading: state.exitHeading,
      rotation: state.exitHeading + SETTINGS.drift.spriteForwardOffset
    };

    if (progress >= 1) {
      if (!state.driftRequested || state.driftPendingDisable) {
        finalizeDriftDisable();
      } else {
        setDriftPhaseHidden();
      }
      activePose = null;
    }
  }

  if (activePose) {
    addTrailsFromPose(activePose, trailLife, 1);
    state.lastCarPose = activePose;
  }

  decayTrails(deltaSeconds);
  drawTrail(state.trailLeft, SETTINGS.drift.trailWidth, 1);
  drawTrail(state.trailRight, SETTINGS.drift.trailWidth, 1);

  if (activePose) {
    drawCarSprite(activePose.x, activePose.y, activePose.rotation, 1);
  }
}

function updateSFTime() {
  sfTime.textContent = sfTimeFormatter.format(new Date());
}

function initWindowControls() {
  closers.forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = button.dataset.closeTarget;
      const target = document.getElementById(targetId);
      if (target) {
        closeWindow(target);
      }
    });
  });

  aboutOpen.addEventListener("click", () => {
    openWindow(aboutWindow);
  });

  emailOpen.addEventListener("click", () => {
    openWindow(emailWindow);
  });

  driftToggle.addEventListener("click", () => {
    setDriftMode(!state.driftRequested);
  });

  windows.forEach((win) => {
    win.addEventListener("pointerdown", () => {
      if (!win.classList.contains("is-hidden")) {
        bringToFront(win);
      }
    });
  });
}

function initDragging() {
  document.querySelectorAll("[data-drag-handle]").forEach((handle) => {
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || isMobileLayout()) {
        return;
      }

      if (event.target.closest(".ctrl")) {
        return;
      }

      const win = handle.closest(".win");
      if (!win || win.classList.contains("is-hidden")) {
        return;
      }

      startDrag(event, win, handle);
    });
  });

  window.addEventListener("pointermove", (event) => {
    positionCursor(event.clientX, event.clientY);
    onDriftPointerActivity(performance.now());
    onDragMove(event);
  });

  window.addEventListener("pointerdown", (event) => {
    positionCursor(event.clientX, event.clientY);
    state.lastPointerMovedAt = performance.now();
  });

  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeWindow(aboutWindow);
      closeWindow(emailWindow);
    }
  });
}

function tick(now) {
  const deltaSeconds = Math.max(0, Math.min(0.05, (now - state.lastFrameAt) / 1000));
  state.lastFrameAt = now;

  updateAmbientGlyphs(now);
  updatePopGlyphs(now);
  updateDrift(now, deltaSeconds);

  requestAnimationFrame(tick);
}

function init() {
  enableTouchModeIfNeeded();

  resizeDriftCanvas();
  initParticles();

  syncAmbientGlyphCount(performance.now());
  scheduleNextPop(0);

  initWindowControls();
  initDragging();

  windows.forEach((win) => bringToFront(win));
  bringToFront(statusWindow);
  bringToFront(sdiWindow);
  bringToFront(linksWindow);

  layoutDesktopWindows();

  updateSFTime();
  setInterval(updateSFTime, 1000);

  positionCursor(window.innerWidth * 0.5, window.innerHeight * 0.5);
  setDriftMode(false);

  window.addEventListener("resize", () => {
    resizeDriftCanvas();
    syncAmbientGlyphCount(performance.now());
    layoutDesktopWindows();
    windows.forEach(clampWindowIntoView);
  });

  requestAnimationFrame(tick);
  typingLoop();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
