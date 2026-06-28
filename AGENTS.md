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
   into the binary** at build time — `public/` is not read from disk at runtime.
3. Opens a native [webview](https://github.com/webview/webview) window pointed at
   that local server (WebView2 on Windows, WebKitGTK on Linux).

There is no separate backend process and no external network dependency at
runtime.

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

- **`src/main.cpp`** — the entire C++ application. Entry point, HTTP routes,
  window creation, per-OS icon handling, and graceful shutdown.
- **`public/`** — the frontend, embedded into the binary via `cpp-embedlib`:
  - `index.html` — layout: menu bar, Ace editor (left), sketch preview (right),
    status/terminal row (bottom), collapsible side panel.
  - `script.js` — all UI logic: editor setup, menus, file open/save, panel
    splitter, and the sketch runner.
  - `style.css` — styling.
  - `libs/` — vendored third-party JS (Ace editor, p5.js). These are committed.
- **`outputs/`** — where saved sketches are written at runtime
  (`POST /api/save-script`). Treated as scratch output; safe to clear.
- **`icons/`** — `.ico` files copied next to the executable on Windows and loaded
  at runtime for the window/taskbar icon.
- **`assets/`** — screenshots for the README only.

### Request/response contract

| Route                  | Method | Body            | Success            | Errors |
|------------------------|--------|-----------------|--------------------|--------|
| `/health`              | GET    | —               | `200` `ok`         | —      |
| `/api/save-script`     | POST   | sketch as text  | `200` `<filename>` | `400` empty, `413` too large, `500` write failure |
| `/api/save-media?ext=` | POST   | binary (PNG/WebM) | `200` `<filename>` | `400` bad/empty ext or body, `413` too large, `500` write failure |
| everything else        | GET    | —               | embedded static asset | `404` |

Saved files are named server-side from the clock — scripts as
`YYYY-MM-DD-HH-MM-SS_p5.js`, media as `YYYY-MM-DD-HH-MM-SS-mmm_<capture|recording>.<ext>`.
The client never supplies a path, so there is no path-traversal surface. For
`/api/save-media` the `ext` query param is sanitised to lower-case alphanumerics
and checked against an allow-list (`png`, `jpg`, `jpeg`, `webm`, `mp4`); anything
else is rejected.

### The sketch runner & capture (security-sensitive)

`runSketch()` in `public/script.js` injects the user's code into an `<iframe>`
via `srcdoc` with `sandbox="allow-scripts"` (intentionally **without**
`allow-same-origin`). This means user sketches:

- run in an **opaque origin** — they cannot read cookies/storage or call the
  local HTTP API (`/api/save-script`, etc.);
- can still load `/libs/p5-1.11.3.min.js` as a subresource and report errors to
  the parent via `postMessage`.

**Do not add `allow-same-origin` back** unless you have a deliberate reason and a
replacement isolation strategy — it would let arbitrary user code escape the
sandbox and reach the local server.

Because the iframe is opaque-origin, **the parent cannot touch the sketch's
canvas directly.** Recording and PNG capture therefore happen *inside* the
iframe: a small `captureController` (also in `script.js`) is injected ahead of
the user code and listens for `postMessage` commands from the parent.

- **Record** (toggle button in the right side panel) → `canvas.captureStream(fps)`
  + `MediaRecorder` produce a WebM blob (GPU-backed; no per-frame pixel copying
  on the main thread). On stop, the bytes are transferred to the parent and
  POSTed to `/api/save-media?ext=webm`.
- **Capture PNG** → `canvas.toBlob('image/png')`, transferred to the parent and
  POSTed to `/api/save-media?ext=png`.

Both land in `outputs/`. The controller feature-detects `captureStream` /
`MediaRecorder` and reports a `record-error` if the webview lacks them (WebKitGTK
support varies by version). Known limitation: PNG capture of **WEBGL** sketches
may be blank because p5 does not set `preserveDrawingBuffer` — video recording of
WEBGL works regardless.

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

`build_and_distribute.bat` is an unimplemented placeholder for Release packaging.

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
  requires a rebuild to take effect — there is no live reload. Adding a new file
  to `public/` makes it served automatically (it is part of the embedded FS).
- **Boost.Asio is intentional but currently idle.** `main()` spins up an
  `io_context` on its own thread as the foundation for future async work. It does
  no work yet. Don't reintroduce console-spam heartbeats; post real tasks to
  `ioc` when async behaviour is actually needed.
- **Loopback only.** The server binds `127.0.0.1`. Never change it to `0.0.0.0`
  or a public interface — it is not designed to be reachable off-host.
- **Server-side limits.** Request bodies are capped at `kMaxScriptBytes` (5 MiB)
  and read/write timeouts are set. Error responses to the client are generic;
  detailed errors go to `std::cerr` (avoid leaking internals to the client).
- **Windows MSVC vs MinGW.** `CMakeLists.txt` and `build_and_run.bat` actively
  guard against MinGW/MSYS2 headers leaking into MSVC's include path. If you see
  `corecrt.h` / `winnt.h` errors, build from a clean VS Developer Command Prompt
  (or just use `build_and_run.bat`).
- **Per-OS code** in `main.cpp` is guarded with `#ifdef _WIN32` / `#ifdef
  __linux__`. macOS is partially wired in CMake (frameworks) but not exercised.
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
