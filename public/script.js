// vecnode 2026
const terminalOutput = document.getElementById("terminal");
const menuButtons = document.querySelectorAll(".menu-button");
const menuItems = document.querySelectorAll(".menu-item");
const hamburgerButton = document.getElementById("hamburger-button");
const appShell = document.querySelector(".app-shell");
const sidePanel = document.getElementById("side-panel");
const statusContainer = document.querySelector(".bottom-row");
const middleRow = document.getElementById("middle-row");
const splitter = document.getElementById("splitter");
const aceContainer = document.getElementById("ace-editor");
const editorMeta = document.getElementById("editor-meta");

// Version of the bundled p5.js library (public/libs/p5-<version>.min.js).
// Single source of truth: drives both the version label and the <script>
// the sketch iframe loads.
const P5_VERSION = "1.11.3";

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

let isResizingPanels = false;
let aceEditor = null;
let openFileInput = null;
let sketchFrame = null;
let isRecording = false;

const recordButton = document.getElementById("record-button");
const captureButton = document.getElementById("capture-button");
const fullscreenButton = document.getElementById("fullscreen-button");

function initializeEditor() {
  if (!aceContainer || typeof ace === "undefined") {
    return;
  }

  aceEditor = ace.edit("ace-editor");
  aceEditor.setTheme("ace/theme/textmate");
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
    }
  });
})();
`;

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
  iframe.style.cssText = "width:100%;height:100%;border:none;background:#fff;";
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
      background: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
    }
  </style>
  <script src="/libs/p5-${P5_VERSION}.min.js"><\/script>
</head>
<body>
  <script>
    window.onerror = function(msg, src, line) {
      window.parent.postMessage({ type: 'sketch-error', message: msg + ' (line ' + line + ')' }, '*');
    };
    ${captureController}
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

// Fullscreen the preview pane. The sketch iframe centres its canvas on a white
// background, so in fullscreen the canvas sits at its exact size in the middle
// of the screen. Esc (browser default) exits.
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
    .then(() => appendStatus("Fullscreen — press Esc to exit"))
    .catch((error) => appendStatus(`Fullscreen failed: ${error.message}`));
}

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

const runButton = document.getElementById("run-button");
if (runButton) {
  runButton.addEventListener("click", (event) => {
    runSketch();
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

if (editorMeta) {
  editorMeta.textContent = `p5.js v${P5_VERSION}`;
}

setLeftPanelSize(50);
initializeEditor();
