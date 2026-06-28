# CLAUDE.md

This file orients Claude Code (and other agents) in this repository.

➡️ **The canonical project guide is [AGENTS.md](./AGENTS.md).** Read it first —
it covers the architecture, the HTTP contract, the sketch-sandbox security model,
build/run instructions, and the project's conventions and gotchas.

## Quick reference

- **What it is:** a single C++ desktop executable that serves an embedded p5.js
  editor over a loopback HTTP server and displays it in a native webview window.
- **Everything lives in:** `src/main.cpp` (C++) and `public/` (frontend, embedded
  into the binary at build time — rebuild after editing).
- **Build & verify:**
  ```sh
  cmake -B build
  cmake --build build --target neo-processing -j --config Debug
  ```
  On Windows you can use `build_and_run.bat`. There is no automated test suite;
  verify by building and running the app.

## Claude-specific notes

- The primary shell is **PowerShell** on Windows; prefer it for build commands.
  The Bash tool is available for POSIX scripts.
- The first CMake configure downloads dependencies (httplib, webview, Boost,
  cpp-embedlib) and is slow; subsequent builds reuse `build/_deps/`.
- If a build fails with a missing Windows SDK version, the `build/CMakeCache.txt`
  is pinned to an SDK that is no longer installed — clear the cache and
  reconfigure (`build_and_run.bat` does this automatically).
- Do not loosen the sketch `<iframe>` sandbox or change the server bind address
  from `127.0.0.1` without explicit reason — see the security notes in
  [AGENTS.md](./AGENTS.md).
