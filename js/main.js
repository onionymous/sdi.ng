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
    ambientNumberBias: 0.12,
    popNumberBias: 0.22
  },
  drift: {
    idleFadeDelayMs: 5000,
    fadeInRate: 1.8,
    fadeOutRate: 22,
    radius: 80,
    radiusWobble: 8,
    speedBase: 0.035,
    speedWobble: 0.02,
    cursorLerp: 0.18,
    trailWidth: 4,
    trailDecay: 1.2,
    trailLength: 140,
    carSize: 64,
    spriteReferenceSize: 256,
    spriteForwardOffset: 0,
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
  orbitCenter: {
    x: window.innerWidth * 0.5,
    y: window.innerHeight * 0.5
  },
  driftEnabled: false,
  driftTime: 0,
  driftAngle: 0,
  trailLeft: [],
  trailRight: [],
  fadeValue: 1,
  fadeTarget: 1,
  lastPointerMoveAt: performance.now(),
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
  if (!state.driftEnabled) {
    driftContext.clearRect(0, 0, driftCanvas.width, driftCanvas.height);
  }
}

function addTrailPoint(arr, x, y, maxLength) {
  arr.push({ x, y, life: 1 });
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

function rotateLocalPoint(cx, cy, rotation, lx, ly) {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    x: cx + lx * cos - ly * sin,
    y: cy + lx * sin + ly * cos
  };
}

function drawCarSprite(x, y, rotation, alpha) {
  if (alpha <= 0.01) {
    return;
  }

  driftContext.save();
  driftContext.globalAlpha = alpha;
  driftContext.translate(x, y);
  driftContext.rotate(rotation);

  if (carSpriteReady) {
    const size = SETTINGS.drift.carSize;
    driftContext.drawImage(carSprite, -size * 0.5, -size * 0.5, size, size);
  } else {
    driftContext.fillStyle = "#11161b";
    driftContext.fillRect(-12, -7, 24, 14);
  }

  driftContext.restore();
}

function setDriftMode(enabled) {
  state.driftEnabled = enabled;
  driftState.textContent = enabled ? "on" : "off";
  driftToggle.querySelector("span:last-child").textContent = enabled ? "disable drift mode" : "enable drift mode";

  if (enabled) {
    driftCanvas.classList.add("drift-front");
    setParticlesInteractive(false);

    // Reset drift state to current pointer so we don't stamp ghost trails from center.
    state.trailLeft.length = 0;
    state.trailRight.length = 0;
    state.orbitCenter.x = state.pointer.x;
    state.orbitCenter.y = state.pointer.y;
    state.driftTime = 0;
    driftContext.clearRect(0, 0, driftCanvas.width, driftCanvas.height);

    const now = performance.now();
    state.lastPointerMoveAt = now;
    state.fadeValue = 0;
    state.fadeTarget = 0;
  } else {
    driftCanvas.classList.remove("drift-front");
    setParticlesInteractive(true);
    state.trailLeft.length = 0;
    state.trailRight.length = 0;
    driftContext.clearRect(0, 0, driftCanvas.width, driftCanvas.height);
  }
}

function updateDrift(now, deltaSeconds) {
  driftContext.clearRect(0, 0, driftCanvas.width, driftCanvas.height);
  if (!state.driftEnabled) {
    return;
  }

  if (now - state.lastPointerMoveAt >= SETTINGS.drift.idleFadeDelayMs) {
    state.fadeTarget = 1;
  }

  const fadeRate = state.fadeTarget > state.fadeValue ? SETTINGS.drift.fadeInRate : SETTINGS.drift.fadeOutRate;
  state.fadeValue += (state.fadeTarget - state.fadeValue) * (1 - Math.exp(-fadeRate * deltaSeconds));
  state.fadeValue = clamp(state.fadeValue, 0, 1);

  state.orbitCenter.x += (state.pointer.x - state.orbitCenter.x) * SETTINGS.drift.cursorLerp;
  state.orbitCenter.y += (state.pointer.y - state.orbitCenter.y) * SETTINGS.drift.cursorLerp;

  state.driftTime += deltaSeconds;

  const radius = SETTINGS.drift.radius + Math.sin(state.driftTime * 1.5) * SETTINGS.drift.radiusWobble;
  const angularSpeed = SETTINGS.drift.speedBase
    + Math.sin(state.driftTime * 0.6) * SETTINGS.drift.speedWobble
    + Math.sin(state.driftTime * 1.2) * (SETTINGS.drift.speedWobble * 0.4);

  state.driftAngle += angularSpeed;

  const carX = state.orbitCenter.x + Math.cos(state.driftAngle) * radius;
  const carY = state.orbitCenter.y + Math.sin(state.driftAngle) * radius;
  const heading = state.driftAngle + Math.PI / 2;
  const carRotation = heading + SETTINGS.drift.spriteForwardOffset;

  const ref = SETTINGS.drift.spriteReferenceSize;
  const size = SETTINGS.drift.carSize;
  // Anchors are expressed against the original 256x256 source sprite and
  // then scaled, so trails stay aligned when carSize changes.
  const rearTrailX = -size * 0.5 + size * (SETTINGS.drift.tireRearFromTopPx / ref);
  const topTrailY = -size * 0.5 + size * (SETTINGS.drift.tireTopFromLeftPx / ref);
  const bottomTrailY = size * 0.5 - size * (SETTINGS.drift.tireBottomFromRightPx / ref);

  const leftTire = rotateLocalPoint(carX, carY, carRotation, rearTrailX, topTrailY);
  const rightTire = rotateLocalPoint(carX, carY, carRotation, rearTrailX, bottomTrailY);

  if (state.fadeValue > 0.02) {
    addTrailPoint(state.trailLeft, leftTire.x, leftTire.y, SETTINGS.drift.trailLength);
    addTrailPoint(state.trailRight, rightTire.x, rightTire.y, SETTINGS.drift.trailLength);
  }

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

  drawTrail(state.trailLeft, SETTINGS.drift.trailWidth, state.fadeValue);
  drawTrail(state.trailRight, SETTINGS.drift.trailWidth, state.fadeValue);
  drawCarSprite(carX, carY, carRotation, state.fadeValue);
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
    setDriftMode(!state.driftEnabled);
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
    state.lastPointerMoveAt = performance.now();
    state.fadeTarget = 0;
    onDragMove(event);
  });

  window.addEventListener("pointerdown", (event) => {
    positionCursor(event.clientX, event.clientY);
    state.lastPointerMoveAt = performance.now();
    state.fadeTarget = 0;
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
