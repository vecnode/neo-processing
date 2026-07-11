# AGENTS.md

Guidance for AI coding agents (and humans) working in this repository. Keep this
file in sync with the code when behaviour changes.

## What this project is

**neo-processing** is a native desktop application that lets a user write
[p5.js](https://p5js.org/) sketches in an embedded code editor and run them in a
live preview, aimed at real-world / full-screen deployment. It is a modern,
JavaScript-based take on the Java Processing IDE.

The whole product is a single C++ executable that:

1. Starts a local HTTP server bound to `127.0.0.1` on an OS-assigned port.
2. Serves a small web frontend (Ace editor + p5.js runner) that is **embedded
   into the binary** at build time - `public/` is not read from disk at runtime.
3. Opens a native [webview](https://github.com/webview/webview) window pointed at
   that local server (WebView2 on Windows, WebKitGTK on Linux).

There is no separate backend process and no external network dependency at
runtime - the only optional exception is choosing an online p5.js build from
the Libraries panel, which loads that build from a CDN (see "Libraries"
below). The default, bundled build keeps the app fully offline.

## Architecture

```
┌─────────────────────────────────────────────┐
│ neo-processing (single native executable)    │
│                                              │
│  webview window  ──HTTP──►  httplib server   │
│  (WebView2 /                 127.0.0.1:<port>│
│   WebKitGTK)                 │               │
│                              ├─ GET  /health │
│                              ├─ POST /api/save-script
│                              ├─ POST /api/save-media
│                              └─ static assets (embedded from public/)
│                                              │
│  boost::asio io_context (idle infra thread)  │
└─────────────────────────────────────────────┘
```

- **`src/main.cpp`** - the entire C++ application. Entry point, HTTP routes,
  window creation, per-OS icon handling, and graceful shutdown.
- **`public/`** - the frontend, embedded into the binary via `cpp-embedlib`:
  - `index.html` - layout: menu bar (Run, Stop, File, Examples), Ace editor + p5
    version label (left), sketch preview (right), a draggable horizontal splitter,
    a resizable status/terminal row (bottom), and a collapsible side panel with a
    Capture section (Record / Capture PNG / Full Window / Fullscreen), a Sketch
    section (canvas anchor toggle - Center/Top Left - and a background-colour
    picker for the area behind the canvas), and a Libraries section (p5.js build
    picker + Import JS Library). Stop tears down the sketch iframe; the
    `.splitter` resizes the editor/preview split and `.h-splitter` the terminal
    height (both drive CSS custom properties on the grid). The Examples menu
    (`#examples-menu`) is grouped into five topics of five sketches each
    (Motion & Physics, Shapes & Geometry, Waves & Noise, Particles & Systems,
    Color & Pattern) via `.menu-section-label` headers; the sketch source lives
    in `script.js`'s `examples` object, keyed by the same label text as the
    `data-action` on each `<li>` button. Keep the two in sync when adding
    examples - a mismatched key silently no-ops (see `loadExample()`).
  - `#tab-strip` (above the editor) + `#layers-panel` (right half of the
    bottom row) - the layer system from `docs/proposals/layer-system.md`,
    Phases 1-4: multi-session editing, stacked/composited layers, and
    composite capture/record. Each tab is one `ace.EditSession` (own undo
    history/cursor/scroll) in the `layers` array (`script.js`);
    `activateLayer()` swaps the session on the single `aceEditor` instance.
    Each layer that's been Run gets its own `sandbox="allow-scripts"`
    iframe, positioned/sized to match its own sketch's `createCanvas()` call
    (`positionLayerIframe()`, kept live by `layerController`'s
    `canvas-size` reports - not stretched to fill `.right-panel`) and
    stacked via inline `z-index` matching array order (`applyLayerZIndex()`)
    - layer 0 isn't in the array at all, it's just `.right-panel`'s own
    `background: var(--sketch-bg)`. Layer iframes have a transparent CSS
    background so lower layers show through wherever a sketch doesn't paint
    something opaque (the sketch's own responsibility - see the proposal
    doc's compositing notes). Hard cap of 5 layers (`MAX_LAYERS`); at least
    one layer must always exist (`closeLayer()` refuses to close the last
    one). Double-click a tab label to rename. Hiding a layer
    (`setLayerVisible()`) both removes it from the visual stack and posts
    `layer-set-visible` to call `noLoop()`/`loop()` inside it
    (`layerController`, injected like `captureController`), so a hidden
    layer stops costing CPU, not just being invisible. Each layer row also
    has a 0-1 opacity slider (`setLayerOpacity()`, plain CSS `opacity` on
    the iframe - visible live, not just in captures). Sound stays a global
    broadcast to every running layer, not per-layer (see the proposal doc's
    "Decisions"). **Capture PNG and Record composite every visible layer**
    (`buildCompositeCanvas()`, requesting a snapshot from each layer's
    `captureController` via a `capture-frame`/`capture-frame-result`
    postMessage round trip, transferring an `ImageBitmap`) - Record runs an
    entirely parent-side `MediaRecorder` fed by repeated composites, not a
    per-layer recorder.
  - `libraries.json` - manifest of injectable p5.js builds (`{ id, name,
    version, url, isLocal }`); see the Libraries section below.
  - `script.js` - all UI logic: editor setup, menus, file open/save, panel
    splitter, the sketch runner, and the capture/fullscreen controls.
  - `style.css` - styling. The app is sized at roughly 80% of its original
    scale via real values (root `font-size: 12px`, was `15px`; Ace editor
    font `11px`, was `14px`; `padding`/`margin`/`gap` scaled ~0.8x
    throughout), **not** CSS `zoom`. An earlier version used `html { zoom:
    0.8 }`, but `zoom` puts child elements in a different coordinate space
    from `getBoundingClientRect()` (which reports post-zoom/visual pixels)
    - this broke the layer system's canvas-centring math, which mixes a
    layer's real (pre-zoom) canvas size with `.right-panel`'s
    `getBoundingClientRect()`. Don't reintroduce `zoom` on `html`/`body`
    without accounting for that. Top-bar buttons (Run/Stop/File/Examples/
    theme toggle/copyright/hamburger) all share an explicit `height: 28px`
    so they align regardless of font metrics. Every colour is a CSS custom property
    defined in `:root` (light theme, default) with dark-theme overrides in
    `[data-theme="dark"]` - the top-row's theme toggle button
    (`#theme-toggle-button`, wired in `script.js`'s `applyTheme()`) just flips
    `data-theme` on `<html>` and persists the choice to `localStorage`
    (`neo-theme`). Add new colours as `var(--token)` referencing a custom
    property, not a literal hex, so they pick up both themes automatically.
    The vendored Ace "textmate" theme hardcodes light-only syntax colours
    (plain blue keywords/numbers, which read poorly on a dark surface), so
    `script.js` swaps the whole Ace theme with the app theme instead of
    patching textmate's colours: `ACE_THEME_LIGHT` ("textmate") for light,
    `ACE_THEME_DARK` ("tomorrow_night", vendored at
    `public/libs/theme-tomorrow_night.js`, same `ace-builds` version as
    `ace.js`) for dark, applied in `applyTheme()` and at editor init.
  - `libs/` - vendored third-party JS (Ace editor, p5.js). These are committed.
    The bundled p5 version is declared once as `P5_VERSION` in `script.js`, which
    drives both the version label and the `<script>` URL the sketch iframe loads;
    keep it in sync with the `public/libs/p5-<version>.min.js` filename.
- **`outputs/`** - where saved sketches are written at runtime
  (`POST /api/save-script`). Treated as scratch output; safe to clear.
- **`icons/`** - `.ico` files copied next to the executable on Windows and loaded
  at runtime for the window/taskbar icon (`app_icon.ico` large, `app_icon_small.ico`
  small/title-bar). `icons/app.rc` is a Win32 resource script that embeds
  `app_icon.ico` into the `.exe` itself at build time (Windows only), so
  Explorer/Alt+Tab show it as the file's own icon - separate from, and in
  addition to, the runtime `LoadImageW`/`WM_SETICON` calls in `main.cpp` that
  set the *window* icon from the same files.
- **`assets/`** - screenshots for the README only.
- **`.github/workflows/build.yml`** - builds Release distributables for Windows
  and Linux and publishes a GitHub Release, but only on a pushed version tag
  (`v*.*.*`) or manual trigger - not on every push/PR.

### Request/response contract

| Route                  | Method | Body            | Success            | Errors |
|------------------------|--------|-----------------|--------------------|--------|
| `/health`              | GET    | -               | `200` `ok`         | -      |
| `/api/save-script`     | POST   | sketch as text  | `200` `<filename>` | `403` bad origin, `400` empty, `413` too large, `500` write failure |
| `/api/save-media?ext=` | POST   | binary (PNG/WebM) | `200` `<filename>` | `403` bad origin, `400` bad/empty ext or body, `413` too large, `500` write failure |
| everything else        | GET    | -               | embedded static asset | `404` |

Both write endpoints reject requests whose `Origin` header isn't the app's own
page origin (`http://127.0.0.1:<port>`). The editor UI's POSTs carry that origin;
a sketch's opaque-origin iframe sends `Origin: null` and is denied, so sketch
code cannot reach these endpoints even via a fire-and-forget request.

Saved files are named server-side from the clock - scripts as
`YYYY-MM-DD-HH-MM-SS_p5.js`, media as `YYYY-MM-DD-HH-MM-SS-mmm_<capture|recording>.<ext>`.
The client never supplies a path, so there is no path-traversal surface. For
`/api/save-media` the `ext` query param is sanitised to lower-case alphanumerics
and checked against an allow-list (`png`, `jpg`, `jpeg`, `webm`, `mp4`); anything
else is rejected.

### The sketch runner & capture (security-sensitive)

`runLayer(layer)` in `public/script.js` injects a layer's code into its own
`<iframe>` via `srcdoc` with `sandbox="allow-scripts"` (intentionally
**without** `allow-same-origin`). This means user sketches:

- run in an **opaque origin** - they cannot read cookies/storage or call the
  local HTTP API (`/api/save-script`, etc.);
- can still load `/libs/p5-1.11.3.min.js` as a subresource and report errors to
  the parent via `postMessage`.

**Do not add `allow-same-origin` back** unless you have a deliberate reason and a
replacement isolation strategy - it would let arbitrary user code escape the
sandbox and reach the local server.

Because each layer's iframe is opaque-origin, **the parent cannot touch a
sketch's canvas directly.** Each layer's `captureController` (also in
`script.js`, one instance per layer iframe) only does one thing: on a
`capture-frame` message, it draws its live canvas onto a logical-size
offscreen canvas (`canvas.clientWidth/Height`, e.g. `400×400`, not the
device-pixel-inflated backing store), turns that into an `ImageBitmap`, and
posts it back transferred (`capture-frame-result`) - no per-frame pixel
copying to JS beyond that one snapshot.

Actual compositing happens in the **parent**, in `buildCompositeCanvas()`:
fill with the layer-0 colour, then `Promise.all()` a `capture-frame` request
to every currently *visible* layer, and `drawImage()` each result at that
layer's on-screen `left`/`top`/size (see `positionLayerIframe()`) and
`layer.opacity` (`ctx.globalAlpha`), in stacking order. `requestLayerFrame()`
times out after 2s per layer so one unresponsive layer can't hang the whole
capture.

- **Capture PNG** builds one composite and exports it with `toBlob('image/png')`,
  POSTed to `/api/save-media?ext=png`.
- **Record** (toggle button in the right side panel) runs an entirely
  parent-side `MediaRecorder` off a canvas that `pumpCompositeRecording()`
  keeps redrawing with fresh composites in a loop (not tied to each layer's
  own frame rate - `captureStream()` re-samples the canvas on its own
  schedule, so a slower composite loop just means some video frames repeat
  the previous composite, not an error). On stop, the encoded WebM is
  POSTed to `/api/save-media?ext=webm`.

Both land in `outputs/`. Recording feature-detects `captureStream` /
`MediaRecorder` and reports "Recording not supported by this webview" if the
webview lacks them (WebKitGTK support varies by version). Known limitation:
capture of **WEBGL** sketches may be blank because p5 does not set
`preserveDrawingBuffer` (affects the per-layer snapshot regardless of which
renderer requested it).

There are two fullscreen modes, both calling `requestFullscreen()` on the preview
pane (`.right-panel`), not the sandboxed iframe - so neither needs an iframe
fullscreen permission. `.right-panel`'s `fullscreenchange` handler calls
`repositionAllLayers()`, so each layer's canvas re-centres (or top-left-anchors)
against the new fullscreen size, still at its own exact pixel size. Esc exits.

- **Full Window** fills the WebView viewport (the app's content area). The native
  window is untouched, so it covers only the app window.
- **Fullscreen** does the same *and* drives the native OS window into borderless
  full-screen via `window.neoSetDesktopFullscreen(bool)` - a function bound in
  C++ (`main.cpp`) that strips the window frame and stretches it over the monitor
  (Win32) or calls `gtk_window_fullscreen` (Linux), so the sketch covers the
  whole desktop. On exit, the `fullscreenchange` handler restores the native
  window.

There is one other JS->C++ bridge: `window.neoOpenRepo()`, bound in `main.cpp`,
opens the project's GitHub page in the user's default system browser
(`ShellExecuteW` on Windows, `g_app_info_launch_default_for_uri` on Linux via
GIO). Used by the copyright popup's link (`#copyright-github-link` in
`script.js`) instead of letting an `<a>` navigate the app's own webview away
from `127.0.0.1` - deliberately a fixed, no-argument binding (the target URL
is hardcoded in C++, not passed in from JS) so no string crosses the bridge.

### Libraries (p5.js build selection)

The side panel's **Libraries** section lets the user choose which p5.js build the
sketch iframe loads. The options come from `public/libraries.json` - a manifest
of `{ id, name, version, url, isLocal }` entries that doubles as the **allow-list**
of injectable builds (the JS-first approach from issue #3). `script.js` tracks the
chosen build in `activeLibrary`; `runLayer()` uses `activeLibrary.url` for the
iframe's p5 `<script>`, and the label under the editor reflects it. **Apply** swaps
the active build and reloads every currently-running layer (`rerunAllRunningLayers()`).

The bundled build (`/libs/p5-1.11.3.min.js`, `isLocal: true`) is the default and
keeps the app fully offline. Selecting an online build loads p5 from a CDN - this
trades offline-first for version flexibility and is loaded inside the same
sandboxed, opaque-origin iframe (so it cannot reach the parent or the local API).
Keep the bundled entry's `version`/`url` in sync with the actual file in
`public/libs/` and with `P5_VERSION` in `script.js`.

**Import JS Library** (below Apply) opens a native file picker (`input[type=file]`,
not the `libraries.json` allow-list) and reads the chosen `.js` file's text via
`FileReader`. The text is stashed in `importedLibrarySource` and injected into
the sketch iframe's `srcdoc` after the capture controller and before the
sketch code (see `runLayer()`), so it runs in the same sandboxed,
opaque-origin iframe as the sketch - no broader a capability than the sketch
code the user already writes there. `samples/test-import-lib.js` is a minimal
file for exercising the button (defines `window.neoTestLib.greet()`). This is
currently a single-file, non-persistent import (cleared on reload); treat it
as a starting point, not the final design, if it needs to support multiple
libraries or persistence later.

### Sound (master audio on/off + volume)

The **Sound** section (between Sketch and Libraries) gives master control
over sketch audio output - muted by default. Design background in
`docs/proposals/sound-section.md`; the doc's top now lists exactly where the
implementation diverges from the original proposal.

Rather than hook whatever audio API a sketch happens to use (raw Web Audio,
p5.sound, an imported library), `buildAudioController(enabled, volume)` in
`script.js` is injected into the sketch iframe (after `captureController`,
before `importedLibrarySource`/the sketch code) and wraps
`AudioContext`/`webkitAudioContext` once: each context gets a `GainNode`
spliced in, and `destination` is shadowed as an *own property* on that
instance so anything the sketch connects to `ctx.destination` lands on the
gain node instead of real output. The parent posts `{ type: 'audio-set',
enabled, volume }` to every running layer on toggle/slider change (see
`applyAudioState()`); the initial state is baked into the controller string
per `runLayer()` call.

No new capability crosses the sandbox boundary - the message payload is just
a boolean and a 0-1 float, and the iframe stays `sandbox="allow-scripts"`
with no `allow-same-origin`, same as everywhere else.

Known limitations (also listed in the proposal doc): browser autoplay policy
may require a click inside a sketch before audio actually starts; recorded
WebM output is still video-only (no audio track - `canvas.captureStream()`,
which the parent-side composite recorder uses, only captures pixels); and if
`p5.sound` is ever bundled, verify it doesn't grab its own `AudioContext`
reference at load time (in `<head>`) before this controller (in `<body>`)
gets a chance to patch `window.AudioContext`.

## Build & run

Prerequisites: CMake ≥ 3.20, a C++20 compiler, Git (CMake `FetchContent`
downloads dependencies), and internet access on the first configure.

- **Windows:** Visual Studio 2022 Build Tools (MSVC) + Microsoft Edge WebView2
  Runtime.
- **Linux:** GCC/Clang with C++20, plus GTK 3 and WebKit2GTK development files.

```sh
# Configure + build (Debug)
cmake -B build
cmake --build build --target neo-processing -j --config Debug

# Run
#   Windows: .\build\Debug\neo-processing.exe
#   Linux:   ./build/neo-processing

# One-shot helper scripts (configure + build Debug + run):
#   Windows: .\build_and_run.bat   (also initialises the MSVC environment)
#   Linux:   ./build_and_run.sh
```

`build_and_distribute.bat` (Windows) builds Release and copies the resulting
`build\Release` folder (executable, icons, runtime DLLs) to
`%USERPROFILE%\Desktop\neo-processing`. The `.exe`'s own file icon is embedded
by the CMake build itself (`icons/app.rc`, see above), so this script does not
need a separate icon-injection step.

### Releases

`.github/workflows/build.yml` builds Release distributables for Windows
(MSVC) and Linux (GCC + GTK3/WebKit2GTK) and publishes them to a GitHub
Release - but **only when a `v*.*.*` tag is pushed**, or on manual dispatch.
It intentionally does not run on regular pushes/PRs: day-to-day rounds stay
branch -> PR -> merge with no CI gate. There is no test suite - the workflow
only verifies the project configures and builds cleanly on both platforms as
part of cutting a release. To cut one: bump `project(... VERSION x.y.z ...)`
in `CMakeLists.txt`, then `git tag vx.y.z && git push --tags`.

### Dependencies (fetched at configure time into `build/_deps/`)

| Dependency        | Purpose                                   |
|-------------------|-------------------------------------------|
| `yhirose/cpp-httplib`  | local HTTP server                    |
| `webview/webview` | native window + system webview            |
| `yhirose/cpp-embedlib` | embeds `public/` into the binary     |
| Boost (`asio`, `system`) | async infrastructure thread (see below) |

None of these are vendored in-repo (except the frontend `libs/`); they are
downloaded into the build tree.

## Conventions & gotchas

- **`public/` is embedded at build time.** Editing a file under `public/`
  requires a rebuild to take effect - there is no live reload. Adding a new file
  to `public/` makes it served automatically (it is part of the embedded FS).
- **Boost.Asio is intentional but currently idle.** `main()` spins up an
  `io_context` on its own thread as the foundation for future async work. It does
  no work yet. Don't reintroduce console-spam heartbeats; post real tasks to
  `ioc` when async behaviour is actually needed.
- **Loopback only.** The server binds `127.0.0.1`. Never change it to `0.0.0.0`
  or a public interface - it is not designed to be reachable off-host.
- **Server-side limits.** Request bodies are capped at `kMaxScriptBytes` (5 MiB)
  and read/write timeouts are set. Error responses to the client are generic;
  detailed errors go to `std::cerr` (avoid leaking internals to the client).
- **Windows MSVC vs MinGW.** `CMakeLists.txt` and `build_and_run.bat` actively
  guard against MinGW/MSYS2 headers leaking into MSVC's include path. If you see
  `corecrt.h` / `winnt.h` errors, build from a clean VS Developer Command Prompt
  (or just use `build_and_run.bat`).
- **Per-OS code** in `main.cpp` is guarded with `#ifdef _WIN32` / `#ifdef
  __linux__`. macOS is partially wired in CMake (frameworks) but not exercised.
- **No console window.** On Windows the target is built as a GUI app
  (`WIN32_EXECUTABLE`, with `/ENTRY:mainCRTStartup` so `int main()` stays the
  entry point), so launching the `.exe` opens no terminal. `std::cerr`/`std::cout`
  logging therefore isn't visible from a console - attach a debugger if you need
  it during development.
- **Platform.** Primary development is on Windows (PowerShell). The Bash tool is
  available for POSIX scripts.

## When making changes

- After touching `src/main.cpp` or anything under `public/`, rebuild the
  `neo-processing` target and confirm it compiles before reporting done.
- Keep the HTTP contract table above and the security notes accurate if you
  change routes, limits, or the sketch sandbox.
- There is no automated test suite. Verify behaviour by building and running the
  app (the right-hand preview should render a sketch; saving writes to
  `outputs/`).
