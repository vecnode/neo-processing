# Proposal: multi-layer sketches (tabs + compositing)

Status: **proposal only** - not implemented. This is a design for review, in
the same spirit as `docs/proposals/sound-section.md`.

## Goal

Today the app runs exactly one sketch: one `<iframe>` in `.right-panel`, with
`sketchBg` painted behind it. This proposal generalises that into a small
compositing stack:

- **Layer 0** - the existing background colour (`sketchBg`, Sketch panel's
  colour picker). Not a sketch, just the base fill behind everything.
- **Layer 1..N** - one running sketch per layer, each its own tab in a new
  tab strip above the code editor, stacked in `.right-panel` in a chosen
  order, composited together.

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

**Canvas size**: for stacking to align, every layer's `createCanvas()` should
agree on one size. Proposing a project-level canvas size (surfaced in the
Sketch panel, defaulting to today's implicit convention e.g. 400x400) rather
than leaving it implicit - an open question below.

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

`applyAudioState()` currently posts to one `sketchFrame`. Change to iterate
all layer iframes and post to each - master on/off + volume stays a single
global control across all layers (per-layer volume is a possible future
add, not v1).

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

1. **Tabs, no compositing.** Multi-session editor, add/close/rename tabs.
   Only the active tab's layer renders (today's single-iframe behaviour,
   just switchable) - proves the editor-side data model before touching
   `.right-panel`.
2. **Stacking + visibility/reorder.** Multiple iframes composited via CSS
   z-index; Layers panel controls visibility/order. Capture/Record
   temporarily scoped to "active layer only" with a clear, documented
   limitation.
3. **Capture/record compositing rework.** The `capture-frame` protocol above;
   Capture PNG and Record both operate on the full composite.
4. **Polish.** Per-layer opacity (cheap - CSS `opacity` on the iframe
   wrapper, no canvas work needed), drag-to-reorder UX, hidden layers
   actually pausing (`postMessage` pause/resume to their `captureController`
   loop) rather than just being CSS-hidden, to cap CPU cost.
5. **Sound broadcast + docs.** Multi-layer audio, `AGENTS.md` updates, and a
   security-review note - no new capability crosses the sandbox boundary,
   it's just more instances of the same `sandbox="allow-scripts"` iframe
   pattern already in the app.

## Open questions

- **Canvas size**: fixed project-wide default, or a control in the Sketch
  panel? Leaning toward the latter (small width/height fields, defaulting to
  400x400) so layers can actually align.
- **Hidden layers**: pause their draw loop (recommended, caps CPU) or keep
  running silently? Proposing pause via `postMessage`.
- **Max layer count**: no hard cap initially, but N layers = N independent
  `requestAnimationFrame` loops + N p5 instances - likely want a soft
  warning past some count (e.g. 6-8) rather than a hard limit.
- **Per-layer Libraries/Import JS Library**: global (one p5 build / one
  imported library for all layers, matching today) for v1, or per-layer
  later? Recommending global for v1 - simpler, and most layered-sketch use
  cases share one p5 build anyway.
- **Persistence**: should the tab/layer set survive an app restart? Out of
  scope v1 - matches today's behaviour (nothing persists beyond explicit
  File > Save to `outputs/`).
