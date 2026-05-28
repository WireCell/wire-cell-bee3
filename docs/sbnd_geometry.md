# SBND Geometry in wire-cell-bee3

Reference for how the SBND detector is described in the Bee3 event-display
front-end. All numeric values below are extracted from a single source of
truth — the `SBND` class in
[`events/static/js/bee/physics/experiment.js`](../events/static/js/bee/physics/experiment.js)
(lines 859–1189).

## 1. Overview

SBND is modeled as a **two-TPC** liquid-argon detector with a **single shared
central cathode** at x ≈ 0 and **two anode planes on the outer walls**. The
geometry is defined in the JavaScript `SBND` class, which extends
`Experiment` and supplies:

- two TPC bounding boxes (`updateTPCLocation(...)`),
- 312 optical detectors (`updateOPLocation(..., 312)`), and
- a per-detector TPC-membership rule (`opTPC(i)`).

All coordinates are in **centimeters**, in the **LArSoft global** frame.
Local (Bee) coordinates subtract `tpc.center` — see `toLocalXYZ` /
`toGlobalXYZ` in `experiment.js:82-96`.

## 2. Coordinate frame

| Axis | Meaning                                          |
|------|--------------------------------------------------|
| X    | Drift direction (perpendicular to the wire planes) |
| Y    | Vertical                                         |
| Z    | Beam direction (upstream → downstream)           |

`tpc.location` entries follow the convention `[xmin, xmax, ymin, ymax, zmin, zmax]`
(`experiment.js:6`).

## 3. TPC bounding boxes

From `experiment.js:863-866`:

| TPC  | X (drift) [cm]      | Y (vertical) [cm]        | Z (beam) [cm]   |
|------|---------------------|--------------------------|------------------|
| TPC0 | [−201.75, −0.45]    | [−203.732, +203.732]     | [0, 509.4]      |
| TPC1 | [+0.45, +201.75]    | [−203.732, +203.732]     | [0, 509.4]      |

Derived quantities:

| Quantity                        | Value         |
|---------------------------------|---------------|
| Drift length per TPC            | 201.30 cm     |
| Top of active volume (Y max)    | +203.732 cm   |
| Bottom of active volume (Y min) | −203.732 cm   |
| Vertical extent (top − bottom)  | 407.464 cm    |
| Upstream face (Z min)           | 0 cm          |
| Downstream face (Z max)         | 509.4 cm      |
| Beam-direction length           | 509.4 cm      |
| Cathode gap between TPCs        | 0.9 cm (x ∈ [−0.45, +0.45]) |

## 4. Anode and cathode plane positions

| Plane    | TPC0 X [cm] | TPC1 X [cm] |
|----------|-------------|-------------|
| Anode    | −201.75     | +201.75     |
| Cathode  | −0.45       | +0.45       |

The **cathode** is a single physical plane at x ≈ 0 shared between the two
TPCs; the per-TPC values (−0.45 / +0.45) are the inner active-volume edges of
each drift volume. The **anodes** sit on the outer, cryostat-facing walls.

This assignment is the one used by the dead-area renderer
(`events/static/js/bee/physics/deadarea.js:125`):

```js
const anode_x = cx_i - drift_i * halfx_i - exp.tpc.center[0];
```

with `driftDir(i) = ((i % 2) - 0.5) * -2` (`experiment.js:51-53`), giving
`+1` for TPC0 and `−1` for TPC1. Evaluating:

- TPC0: `cx = −101.10`, `drift = +1`, `halfx = 100.65` → **anode_x = −201.75**
- TPC1: `cx = +101.10`, `drift = −1`, `halfx = 100.65` → **anode_x = +201.75**

It is also independently corroborated by the optical-detector layout: PMTs
and X-Arapucas sit at |x| ≈ 213 cm — just *outside* the anode plane at
|x| = 201.75 cm, which is where they are mounted in the real detector.

## 5. Drift velocity and timing

Inherited from the `Experiment` base class (`experiment.js:13-17`); the
`SBND` subclass does not override them.

| Field                                | Value         |
|--------------------------------------|---------------|
| `tpc.driftVelocity`                  | 0.16 cm/μs    |
| `daq.timeBeforeTrigger`              | 250 μs        |
| `daq.timeAfterTrigger`               | 2750 μs       |

## 6. Optical detectors (PMTs + X-Arapucas)

SBND has **312 optical detectors** total, declared via
`updateOPLocation({...}, 312)` at `experiment.js:868-1182`. Each entry has
the form `id: [x, y, z]` for PMTs or `id: [x, y, z, 2]` for X-Arapucas (the
trailing `2` selects the rectangular shape in
`events/static/js/bee/physics/op.js`).

### Counts and placement

| Quantity              | Value                                                |
|-----------------------|------------------------------------------------------|
| Total OpDets          | 312                                                  |
| PMTs                  | 120 (60 per TPC)                                     |
| X-Arapucas            | 192 (96 per TPC)                                     |
| PMT X positions       | ±213.4 cm (just outside anode at ±201.75)            |
| X-Arapuca X positions | ±213.75 cm                                           |
| `op.peScaling`        | 0.5 (rendering opacity factor, `experiment.js:1184`) |

TPC assignment rule (`experiment.js:1187`):

```js
opTPC(i) { return this.op.location[i][0] < 0 ? 0 : 1; }
```

So every detector with negative X belongs to TPC0, positive X to TPC1.

### PMT layout (Y rows × Z rings)

PMT Y rows used: **−175, −135, −95, −40, 0, +40, +95, +135, +175 cm**.

PMTs sit on twelve Z rings. The rings alternate between dense (12 detectors:
6 Y positions × 2 TPCs at Y ∈ {±175, ±95, ±40}) and sparse (6 detectors:
3 Y positions × 2 TPCs at Y ∈ {−135, 0, +135}):

| Z ring [cm] | Density | IDs (signed by TPC)                          |
|-------------|---------|----------------------------------------------|
| 27.8742     | dense   | 6–17                                         |
| 57.8742     | sparse  | 36–41                                        |
| 87.8742     | dense   | 60–71                                        |
| 161.158     | dense   | 84–95                                        |
| 191.158     | sparse  | 114–119                                      |
| 221.158     | dense   | 138–149                                      |
| 288.242     | dense   | 162–173                                      |
| 318.242     | sparse  | 192–197                                      |
| 348.242     | dense   | 216–227                                      |
| 421.526     | dense   | 240–251                                      |
| 451.526     | sparse  | 270–275                                      |
| 481.526     | dense   | 294–305                                      |

Total: 12 + 6 + 12 + 12 + 6 + 12 + 12 + 6 + 12 + 12 + 6 + 12 = **120 PMTs**.

### X-Arapuca layout

X-Arapuca IDs fill the remaining slots in `[0, 311]` not occupied by PMTs.
Their X positions are ±213.75 cm and their Z positions span the full beam
length (Z range **20.25 → 489.15 cm**), interleaved with the PMT rings.
Y rows used match the PMT pattern (`{±175, ±135, ±95, ±40, 0}`), with each
Z slice either a 6-detector or a 12-detector row.

Total: **192 X-Arapucas** (96 per TPC).

## 7. Updates needed in Bee's SBND geometry

The values in §3–§5 reflect what is **currently coded in
`experiment.js`**, not necessarily what the latest SBND simulation /
calibration says is correct. Below is a side-by-side of Bee's numbers
against the canonical values from the SBND software / DAQ (per
discussions with collaborators; Wire-Cell config in
[`sbnd/simparams.jsonnet`](https://github.com/SBNSoftware/sbndcode/blob/develop/sbndcode/WireCell/cfg/pgrapher/experiment/sbnd/simparams.jsonnet)).

### 7.1 Anode region — a single plane is an oversimplification

Bee models each anode as a single X coordinate (|x| = 201.75 cm).
The real SBND APA has **three wire planes** at distinct X:

| Plane     | |X| [cm] |
|-----------|----------|
| U (1st induction)  | 201.45 |
| V (2nd induction)  | ~201.75 (≈ Bee's value) |
| W (collection)     | 202.05 |

Bee's 201.75 cm is effectively the **midpoint of U and W**, i.e. roughly
the V (middle induction) plane. The active wire-readout region (the
**three-plane overlap**) is also smaller than the TPC box:

| Axis | Wire-overlap region [cm] | Bee's current TPC box [cm] |
|------|--------------------------|----------------------------|
| Y    | [−200, +200]             | [−203.732, +203.732]       |
| Z    | [0.15, 500.85]           | [0, 509.4]                 |

**Action:** decide whether Bee should keep showing the TPC active
volume (as now) or the wire-overlap region; if both are useful, expose
them separately. At minimum, the **Z extent (509.4 cm) is too long** —
the SBND TPC box is 0–501 cm, so the current value overshoots by
~8.4 cm and should be corrected.

### 7.2 Cathode (CPA) thickness — sim vs. data

Bee currently leaves a **0.9 cm cathode gap** (x ∈ [−0.45, +0.45]),
which matches the **simulation** CPA half-thickness of ±0.45 cm.

In **data** the effective cathode gap is closer to **±1.5 cm
(~3 cm total)** and is non-uniform across the CPA — see the SBND
"DENT" issue. Work is in progress to either update the simulation gap
or apply a fiducial cut that mimics the data gap.

**Action:** parametrize the cathode gap so the data and simulation
geometries can be selected separately; the data variant should use
x ∈ [−1.5, +1.5] (TPC0 inner edge at x = −1.5 and TPC1 at x = +1.5),
and the maximum drift distance shown to the user should follow.

### 7.3 Drift velocity — replace inherited default

Bee inherits the `Experiment` base default `driftVelocity = 0.16 cm/μs`.
The current Wire-Cell SBND configuration (`simparams.jsonnet`) uses
**0.1563 cm/μs** (1.563 mm/μs). The corresponding max drift time
observed in 2024 data is **1281–1282 μs**, consistent with a ~2 m
drift distance.

**Action:** override `this.tpc.driftVelocity = 0.1563` inside the
`SBND` constructor (analogous to how `MicroBooNE` overrides it at
`experiment.js:110`). Without this, the X position computed from drift
time will be off by ~2.4%.

### 7.4 Max drift distance — depends on §7.1 and §7.2

The effective max drift distance is `|x_anode| − |x_cathode|`. Combining
the canonical numbers:

| Configuration | Anode |X| | Cathode |X| | Max drift |
|---------------|-----------|-------------|-----------|
| Simulation (W plane − sim CPA face) | 202.05 | 0.45 | 201.60 cm |
| Data (W plane − data CPA face)       | 202.05 | 1.50 | 200.55 cm |
| Bee (current)                        | 201.75 | 0.45 | 201.30 cm |

**Action:** once §7.1–§7.3 are applied, the displayed drift volume and
the drift-time → X mapping will both agree with the SBND calibration.

### 7.5 Light detectors vs. GDML truth (`sbnd_v02_06`)

A position-by-position comparison of Bee's PDS layout against the
canonical GDML / wire-JSON geometry summarized in
[`sbnd_geometry/sbnd_gdml_geometry.md`](../sbnd_geometry/sbnd_gdml_geometry.md)
(tag `v10_20_05` of `sbndcode`). The GDML uses **mm**; values below are
converted to **cm** to match Bee.

**Agreements:**

- Detector counts: 120 PMTs + 192 X-Arapucas = 312 total ✓
- Per-wall split: 60 PMTs + 96 X-Arapucas per TPC (matches 12 PDS
  modules × wall, 5 PMTs + 8 X-Arapucas per module) ✓
- PMT Y rows: {±175, ±135, ±95, ±40, 0} cm ✓
- TPC sign convention (negative X → TPC0/East, positive X → TPC1/West) ✓

**Discrepancies (Bee → GDML):**

| Quantity | Bee [cm] | GDML truth [cm] | Δ (Bee − GDML) | Note |
|----------|----------|------------------|----------------|------|
| PMT X (photocathode wall) | ±213.40 | ±208.55 | **+4.85** (further from TPC) | Bee places PMTs ~5 cm outside the GDML photocathode-center X. PMT R = 10.2 cm, so the photocathode face is offset further toward the TPC than the volume center — Bee's value is on the wrong side of both. |
| X-Arapuca X | ±213.75 | ±214.55 | **−0.80** (closer to TPC) | Bee XAs are ~0.8 cm closer to the TPC than the GDML truth. |
| Relative X (XA − PMT) | 0.35 | 5.95 | **−5.60** | In GDML the XAs sit ~6 cm *outboard* of the PMTs; in Bee they sit only ~0.35 cm outboard. The full radial stacking of the PDS is collapsed. |
| All PMT/XA Z values | systematically **+4.20** cm relative to GDML `z_J` | — | **+4.20 cm** uniform shift | Matches the 4.20 cm padding on each end of Bee's TPC Z box (509.4 vs. 501.0 cm). Likely a frame-origin issue, not 24 independent typos — see §7.5.1. |
| Y positions | ✓ exact match | — | 0 | No action. |

**§7.5.1 Frame-origin / Z-offset hypothesis**

The +4.20 cm shift is identical for every PMT ring and every X-Arapuca
position, so it is almost certainly a **single frame-origin error**, not
per-detector typos. The GDML's TPC Z frame (`z_J`) places the upstream
TPC face at z_J = 0 cm and the downstream face at z_J = 501.0 cm. Bee's
Z runs 0 → 509.4 cm; if Bee's z = 0 is taken to be 4.20 cm *upstream* of
the GDML upstream face, then:

- Bee TPC box: [0, 509.4] cm = GDML [−4.20, +505.20] cm  → 4.20 cm pad
  on each side (still doesn't match GDML's 0–501.0)
- Bee PDS Z values are all GDML `z_J` + 4.20 cm

A clean fix would be to (a) shrink the Bee TPC Z extent to GDML's
[0, 501.0] cm (already noted in §7.1) and (b) subtract 4.20 cm from
every PMT and X-Arapuca Z entry so that Bee shares the GDML `z_J`
frame — these two changes are coupled and should be done together.

**§7.5.2 East/West module structure (per-ID mapping)**

*What the GDML says.* Each wall (East at x = −2085.5 mm, West at
x = +2085.5 mm) has 12 PDS modules. The 5 PMTs inside a module are
**not** arranged symmetrically about the module's z-center — they sit
at three Y positions, and at z-offsets `(−300, +300, 0, −300, +300) mm`
for PMTs (1, 2, 3, 4, 5) respectively (see East Module 1, GDML §6):

| Module 1 (East, module z_J center = 536.74 mm) | PMT 1 | PMT 2 | PMT 3 | PMT 4 | PMT 5 |
|------------------------------------------------|------:|------:|------:|------:|------:|
| y (mm)                                         | +1750 | +1750 | +1350 |  +950 |  +950 |
| z_J (mm)                                       | 236.74| 836.74| 536.74| 236.74| 836.74|
| z-offset within module (mm)                    | −300  | +300  |   0   | −300  | +300  |

The GDML installs each **West module by rotating the corresponding East
module 180° around the Y axis**. That rotation does two things:

1. The X side flips (intentional — that puts the module on the +X wall).
2. The Z side also flips. So **within the module**, the ±300 mm
   z-offsets swap places: PMT 1 ends up at +300 (not −300), PMT 2 at
   −300, etc. Only the centered PMT 3 stays put.

The GDML shows this directly. West Module 13 (the partner of East
Module 1) has the same module z-center 536.74 mm, but its PMT z values
are reordered:

| Module 13 (West) | PMT 1 | PMT 2 | PMT 3 | PMT 4 | PMT 5 |
|------------------|------:|------:|------:|------:|------:|
| y (mm)           | +1750 | +1750 | +1350 |  +950 |  +950 |
| z_J (mm)         | 836.74| 236.74| 536.74| 836.74| 236.74|

So East PMT 1 (at z=236.74) physically faces **West PMT 2** (also at
z=236.74), not West PMT 1.

*What Bee does instead.* Bee's `op.location` is just
`{opdet_id: [x, y, z]}` — there is no module concept. Bee writes IDs in
adjacent East/West pairs that share the **same (y, z)** and only differ
in the sign of X. From `experiment.js:869-870`:

```js
6: [-213.4, -175, 27.8742],  // East detector at (y, z) = (-175, 27.87)
7: [+213.4, -175, 27.8742],  // West detector at the SAME (y, z)
```

Bee is therefore asserting that *the West-wall PMT with ID 7 sits
directly across the cathode from the East-wall PMT with ID 6*. This
mirror-pair assumption is the part the GDML 180° rotation breaks: for
the 4 off-center PMTs in every module (i.e. 4/5 = 80% of all PMTs),
the actual ID-to-(y, z) mapping on the West wall is offset by ±300 mm
in Z relative to its East mirror partner. The same applies to all 8
X-Arapucas in every module (none are at the module z-center, so 100%
of them are affected).

*Why this matters.* Wire-Cell / LArSoft `OpHit` and `OpFlash` objects
are keyed by `OpDetID` (an integer 0–311). When Bee renders an OpFlash,
it does `op.location[opdet_id]` to find where to draw the glow. If
Bee's ID-to-position mapping does not match LArSoft's, the glow for a
West-wall channel can appear ±300 mm (≈30 cm in Z) away from the
physical PMT that actually saw the light. The picture of *which* PMTs
exist looks correct (the set of {(y, z)} on each wall is unchanged),
but flash overlays keyed by channel will be wrong on the West wall.

*What is and isn't broken.*

| Aspect | Bee | Status |
|--------|-----|--------|
| Number of PMTs / XAs per wall | 60 + 96 | ✓ |
| Set of (y, z) positions covered on each wall | matches GDML | ✓ |
| Mirror symmetry of the **set** across the cathode | yes | ✓ |
| Per-channel `OpDetID` → (y, z) on the East wall | likely OK (Bee was probably tuned against East) | needs verification |
| Per-channel `OpDetID` → (y, z) on the West wall | **wrong for every off-center detector** if the LArSoft mapping follows the GDML 180° rotation | **needs verification & likely fix** |

*How to verify.* Dump `(channel, x, y, z)` for every optical channel
from the LArSoft `geo::OpDetGeo` interface (e.g. via a one-shot
`art`/`gallery` job against `sbndcode`, or from the `OpDet`
properties exposed in `Geometry` service). Compare against
`experiment.js:868-1181`. The East-wall channels should match; the
West-wall channels are the ones likely to be permuted within each
module. If they are permuted, the fix is to reorder the West-wall IDs
in Bee's `op.location` dictionary so each ID maps to the (y, z) that
LArSoft assigns to that `OpDetID`.

**§7.5.3 Summary of light-detector actions**

1. **Move PMTs inboard by 4.85 cm**: change `±213.4` → `±208.55` for
   all PMT X entries in `experiment.js:868-988`.
2. **Move X-Arapucas outboard by 0.80 cm**: change `±213.75` → `±214.55`
   for all X-Arapuca X entries in `experiment.js:990-1181`.
3. **Subtract 4.20 cm from every PMT and X-Arapuca Z** (coupled to the
   Z-extent fix in §7.1) so Bee shares the GDML `z_J` frame.
4. **Audit the per-ID East/West mapping** against LArSoft `OpDetID`:
   the GDML 180° West-wall rotation negates within-module z-offsets,
   which Bee does not currently reflect.

### 7.6 Resolution against the v02_02 ↔ v02_06 comparison

The colleague's §10 of
[`sbnd_geometry/sbnd_gdml_geometry.md`](../sbnd_geometry/sbnd_gdml_geometry.md)
documents the only geometric change between SBND `v02_02` and `v02_06`:

| Quantity | v02_02 | v02_06 | Δ |
|----------|:------:|:------:|:-:|
| TPC box dz | **5094.0 mm** | 5010.0 mm | −84 mm |
| z_J frame offset (`z_J = z_C + …`) | **+2959.5 mm** | +2917.5 mm | −42 mm |
| PDS module z_J centers | **578.74, 1911.58, 3182.42, 4515.26 mm** | 536.74, 1869.58, 3140.42, 4473.26 mm | −42 mm each |

All other GDML quantities — wire-plane X positions, cathode X, PMT
volume-center X (**±2085.5 mm in both versions**), X-Arapuca X
(**±2145.5 mm in both versions**), Y rows, PDS world-frame (`z_C`)
positions, all counts — are **identical between v02_02 and v02_06**.

Wire-Cell BEE's SBND geometry is built from **v02_02**. With that in
mind, several of the "discrepancies" flagged above are actually correct
for the version BEE was built against:

| Flag | Verdict |
|------|---------|
| §7.1 — Z extent 509.4 cm "overshoots" by 8.4 cm | **Not a bug.** 509.4 cm = 5094 mm is exactly the v02_02 TPC dz. The "−8.4 cm" shrink is needed only to migrate BEE to v02_06. |
| §7.5 — uniform +4.20 cm Z offset on every PMT and X-Arapuca | **Not a bug.** Bee's PDS Z values exactly equal v02_06 `z_J` + 4.20 cm because the v02_02 → v02_06 change moved `z_J = 0` downstream by 42 mm. Bee is correct in the v02_02 `z_J` frame. |
| §7.5 — Z-frame-origin hypothesis (§7.5.1) | **Confirmed and explained.** It is a single frame-origin difference, and the origin is the v02_02 upstream TPC face. |
| §7.5 — PMT X = ±213.4 cm vs GDML ±208.55 cm (+4.85 cm) | **Still a real discrepancy.** PMT X is unchanged between v02_02 and v02_06. Bee's value matches neither the PMT volume center nor the photocathode face. Likely points at the cryostat-side face of the PDS module case or a hand-tuned value; needs cross-check against the v02_02 PDS module placements before changing. |
| §7.5 — X-Arapuca X = ±213.75 cm vs GDML ±214.55 cm (−0.80 cm) | **Still a real discrepancy.** XA X is unchanged between v02_02 and v02_06. The relative XA-vs-PMT stacking in Bee (XA only 0.35 cm outboard of PMT) is also wrong: GDML has XAs 6 cm outboard of PMTs in both versions. |
| §7.5.2 — per-ID East/West mapping (180° West rotation) | **Not addressed by the v02_02 comparison.** The within-module z-offset negation between East and West walls is present in both versions. Still needs an audit against LArSoft `OpDetID`. |
| §7.2 — CPA gap (sim ±0.45 cm vs data ±1.5 cm) | **Independent of version.** Driven by the sim/data difference, not by GDML revision. |
| §7.3 — drift velocity 0.16 cm/μs (base default) vs 0.1563 cm/μs | **Independent of version.** Driven by the Wire-Cell `simparams.jsonnet`, not by GDML revision. |

**Net effect on the action list:** items addressing the TPC Z extent and
the PDS Z offset become **optional** — required only if BEE is migrated
to the v02_06 geometry. The PMT X, X-Arapuca X, East/West ID-mapping,
CPA-gap, and drift-velocity items remain genuine fixes regardless of
GDML version.

### 7.7 Summary of fields to change in `experiment.js`

> **Status:** items 2, 3, 5, 6, 7 below were applied 2026-05-28 — see
> §8 for the diff. Items 1 (drift velocity), 4 (per-ID East/West audit),
> 8 (anode multi-plane), and 9 (wire-overlap outline) are still
> outstanding.

In the `SBND` constructor (`experiment.js:861-1184`). After §7.6 these
split cleanly into "fix regardless of version" and "v02_06 migration":

**Fixes needed regardless of GDML version**

1. **Drift velocity**: add `this.tpc.driftVelocity = 0.1563;` (Wire-Cell
   `simparams.jsonnet` value; current inherited default 0.16 is ~2.4%
   high). §7.3.
2. **PMT X positions** (`experiment.js:868-988`): every `±213.4` does
   not match GDML in either v02_02 or v02_06 (both have PMT volume
   center at ±208.55 cm). Before editing, identify what reference Bee
   was actually using — e.g. PDS module-case outer face — since v02_02
   PDS world placements are identical to v02_06 and so cannot be the
   source of the +4.85 cm offset. §7.5 / §7.6.
3. **X-Arapuca X positions** (`experiment.js:990-1181`): every `±213.75`
   should be `±214.55` (unchanged between v02_02 and v02_06). §7.5.
4. **Per-ID East/West audit**: confirm Bee's ID-to-position mapping
   matches LArSoft `OpDetID`. The GDML West wall is 180°-rotated
   around Y relative to East (both versions), which negates
   within-module z-offsets; Bee currently pairs East/West at identical
   (y, z) and may have the West-wall IDs swapped within each module.
   §7.5.2.
5. **CPA gap parametrization**: expose a switch between simulation
   (±0.45 cm, current behaviour) and data (±1.5 cm, ~3 cm DENT-driven
   gap), and propagate to the inner X edges of the TPC bounding
   boxes. §7.2.

**Optional — only if migrating BEE from v02_02 to v02_06**

6. **TPC Z extent** (`updateTPCLocation`): change Z from `[0, 509.4]`
   (v02_02) to `[0, 501.0]` (v02_06). 8.4 cm shorter; 4.2 cm comes
   off each end. §7.1.
7. **PMT and X-Arapuca Z positions**: subtract `4.20` cm from every
   entry. This is coupled with item 6 — the v02_06 `z_J` origin is
   42 mm downstream of v02_02 `z_J = 0`, so PDS Z values shift by the
   same amount. Do not apply this in isolation. §7.5.1 / §7.6.

**Cosmetic / UX**

8. **Anode-plane representation**: Bee uses a single X (±201.75 cm)
   for each anode but the real APA has three wire planes at
   ±201.45 / ±201.75 / ±202.05 cm. Consider showing all three, or
   document which one the single value represents. §7.1.
9. **Wire-overlap region**: optionally draw the smaller three-plane
   overlap box ([−200, +200] cm in Y, [0.15, 500.85] cm in Z relative
   to the v02_06 TPC, or the v02_02 equivalent) so users do not
   mistake the TPC box for the readout boundary. §7.1.

## 8. Applied changes (2026-05-28)

The following items from §7.7 have been implemented in
`events/static/js/bee/physics/experiment.js`. The geometry now aligns
to the **GDML v02_06 wire-overlap region**, with the data-style CPA
gap. (Items not in this list — drift velocity, per-ID East/West audit
— remain TODO.)

### 8.1 TPC bounding boxes

`updateTPCLocation` now uses the three-wire-plane overlap region for
Y and Z, the W (collection) plane for the anode-side X, and the
data-style CPA face for the cathode-side X:

```js
this.updateTPCLocation([
    [-202.05, -1.5, -200, 200, 0.15, 500.85],
    [1.5, 202.05, -200, 200, 0.15, 500.85]
]);
```

| Axis | Old (v02_02 TPC box) | New (v02_06 wire-overlap) | Source |
|------|----------------------|---------------------------|--------|
| X anode | ±201.75 cm (≈ V plane) | **±202.05 cm** (W / collection plane) | §7.1 |
| X cathode (inner edge) | ±0.45 cm (sim CPA face, ~1 cm gap) | **±1.5 cm** (data CPA face, ~3 cm gap) | §7.2 |
| Y | [−203.732, +203.732] (TPC box) | **[−200, +200] cm** (3-plane overlap) | §7.1 |
| Z | [0, 509.4] cm (v02_02 TPC dz = 5094 mm) | **[0.15, 500.85] cm** (3-plane overlap, v02_06 z_J frame) | §7.1, §7.6 |

Per-TPC drift length is now `202.05 − 1.5 = 200.55 cm` (matches the
data-based estimate in §7.4).

### 8.2 PMT positions

Every PMT entry (`experiment.js:872-991`) had its **X** updated
±213.4 → ±208.55 cm (GDML photocathode-center X, unchanged between
v02_02 and v02_06) and its **Z** reduced by 4.20 cm to enter the
v02_06 `z_J` frame:

| PMT Z rings (cm) | Old (v02_02 z_J) | New (v02_06 z_J) |
|------------------|------------------|------------------|
| First trio       | 27.8742, 57.8742, 87.8742 | 23.6742, 53.6742, 83.6742 |
| Second trio      | 161.158, 191.158, 221.158 | 156.958, 186.958, 216.958 |
| Third trio       | 288.242, 318.242, 348.242 | 284.042, 314.042, 344.042 |
| Fourth trio      | 421.526, 451.526, 481.526 | 417.326, 447.326, 477.326 |

Y rows unchanged (already matched GDML).

### 8.3 X-Arapuca positions

Every X-Arapuca entry (`experiment.js:994-1185`) had its **X** updated
±213.75 → ±214.55 cm (GDML XA center X, unchanged between v02_02 and
v02_06) and its **Z** reduced by 4.20 cm (same v02_06 `z_J` shift as
the PMTs). All 24 distinct XA Z values were shifted; the new range is
**16.0542 → 484.946 cm** (was 20.2542 → 489.146 cm).

### 8.4 What was explicitly NOT changed

- **OpDet ID → (y, z) mapping** (§7.5.2). Per the user, the per-ID
  East/West pairing is fine as-is and was left untouched.
- **Drift velocity** (§7.3). Still inherits the base default
  `0.16 cm/μs`. Override to `0.1563 cm/μs` is still pending if
  drift-time → X accuracy matters for the use case.
- **Anode-plane multi-wire-plane representation** (§7.1, item 8). Bee
  still shows a single anode X (now `±202.05` = W plane); U and V
  planes are not rendered separately.

### 8.5 Verification

After the edits, no instance of any old SBND-specific numeric value
remains in `experiment.js`:

```sh
grep -n "213\.4\|213\.75\|201\.75\|203\.732\|509\.4\|\
27\.8742\|57\.8742\|87\.8742\|161\.158\|191\.158\|221\.158\|\
288\.242\|318\.242\|348\.242\|421\.526\|451\.526\|481\.526\|\
20\.2542\|35\.4942\|50\.2542\|65\.4942\|80\.2542\|95\.4942\|\
153\.538\|168\.778\|183\.538\|198\.778\|213\.538\|228\.778\|\
280\.622\|295\.862\|310\.622\|325\.862\|340\.622\|355\.862\|\
413\.906\|429\.146\|443\.906\|459\.146\|473\.906\|489\.146" \
    events/static/js/bee/physics/experiment.js
# → no matches
```

Spot-check against GDML v02_06 §6 (e.g. East Module 1 PMT 1 at
y_J = 236.74 mm, z_J = 23.674 cm): Bee's ID 6 is now at
`[-208.55, -175, 23.6742]`, matching the GDML photocathode-center X
and z_J value exactly (Y is the across-cathode mirror; see §7.5.2 for
why ID-to-position pairing is still East/West-symmetric).

## 9. Where to look in the source

| File                                                                                  | What it provides                                                                |
|---------------------------------------------------------------------------------------|----------------------------------------------------------------------------------|
| `events/static/js/bee/physics/experiment.js:1-98`                                     | `Experiment` base class: `tpc.location` format, `driftDir`, `opTPC`, frame helpers |
| `events/static/js/bee/physics/experiment.js:859-1189`                                 | `SBND` class: TPC bounding boxes and full optical-detector dictionary           |
| `events/static/js/bee/physics/deadarea.js:118-134`                                    | Canonical anode-face X computation from TPC bounding box + drift direction      |
| `events/static/js/bee/physics/op.js`                                                  | Optical-detector rendering; type-2 vs. default (X-Arapuca vs. PMT) shape choice |

If any number above needs to be updated, change it in `experiment.js` first
and reflect the new value here.
