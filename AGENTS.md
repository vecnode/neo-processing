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
  - `#tab-strip` (above the editor) - the layer tabs from
    `docs/proposals/layer-system.md`, Phase 1: multi-session editing only.
    Each tab is one `ace.EditSession` (own undo history/cursor/scroll) in the
    `layers` array (`script.js`); `activateLayer()` swaps the session on the
    single `aceEditor` instance. Only one iframe still ever runs (Run uses
    whichever tab is active) - compositing multiple simultaneously-running
    layers is a later phase, not yet built. Hard cap of 10 layers
    (`MAX_LAYERS`); at least one layer must always exist (`closeLayer()`
    refuses to close the last one). Double-click a tab label to rename.
  - `libraries.json` - manifest of injectable p5.js builds (`{ id, name,
    version, url, isLocal }`); see the Libraries section below.
  - `script.js` - all UI logic: editor setup, menus, file open/save, panel
    splitter, the sketch runner, and the capture/fullscreen controls.
  - `style.css` - styling. The `html` element is set to `zoom: 0.8` so the app
    starts at 80% of its natural size (more editor/preview space in the same
    window); this scales fonts, paddings, and controls together instead of
    tuning each dimension by hand. Every colour is a CSS custom property
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

`runSketch()` in `public/script.js` injects the user's code into an `<iframe>`
via `srcdoc` with `sandbox="allow-scripts"` (intentionally **without**
`allow-same-origin`). This means user sketches:

- run in an **opaque origin** - they cannot read cookies/storage or call the
  local HTTP API (`/api/save-script`, etc.);
- can still load `/libs/p5-1.11.3.min.js` as a subresource and report errors to
  the parent via `postMessage`.

**Do not add `allow-same-origin` back** unless you have a deliberate reason and a
replacement isolation strategy - it would let arbitrary user code escape the
sandbox and reach the local server.

Because the iframe is opaque-origin, **the parent cannot touch the sketch's
canvas directly.** Recording and PNG capture therefore happen *inside* the
iframe: a small `captureController` (also in `script.js`) is injected ahead of
the user code and listens for `postMessage` commands from the parent.

Output media is rendered at the sketch's **logical** size (`canvas.clientWidth/
Height`, e.g. `400×400`), not the device-pixel-inflated backing store, so files
match the dimensions the sketch declares.

- **Record** (toggle button in the right side panel) → an offscreen canvas at the
  logical size is fed each frame from the live canvas (`drawImage`), and
  `offscreen.captureStream(fps)` + `MediaRecorder` produce a WebM blob (GPU-backed;
  no per-frame pixel copying to JS). On stop, the bytes are transferred to the
  parent and POSTed to `/api/save-media?ext=webm`.
- **Capture PNG** → the live canvas is drawn once onto a logical-size offscreen
  canvas and exported with `toBlob('image/png')`, transferred to the parent and
  POSTed to `/api/save-media?ext=png`.

Both land in `outputs/`. The controller feature-detects `captureStream` /
`MediaRecorder` and reports a `record-error` if the webview lacks them (WebKitGTK
support varies by version). Known limitation: capture of **WEBGL** sketches may
be blank because p5 does not set `preserveDrawingBuffer` (this affects both the
PNG snapshot and the per-frame `drawImage` used for recording).

There are two fullscreen modes, both calling `requestFullscreen()` on the preview
pane (`.right-panel`), not the sandboxed iframe - so neither needs an iframe
fullscreen permission. The sketch iframe's body centres its canvas on a white
background, so the canvas shows at its exact pixel size in the middle. Esc exits.

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
chosen build in `activeLibrary`; `runSketch()` uses `activeLibrary.url` for the
iframe's p5 `<script>`, and the label under the editor reflects it. **Apply** swaps
the active build and reloads any running sketch.

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
sketch code (see `runSketch()`), so it runs in the same sandboxed,
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
enabled, volume }` on toggle/slider change (see `applyAudioState()`); the
initial state is baked into the controller string per `runSketch()` call.

No new capability crosses the sandbox boundary - the message payload is just
a boolean and a 0-1 float, and the iframe stays `sandbox="allow-scripts"`
with no `allow-same-origin`, same as everywhere else.

Known limitations (also listed in the proposal doc): browser autoplay policy
may require a click inside the sketch before audio actually starts; the
`captureController`'s WebM recording is still video-only (no audio track);
and if `p5.sound` is ever bundled, verify it doesn't grab its own
`AudioContext` reference at load time (in `<head>`) before this controller
(in `<body>`) gets a chance to patch `window.AudioContext`.

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
