# Security Policy

neo-processing is a native, cross-platform C++ desktop application that embeds a
system WebView to run a JavaScript (p5.js) editor and runtime. This document
explains how security is handled, what is in scope, and how to report a
vulnerability. It is intended to evolve as the project's threat model does.

## Supported Versions

Security fixes are applied to:

- the `main` branch (active development), and
- the latest tagged release (currently the `0.1.x` line).

Older versions do not receive security fixes. Please upgrade to the latest
release before reporting an issue.

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Instead, report privately through **GitHub's private vulnerability reporting**:

1. Go to the repository's **Security** tab → **Report a vulnerability**
   (Security Advisories), or open:
   <https://github.com/vecnode/neo-processing/security/advisories/new>
2. Describe the issue with enough detail for us to reproduce it.

Please include, where possible:

- A description of the issue and the component affected.
- Steps to reproduce, and a minimal proof-of-concept if you have one.
- The impact you have identified (what an attacker could achieve).
- Your environment: OS and version, compiler/toolchain, WebView runtime
  (WebView2 / WebKitGTK) version, and how you built or obtained the app.

Avoid including real secrets, personal data, or anything sensitive in your
report. We aim to acknowledge new reports within **5 business days** and to
provide an initial assessment shortly after; timelines vary with severity and
complexity. We will keep you informed as a fix is developed, and we are happy to
credit reporters who wish to be named.

## Scope

This policy covers:

- The C++ application in this repository (`src/`) and its build scripts
  (`CMakeLists.txt`, `build_and_run.*`).
- The embedded frontend shipped in the binary (`public/`), including the editor,
  the sketch runner, and the local HTTP server contract.
- The default configuration, bundled assets, and example sketches.

It does **not** cover:

- Third-party JavaScript libraries a user chooses to load at runtime (e.g. from a
  CDN), or future support for swapping the p5.js version online.
- User-authored sketches/scripts and any content they load.
- Forks or downstream redistributions of this project.
- Vulnerabilities solely within the OS-provided WebView runtime
  (WebView2 / WebKitGTK) — please report those to the respective vendor — though
  we will adjust our integration when it can mitigate an issue.

## Security model

A few design decisions form the backbone of the app's security posture. Changes
that weaken them should be treated as security-relevant:

- **Loopback only.** The embedded HTTP server binds to `127.0.0.1` on an
  OS-assigned port. It is never exposed on `0.0.0.0` or a routable interface, so
  it is not reachable from other hosts.
- **Sandboxed sketches.** User sketches run inside an `<iframe>` with
  `sandbox="allow-scripts"` and **no** `allow-same-origin`, giving them an opaque
  origin. They cannot read cookies/storage, reach the parent document, or call
  the local HTTP API. Recording/screenshot capture happens inside that sandbox
  and only finished bytes cross the boundary via `postMessage`.
- **Constrained server endpoints.** Request bodies are size-capped and requests
  are time-bounded. Saved files use server-generated names; the only
  client-supplied value (a media file extension) is sanitised to lower-case
  alphanumerics and checked against an allow-list, so the client never controls a
  path on disk.
- **Offline-first.** The frontend and p5.js are embedded into the binary and
  served locally; nothing is fetched from the network at runtime by default.

See [AGENTS.md](./AGENTS.md) for the detailed architecture and HTTP contract.

## Best practices for users

Because neo-processing executes user-provided JavaScript inside a WebView:

- Only open sketches and projects from sources you trust.
- Treat a sketch like any other program — review code before running it,
  especially anything that loads third-party libraries.
- Be cautious if you enable future options that fetch libraries over the network.

## Best practices for maintainers

- Keep the JS↔C++ surface minimal; validate and bound everything that crosses it.
- Do not expose direct file system, network, or process-control APIs to sketch
  code.
- Preserve the sandbox (`allow-scripts` only) and the loopback bind address.
- Keep dependencies — including the WebView runtime and fetched libraries —
  reasonably current.

## Handling and disclosure

When a vulnerability is confirmed:

1. A fix is developed privately (a private branch or a GitHub Security Advisory).
2. A patched release is published where appropriate.
3. Release notes reference the fix without exploit details until users have had a
   reasonable chance to update. For severe or actively exploited issues, details
   may be withheld longer.

## Platform considerations

neo-processing targets Windows and Linux today (macOS is partially wired up).
Security behaviour should be consistent across platforms where practical, and
platform-specific mitigations may be used when they improve security without
breaking portability. If you find a platform-specific issue (for example, one
that only occurs under a particular windowing system or WebView runtime), please
note that in your report.
