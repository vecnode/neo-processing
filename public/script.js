// vecnode 2026
const terminalOutput = document.getElementById("terminal");
const menuButtons = document.querySelectorAll(".menu-button");
const menuItems = document.querySelectorAll(".menu-item");
const hamburgerButton = document.getElementById("hamburger-button");
const themeToggleButton = document.getElementById("theme-toggle-button");
const appShell = document.querySelector(".app-shell");
const sidePanel = document.getElementById("side-panel");
const statusContainer = document.querySelector(".bottom-row");
const middleRow = document.getElementById("middle-row");
const splitter = document.getElementById("splitter");
const aceContainer = document.getElementById("ace-editor");
const editorMeta = document.getElementById("editor-meta");

// Declared here (rather than down with the other editor state) so applyTheme()
// below can reference it immediately at load time without a temporal-dead-zone
// error - aceEditor is assigned once initializeEditor() runs, but is safe to
// read (as null) before that.
let aceEditor = null;

// Light/dark theme: [data-theme] on <html> drives every colour in style.css
// via CSS custom properties. Applied immediately (before the rest of the app
// initialises) and persisted so the app reopens in the same theme.
const THEME_STORAGE_KEY = "neo-theme";
const ACE_THEME_LIGHT = "ace/theme/textmate";
// The vendored "textmate" theme's hardcoded syntax colours (plain blue
// keywords/numbers) read poorly on a dark background, so dark mode uses a
// second vendored theme actually designed for dark backgrounds instead of
// patching textmate's token colours.
const ACE_THEME_DARK = "ace/theme/tomorrow_night";

function applyTheme(theme) {
  const resolved = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", resolved);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, resolved);
  } catch (error) {
    // Ignore storage failures (e.g. disabled storage) - theme still applies
    // for this session, it just won't persist across restarts.
  }
  if (themeToggleButton) {
    const isDark = resolved === "dark";
    themeToggleButton.setAttribute("aria-pressed", String(isDark));
    themeToggleButton.setAttribute("aria-label", isDark ? "Switch to light theme" : "Switch to dark theme");
    const icon = themeToggleButton.querySelector(".theme-toggle-icon");
    if (icon) {
      icon.textContent = isDark ? "☀" : "☾";
    }
  }
  if (aceEditor) {
    aceEditor.setTheme(resolved === "dark" ? ACE_THEME_DARK : ACE_THEME_LIGHT);
  }
}

function initTheme() {
  let stored = null;
  try {
    stored = localStorage.getItem(THEME_STORAGE_KEY);
  } catch (error) {
    stored = null;
  }
  applyTheme(stored === "dark" ? "dark" : "light");
}

if (themeToggleButton) {
  themeToggleButton.addEventListener("click", () => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    applyTheme(isDark ? "light" : "dark");
  });
}

initTheme();

// Copyright popup: a simple modal, opened from the top bar.
const copyrightButton = document.getElementById("copyright-button");
const copyrightOverlay = document.getElementById("copyright-overlay");
const copyrightCloseButton = document.getElementById("copyright-close-button");
const copyrightGithubLink = document.getElementById("copyright-github-link");

function openCopyrightModal() {
  if (copyrightOverlay) {
    copyrightOverlay.hidden = false;
  }
}

function closeCopyrightModal() {
  if (copyrightOverlay) {
    copyrightOverlay.hidden = true;
  }
}

if (copyrightButton) {
  copyrightButton.addEventListener("click", openCopyrightModal);
}

if (copyrightCloseButton) {
  copyrightCloseButton.addEventListener("click", closeCopyrightModal);
}

if (copyrightOverlay) {
  copyrightOverlay.addEventListener("click", (event) => {
    if (event.target === copyrightOverlay) {
      closeCopyrightModal();
    }
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && copyrightOverlay && !copyrightOverlay.hidden) {
    closeCopyrightModal();
  }
});

if (copyrightGithubLink) {
  // Open in the user's default system browser (window.neoOpenRepo, bound in
  // main.cpp) instead of letting the link navigate the app's own webview
  // away from 127.0.0.1.
  copyrightGithubLink.addEventListener("click", (event) => {
    event.preventDefault();
    if (window.neoOpenRepo) {
      window.neoOpenRepo();
    }
  });
}

// Version of the bundled p5.js library (public/libs/p5-<version>.min.js).
// Single source of truth for the default build the sketch iframe loads.
const P5_VERSION = "1.11.3";

// The p5.js build currently injected into sketches. Defaults to the bundled,
// offline copy; the Libraries panel can swap it (see public/libraries.json).
let activeLibrary = {
  name: `p5.js v${P5_VERSION} (bundled)`,
  url: `/libs/p5-${P5_VERSION}.min.js`,
  isLocal: true,
};

// Source text of a user-imported .js file (see "Import JS Library"), injected
// into the sketch iframe after p5.js and before the sketch code. Empty when
// nothing has been imported.
let importedLibrarySource = "";
let importedLibraryName = "";

const defaultSketch = `// Start your sketch
function setup() {
  createCanvas(400, 400);
}

function draw() {
  background(20);
  noStroke();
  fill(37, 99, 235);
  circle(width / 2, height / 2, 160);
}`;

// Built-in example sketches, keyed by their Examples-menu label. Organised
// into five topics of five sketches each (see public/index.html's
// #examples-menu, which groups them the same way).
const examples = {
  // --- Motion & Physics ---------------------------------------------------
  "Bouncing Ball": `// Bouncing Ball
let x, y, vx, vy, r;

function setup() {
  createCanvas(400, 400);
  x = width / 2;
  y = height / 2;
  vx = 3.2;
  vy = 2.4;
  r = 36;
}

function draw() {
  background(20);
  x += vx;
  y += vy;
  if (x < r || x > width - r) vx *= -1;
  if (y < r || y > height - r) vy *= -1;
  noStroke();
  fill(37, 99, 235);
  circle(x, y, r * 2);
}`,
  "Random Walker": `// Random Walker
let x, y;

function setup() {
  createCanvas(400, 400);
  background(20);
  x = width / 2;
  y = height / 2;
}

function draw() {
  stroke(37, 99, 235);
  strokeWeight(2);
  point(x, y);
  x = constrain(x + random(-4, 4), 0, width);
  y = constrain(y + random(-4, 4), 0, height);
}`,
  "Spring Follow": `// Spring Follow
let x, y, tx, ty;

function setup() {
  createCanvas(400, 400);
  x = tx = width / 2;
  y = ty = height / 2;
}

function draw() {
  background(20);
  tx = width / 2 + cos(frameCount * 0.02) * 140;
  ty = height / 2 + sin(frameCount * 0.03) * 140;
  x += (tx - x) * 0.08;
  y += (ty - y) * 0.08;
  noStroke();
  fill(37, 99, 235);
  circle(x, y, 30);
}`,
  "Gravity Bounce": `// Gravity Bounce
let x, y, vy, r;

function setup() {
  createCanvas(400, 400);
  x = width / 2;
  y = 40;
  vy = 0;
  r = 30;
}

function draw() {
  background(20);
  vy += 0.5;
  y += vy;
  if (y > height - r) {
    y = height - r;
    vy *= -0.75;
  }
  noStroke();
  fill(37, 99, 235);
  circle(x, y, r * 2);
}`,
  "Orbiting Body": `// Orbiting Body
let angle = 0;

function setup() {
  createCanvas(400, 400);
}

function draw() {
  background(20);
  translate(width / 2, height / 2);
  angle += 0.03;
  let x = cos(angle) * 140;
  let y = sin(angle) * 140;
  stroke(80);
  line(0, 0, x, y);
  noStroke();
  fill(37, 99, 235);
  circle(0, 0, 24);
  fill(234, 88, 12);
  circle(x, y, 16);
}`,

  // --- Shapes & Geometry ---------------------------------------------------
  "Spinning Square": `// Spinning Square
function setup() {
  createCanvas(400, 400);
  rectMode(CENTER);
}

function draw() {
  background(20);
  translate(width / 2, height / 2);
  rotate(frameCount * 0.02);
  noStroke();
  fill(37, 99, 235);
  rect(0, 0, 150, 150);
}`,
  "Grid of Circles": `// Grid of Circles
function setup() {
  createCanvas(400, 400);
  noStroke();
}

function draw() {
  background(20);
  fill(37, 99, 235);
  let step = 40;
  for (let x = step / 2; x < width; x += step) {
    for (let y = step / 2; y < height; y += step) {
      let d = 10 + 8 * sin(frameCount * 0.05 + x * 0.05 + y * 0.05);
      circle(x, y, d);
    }
  }
}`,
  "Polygon Pulse": `// Polygon Pulse
function setup() {
  createCanvas(400, 400);
  noFill();
  stroke(37, 99, 235);
  strokeWeight(2);
}

function draw() {
  background(20);
  translate(width / 2, height / 2);
  rotate(frameCount * 0.01);
  let sides = 6;
  let r = 100 + 30 * sin(frameCount * 0.04);
  beginShape();
  for (let i = 0; i < sides; i++) {
    let a = (TWO_PI * i) / sides;
    vertex(cos(a) * r, sin(a) * r);
  }
  endShape(CLOSE);
}`,
  "Concentric Rings": `// Concentric Rings
function setup() {
  createCanvas(400, 400);
  noFill();
  strokeWeight(2);
}

function draw() {
  background(20);
  translate(width / 2, height / 2);
  let offset = (frameCount * 1.5) % 20;
  for (let r = 10; r < 220; r += 20) {
    stroke(37, 99, 235, constrain(200 - r, 20, 200));
    circle(0, 0, r + offset);
  }
}`,
  "Star Field": `// Star Field
let stars = [];

function setup() {
  createCanvas(400, 400);
  for (let i = 0; i < 200; i++) {
    stars.push({ x: random(width), y: random(height), z: random(1, 4) });
  }
  noStroke();
}

function draw() {
  background(10);
  fill(255);
  for (const s of stars) {
    s.x -= s.z;
    if (s.x < 0) s.x = width;
    circle(s.x, s.y, s.z);
  }
}`,

  // --- Waves & Noise -------------------------------------------------------
  "Sine Wave": `// Sine Wave
function setup() {
  createCanvas(400, 400);
}

function draw() {
  background(20);
  noFill();
  stroke(37, 99, 235);
  strokeWeight(3);
  beginShape();
  for (let px = 0; px <= width; px += 8) {
    let py = height / 2 + sin(px * 0.03 + frameCount * 0.05) * 90;
    vertex(px, py);
  }
  endShape();
}`,
  "Perlin Terrain": `// Perlin Terrain
function setup() {
  createCanvas(400, 400);
  noStroke();
}

function draw() {
  background(20);
  fill(37, 99, 235);
  let step = 8;
  for (let x = 0; x < width; x += step) {
    let h = noise(x * 0.01, frameCount * 0.01) * height * 0.6;
    rect(x, height - h, step, h);
  }
}`,
  "Flow Field": `// Flow Field
let particles = [];

function setup() {
  createCanvas(400, 400);
  background(20);
  for (let i = 0; i < 150; i++) {
    particles.push(createVector(random(width), random(height)));
  }
}

function draw() {
  background(20, 15);
  stroke(37, 99, 235);
  strokeWeight(1);
  for (const p of particles) {
    let angle = noise(p.x * 0.01, p.y * 0.01, frameCount * 0.005) * TWO_PI * 2;
    point(p.x, p.y);
    p.x += cos(angle);
    p.y += sin(angle);
    if (p.x < 0) p.x = width;
    if (p.x > width) p.x = 0;
    if (p.y < 0) p.y = height;
    if (p.y > height) p.y = 0;
  }
}`,
  "Radial Wave": `// Radial Wave
function setup() {
  createCanvas(400, 400);
  noFill();
  strokeWeight(2);
}

function draw() {
  background(20);
  translate(width / 2, height / 2);
  stroke(37, 99, 235);
  beginShape();
  for (let a = 0; a <= TWO_PI; a += 0.05) {
    let r = 100 + 30 * sin(a * 6 + frameCount * 0.05);
    vertex(cos(a) * r, sin(a) * r);
  }
  endShape(CLOSE);
}`,
  "Interference Pattern": `// Interference Pattern
function setup() {
  createCanvas(400, 400);
  noStroke();
}

function draw() {
  background(20);
  fill(37, 99, 235);
  let step = 6;
  for (let x = 0; x < width; x += step) {
    for (let y = 0; y < height; y += step) {
      let d1 = dist(x, y, width * 0.35, height * 0.5);
      let d2 = dist(x, y, width * 0.65, height * 0.5);
      let v = sin(d1 * 0.15 - frameCount * 0.1) + sin(d2 * 0.15 - frameCount * 0.1);
      if (v > 1.2) circle(x, y, step);
    }
  }
}`,

  // --- Particles & Systems --------------------------------------------------
  "Particle Swarm": `// Particle Swarm
let particles = [];

function setup() {
  createCanvas(400, 400);
  for (let i = 0; i < 80; i++) {
    particles.push({ a: random(TWO_PI), r: random(40, 180), s: random(0.005, 0.02) });
  }
}

function draw() {
  background(20, 40);
  noStroke();
  fill(37, 99, 235);
  for (const p of particles) {
    p.a += p.s;
    circle(width / 2 + cos(p.a) * p.r, height / 2 + sin(p.a) * p.r, 6);
  }
}`,
  "Fireworks Burst": `// Fireworks Burst
let particles = [];

function setup() {
  createCanvas(400, 400);
  background(10);
}

function burst(x, y) {
  for (let i = 0; i < 60; i++) {
    let a = random(TWO_PI);
    let s = random(1, 5);
    particles.push({ x, y, vx: cos(a) * s, vy: sin(a) * s, life: 60 });
  }
}

function draw() {
  background(10, 40);
  if (frameCount % 45 === 1) {
    burst(random(100, 300), random(100, 250));
  }
  noStroke();
  fill(234, 88, 12);
  for (let i = particles.length - 1; i >= 0; i--) {
    let p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.03;
    p.life -= 1;
    circle(p.x, p.y, 4);
    if (p.life <= 0) particles.splice(i, 1);
  }
}`,
  "Particle Trail": `// Particle Trail
let trail = [];

function setup() {
  createCanvas(400, 400);
}

function draw() {
  background(20, 30);
  let x = width / 2 + cos(frameCount * 0.05) * 140;
  let y = height / 2 + sin(frameCount * 0.07) * 100;
  trail.push({ x, y });
  if (trail.length > 80) trail.shift();
  noStroke();
  for (let i = 0; i < trail.length; i++) {
    let t = trail[i];
    fill(37, 99, 235, (i / trail.length) * 255);
    circle(t.x, t.y, 10 * (i / trail.length));
  }
}`,
  "Attractor Swarm": `// Attractor Swarm
let particles = [];

function setup() {
  createCanvas(400, 400);
  for (let i = 0; i < 120; i++) {
    particles.push({ x: random(width), y: random(height), vx: 0, vy: 0 });
  }
  noStroke();
}

function draw() {
  background(20, 40);
  let mx = width / 2 + cos(frameCount * 0.02) * 100;
  let my = height / 2 + sin(frameCount * 0.02) * 100;
  fill(37, 99, 235);
  for (const p of particles) {
    let dx = mx - p.x;
    let dy = my - p.y;
    let d = max(20, sqrt(dx * dx + dy * dy));
    p.vx += (dx / d) * 0.3;
    p.vy += (dy / d) * 0.3;
    p.vx *= 0.95;
    p.vy *= 0.95;
    p.x += p.vx;
    p.y += p.vy;
    circle(p.x, p.y, 5);
  }
}`,
  "Snow Fall": `// Snow Fall
let flakes = [];

function setup() {
  createCanvas(400, 400);
  for (let i = 0; i < 120; i++) {
    flakes.push({ x: random(width), y: random(height), s: random(1, 3) });
  }
  noStroke();
}

function draw() {
  background(20);
  fill(255);
  for (const f of flakes) {
    f.y += f.s;
    f.x += sin(frameCount * 0.02 + f.y * 0.05);
    if (f.y > height) {
      f.y = 0;
      f.x = random(width);
    }
    circle(f.x, f.y, f.s * 2);
  }
}`,

  // --- Color & Pattern -------------------------------------------------------
  "Color Grid": `// Color Grid
function setup() {
  createCanvas(400, 400);
  noStroke();
  colorMode(HSB, 360, 100, 100);
}

function draw() {
  background(0, 0, 8);
  let step = 25;
  for (let x = 0; x < width; x += step) {
    for (let y = 0; y < height; y += step) {
      let hue = (x + y + frameCount) % 360;
      fill(hue, 70, 90);
      rect(x, y, step - 2, step - 2);
    }
  }
}`,
  "Gradient Sweep": `// Gradient Sweep
function setup() {
  createCanvas(400, 400);
  colorMode(HSB, 360, 100, 100);
}

function draw() {
  for (let y = 0; y < height; y++) {
    let hue = (y + frameCount) % 360;
    stroke(hue, 70, 90);
    line(0, y, width, y);
  }
}`,
  "Checkerboard Shift": `// Checkerboard Shift
function setup() {
  createCanvas(400, 400);
  noStroke();
}

function draw() {
  background(20);
  let step = 40;
  let offset = floor(frameCount / 20) % 2;
  for (let x = 0; x < width; x += step) {
    for (let y = 0; y < height; y += step) {
      let i = floor(x / step) + floor(y / step);
      if ((i + offset) % 2 === 0) {
        fill(37, 99, 235);
      } else {
        fill(30);
      }
      rect(x, y, step, step);
    }
  }
}`,
  "Mosaic Tiles": `// Mosaic Tiles
let seedVals = [];
const mosaicCols = 10;

function setup() {
  createCanvas(400, 400);
  noStroke();
  colorMode(HSB, 360, 100, 100);
  for (let i = 0; i < mosaicCols * mosaicCols; i++) {
    seedVals.push(random(360));
  }
}

function draw() {
  background(0, 0, 8);
  let step = width / mosaicCols;
  for (let i = 0; i < mosaicCols; i++) {
    for (let j = 0; j < mosaicCols; j++) {
      let idx = i * mosaicCols + j;
      let hue = (seedVals[idx] + frameCount * 0.3) % 360;
      fill(hue, 60, 85);
      rect(i * step, j * step, step - 2, step - 2);
    }
  }
}`,
  "Pulsing Dots": `// Pulsing Dots
function setup() {
  createCanvas(400, 400);
  noStroke();
  colorMode(HSB, 360, 100, 100);
}

function draw() {
  background(0, 0, 8);
  let step = 30;
  let cols = width / step;
  let rows = height / step;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      let x = i * step + step / 2;
      let y = j * step + step / 2;
      let d = dist(x, y, width / 2, height / 2);
      let s = 6 + 6 * sin(frameCount * 0.08 - d * 0.05);
      fill((d + frameCount) % 360, 70, 90);
      circle(x, y, max(2, s));
    }
  }
}`,
};

let isResizingPanels = false;
let openFileInput = null;
let isRecording = false;

const recordButton = document.getElementById("record-button");
const captureButton = document.getElementById("capture-button");
const fullscreenButton = document.getElementById("fullscreen-button");
const desktopFullscreenButton = document.getElementById("desktop-fullscreen-button");
const librarySelect = document.getElementById("library-select");
const libraryApplyButton = document.getElementById("library-apply");
const importLibraryButton = document.getElementById("import-library-button");
const importLibraryInput = document.getElementById("import-library-input");
const importLibraryHint = document.getElementById("import-library-hint");
const sketchBgColor = document.getElementById("sketch-bg-color");

// Background colour shown behind the sketch canvas (default white). Baked into
// the iframe when a sketch runs and pushed live via postMessage when changed.
let sketchBg = "#ffffff";

// Where the canvas sits within the preview: "center" (default) or "topleft".
let sketchAnchor = "center";
const anchorButtons = document.querySelectorAll(".segmented-btn[data-anchor]");

// Master audio on/off + volume for sketch output (see docs/proposals/sound-section.md).
// Muted by default - a silent-by-default app is the safer default for
// unattended/full-screen installs. Baked into the iframe when a sketch runs
// and pushed live via postMessage when changed.
let audioEnabled = false;
let audioMasterVolume = 1;
const audioToggleButtons = document.querySelectorAll(".segmented-btn[data-audio]");
const audioMasterSlider = document.getElementById("audio-master-slider");

// Layers (see docs/proposals/layer-system.md). Phase 1 (tabs, one
// ace.EditSession per layer) + Phase 2 (stacking): layers 1..N are
// independent, simultaneously-running iframes composited in .right-panel
// via z-index (array order = stack order, index 0 at the bottom). Layer 0
// isn't in this array at all - it's just the panel's own CSS background
// (sketchBg/--sketch-bg), no code runs on it. Capture/Record are still
// scoped to the active layer only (Phase 3 - compositing the capture/
// recording pipeline itself - isn't built yet).
const MAX_LAYERS = 5;
const tabStrip = document.getElementById("tab-strip");
const layersPanel = document.getElementById("layers-panel");
const stopAllLayersButton = document.getElementById("stop-all-layers-button");
let layers = [];
let activeLayerId = null;
let nextLayerNumber = 1;

function createLayerSession(code) {
  const session = ace.createEditSession(code, "ace/mode/javascript");
  session.setTabSize(2);
  session.setUseSoftTabs(true);
  return session;
}

function activeLayer() {
  return layers.find((l) => l.id === activeLayerId) || null;
}

// Creates a new layer (not activated - call activateLayer() to switch to it).
// Returns null if the MAX_LAYERS cap is already reached.
function addLayer(code) {
  if (layers.length >= MAX_LAYERS) {
    appendStatus(`Maximum of ${MAX_LAYERS} layers reached`);
    return null;
  }

  const layer = {
    id: `layer-${nextLayerNumber}-${Date.now()}`,
    name: `Layer ${nextLayerNumber}`,
    session: createLayerSession(code),
    iframe: null, // the running <iframe>, or null while stopped
    visible: true,
    // Sized to the layer's own createCanvas() call (reported live by
    // layerController), not stretched to fill .right-panel - defaults to
    // 400x400 until the sketch's actual canvas size is known.
    canvasWidth: 400,
    canvasHeight: 400,
    opacity: 1,
  };
  nextLayerNumber += 1;
  layers.push(layer);
  return layer;
}

function activateLayer(id) {
  const layer = layers.find((l) => l.id === id);
  if (!layer || !aceEditor) {
    return;
  }

  activeLayerId = id;
  aceEditor.setSession(layer.session);
  aceEditor.resize();
  aceEditor.focus();
  renderLayerUI();
}

// Keeps every running layer's iframe z-index in sync with array order
// (index 0 = bottom of the stack). Call after anything that adds, removes,
// or reorders layers.
function applyLayerZIndex() {
  layers.forEach((layer, index) => {
    if (layer.iframe) {
      layer.iframe.style.zIndex = String(index + 1);
    }
  });
}

// Sizes and positions one layer's iframe to match its own sketch's
// createCanvas() call (layer.canvasWidth/Height, kept live by
// layerController's postMessage reports - see the "canvas-size" case in the
// message listener) rather than stretching it to fill .right-panel. This is
// what lets layers of different sizes actually composite like stacked
// artboards instead of all being forced to one shared size (see
// docs/proposals/layer-system.md's "Decisions").
function positionLayerIframe(layer) {
  if (!layer.iframe) {
    return;
  }

  const rightPanel = document.querySelector(".right-panel");
  if (!rightPanel) {
    return;
  }

  const w = layer.canvasWidth || 400;
  const h = layer.canvasHeight || 400;
  layer.iframe.style.width = `${w}px`;
  layer.iframe.style.height = `${h}px`;

  if (sketchAnchor === "center") {
    const rect = rightPanel.getBoundingClientRect();
    layer.iframe.style.left = `${Math.max(0, (rect.width - w) / 2)}px`;
    layer.iframe.style.top = `${Math.max(0, (rect.height - h) / 2)}px`;
  } else {
    layer.iframe.style.left = "0px";
    layer.iframe.style.top = "0px";
  }
}

function repositionAllLayers() {
  layers.forEach(positionLayerIframe);
}

// Closes a layer's tab: stops its iframe (if running) and drops its Ace
// session. Always keeps at least one layer - the last remaining tab can't
// be closed.
function closeLayer(id) {
  if (layers.length <= 1) {
    appendStatus("At least one layer is required");
    return;
  }

  const index = layers.findIndex((l) => l.id === id);
  if (index === -1) {
    return;
  }

  const [closed] = layers.splice(index, 1);
  if (closed.iframe) {
    closed.iframe.remove();
  }
  applyLayerZIndex();

  if (closed.id === activeLayerId) {
    const next = layers[index] || layers[index - 1] || layers[0];
    activateLayer(next.id);
  } else {
    renderLayerUI();
  }
}

function renameLayer(id, name) {
  const layer = layers.find((l) => l.id === id);
  const trimmed = name.trim();
  if (layer && trimmed) {
    layer.name = trimmed;
  }
  renderLayerUI();
}

// Moves a layer up (-1) or down (+1) in stacking order and re-applies
// z-index. No-op at either end of the array.
function moveLayer(id, direction) {
  const index = layers.findIndex((l) => l.id === id);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= layers.length) {
    return;
  }

  const [layer] = layers.splice(index, 1);
  layers.splice(target, 0, layer);
  applyLayerZIndex();
  renderLayerUI();
}

// Shows/hides a layer. Hiding both removes it from the visual stack
// (display:none) and tells its p5 instance to stop its draw loop
// (noLoop()) via layerController, so a hidden layer costs no CPU - not
// just visually absent. Only meaningful for a layer that's actually
// running; the flag is still stored either way so a later Run respects it.
function setLayerVisible(layer, visible) {
  layer.visible = visible;
  if (layer.iframe) {
    layer.iframe.style.display = visible ? "block" : "none";
    if (layer.iframe.contentWindow) {
      layer.iframe.contentWindow.postMessage({ type: "layer-set-visible", visible }, "*");
    }
  }
  renderLayerUI();
}

// Per-layer opacity (0-1): a plain CSS opacity on the iframe wrapper, so it
// costs nothing extra to render and shows live in the editor, not just in
// captured/recorded composites (buildCompositeCanvas() reads the same
// layer.opacity value when compositing).
function setLayerOpacity(layer, opacity) {
  layer.opacity = opacity;
  if (layer.iframe) {
    layer.iframe.style.opacity = String(opacity);
  }
}

function renderTabStrip() {
  if (!tabStrip) {
    return;
  }

  tabStrip.innerHTML = "";

  layers.forEach((layer) => {
    const tab = document.createElement("div");
    tab.className = "tab" + (layer.id === activeLayerId ? " is-active" : "");
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", String(layer.id === activeLayerId));
    tab.dataset.layerId = layer.id;

    const label = document.createElement("span");
    label.className = "tab-label";
    label.textContent = layer.name;
    label.title = layer.name;
    label.addEventListener("dblclick", (event) => {
      event.stopPropagation();
      const input = document.createElement("input");
      input.type = "text";
      input.className = "tab-rename-input";
      input.value = layer.name;
      label.replaceWith(input);
      input.focus();
      input.select();
      const commit = () => renameLayer(layer.id, input.value);
      input.addEventListener("blur", commit);
      input.addEventListener("keydown", (keyEvent) => {
        if (keyEvent.key === "Enter") {
          input.blur();
        } else if (keyEvent.key === "Escape") {
          input.value = layer.name;
          input.blur();
        }
      });
    });

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "tab-close";
    closeButton.setAttribute("aria-label", `Close ${layer.name}`);
    closeButton.textContent = "×";
    closeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      closeLayer(layer.id);
    });

    tab.appendChild(label);
    tab.appendChild(closeButton);
    tab.addEventListener("click", () => activateLayer(layer.id));
    tabStrip.appendChild(tab);
  });

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "tab-add-button";
  addButton.setAttribute("aria-label", "Add layer");
  addButton.textContent = "+";
  addButton.disabled = layers.length >= MAX_LAYERS;
  addButton.addEventListener("click", () => {
    const layer = addLayer(defaultSketch);
    if (layer) {
      activateLayer(layer.id);
      appendStatus(`Added ${layer.name}`);
    }
  });
  tabStrip.appendChild(addButton);
}

// The Layers panel (right half of the bottom row): a static Layer 0 row for
// the background colour, then one row per layer with its running status,
// a Hide/Show toggle, Stop, and Up/Down reorder buttons.
function renderLayersPanel() {
  if (!layersPanel) {
    return;
  }

  layersPanel.innerHTML = "";

  const baseRow = document.createElement("div");
  baseRow.className = "layer-row is-base";
  baseRow.setAttribute("role", "listitem");
  const baseName = document.createElement("span");
  baseName.className = "layer-row-name";
  baseName.textContent = "Layer 0 · Background";
  baseRow.appendChild(baseName);
  layersPanel.appendChild(baseRow);

  layers.forEach((layer, index) => {
    const row = document.createElement("div");
    row.className = "layer-row" + (layer.id === activeLayerId ? " is-active-layer" : "");
    row.setAttribute("role", "listitem");

    const name = document.createElement("span");
    name.className = "layer-row-name";
    name.textContent = layer.name;
    name.title = layer.name;
    name.addEventListener("click", () => activateLayer(layer.id));

    const status = document.createElement("span");
    status.className = "layer-row-status";
    status.textContent = !layer.iframe ? "Stopped" : layer.visible ? "Running" : "Hidden";

    const opacitySlider = document.createElement("input");
    opacitySlider.type = "range";
    opacitySlider.className = "layer-row-opacity";
    opacitySlider.min = "0";
    opacitySlider.max = "1";
    opacitySlider.step = "0.05";
    opacitySlider.value = String(typeof layer.opacity === "number" ? layer.opacity : 1);
    opacitySlider.setAttribute("aria-label", `${layer.name} opacity`);
    opacitySlider.addEventListener("input", (event) => {
      setLayerOpacity(layer, parseFloat(event.target.value));
    });

    const upButton = document.createElement("button");
    upButton.type = "button";
    upButton.className = "layer-row-button";
    upButton.textContent = "↑";
    upButton.setAttribute("aria-label", `Move ${layer.name} up`);
    upButton.disabled = index === 0;
    upButton.addEventListener("click", () => moveLayer(layer.id, -1));

    const downButton = document.createElement("button");
    downButton.type = "button";
    downButton.className = "layer-row-button";
    downButton.textContent = "↓";
    downButton.setAttribute("aria-label", `Move ${layer.name} down`);
    downButton.disabled = index === layers.length - 1;
    downButton.addEventListener("click", () => moveLayer(layer.id, 1));

    const visibilityButton = document.createElement("button");
    visibilityButton.type = "button";
    visibilityButton.className = "layer-row-button";
    visibilityButton.textContent = layer.visible ? "Hide" : "Show";
    visibilityButton.disabled = !layer.iframe;
    visibilityButton.addEventListener("click", () => setLayerVisible(layer, !layer.visible));

    const stopRowButton = document.createElement("button");
    stopRowButton.type = "button";
    stopRowButton.className = "layer-row-button";
    stopRowButton.textContent = "Stop";
    stopRowButton.disabled = !layer.iframe;
    stopRowButton.addEventListener("click", () => stopLayer(layer));

    row.appendChild(name);
    row.appendChild(status);
    row.appendChild(opacitySlider);
    row.appendChild(upButton);
    row.appendChild(downButton);
    row.appendChild(visibilityButton);
    row.appendChild(stopRowButton);
    layersPanel.appendChild(row);
  });
}

function renderLayerUI() {
  renderTabStrip();
  renderLayersPanel();
}

function initializeEditor() {
  if (!aceContainer || typeof ace === "undefined") {
    return;
  }

  aceEditor = ace.edit("ace-editor");
  aceEditor.setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? ACE_THEME_DARK : ACE_THEME_LIGHT);
  aceEditor.setOptions({
    fontSize: "14px",
    showPrintMargin: false,
    wrap: true,
  });

  const firstLayer = addLayer(defaultSketch);
  activateLayer(firstLayer.id);
}

function getEditorContents() {
  if (!aceEditor) {
    return defaultSketch;
  }

  return aceEditor.getValue();
}

function setEditorContents(contents) {
  if (!aceEditor) {
    return;
  }

  aceEditor.setValue(contents, -1);
  aceEditor.clearSelection();
  aceEditor.resize();
}

function ensureOpenFileInput() {
  if (openFileInput) {
    return openFileInput;
  }

  openFileInput = document.createElement("input");
  openFileInput.type = "file";
  openFileInput.accept = ".js,text/javascript,application/javascript,text/plain";
  openFileInput.style.display = "none";
  openFileInput.addEventListener("change", async () => {
    const file = openFileInput.files && openFileInput.files[0];
    if (!file) {
      return;
    }

    const contents = await file.text();
    setEditorContents(contents);
    appendStatus(`Opened ${file.name}`);
    openFileInput.value = "";
  });
  document.body.appendChild(openFileInput);

  return openFileInput;
}

function newSketch() {
  setEditorContents(defaultSketch);
  appendStatus("New sketch created");
}

function openSketch() {
  ensureOpenFileInput().click();
}

function loadExample(name) {
  const code = examples[name];
  if (!code) {
    return;
  }

  setEditorContents(code);
  appendStatus(`Loaded example: ${name}`);
  runActiveLayer();
}

// Updates the label under the editor to show which p5.js build is active.
function setLibraryLabel() {
  if (editorMeta) {
    editorMeta.textContent = activeLibrary.name;
  }
}

// Populates the Libraries dropdown from public/libraries.json. The manifest is
// the allow-list of injectable builds (see issue #3).
async function loadLibraryManifest() {
  if (!librarySelect) {
    return;
  }

  try {
    const response = await fetch("/libraries.json");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const libraries = await response.json();
    librarySelect.innerHTML = "";
    libraries.forEach((lib) => {
      if (!lib || !lib.url) {
        return;
      }

      const option = document.createElement("option");
      option.value = lib.url;
      option.textContent = lib.name || lib.url;
      option.dataset.name = lib.name || lib.url;
      option.dataset.local = String(Boolean(lib.isLocal));
      if (lib.url === activeLibrary.url) {
        option.selected = true;
      }
      librarySelect.appendChild(option);
    });
  } catch (error) {
    appendStatus(`Could not load library list: ${error.message}`);
  }
}

// Applies the selected p5.js build: future sketch runs load it, the editor
// label updates, and any running sketch is reloaded so it takes effect now.
function applyLibrary() {
  if (!librarySelect || !librarySelect.selectedOptions.length) {
    return;
  }

  const option = librarySelect.selectedOptions[0];
  activeLibrary = {
    name: option.dataset.name || option.textContent,
    url: option.value,
    isLocal: option.dataset.local === "true",
  };

  setLibraryLabel();
  appendStatus(`Library set to ${activeLibrary.name}`);
  rerunAllRunningLayers();
}

// Reads a locally-picked .js file and stashes its source so runLayer() injects
// it into the sketch iframe (after p5.js, before the sketch code). Runs inside
// the same sandboxed, opaque-origin iframe as the sketch itself, so this is no
// broader a capability than the sketch code the user already writes there.
function importLibraryFile() {
  const file = importLibraryInput.files && importLibraryInput.files[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    importedLibrarySource = String(reader.result || "");
    importedLibraryName = file.name;
    if (importLibraryHint) {
      importLibraryHint.textContent = `Imported: ${importedLibraryName}`;
    }
    appendStatus(`Imported library: ${importedLibraryName}`);
    rerunAllRunningLayers();
  };
  reader.onerror = () => {
    appendStatus(`Could not read ${file.name}: ${reader.error}`);
  };
  reader.readAsText(file);
  importLibraryInput.value = "";
}

async function saveSketch() {
  const response = await fetch("/api/save-script", {
    method: "POST",
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
    body: getEditorContents(),
  });

  const result = await response.text();
  if (!response.ok) {
    throw new Error(result || "Save failed");
  }

  appendStatus(`Saved to outputs/${result}`);
}

function setLeftPanelSize(percent) {
  if (!middleRow) {
    return;
  }

  const clamped = Math.min(80, Math.max(20, percent));
  middleRow.style.setProperty("--left-panel-size", `${clamped}%`);
}

function scrollStatusToBottom() {
  if (!statusContainer) {
    return;
  }

  statusContainer.scrollTop = statusContainer.scrollHeight;
}

function appendStatus(message) {
  if (!terminalOutput) {
    return;
  }

  if (!terminalOutput.textContent) {
    terminalOutput.textContent = message;
    scrollStatusToBottom();
    return;
  }

  terminalOutput.textContent += `\n${message}`;
  scrollStatusToBottom();
}

function closeMenus() {
  menuButtons.forEach((button) => {
    const menuId = button.dataset.menu;
    const menu = document.getElementById(menuId);
    button.setAttribute("aria-expanded", "false");
    if (menu) {
      menu.hidden = true;
    }
  });
}

function toggleSidebar() {
  if (!appShell || !hamburgerButton || !sidePanel) {
    return;
  }

  const isOpen = appShell.classList.toggle("sidebar-open");
  hamburgerButton.setAttribute("aria-expanded", String(isOpen));
  sidePanel.setAttribute("aria-hidden", String(!isOpen));
  appendStatus(isOpen ? "Sidebar opened" : "Sidebar closed");
  // .right-panel's width changes via the 0.2s CSS width transition on
  // .main-layout/.side-panel - reposition once it's settled. (Also covered
  // by the ResizeObserver below, but that may not fire in every webview;
  // this is the reliable belt-and-suspenders path.)
  window.setTimeout(repositionAllLayers, 220);
}

function updateSplitFromPointer(clientX) {
  if (!middleRow) {
    return;
  }

  const rect = middleRow.getBoundingClientRect();
  if (rect.width <= 0) {
    return;
  }

  const percent = ((clientX - rect.left) / rect.width) * 100;
  setLeftPanelSize(percent);
  repositionAllLayers();
}




menuButtons.forEach((button) => {
  button.addEventListener("click", (event) => {
    const menuId = button.dataset.menu;
    const menu = document.getElementById(menuId);
    const isExpanded = button.getAttribute("aria-expanded") === "true";

    closeMenus();

    if (!isExpanded && menu) {
      button.setAttribute("aria-expanded", "true");
      menu.hidden = false;
    }

    event.stopPropagation();
  });
});

menuItems.forEach((item) => {
  item.addEventListener("click", () => {
    const action = item.dataset.action;
    if (action === "New file") {
      newSketch();
    } else if (action === "Open file") {
      openSketch();
    } else if (action === "Save file") {
      saveSketch().catch((error) => {
        appendStatus(error.message);
      });
    } else if (examples[action]) {
      loadExample(action);
    } else {
      appendStatus(`${action} clicked`);
    }
    closeMenus();
  });
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".menu-group")) {
    closeMenus();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMenus();
  }
});

window.addEventListener("resize", () => {
  if (aceEditor) {
    aceEditor.resize();
  }
  repositionAllLayers();
});

// Belt-and-suspenders: also reposition on any .right-panel size change via
// ResizeObserver, in case some resize path isn't covered by the explicit
// calls above - cheap either way, since positionLayerIframe() just reads
// the panel's current getBoundingClientRect() each time.
const rightPanelForResize = document.querySelector(".right-panel");
if (rightPanelForResize && typeof ResizeObserver !== "undefined") {
  new ResizeObserver(() => repositionAllLayers()).observe(rightPanelForResize);
}




// Capture/record controller injected into every sketch iframe. Because the
// iframe is sandboxed to an opaque origin, the parent cannot touch its canvas
// directly — instead we record/snapshot here (using the GPU-backed
// MediaRecorder / toBlob APIs) and ship the resulting bytes out via postMessage.
// Capture/record controller injected into every layer's iframe. Because
// each iframe is sandboxed to an opaque origin, the parent cannot touch its
// canvas directly - instead each layer snapshots itself on request and
// ships an ImageBitmap out (transferred, no copy). The parent composites
// every visible layer's bitmap into one canvas (see buildCompositeCanvas())
// for both Capture PNG and Record - see docs/proposals/layer-system.md
// Phase 3. Recording itself (MediaRecorder, encoding) now happens entirely
// in the parent, driven by repeated composites - no per-iframe recorder.
const captureController = `
(function () {
  function canvas() { return document.querySelector('canvas'); }
  // Logical sketch size (e.g. createCanvas(400, 400)), independent of the
  // device pixel ratio that inflates the canvas backing store. Output media
  // is rendered at this size so files match the dimensions the sketch
  // declares.
  function logicalSize(el) {
    return {
      w: Math.max(1, Math.round(el.clientWidth || el.width)),
      h: Math.max(1, Math.round(el.clientHeight || el.height))
    };
  }
  window.addEventListener('message', function (event) {
    var data = event.data || {};
    if (data.type === 'capture-frame') {
      var el = canvas();
      if (!el) {
        parent.postMessage({ type: 'capture-frame-result', requestId: data.requestId, ok: false }, '*');
        return;
      }
      var s = logicalSize(el);
      var off = document.createElement('canvas');
      off.width = s.w; off.height = s.h;
      off.getContext('2d').drawImage(el, 0, 0, s.w, s.h);
      createImageBitmap(off).then(function (bitmap) {
        parent.postMessage(
          { type: 'capture-frame-result', requestId: data.requestId, ok: true, w: s.w, h: s.h, bitmap: bitmap },
          '*',
          [bitmap]
        );
      }).catch(function (err) {
        parent.postMessage({ type: 'capture-frame-result', requestId: data.requestId, ok: false, error: String(err) }, '*');
      });
    }
  });
})();
`;

// Master audio on/off + volume, injected ahead of the sketch code (see
// docs/proposals/sound-section.md). Rather than hook every possible audio API
// a sketch might use (p5.sound, raw Web Audio, an imported library), this
// wraps AudioContext/webkitAudioContext once: each context gets a gain node
// spliced between it and the real output, and `destination` is shadowed on
// the instance to point at that gain node - so anything the sketch connects
// to `ctx.destination` (p5.sound's master bus included) lands on our gain
// node instead. No new capability crosses the sandbox: the postMessage
// payload is just a boolean and a 0-1 float, iframe stays
// sandbox="allow-scripts" with no allow-same-origin, exactly as elsewhere.
function buildAudioController(initialEnabled, initialVolume) {
  return `
(function () {
  var masterGain = null;
  var enabled = ${initialEnabled ? "true" : "false"};
  var volume = ${JSON.stringify(typeof initialVolume === "number" ? initialVolume : 1)};
  function applyGain() {
    if (masterGain) masterGain.gain.value = enabled ? volume : 0;
  }
  var RealAC = window.AudioContext || window.webkitAudioContext;
  if (RealAC) {
    var Patched = function () {
      var ctx = Reflect.construct(RealAC, arguments);
      masterGain = ctx.createGain();
      masterGain.connect(ctx.destination);
      applyGain();
      Object.defineProperty(ctx, 'destination', { get: function () { return masterGain; } });
      return ctx;
    };
    window.AudioContext = Patched;
    window.webkitAudioContext = Patched;
  }
  window.addEventListener('message', function (event) {
    var data = event.data || {};
    if (data.type === 'audio-set') {
      if (typeof data.enabled === 'boolean') enabled = data.enabled;
      if (typeof data.volume === 'number') volume = data.volume;
      applyGain();
    }
  });
})();
`;
}

// Two jobs for the parent, per layer: (1) pause/resume the draw loop when
// hidden (see setLayerVisible()) - hiding both removes a layer from the
// visual stack and stops it costing CPU; (2) report the sketch's actual
// canvas size (from createCanvas()) so the parent can size/position this
// layer's iframe to match instead of stretching it to fill .right-panel -
// that's what lets differently-sized layers actually composite like
// stacked artboards (see docs/proposals/layer-system.md's "Decisions").
// Polls rather than using a MutationObserver/ResizeObserver on the canvas:
// simpler, and cheap enough at a 4x/second cadence.
const layerController = `
(function () {
  var lastW = 0, lastH = 0;
  function reportCanvasSize() {
    var el = document.querySelector('canvas');
    if (!el) return;
    var w = Math.max(1, Math.round(el.clientWidth || el.width));
    var h = Math.max(1, Math.round(el.clientHeight || el.height));
    if (w !== lastW || h !== lastH) {
      lastW = w; lastH = h;
      parent.postMessage({ type: 'canvas-size', width: w, height: h }, '*');
    }
  }
  setInterval(reportCanvasSize, 250);
  window.addEventListener('message', function (event) {
    var data = event.data || {};
    if (data.type === 'layer-set-visible') {
      if (data.visible) {
        if (typeof loop === 'function') loop();
      } else {
        if (typeof noLoop === 'function') noLoop();
      }
    }
  });
})();
`;

// Runs (or re-runs) one layer's sketch in its own iframe, stacked in
// .right-panel via z-index (see applyLayerZIndex()). Each layer's iframe
// has a transparent background so layers below it can show through -
// layer.session's own code is responsible for actually leaving parts
// transparent (see docs/proposals/layer-system.md's compositing notes).
function runLayer(layer) {
  const rightPanel = document.querySelector(".right-panel");
  if (!rightPanel) {
    appendStatus("Error: render panel not found");
    return;
  }

  appendStatus(`Running ${layer.name}...`);
  if (layer.id === activeLayerId) {
    resetRecordingState();
  }

  if (layer.iframe) {
    layer.iframe.remove();
    layer.iframe = null;
  }

  // Reset to the default size for this run - a fresh sketch may declare a
  // completely different createCanvas() size than whatever was there
  // before; layerController's live reports correct this shortly after.
  layer.canvasWidth = 400;
  layer.canvasHeight = 400;

  const code = layer.session.getValue();
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:absolute;border:none;background:transparent;";
  iframe.style.opacity = String(typeof layer.opacity === "number" ? layer.opacity : 1);
  // Run user sketches in an opaque origin: scripts are permitted, but the
  // sketch cannot reach the parent document, cookies, storage, or the local
  // HTTP API. (allow-same-origin is deliberately omitted.)
  iframe.sandbox = "allow-scripts";

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    /* The iframe is sized to match the sketch's own createCanvas() call
       (see positionLayerIframe() in the parent) and positionLayerIframe()
       is what actually applies the Sketch panel's anchor setting - by
       placing this canvas-sized iframe within .right-panel. No centring
       needed in here; the canvas already fills the iframe exactly. */
    html, body { height: 100%; }
    body {
      margin: 0;
      overflow: hidden;
      background: transparent;
    }
  </style>
  <script src="${activeLibrary.url}"><\/script>
</head>
<body>
  <script>
    window.onerror = function(msg, src, line) {
      window.parent.postMessage({ type: 'sketch-error', message: msg + ' (line ' + line + ')' }, '*');
    };
    ${captureController}
    ${buildAudioController(audioEnabled, audioMasterVolume)}
    ${layerController}
    ${importedLibrarySource}
    ${code}
  <\/script>
</body>
</html>`;

  iframe.srcdoc = html;
  layer.visible = true;
  rightPanel.appendChild(iframe);
  layer.iframe = iframe;
  applyLayerZIndex();
  positionLayerIframe(layer);
  renderLayerUI();
}

function runActiveLayer() {
  const layer = activeLayer();
  if (layer) {
    runLayer(layer);
  }
}

// Re-runs every currently-running layer - used when a global setting that's
// baked into the iframe at run time changes (p5 build, imported library).
function rerunAllRunningLayers() {
  layers.filter((l) => l.iframe).forEach((l) => runLayer(l));
}

function stopLayer(layer) {
  if (!layer.iframe) {
    return;
  }

  layer.iframe.remove();
  layer.iframe = null;
  if (layer.id === activeLayerId) {
    resetRecordingState();
  }
  renderLayerUI();
}

function stopActiveLayer() {
  const layer = activeLayer();
  if (!layer || !layer.iframe) {
    appendStatus("No sketch running");
    return;
  }

  stopLayer(layer);
  appendStatus(`${layer.name} stopped`);
}

function stopAllLayers() {
  const running = layers.filter((l) => l.iframe);
  if (!running.length) {
    appendStatus("No layers running");
    return;
  }

  running.forEach((l) => stopLayer(l));
  appendStatus("All layers stopped");
}

async function saveMedia(buffer, ext) {
  const response = await fetch(`/api/save-media?ext=${encodeURIComponent(ext)}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: buffer,
  });

  const result = await response.text();
  if (!response.ok) {
    throw new Error(result || "Save failed");
  }

  return result;
}

function setRecordingUI(active) {
  isRecording = active;
  if (!recordButton) {
    return;
  }

  recordButton.classList.toggle("recording", active);
  recordButton.setAttribute("aria-pressed", String(active));
  const label = recordButton.querySelector(".rec-label");
  if (label) {
    label.textContent = active ? "Stop" : "Record";
  }
}

function resetRecordingState() {
  setRecordingUI(false);
}

// Asks one layer's captureController for a snapshot of its current canvas,
// returned as a transferred ImageBitmap. Resolves null on timeout/error/no
// canvas so a single unresponsive layer can't hang the whole composite.
function requestLayerFrame(layer) {
  return new Promise((resolve) => {
    if (!layer.iframe || !layer.iframe.contentWindow) {
      resolve(null);
      return;
    }

    const requestId = `${layer.id}-${Date.now()}-${Math.random()}`;
    const timeoutId = window.setTimeout(() => {
      window.removeEventListener("message", handleResult);
      resolve(null);
    }, 2000);

    function handleResult(event) {
      const data = event.data;
      if (!data || data.type !== "capture-frame-result" || data.requestId !== requestId) {
        return;
      }
      window.clearTimeout(timeoutId);
      window.removeEventListener("message", handleResult);
      resolve(data.ok ? { bitmap: data.bitmap, w: data.w, h: data.h } : null);
    }

    window.addEventListener("message", handleResult);
    layer.iframe.contentWindow.postMessage({ type: "capture-frame", requestId }, "*");
  });
}

// Builds one canvas compositing every currently visible, running layer -
// layer 0's fill colour first, then each layer's snapshot drawn at its own
// on-screen position/size (see positionLayerIframe()) and opacity, in
// stacking order. Used by both Capture PNG and Record (see
// docs/proposals/layer-system.md Phase 3).
async function buildCompositeCanvas() {
  const rightPanel = document.querySelector(".right-panel");
  const rect = rightPanel.getBoundingClientRect();
  const composite = document.createElement("canvas");
  composite.width = Math.max(1, Math.round(rect.width));
  composite.height = Math.max(1, Math.round(rect.height));
  const ctx = composite.getContext("2d");
  ctx.fillStyle = sketchBg;
  ctx.fillRect(0, 0, composite.width, composite.height);

  const visibleLayers = layers.filter((l) => l.iframe && l.visible);
  const frames = await Promise.all(visibleLayers.map(requestLayerFrame));

  frames.forEach((frame, index) => {
    if (!frame) {
      return;
    }
    const layer = visibleLayers[index];
    const left = parseFloat(layer.iframe.style.left) || 0;
    const top = parseFloat(layer.iframe.style.top) || 0;
    ctx.save();
    ctx.globalAlpha = typeof layer.opacity === "number" ? layer.opacity : 1;
    ctx.drawImage(frame.bitmap, left, top, frame.w, frame.h);
    ctx.restore();
    frame.bitmap.close();
  });

  return composite;
}

async function capturePng() {
  if (!layers.some((l) => l.iframe)) {
    appendStatus("Run a sketch first");
    return;
  }

  appendStatus("Capturing frame...");
  try {
    const composite = await buildCompositeCanvas();
    const blob = await new Promise((resolve) => composite.toBlob(resolve, "image/png"));
    if (!blob) {
      throw new Error("Snapshot failed");
    }
    const buffer = await blob.arrayBuffer();
    const name = await saveMedia(buffer, "png");
    appendStatus(`Saved frame to outputs/${name}`);
  } catch (error) {
    appendStatus(`Capture error: ${error.message}`);
  }
}

// Composite recording: repeatedly rebuilds the full composite (see
// buildCompositeCanvas()) and draws it onto a canvas whose MediaRecorder
// stream is what actually gets encoded - so the recording matches whatever
// Capture PNG would produce at any given moment, not just one layer.
let compositeRecorder = null;
let compositeRecordingChunks = [];
let compositeRecordingActive = false;

function pickRecordingMimeType() {
  const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"];
  for (const candidate of candidates) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }
  return "";
}

async function pumpCompositeRecording(ctx, canvas) {
  while (compositeRecordingActive) {
    const frame = await buildCompositeCanvas();
    if (!compositeRecordingActive) {
      break;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(frame, 0, 0);
    // Brief yield between composites so this loop doesn't peg the CPU -
    // captureStream() re-samples the canvas's current pixels on its own
    // schedule, so composites don't need to land on every video frame.
    await new Promise((resolve) => window.setTimeout(resolve, 16));
  }
}

function startCompositeRecording() {
  if (!layers.some((l) => l.iframe)) {
    appendStatus("Run a sketch first");
    return;
  }

  const rightPanel = document.querySelector(".right-panel");
  const rect = rightPanel.getBoundingClientRect();
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(rect.width));
  canvas.height = Math.max(1, Math.round(rect.height));
  const ctx = canvas.getContext("2d");

  if (!canvas.captureStream || !window.MediaRecorder) {
    appendStatus("Recording not supported by this webview");
    return;
  }

  const stream = canvas.captureStream(60);
  const mimeType = pickRecordingMimeType();
  try {
    compositeRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  } catch (error) {
    appendStatus(`Recording error: ${error.message}`);
    return;
  }

  compositeRecordingChunks = [];
  compositeRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size) {
      compositeRecordingChunks.push(event.data);
    }
  };
  compositeRecorder.onstop = () => {
    const blob = new Blob(compositeRecordingChunks, { type: (compositeRecorder && compositeRecorder.mimeType) || "video/webm" });
    blob.arrayBuffer().then((buffer) => {
      saveMedia(buffer, "webm")
        .then((name) => appendStatus(`Saved recording to outputs/${name}`))
        .catch((error) => appendStatus(`Save failed: ${error.message}`));
    });
  };

  compositeRecordingActive = true;
  setRecordingUI(true);
  appendStatus("Recording composite...");
  compositeRecorder.start();
  pumpCompositeRecording(ctx, canvas);
}

function stopCompositeRecording() {
  compositeRecordingActive = false;
  if (compositeRecorder && compositeRecorder.state !== "inactive") {
    compositeRecorder.stop();
  }
  setRecordingUI(false);
}

function toggleRecording() {
  if (isRecording) {
    stopCompositeRecording();
    return;
  }

  startCompositeRecording();
}

// "Full Window": fill the WebView viewport (the app's content area) with the
// preview pane via the Fullscreen API. The sketch iframe centres its canvas on a
// white background. Esc (browser default) exits.
function toggleFullscreen() {
  const rightPanel = document.querySelector(".right-panel");
  if (!rightPanel) {
    return;
  }

  if (document.fullscreenElement) {
    document.exitFullscreen();
    return;
  }

  if (!layers.some((l) => l.iframe)) {
    appendStatus("Run a sketch first");
    return;
  }

  const request = rightPanel.requestFullscreen
    ? rightPanel.requestFullscreen()
    : Promise.reject(new Error("Fullscreen not supported"));

  Promise.resolve(request)
    .then(() => appendStatus("Full window — press Esc to exit"))
    .catch((error) => appendStatus(`Fullscreen failed: ${error.message}`));
}

// "Fullscreen": the same preview-pane fullscreen, but also drive the native
// window into borderless full-screen (window.neoSetDesktopFullscreen, bound in
// C++) so the sketch covers the whole desktop, not just the app window. Esc
// exits both — the browser leaves element fullscreen and the fullscreenchange
// handler below restores the native window.
let desktopFullscreenActive = false;

function toggleDesktopFullscreen() {
  const rightPanel = document.querySelector(".right-panel");
  if (!rightPanel) {
    return;
  }

  if (document.fullscreenElement) {
    document.exitFullscreen();
    return;
  }

  if (!layers.some((l) => l.iframe)) {
    appendStatus("Run a sketch first");
    return;
  }

  const request = rightPanel.requestFullscreen
    ? rightPanel.requestFullscreen()
    : Promise.reject(new Error("Fullscreen not supported"));

  Promise.resolve(request)
    .then(() => {
      desktopFullscreenActive = true;
      if (window.neoSetDesktopFullscreen) {
        window.neoSetDesktopFullscreen(true);
      }
      appendStatus("Fullscreen — press Esc to exit");
    })
    .catch((error) => appendStatus(`Fullscreen failed: ${error.message}`));
}

document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement && desktopFullscreenActive) {
    desktopFullscreenActive = false;
    if (window.neoSetDesktopFullscreen) {
      window.neoSetDesktopFullscreen(false);
    }
  }
  repositionAllLayers();
});

window.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data.type !== "string") {
    return;
  }

  switch (data.type) {
    case "sketch-error":
      appendStatus(`Sketch error: ${data.message}`);
      break;
    case "canvas-size": {
      // Identify which layer sent this by matching event.source (its
      // iframe's contentWindow) - multiple layers share this one listener.
      const layer = layers.find((l) => l.iframe && l.iframe.contentWindow === event.source);
      if (layer && (layer.canvasWidth !== data.width || layer.canvasHeight !== data.height)) {
        layer.canvasWidth = data.width;
        layer.canvasHeight = data.height;
        positionLayerIframe(layer);
      }
      break;
    }
    default:
      break;
  }
});

if (recordButton) {
  recordButton.addEventListener("click", toggleRecording);
}

if (captureButton) {
  captureButton.addEventListener("click", capturePng);
}

if (fullscreenButton) {
  fullscreenButton.addEventListener("click", toggleFullscreen);
}

if (desktopFullscreenButton) {
  desktopFullscreenButton.addEventListener("click", toggleDesktopFullscreen);
}

if (libraryApplyButton) {
  libraryApplyButton.addEventListener("click", applyLibrary);
}

if (importLibraryButton && importLibraryInput) {
  importLibraryButton.addEventListener("click", () => importLibraryInput.click());
  importLibraryInput.addEventListener("change", importLibraryFile);
}

// Applies the chosen background colour - this *is* layer 0 (see
// docs/proposals/layer-system.md), just a CSS custom property on
// .right-panel itself, live immediately since no iframe needs to know
// about it.
function applySketchBg(color) {
  sketchBg = color;
  document.documentElement.style.setProperty("--sketch-bg", color);
}

if (sketchBgColor) {
  applySketchBg(sketchBgColor.value || "#ffffff");
  sketchBgColor.addEventListener("input", (event) => {
    applySketchBg(event.target.value);
  });
}

// Anchor switch: stores the choice and repositions every running layer's
// iframe within .right-panel immediately (each iframe is sized to its own
// canvas - see positionLayerIframe() - so "anchor" now means where that
// canvas-sized iframe sits in the panel, not where the canvas sits within
// an oversized iframe). Global across all layers, same as Sound and
// Libraries (see docs/proposals/layer-system.md's "Decisions").
function applySketchAnchor(anchor) {
  sketchAnchor = anchor;
  repositionAllLayers();
}

anchorButtons.forEach((button) => {
  button.addEventListener("click", () => {
    anchorButtons.forEach((other) => {
      const isActive = other === button;
      other.classList.toggle("is-active", isActive);
      other.setAttribute("aria-pressed", String(isActive));
    });
    applySketchAnchor(button.dataset.anchor);
  });
});

// Master audio on/off + volume: pushes live to every running layer so the
// mute/volume change takes effect immediately, no need to re-run. Global
// across all layers, not per-layer, for now.
function applyAudioState() {
  if (audioMasterSlider) {
    audioMasterSlider.disabled = !audioEnabled;
  }
  layers.forEach((layer) => {
    if (layer.iframe && layer.iframe.contentWindow) {
      layer.iframe.contentWindow.postMessage(
        { type: "audio-set", enabled: audioEnabled, volume: audioMasterVolume },
        "*"
      );
    }
  });
}

audioToggleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    audioToggleButtons.forEach((other) => {
      const isActive = other === button;
      other.classList.toggle("is-active", isActive);
      other.setAttribute("aria-pressed", String(isActive));
    });
    audioEnabled = button.dataset.audio === "on";
    applyAudioState();
    appendStatus(`Sketch audio ${audioEnabled ? "on" : "off"}`);
  });
});

if (audioMasterSlider) {
  audioMasterSlider.disabled = !audioEnabled;
  audioMasterSlider.addEventListener("input", (event) => {
    audioMasterVolume = parseFloat(event.target.value);
    if (Number.isNaN(audioMasterVolume)) {
      audioMasterVolume = 1;
    }
    applyAudioState();
  });
}

const runButton = document.getElementById("run-button");
if (runButton) {
  runButton.addEventListener("click", (event) => {
    runActiveLayer();
    event.stopPropagation();
  });
}

const stopButton = document.getElementById("stop-button");
if (stopButton) {
  stopButton.addEventListener("click", (event) => {
    stopActiveLayer();
    event.stopPropagation();
  });
}

if (stopAllLayersButton) {
  stopAllLayersButton.addEventListener("click", stopAllLayers);
}

if (hamburgerButton) {
  hamburgerButton.addEventListener("click", toggleSidebar);
}

if (splitter && middleRow) {
  splitter.addEventListener("pointerdown", (event) => {
    isResizingPanels = true;
    splitter.setPointerCapture(event.pointerId);
    updateSplitFromPointer(event.clientX);
    event.preventDefault();
  });

  splitter.addEventListener("pointermove", (event) => {
    if (!isResizingPanels) {
      return;
    }

    updateSplitFromPointer(event.clientX);
  });

  splitter.addEventListener("pointerup", (event) => {
    isResizingPanels = false;
    if (splitter.hasPointerCapture(event.pointerId)) {
      splitter.releasePointerCapture(event.pointerId);
    }
  });

  splitter.addEventListener("pointercancel", (event) => {
    isResizingPanels = false;
    if (splitter.hasPointerCapture(event.pointerId)) {
      splitter.releasePointerCapture(event.pointerId);
    }
  });
}

const hSplitter = document.getElementById("h-splitter");
const mainLayout = document.querySelector(".main-layout");
let isResizingBottom = false;

function setBottomPanelSize(px) {
  if (!mainLayout) {
    return;
  }

  const rect = mainLayout.getBoundingClientRect();
  const max = rect.height * 0.8;
  const clamped = Math.min(max, Math.max(48, px));
  mainLayout.style.setProperty("--bottom-panel-size", `${clamped}px`);
  if (aceEditor) {
    aceEditor.resize();
  }
  repositionAllLayers();
}

function updateBottomFromPointer(clientY) {
  if (!mainLayout) {
    return;
  }

  const rect = mainLayout.getBoundingClientRect();
  setBottomPanelSize(rect.bottom - clientY);
}

if (hSplitter && mainLayout) {
  hSplitter.addEventListener("pointerdown", (event) => {
    isResizingBottom = true;
    hSplitter.setPointerCapture(event.pointerId);
    updateBottomFromPointer(event.clientY);
    event.preventDefault();
  });

  hSplitter.addEventListener("pointermove", (event) => {
    if (!isResizingBottom) {
      return;
    }

    updateBottomFromPointer(event.clientY);
  });

  const endBottomResize = (event) => {
    isResizingBottom = false;
    if (hSplitter.hasPointerCapture(event.pointerId)) {
      hSplitter.releasePointerCapture(event.pointerId);
    }
  };

  hSplitter.addEventListener("pointerup", endBottomResize);
  hSplitter.addEventListener("pointercancel", endBottomResize);
}

setLibraryLabel();
loadLibraryManifest();

setLeftPanelSize(50);
initializeEditor();
