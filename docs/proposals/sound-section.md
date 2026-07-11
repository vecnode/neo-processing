# Proposal: "Sound" side-panel section

Status: **proposal only** - not implemented. This is a design for review, in the
same spirit as `AGENTS.md`'s existing sections on Capture/Libraries.

## Problem

Sketches can already produce audio (raw Web Audio API, or p5.sound if the user
brings it in via `libraries.json` or the new "Import JS Library" button), but
there is no app-level control over it: no way to mute all sketch audio, and no
master volume. For full-screen/kiosk-style deployment (the project's stated
goal) an operator needs a single, reliable ON/OFF and a master level that
works regardless of what audio API a given sketch happens to use.

## User-facing design

A new `panel-section` titled **Sound**, placed after **Sketch** and before
**Libraries** (it's a sketch-output setting like Sketch/Capture, not a library
concern):

```
Sound
  [ Off | On ]      <- segmented toggle, same visual pattern as the
                       Sketch section's anchor toggle (Center/Top Left)
  Master  [====================o]   0.00-1.00, step 0.01
  "Sketch audio is muted by default. Turn it on to hear output; browser
   autoplay policy may require a click inside the sketch before sound starts."
```

- Defaults to **Off** - a silent-by-default app is the safer default for
  unattended/full-screen installs, and matches "let the user turn audio *on*"
  in the request.
- The Master slider is enabled/disabled visually in step with the toggle, but
  its value is retained even when muted (matches the existing Sketch
  background-colour control, which keeps its value across anchor changes).

## Why a master gain node, not per-library hooks

The app doesn't control which audio API a sketch uses - p5.sound, raw
`AudioContext`, or something an imported library brings in. Hooking every
possible library individually doesn't scale. Instead, patch the audio
*destination*, once, generically:

1. Inject a small controller (same pattern as `captureController` in
   `script.js`, prepended into the sketch iframe's `srcdoc` before the sketch
   code) that wraps `window.AudioContext` (and `webkitAudioContext` for older
   WebKitGTK):
   ```js
   (function () {
     var RealAC = window.AudioContext || window.webkitAudioContext;
     if (!RealAC) return; // no Web Audio in this webview - Sound section no-ops
     var masterGain = null;
     function patched() {
       var ctx = new RealAC(...arguments);
       masterGain = ctx.createGain();
       masterGain.gain.value = 0; // starts muted; parent pushes real state below
       masterGain.connect(ctx.destination);
       // Redefine `destination` so anything the sketch connects to it
       // (oscillator.connect(ctx.destination), p5.sound's master bus, etc.)
       // actually lands on our gain node instead of the real output.
       Object.defineProperty(ctx, 'destination', { get: function () { return masterGain; } });
       return ctx;
     }
     patched.prototype = RealAC.prototype;
     window.AudioContext = window.webkitAudioContext = patched;
     window.addEventListener('message', function (event) {
       var data = event.data || {};
       if (data.type === 'audio-set-enabled' || data.type === 'audio-set-volume') {
         if (masterGain) {
           masterGain.gain.value = data.enabled === false ? 0 : (data.volume != null ? data.volume : masterGain.gain.value);
         }
       }
     });
   })();
   ```
   (Sketch/proof-of-concept form - see Open questions below for the two-message
   vs one-message API choice.)
2. `script.js` keeps `audioEnabled` / `audioMasterVolume` state exactly like
   `sketchBg`/`sketchAnchor`: baked into the initial gain value when
   `runSketch()` builds the `srcdoc`, and pushed live via
   `sketchFrame.contentWindow.postMessage(...)` when the toggle or slider
   changes while a sketch is running (same live-update pattern
   `applySketchBg()` already uses).

This means **no changes to `libraries.json` or the capture pipeline** are
needed, and it works whether the sketch uses p5.sound, plain Web Audio, or an
imported library - because they all eventually reach `AudioContext.destination`.

## Security

No new capability crosses the sandbox boundary: the postMessage payload is a
boolean and a 0-1 float, and the iframe stays `sandbox="allow-scripts"` with
no `allow-same-origin`, exactly as today. The parent cannot read or capture
sketch audio (no `allow-same-origin` means no cross-frame audio graph
introspection either) - this proposal is output-side muting/leveling only.

## Open questions / follow-ups (not blocking, but worth deciding before build)

- **Autoplay policy.** Browsers (Chromium/WebKit) require a user gesture
  before audio plays. The Run button click happens in the *parent* document;
  it does not automatically count as a gesture inside the freshly-created
  sandboxed iframe. First cut: document the limitation (a click inside the
  sketch canvas unlocks audio, same as any web page). If that's not
  acceptable for kiosk use, a follow-up could auto-resume the `AudioContext`
  from the `set-anchor`/`set-bg` style postMessage handshake that already
  fires right after Run, though this may still be blocked by policy without a
  genuine gesture.
- **Recording integration.** `captureController`'s WebM recording is
  video-only today (canvas frames via `drawImage`). A future extension could
  merge a `masterGain` tap (`createMediaStreamDestination()`) into the
  recorded stream so captured video has audio - out of scope for this
  proposal, but the master-gain design leaves the door open since it's a
  single, well-known node to tap.
- **Volume curve.** Linear 0-1 gain (as requested) is simplest and matches
  the ask. Human loudness perception is closer to logarithmic; if the linear
  slider feels front-loaded in testing, a follow-up could map the slider
  through a perceptual curve before writing `gain.value`.
- **WebKitGTK coverage.** Like `MediaRecorder` (already a known limitation in
  `AGENTS.md`), Web Audio support varies by WebKitGTK version. The controller
  should no-op cleanly (as sketched above) rather than throw when
  `AudioContext` isn't available.
