# ProtoDUNE-HD / ProtoDUNE-VD Geometry in wire-cell-bee3

Reference for how the PDHD and PDVD detectors are described in the Bee3
event-display front-end, and how those numbers relate to the Wire-Cell
toolkit's wire geometry files and the DetectorVolumes / fiducial-volume (FV)
metadata used by the clustering code. The Bee numbers live in the
`ProtoDUNEHD` and `ProtoDUNEVD` classes in
[`events/static/js/bee/physics/experiment.js`](../events/static/js/bee/physics/experiment.js).

All coordinates are in **centimeters** in the **LArSoft global** frame;
`tpc.location` entries are `[xmin, xmax, ymin, ymax, zmin, zmax]`.

## 1. Box convention (2026-06 update)

The TPC boxes were updated (previous values kept as comments in
`experiment.js`) to span:

- **x**: from the **cathode FV edge** (|x| = 2.54 cm — the cathode gap used by
  the toolkit clustering DetectorVolumes metadata; for PDVD this is also the
  physical cathode half-thickness, 50.8 mm / 2) out to the
  **cathode-facing collection-wire plane** (where the apparent drift
  coordinate of a sampled blob point tops out at T0 = 0);
- **y/z**: the per-anode wire extents of the toolkit's current default wire
  geometry file, dumped with `wirecell-util wires-info`.

This guarantees every toolkit-sampled blob point renders inside a box and the
drawn cathode gap matches what the clustering code uses. The toolkit sources
of truth are:

| Detector | Wire file (default in `params.jsonnet`) | Clustering DetectorVolumes |
|---|---|---|
| PDHD | `protodunehd-wires-larsoft-v1.json.bz2` | `cfg/pgrapher/experiment/pdhd/clus.jsonnet` |
| PDVD | `protodunevd-wires-larsoft-v5.json.bz2` | `cfg/pgrapher/experiment/protodunevd/clus.jsonnet` |

## 2. ProtoDUNE-HD

Four APAs in a 2 (drift side) × 2 (z) layout, central cathode at x = 0.
Only the cathode-facing face of each APA images (the wall faces are
degenerate). Box index = WCT APA ident.

### TPC boxes (current)

| Box / APA | X (drift) [cm] | Y [cm] | Z (beam) [cm] |
|---|---|---|---|
| 0 | [−353.202, −2.54] | [7.61, 606.67] | [−0.10, 230.573] |
| 1 | [+2.54, +353.002] | [7.61, 606.67] | [−0.10, 230.573] |
| 2 | [−353.202, −2.54] | [7.61, 606.67] | [231.96, 462.633] |
| 3 | [+2.54, +353.002] | [7.61, 606.67] | [231.96, 462.633] |

Derivation (wire file `protodunehd-wires-larsoft-v1`, `wirecell-util wires-info`):

- Collection (W) wire planes of the cathode-facing faces: x = −353.202 cm
  (APA0/2 face 0) and +353.002 cm (APA1/3 face 1). These are the `xorig`
  values used by the toolkit `BlobSampler::time2drift` for blob x.
- Wire active area: y ∈ [7.61, 606.67]; z ∈ [−0.10, 230.573] (APA0/1) and
  [231.96, 462.633] (APA2/3) — a real 1.39 cm no-wire gap between the APA
  pairs (the previous Bee boxes had a 0.4 cm gap).
- Cathode gap |x| < 2.54 cm = the clustering per-face FV boundary
  (`a0f0pA.FV_xmax = −25.4 mm` etc.). The physical cathode is only 3.175 mm
  thick; ±2.54 cm is the toolkit FV convention, adopted here for consistency.

Relation to the clustering FV (not used for the boxes): the overall FV is
x ±357.985 (the APA mid-plane, ~4.8 cm *behind* the wires), y [7.61, 606.0],
z [0.234, 462.297], with 2/2.5/3 cm margins. The boxes deliberately stop at
the wire planes instead of the FV x so they trace where charge can actually
appear.

### Previous (pre-2026-06) boxes

`[-352.949, -1.00198, 3.6375, 603.861, -0.59375, 231.066]` etc. — LArSoft
GDML TPC-active-volume numbers: anode edges 0.25 cm short of the wire planes,
asymmetric cathode gap [−1.00, +0.80], y 4 cm low at the bottom / 2.8 cm
short at the top.

## 3. ProtoDUNE-VD

Eight CRPs in a 2 (drift side) × 2 (y) × 2 (z) layout: anodes 0–3 at the
bottom (wires at x ≈ −341.55, drift +x), anodes 4–7 at the top (wires at
x ≈ +341.55, drift −x), cathode at x = 0. Box index = WCT anode ident.

### TPC boxes (current)

| Box / anode | X (drift) [cm] | Y [cm] | Z (beam) [cm] |
|---|---|---|---|
| 0 | [−341.55, −2.54] | [−336.4, −0.6] | [0.855, 149.82] |
| 1 | [−341.55, −2.54] | [−336.4, −0.6] | [149.82, 298.445] |
| 2 | [−341.55, −2.54] | [+0.6, +336.4] | [0.855, 149.82] |
| 3 | [−341.55, −2.54] | [+0.6, +336.4] | [149.82, 298.445] |
| 4 | [+2.54, +341.55] | [−336.4, −0.6] | [−0.36, 149.65] |
| 5 | [+2.54, +341.55] | [−336.4, −0.6] | [149.65, 300.0] |
| 6 | [+2.54, +341.55] | [+0.6, +336.4] | [−0.36, 149.65] |
| 7 | [+2.54, +341.55] | [+0.6, +336.4] | [149.65, 300.0] |

Derivation (wire file `protodunevd-wires-larsoft-v5`, `wirecell-util wires-info`):

- Collection (W) wire planes at x = ±341.55 cm (induction planes at ±341.51 /
  ±341.53) — the blob-x `xorig`.
- Cathode gap |x| < 2.54 cm = physical cathode half-thickness (50.8 mm plate
  at x = 0) = the clustering per-drift FV boundary.
- y halves: each CRP's two faces split at |y| = 0.6 cm; the |y| < 0.6 band is
  a real no-wire gap, and the outer edge is ±336.4.
- z: per-drift-side wire extents are bottom [0.855, 298.445] and top
  [−0.36, 300.0] (the bottom CRPs carry the v5 U/V z-shift calibration, so
  top and bottom genuinely differ by ~1.5 cm). The inner z split uses the
  per-side gap midpoint — bottom 149.82, top 149.65 — because the raw
  per-CRP extents *overlap* by ~2 cm (v5 U/V endpoint shifts) and
  `Experiment.tpcOf()` needs disjoint boxes.

Relation to the clustering FV (not used for the boxes): per-drift FV x is
±[2.54, 335.835] — the FV anode edge sits 5.7 cm inside the wire plane
(`apa_plane` = 57.15 mm), so blob points in the 335.8–341.55 cm "anode band"
are inside the boxes but outside the FV. Overall FV: y ±336.4,
z [0.05, 299.25].

### Previous (pre-2026-06) boxes

`[±3.03, ±313.03] × [0/−337, 337/0] × [0, 149.65, 299.3]` — the anode edge
at |x| = 313.03 was **28.5 cm inside** the actual wire plane (and 22.8 cm
inside even the FV edge), so tracks near the anodes rendered well outside the
drawn detector; the cathode gap (3.03 cm) was ~0.5 cm per side too wide.

## 4. Consistency summary (toolkit vs Bee, after the update)

| Quantity | Toolkit source | Bee |
|---|---|---|
| PDHD anode (W-plane) x | −353.202 / +353.002 (wire file v1) | box edges, exact |
| PDHD cathode gap | ±2.54 (clus.jsonnet `a*f*pA` FV_x) | box edges, exact |
| PDHD y/z extents | wire file v1 per-APA extents | box edges, exact |
| PDVD anode (W-plane) x | ±341.55 (wire file v5) | box edges, exact |
| PDVD cathode gap | ±2.54 (50.8 mm cathode; clus.jsonnet FV) | box edges, exact |
| PDVD y/z extents | wire file v5 per-anode extents | box edges, exact (z split at per-side gap midpoint) |
| Drift velocity | 1.6 mm/µs (clus.jsonnet) | 0.16 cm/µs (PDHD explicit, PDVD base default) |

Neither detector has per-event T0 (time_offset = 0 in the toolkit), so blob x
is the apparent drift position; the box x ranges above are exactly the
apparent-x ranges of in-time charge.
