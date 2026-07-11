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
let sketchFrame = null;
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

function initializeEditor() {
  if (!aceContainer || typeof ace === "undefined") {
    return;
  }

  aceEditor = ace.edit("ace-editor");
  aceEditor.setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? ACE_THEME_DARK : ACE_THEME_LIGHT);
  aceEditor.session.setMode("ace/mode/javascript");
  aceEditor.session.setTabSize(2);
  aceEditor.session.setUseSoftTabs(true);
  aceEditor.setOptions({
    fontSize: "14px",
    showPrintMargin: false,
    wrap: true,
  });
  aceEditor.setValue(defaultSketch, -1);
  aceEditor.resize();
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
  runSketch();
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

  if (sketchFrame) {
    runSketch();
  }
}

// Reads a locally-picked .js file and stashes its source so runSketch() injects
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
    if (sketchFrame) {
      runSketch();
    }
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
});




// Capture/record controller injected into every sketch iframe. Because the
// iframe is sandboxed to an opaque origin, the parent cannot touch its canvas
// directly — instead we record/snapshot here (using the GPU-backed
// MediaRecorder / toBlob APIs) and ship the resulting bytes out via postMessage.
const captureController = `
(function () {
  var recorder = null;
  var chunks = [];
  var recording = false;
  var rafId = 0;
  function canvas() { return document.querySelector('canvas'); }
  function send(type, extra, transfer) {
    var msg = Object.assign({ type: type }, extra || {});
    parent.postMessage(msg, '*', transfer || []);
  }
  // Logical sketch size (e.g. createCanvas(400, 400)), independent of the
  // device pixel ratio that inflates the canvas backing store. Output media is
  // rendered at this size so files match the dimensions the sketch declares.
  function logicalSize(el) {
    return {
      w: Math.max(1, Math.round(el.clientWidth || el.width)),
      h: Math.max(1, Math.round(el.clientHeight || el.height))
    };
  }
  function pickMime() {
    var c = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    for (var i = 0; i < c.length; i++) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(c[i])) return c[i];
    }
    return '';
  }
  window.addEventListener('message', function (event) {
    var data = event.data || {};
    if (data.type === 'capture-png') {
      var el = canvas();
      if (!el) { send('capture-error', { message: 'No canvas in sketch' }); return; }
      var s = logicalSize(el);
      var off = document.createElement('canvas');
      off.width = s.w; off.height = s.h;
      off.getContext('2d').drawImage(el, 0, 0, s.w, s.h);
      off.toBlob(function (blob) {
        if (!blob) { send('capture-error', { message: 'Snapshot failed' }); return; }
        blob.arrayBuffer().then(function (buf) {
          send('capture-complete', { buffer: buf, ext: 'png' }, [buf]);
        });
      }, 'image/png');
    } else if (data.type === 'record-start') {
      var el2 = canvas();
      if (!el2) { send('record-error', { message: 'No canvas in sketch' }); return; }
      if (recorder && recorder.state !== 'inactive') return;
      // Record from an offscreen canvas sized to the logical sketch, fed each
      // frame from the live canvas — the WebM matches the declared dimensions.
      var s2 = logicalSize(el2);
      var rec = document.createElement('canvas');
      rec.width = s2.w; rec.height = s2.h;
      var ctx = rec.getContext('2d');
      if (!rec.captureStream || !window.MediaRecorder) {
        send('record-error', { message: 'Recording not supported by this webview' });
        return;
      }
      var mime = pickMime();
      try {
        var stream = rec.captureStream(data.fps || 60);
        recorder = mime ? new MediaRecorder(stream, { mimeType: mime })
                        : new MediaRecorder(stream);
      } catch (err) { send('record-error', { message: String(err) }); return; }
      chunks = [];
      recording = true;
      (function pump() {
        if (!recording) return;
        var src = canvas();
        if (src) ctx.drawImage(src, 0, 0, rec.width, rec.height);
        rafId = requestAnimationFrame(pump);
      })();
      recorder.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      recorder.onstop = function () {
        recording = false;
        if (rafId) cancelAnimationFrame(rafId);
        var blob = new Blob(chunks, { type: (recorder && recorder.mimeType) || 'video/webm' });
        blob.arrayBuffer().then(function (buf) {
          send('recording-complete', { buffer: buf, ext: 'webm' }, [buf]);
        });
      };
      recorder.start();
      send('record-started', {});
    } else if (data.type === 'record-stop') {
      recording = false;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
    } else if (data.type === 'set-bg') {
      document.body.style.background = data.color;
    } else if (data.type === 'set-anchor') {
      var a = data.anchor === 'center' ? 'center' : 'flex-start';
      document.body.style.alignItems = a;
      document.body.style.justifyContent = a;
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

function runSketch() {
  const code = getEditorContents();
  const rightPanel = document.querySelector(".right-panel");
  if (!rightPanel) {
    appendStatus("Error: render panel not found");
    return;
  }

  appendStatus("Running sketch...");
  resetRecordingState();

  const existingFrame = rightPanel.querySelector("iframe");
  if (existingFrame) {
    existingFrame.remove();
  }

  const iframe = document.createElement("iframe");
  iframe.style.cssText = `width:100%;height:100%;border:none;background:${sketchBg};`;
  // Run user sketches in an opaque origin: scripts are permitted, but the
  // sketch cannot reach the parent document, cookies, storage, or the local
  // HTTP API. (allow-same-origin is deliberately omitted.)
  iframe.sandbox = "allow-scripts";

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    html, body { height: 100%; }
    body {
      margin: 0;
      overflow: hidden;
      background: ${sketchBg};
      display: flex;
      align-items: ${sketchAnchor === "center" ? "center" : "flex-start"};
      justify-content: ${sketchAnchor === "center" ? "center" : "flex-start"};
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
    ${importedLibrarySource}
    ${code}
  <\/script>
</body>
</html>`;

  iframe.srcdoc = html;
  rightPanel.appendChild(iframe);
  sketchFrame = iframe;
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

function postToSketch(message) {
  if (!sketchFrame || !sketchFrame.contentWindow) {
    appendStatus("Run a sketch first");
    return false;
  }

  sketchFrame.contentWindow.postMessage(message, "*");
  return true;
}

function capturePng() {
  if (postToSketch({ type: "capture-png" })) {
    appendStatus("Capturing frame...");
  }
}

function toggleRecording() {
  if (isRecording) {
    postToSketch({ type: "record-stop" });
    return;
  }

  if (postToSketch({ type: "record-start", fps: 60 })) {
    appendStatus("Starting recording...");
  }
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

  if (!sketchFrame) {
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

  if (!sketchFrame) {
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
    case "record-started":
      setRecordingUI(true);
      appendStatus("Recording...");
      break;
    case "record-error":
      setRecordingUI(false);
      appendStatus(`Recording error: ${data.message}`);
      break;
    case "capture-error":
      appendStatus(`Capture error: ${data.message}`);
      break;
    case "recording-complete":
      setRecordingUI(false);
      saveMedia(data.buffer, data.ext || "webm")
        .then((name) => appendStatus(`Saved recording to outputs/${name}`))
        .catch((error) => appendStatus(`Save failed: ${error.message}`));
      break;
    case "capture-complete":
      saveMedia(data.buffer, data.ext || "png")
        .then((name) => appendStatus(`Saved frame to outputs/${name}`))
        .catch((error) => appendStatus(`Save failed: ${error.message}`));
      break;
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

// Applies the chosen sketch background: stores it (baked into the next run),
// updates the fullscreen letterbox colour, and pushes it live to a running
// sketch so the change shows immediately.
function applySketchBg(color) {
  sketchBg = color;
  document.documentElement.style.setProperty("--sketch-bg", color);
  if (sketchFrame && sketchFrame.contentWindow) {
    sketchFrame.contentWindow.postMessage({ type: "set-bg", color }, "*");
  }
}

if (sketchBgColor) {
  applySketchBg(sketchBgColor.value || "#ffffff");
  sketchBgColor.addEventListener("input", (event) => {
    applySketchBg(event.target.value);
  });
}

// Anchor switch: stores the choice (baked into the next run) and pushes it live
// to a running sketch so the canvas repositions immediately.
function applySketchAnchor(anchor) {
  sketchAnchor = anchor;
  if (sketchFrame && sketchFrame.contentWindow) {
    sketchFrame.contentWindow.postMessage({ type: "set-anchor", anchor }, "*");
  }
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

// Master audio on/off + volume: pushes live to a running sketch so the
// mute/volume change takes effect immediately, no need to re-run.
function applyAudioState() {
  if (audioMasterSlider) {
    audioMasterSlider.disabled = !audioEnabled;
  }
  if (sketchFrame && sketchFrame.contentWindow) {
    sketchFrame.contentWindow.postMessage(
      { type: "audio-set", enabled: audioEnabled, volume: audioMasterVolume },
      "*"
    );
  }
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

// Stop the running sketch: remove its iframe so it stops executing and
// rendering entirely, and reset any capture state tied to it.
function stopSketch() {
  const rightPanel = document.querySelector(".right-panel");
  const frame = rightPanel && rightPanel.querySelector("iframe");
  if (!frame) {
    appendStatus("No sketch running");
    return;
  }

  frame.remove();
  sketchFrame = null;
  resetRecordingState();
  appendStatus("Sketch stopped");
}

const runButton = document.getElementById("run-button");
if (runButton) {
  runButton.addEventListener("click", (event) => {
    runSketch();
    event.stopPropagation();
  });
}

const stopButton = document.getElementById("stop-button");
if (stopButton) {
  stopButton.addEventListener("click", (event) => {
    stopSketch();
    event.stopPropagation();
  });
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
