# Charge–light matching: a "true detector frame" view (design brainstorm)

> Status: **Option B implemented** (side-by-side panel). The original brainstorm
> (both options) is kept below for context; see §11 for what shipped and how to
> build it locally.
> Scope: must work generally across multi-drift-volume detectors —
> **SBND**, **ProtoDUNE-HD** (horizontal drift), and **ProtoDUNE-VD** (vertical drift).

## 1. Problem

In the Bee charge–light matching view, charge clusters are drawn at their fixed
reconstructed positions, and a **red detector box per TPC** is shifted along the
drift direction by the flash time `t` (T0). The shift is computed in
`events/static/js/bee/physics/op.js`:

```js
let sx = exp.center(iTPC)[0] + driftV*t*exp.driftDir(iTPC); // op.js:51
boxhelper.position.set(...exp.toLocalXYZ(sx, exp.center(iTPC)[1], exp.center(iTPC)[2]));
```

When `t` is the correct T0 for a flash, the box lines up with the clusters that
produced that flash. The user reads the match by stepping flashes (`<` / `>`).

This works adequately for a single drift volume. It breaks down for detectors
with **two (or more) drift volumes that drift in opposite directions** away from a
shared cathode:

- For some T0 the two boxes **separate far apart** → you cannot tell whether a
  track is actually continuous across the real cathode boundary.
- For another T0 the two boxes **overlap** → you cannot tell which cluster belongs
  to which box, nor how a track crosses the cathode.

This is not an SBND quirk. **Every detector in scope has this opposing-drift
topology**, and — importantly — in the Bee data convention they share the *same*
geometry (see §3): drift along X, cathode at x ≈ 0.

**Root cause:** the moving-box scheme expresses T0 in the *reconstruction frame*,
where opposing volumes anchor to anodes on opposite outer faces. As T0 grows the
two reconstructed-anode boxes necessarily move apart (or cross) — the real,
physically-adjacent cathode boundary at x ≈ 0 is never preserved.

## 2. The key idea — invert the representation (the "true detector frame")

The current and proposed schemes are exact **duals**:

| | Boxes | Clusters |
|---|---|---|
| **Current (reco frame)** | move by `+driftV·t·driftDir` (along data-X) | fixed |
| **Proposed (detector frame)** | **fixed at real location** | move by `−driftV·t·driftDir` (along data-X) |

In the **true detector frame**, the red boxes stay **permanently at their real
detector positions**, so the two drift volumes remain **adjacent at the cathode
(x ≈ 0)** forever. The clusters are T0-corrected back toward their true positions:

- A genuine through-going track **snaps together across the cathode** at the
  correct T0.
- Clusters with the wrong T0 fall **outside** their box.

Both of the user's problems disappear, because the geometry is anchored to the real
detector — there is no divergence and no overlap by construction. It is also the
physically honest picture: the detector is fixed; the charge is what the unknown T0
mis-placed.

## 3. Why this is already general — the geometry is uniform in data coordinates

Reading the actual `tpc.location` arrays in `experiment.js`, all three target
detectors share the **same drift convention in Bee data coordinates**: drift along
**X**, with the opposing-drift **cathode at x ≈ 0**.

| Detector | class / `nTPC()` | TPC x-ranges (cm) | Cathode gap (x) | `driftDir(i)` |
|---|---|---|---|---|
| SBND | `SBND` / 2 | `[-202.05,-1.5]`, `[1.5,202.05]` | `[-1.5, 1.5]` | 0:−1, 1:+1 |
| ProtoDUNE-HD | `ProtoDUNEHD` / 4 | left `[-352.95,-1.00]`, right `[0.80,352.75]` (×2 Z-layers) | ≈ `[-1.0, 0.8]` | 0,2:−1; 1,3:+1 |
| ProtoDUNE-VD | `ProtoDUNEVD` / 8 | left `[-313.03,-3.03]`, right `[3.03,313.03]` (×Y,Z subdivisions) | `[-3.03, 3.03]` | parity ±1 |

Base `driftDir(i) = ((i%2)-0.5)*-2` → ±1 (`experiment.js:51`). In every case the
sign lines up with the side of the cathode: **left of x≈0 → −1, right → +1**.

### The ProtoDUNE-VD subtlety (do not over-engineer this)

ProtoDUNE-VD is *physically* a vertical-drift detector, but **that verticality is
not in the data** — it is a **display-only** transform: `Scene3D.rotateVDScene`
rotates the entire scene 90° about Z when `name.includes('vd')`
(`scene.js:33-44`). The T0 math in `op.js` operates on data-**X** for *every*
detector, VD included, and the scene rotation then presents that as vertical.

**Consequence:** the detector-frame inversion can operate on the **same data-X**
the current code uses, and it **inherits the VD scene rotation for free**. We do
**not** need a new per-TPC drift-axis abstraction (`driftAxis`/`driftVec`) to cover
these three detectors. The single generic primitive we need is the **cathode plane
coordinate** (≈ x=0) used to partition cathode-crossing clusters (§4).

> If a future detector ever stores a non-X drift in data coordinates, *then* a
> `driftAxis(i)`/`driftVec(i)` accessor would be warranted. For SBND / HD / VD it
> is unnecessary — flagging it would be premature generality.

## 4. The correctness trap (applies to all three detectors)

A single cluster that **crosses the cathode** must be shifted **per-point by which
drift volume each point is in**, *not* as one rigid group. If shifted as a group,
the two halves move together and never reconnect.

General rule: a point's drift sign is `sign(x − x_cathode)` with `x_cathode ≈ 0`
for all three detectors — i.e. **left of the cathode shifts by −(−driftV·t)·… and
right by the opposite**. Concretely, the detector-frame shift of a charge point is:

```
x' = x − driftV · t · sign(x − x_cathode)      // x_cathode ≈ 0
```

which equals `x − driftV·t·driftDir(tpc_of_point)` because `driftDir` already
matches the side of the cathode. Partition each cluster's points once by
`sign(x − x_cathode)`, then translate each side by its own amount.

Through-going tracks are often already split into one cluster per TPC, but the
display **must not assume this** — partition by position, not by `cluster_id`.

To stay clean, add one small accessor rather than hardcoding `0`:

- `cathodeX()` (or `cathodeCoord()`) → the x of the shared cathode (≈0; exact value
  per detector from the gap midpoint above). This is the *only* new geometry helper
  the feature needs for SBND / HD / VD.

## 5. "Is it slow?" — gate on the right cost

The arithmetic is **cheap**: the per-point shift is one add per point along X.
After a one-time O(N) partition of points by cathode side, each T0 change is an
O(1) group translation — the same cost as moving the box today. Drift correction is
**not** the expensive part.

The real cost is **maintaining and rendering a second scene/viewport** (duplicated
cluster geometry, recon overlays, PMT circles, an extra render pass). So if anything
is hidden behind an "enable" switch, gate it on the **second-scene cost**, not on
the correction math.

## 6. Recommended approach — document both; default to the in-place toggle

### Option A — In-place frame toggle (lightweight, recommended default)

Add a **"Matching frame"** toggle in the Optical Flash GUI folder that switches the
main view between:

- `reco` — today's behavior (clusters fixed, boxes move), and
- `detector` — new (boxes fixed at real location, clusters T0-corrected on data-X).

This **eliminates** the divergence/overlap problem with **no second scene**. On a
T0 change in `detector` mode, translate the per-volume cluster groups instead of the
boxes. No extra render budget. Works identically for SBND / HD / VD because the
shift uses the same data-X convention and inherits VD's scene rotation.

### Option B — Side-by-side panel (the original idea, gated)

Keep the current view and add a **second viewport** showing the true detector frame
for simultaneous comparison. Preferred implementation: **one renderer split via
`setViewport` / `setScissor`** (Three.js supports multiple viewports per renderer)
rather than a second `WebGLRenderer`/WebGL context — cheaper and reuses existing
renderer/camera machinery. This panel is the part worth hiding behind an "enable"
switch, since it duplicates scene geometry and adds a render pass.

**Recommendation:** ship Option A first (it solves the stated problem cheaply and
generally); add Option B only if simultaneous reco-vs-detector comparison is
actually wanted.

### Tradeoffs

| | A: in-place toggle | B: side-by-side panel |
|---|---|---|
| Solves divergence/overlap | ✅ | ✅ |
| Simultaneous reco-vs-detector compare | ❌ (one at a time) | ✅ |
| Second scene / render cost | none | yes → gate behind enable |
| Implementation size | small | medium |
| Works for SBND / HD / VD | yes (same data-X) | yes (same) |

## 7. Light display (measured vs predicted)

Reuse the **existing PMT/X-Arapuca circle rendering** in `op.js` (measured = red,
predicted = green, radius ∝ √PE). In the detector frame the optical detectors are
drawn at their **fixed real positions** — i.e. **drop the `sox` drift shift**
(`op.js:61,108,137,163`), don't add to it. The status bar already reports flash
time and total PE.

*Optional follow-up (out of core scope):* a small per-PMT or total-PE
measured-vs-predicted bar/scatter to judge match quality numerically. Note as future
work; don't block the main feature on it.

## 8. Files involved (for the eventual implementation)

- `events/static/js/bee/physics/experiment.js` — **add** one helper: `cathodeX()`
  (≈0; per-detector exact value from the gap midpoint). Reuse `driftDir`, `center`,
  `halfXYZ`, `tpc.location`, `toLocalXYZ`. **No** new drift-axis abstraction needed.
- `events/static/js/bee/physics/op.js` — in `detector` frame, draw the box fixed
  (no shift) and PMTs at fixed real positions; current shift logic lives in
  `draw()` (`:51`, `:61`, `:108`, `:137`, `:163`).
- `events/static/js/bee/physics/sst.js` — partition cluster points by cathode side
  (`sign(x − cathodeX)`) and translate each group by `−driftV·t·driftDir` on X when
  in `detector` frame. Entry points: `initData`, `drawInsideBox`,
  `drawInsideThreeFrames`.
- `events/static/js/bee/store.js` — add `config.op.matchFrame` (`'reco'|'detector'`),
  and (Option B) a `config.op.sidePanel` enable flag.
- `events/static/js/bee/gui.js` — add the toggle(s) in `initGuiOP`.
- `events/static/js/bee/scene.js` — Option B only: viewport/scissor split; note
  interaction with existing `setReverseDrift` / `rotateVDScene` (the detector-frame
  shift is in data-X and composes with both).
- `events/static/js/bee/dispatcher.js` — optional hotkey to flip frame.

## 9. Verification (when implemented)

- **SBND / ProtoDUNE-HD:** load an event with a known through-going cathode-crosser,
  switch to detector frame, step T0 (`<`/`>`); confirm the two halves reconnect at
  x≈0 at the matching flash while both boxes stay adjacent.
- **ProtoDUNE-VD:** repeat and confirm the correction is applied correctly *with*
  `rotateVDScene` active — i.e. it presents as a vertical reconnection on screen
  while the data-X math is unchanged. **Verify** the assumption that VD stores drift
  along data-X (high confidence: cathode gap is at x≈0 and verticality is the scene
  rotation, but confirm on a real VD event).
- Confirm the `reco` toggle reproduces today's exact behavior (no regression).

## 10. Open questions for the implementer

1. **ProtoDUNE-HD grouping:** 4 LArSoft TPCs = 2 physical drift volumes (left/right)
   × 2 Z-layers. Partitioning by `sign(x − cathodeX)` already handles this correctly
   regardless of Z-layer — confirm no per-layer special-casing is needed.
2. **ProtoDUNE-VD data convention:** confirm drift is along data-X (verticality =
   scene rotation only). If a real VD event ever stores drift along Y in data, the
   design must add `driftAxis(i)`/`driftVec(i)`; otherwise keep it out (§3).
3. **Composition with scene transforms:** the detector-frame shift is defined in
   global/local data coordinates and should compose cleanly with `reverseDrift`
   (X-scale flip) and `rotateVDScene` (90° about Z) since those are scene-level
   transforms applied after — verify on each detector.

## 11. Implementation status — Option B shipped

**Option B (side-by-side panel) is implemented.** A new **"Side Panel (detector
frame)"** toggle in the *Optical Flash* GUI folder splits the canvas into two
viewports sharing one camera: the **left** panel is the existing reco frame
(clusters fixed, red boxes move with T0) and the **right** panel is the true
detector frame (red boxes fixed at their real location, charge T0-corrected by the
exact dual shift). Toggle it off → the original full-screen behavior is restored
exactly.

Changed files (front-end ES-module source under `events/static/js/bee/`):

| File | Change |
|---|---|
| `physics/experiment.js` | `tpcOf(gx,gy,gz)` — maps a point to its containing TPC so the per-point shift is the exact dual of the `op.js` box shift (correct for SBND / HD / VD by construction; no `cathodeX` needed). |
| `store.js` | `config.op.sidePanel` flag. |
| `physics/op.js` | Extracted `buildGroup(group, detectorFrame)`; `draw()` builds the reco group into `scene.main` and, when the panel is on, a fixed-box group into `scene.detector`. |
| `physics/sst.js` | `drawInsideBox(...)` gained optional `targetScene` + `shiftFn`; added `drawDetectorFrame()` / `clearDetectorFrame()` (uses a separate `pointCloudDetector` handle). |
| `scene.js` | New `scene.detector` (wired into `setReverseDrift`, `rotateVDScene`, auto-rotate); split-view clone cameras + `_syncSplitCamera`; left/right `setViewport`/`setScissor` render pass. |
| `gui.js` | The toggle in `initGuiOP`. |

## 12. Building & running locally — and why that is *not* "deploying to the server"

The browser does **not** load these `.js` source files directly. It loads a
**Parcel bundle** (`events/static/js/bee/dist/bee.js`, referenced from
`events/templates/events/event.html`). `dist/` is **git-ignored**, so the bundle is
a local build artifact that is never committed. **Any edit to the source above has
no effect until you rebuild the bundle.**

**Build locally** (what makes your edits show up on *your* machine):

```bash
cd events/static/js/bee
npm install                                                  # first time only
npx parcel build --no-source-maps --public-url ./ bee.js wires-vue.js
```

This regenerates `dist/bee.js`. With the Django dev server already running
(`python manage.py runserver`), just **hard-refresh** the browser (the ES-module
bundle is cached) and the side panel appears. The `--public-url ./` flag keeps the
`three.min.js` reference relative so it does not 404 (see commit *fix three.min.js
404 on server deployment*). The canonical steps live in
[`docs/local-setup.md`](local-setup.md) (steps 7–8).

**This is distinct from deploying to the server.** Building locally only writes
`dist/` on your workstation. Deploying means publishing the app (and a freshly
built `dist/`) to the hosting server — a separate operation (e.g. `collectstatic`
into `STATIC_ROOT` and syncing to the BNL host), under its own
production `STATIC_URL`. Rebuilding locally never touches the server; conversely a
server deploy must run its **own** Parcel build because `dist/` is not in git.
