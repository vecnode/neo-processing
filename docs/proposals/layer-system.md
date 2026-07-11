# Proposal: multi-layer sketches (tabs + compositing)

Status: **Phases 1-2 implemented** (2026-07-11) - multi-session tabs, and
stacked/composited layers (visibility, reorder, hidden layers actually
pausing). Phases 3-5 (capture/record compositing rework, polish, sound
broadcast) are still proposal-only - note Sound/Anchor broadcasts actually
landed early, as part of Phase 2, since per-layer running state required
touching those call sites anyway. The "Open questions" section below has
been resolved - see "Decisions" at the end.

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
   via CSS z-index; Layers panel controls visibility/order (Up/Down buttons,
   not drag-and-drop - see the note under Phase 4). Hidden layers pause via
   `noLoop()`/`loop()` (verified: a self-reporting test sketch went from 15
   frames/300ms to 0 new frames after hiding, back to 18 frames/300ms after
   showing again). Capture/Record scoped to "active layer only", documented
   in the Capture panel's hint text and here.
3. **Capture/record compositing rework.** The `capture-frame` protocol above;
   Capture PNG and Record both operate on the full composite.
4. **Polish.** Per-layer opacity (cheap - CSS `opacity` on the iframe
   wrapper, no canvas work needed). Real drag-and-drop reordering, if the
   Up/Down buttons from Phase 2 turn out not to be enough - they were chosen
   over HTML5 drag-and-drop for lower implementation risk, not because
   drag-and-drop was ruled out.
5. **✅ Sound broadcast (done, landed early with Phase 2).** `AGENTS.md`
   updated. Security-review note: no new capability crosses the sandbox
   boundary - it's just more instances of the same `sandbox="allow-scripts"`
   iframe pattern already in the app, and the postMessage payloads
   (`layer-set-visible`, `audio-set`, `set-anchor`) are all booleans/floats/
   fixed strings, same shape as before.

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
