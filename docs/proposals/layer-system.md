# Proposal: multi-layer sketches (tabs + compositing)

Status: **Phases 1-4 implemented** (2026-07-11). The "Open questions"
section below has been resolved - see "Decisions" at the end.

Also implemented alongside Phase 2 (not originally scoped there, but became
necessary once layers actually composited): **each layer is now sized to
its own sketch's `createCanvas()` call** instead of being stretched to fill
`.right-panel`. Layer iframes are absolute-positioned at their reported
canvas size (`positionLayerIframe()`/`layerController`'s `canvas-size`
reports), anchored per the Sketch panel's Center/Top Left setting -
otherwise two differently-sized layers couldn't actually composite as
distinct shapes, they'd just both stretch to the same rectangle.

**Verification caveat on Phase 3:** the compositing *protocol* (request/
response `capture-frame` messages, correct `requestId` matching, correct
per-layer size/position math, no runtime errors) was verified end-to-end in
the running app. The actual *pixel output* of a captured/recorded composite
could not be verified in this session's automated browser test harness -
`canvas.getImageData()`/`toDataURL()` consistently returned blank
(`[0,0,0,0]`) data whenever the test tab's `document.visibilityState` was
`"hidden"` (which it was for the whole session, including in a freshly
opened tab with no other code involved - a plain p5 sketch in a bare
iframe showed the same blank-readback behaviour). This reads as a
Chromium canvas-GPU-readback-needs-compositor-focus issue specific to the
test tooling, not the app - a real screenshot taken earlier in the same
session *did* show the on-screen composite rendering correctly, and
on-screen rendering and `getImageData()` readback are different code paths
in Chromium. **Recommend a human verify Capture PNG / Record actually
produce correct composited output in the real running app before relying on
this.**

## Goal

Today the app runs exactly one sketch: one `<iframe>` in `.right-panel`, with
`sketchBg` painted behind it. This proposal generalises that into a small
compositing stack:

- **Layer 0** - the existing background colour (`sketchBg`, Sketch panel's
  colour picker). Not a sketch - no code runs on it, no fixed size, it just
  stretches to fill `.right-panel` (including fullscreen). It's the base
  fill behind everything else.
- **Layer 1..N** - one running sketch per layer, each its own tab in a new
  tab strip above the code editor, stacked in `.right-panel` in a chosen
  order, composited together. Each layer is sized to *its own* sketch's
  `createCanvas()` call - no forced project-wide canvas size - defaulting to
  400x400 if a layer's sketch never calls `createCanvas()`.

UI changes requested:
1. A tab bar above the Ace editor - one tab per layer/sketch.
2. The bottom row splits in half: terminal keeps the left side, a new
   **Layers** panel takes the right side (list layers, toggle visibility,
   reorder, stop individual layers).

## Editor: tabs

Ace supports multiple `EditSession`s on one `Editor` instance - switching
sessions (not swapping text in one session) is the right primitive, since it
preserves each tab's undo history, cursor position, and scroll position.
Add a tab strip (`+` to add, `x` to close, double-click to rename) above
`#ace-editor`; `aceEditor.setSession(layer.session)` on tab switch.

Data model sketch (in `script.js`):

```js
// One entry per layer (tabs 1..N - layer 0 is just sketchBg, not in this list)
let layers = [
  {
    id, name,              // "Layer 1", user-renameable
    session,               // ace.EditSession - owns the code + undo history
    iframe: null,          // the running <iframe>, or null if stopped
    visible: true,
    running: false,
  },
  // ...
];
let activeLayerId = layers[0].id; // which tab's session is in the editor
```

## Compositing in `.right-panel`

Each layer's iframe is absolutely positioned, filling `.right-panel`, stacked
by `z-index` in layer order - same `sandbox="allow-scripts"` (no
`allow-same-origin`) as today, one iframe per layer. `.right-panel` itself
gets `background: var(--sketch-bg)` and layer iframes get a transparent CSS
background so lower layers show through *where the layer above doesn't paint
anything opaque*.

**This only composites visually if each layer's sketch cooperates** - a
sketch that calls `background(20)` (opaque) every frame will fully occlude
everything below it within its own canvas bounds, same as any layered tool
(Photoshop, TouchDesigner, etc.). The app can't force this; it can only:
- default new layers' canvas CSS to transparent (no unwanted opaque box),
- document the convention (use `clear()` or an alpha `background()` call for
  layers meant to composite),
- maybe lint/hint on `background(` with no alpha in a non-layer-0 sketch (a
  nice-to-have, not required for v1).

**Canvas size**: each layer sizes itself to its own sketch's `createCanvas()`
call (default 400x400 if unset) - no forced project-wide size. Layer 0 has
no size of its own; it stretches to fill `.right-panel` (fullscreen-capable,
same as today's `sketchBg` behaviour). Layers of differing sizes stack using
the existing Sketch-panel anchor setting (Center/Top Left), same as today's
single-sketch behaviour - a 300x300 layer and a 600x600 layer both anchor
the same way, they just don't pixel-align edge-to-edge. That's an accepted
tradeoff of not forcing one canvas size.

## Capture & recording rework (the biggest item)

Today's `captureController` captures *the* canvas inside *the* iframe. With
N layers, Capture PNG / Record need the **composite**, and the parent cannot
reach into a sandboxed, opaque-origin iframe's canvas directly (no
`allow-same-origin` - same restriction already documented for the current
single-layer capture path).

New protocol: each layer's `captureController` gets a `capture-frame`
message that snapshots its canvas to an `ImageBitmap` and posts it back
`transfer`red (cheap, no copy). The parent:
1. On Capture PNG / each recording tick, requests a frame from every
   *visible* layer, in z-order.
2. Draws them onto one offscreen canvas, starting with the layer-0 fill
   colour, then each layer's bitmap on top.
3. Encodes/streams that composite exactly like the current single-canvas
   path (`toBlob('image/png')` / `MediaRecorder` off an offscreen canvas
   stream) - so `/api/save-media` and `outputs/` don't need to change.

This is a real rework of the capture pipeline, not an additive change -
scoped as its own phase below.

## Sound

**Done.** `applyAudioState()` iterates all layer iframes and posts to each -
master on/off + volume stays a single global control across all layers
(per-layer volume is a possible future add, not v1).

## Run/Stop semantics

- Top-bar Run/Stop act on the **active tab's** layer (start/stop that one
  iframe), matching today's single-Run mental model per tab.
- The new Layers panel lists every layer with its own visibility toggle and
  a per-layer Stop button, plus (maybe) a "Stop All".
- Closing a tab stops its layer and removes it from the panel.

## Layout changes

- New tab strip component above `#ace-editor` (mirrors `.menu-list`/segmented
  button styling already in the app, not a new visual language).
- `.bottom-row` becomes two columns via a new vertical splitter (same pattern
  as the existing `.h-splitter`, just oriented for this split): left =
  existing `#terminal`, right = new `#layers-panel` (swatch/name, eye-icon
  visibility toggle, drag handle for reorder, per-layer Stop).

## Phased plan

1. **✅ Tabs, no compositing (done).** Multi-session editor, add/close/rename
   tabs. Only the active tab's layer renders (today's single-iframe
   behaviour, just switchable) - proves the editor-side data model before
   touching `.right-panel`.
2. **✅ Stacking + visibility/reorder (done).** Multiple iframes composited
   via CSS z-index, each sized/positioned to its own sketch's canvas (see
   the note above the phase list). Layers panel controls visibility/order
   (Up/Down buttons, not drag-and-drop - see the note under Phase 4). Hidden
   layers pause via `noLoop()`/`loop()` (verified: a self-reporting test
   sketch went from 15 frames/300ms to 0 new frames after hiding, back to 18
   frames/300ms after showing again).
3. **✅ Capture/record compositing rework (done, see verification caveat
   above).** Each layer's `captureController` now only handles
   `capture-frame` (snapshot -> transferred `ImageBitmap`); the parent's
   `buildCompositeCanvas()` requests one from every visible layer, draws
   each at its on-screen position/size/opacity onto one canvas starting
   with the layer-0 fill colour. `capturePng()` uses this directly; Record
   now runs an entirely parent-side `MediaRecorder` fed by repeated
   composites (`pumpCompositeRecording()`), replacing the old per-iframe
   recorder - no more per-layer `record-start`/`record-stop` messages.
4. **✅ Polish - per-layer opacity (done).** A 0-1 range input per layer row
   sets `layer.iframe.style.opacity` live (visible immediately, not just in
   captures) and is read by `buildCompositeCanvas()` via `ctx.globalAlpha`.
   Real drag-and-drop reordering is **not** done - Up/Down buttons from
   Phase 2 remain the reorder UI. Not ruled out, just not needed yet; revisit
   if Up/Down turns out to be too slow for real use.
5. **✅ Sound broadcast (done, landed early with Phase 2).** `AGENTS.md`
   updated. Security-review note: no new capability crosses the sandbox
   boundary - it's just more instances of the same `sandbox="allow-scripts"`
   iframe pattern already in the app, and the postMessage payloads
   (`layer-set-visible`, `audio-set`, `capture-frame`/`capture-frame-result`)
   are all booleans/floats/fixed strings, or (for `capture-frame-result`) a
   transferred `ImageBitmap` of the layer's own already-rendered canvas -
   not a new capability, just how the pixels leave the sandbox.

## Decisions (resolved 2026-07-11)

- **Canvas size**: no project-wide size. Layer 0 stretches to fill
  `.right-panel` (fullscreen-capable) and has no code/size of its own.
  Layers 1..N each size to their own sketch's `createCanvas()`, defaulting
  to 400x400 if unset.
- **Hidden layers**: stop processing (pause the draw loop via `postMessage`,
  not just CSS-hidden) - caps CPU cost as designed.
- **Max layer count**: hard cap of **5** layers (layer 0 + up to 5 running
  sketches). Lowered from an initial 10 (2026-07-11) - can be raised later
  once compositing/perf is proven out.
- **Per-layer Libraries/Import JS Library**: global for now, not per-layer.
- **Persistence**: not for now - layers/tabs don't survive an app restart,
  matching today's behaviour.
