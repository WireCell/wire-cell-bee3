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

- **x**: from the **cathode** (PDHD: the physical cathode surface |x| = 0.159 cm
  = the toolkit `cpa_plane` / QLMatching `cathode_x`; PDVD: the |x| = 3.0 cm
  physical cathode surface, updated 2026-07 with the toolkit `cpa_thick`
  50.8 → 60 mm GDML correction — see the per-detector sections) out to the
  **cathode-facing collection-wire plane** (where the apparent drift
  coordinate of a sampled blob point tops out at T0 = 0);
- **y/z**: the per-anode wire extents of the toolkit's current default wire
  geometry file, dumped with `wirecell-util wires-info`.

This guarantees every toolkit-sampled blob point renders inside a box and the
drawn cathode edge matches the physical cathode (PDHD) / clustering FV (PDVD).
The toolkit sources of truth are:

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
| 0 | [−353.202, −0.159] | [7.61, 606.67] | [−0.10, 230.573] |
| 1 | [+0.159, +353.002] | [7.61, 606.67] | [−0.10, 230.573] |
| 2 | [−353.202, −0.159] | [7.61, 606.67] | [231.96, 462.633] |
| 3 | [+0.159, +353.002] | [7.61, 606.67] | [231.96, 462.633] |

Derivation (wire file `protodunehd-wires-larsoft-v1`, `wirecell-util wires-info`):

- Collection (W) wire planes of the cathode-facing faces: x = −353.202 cm
  (APA0/2 face 0) and +353.002 cm (APA1/3 face 1). These are the `xorig`
  values used by the toolkit `BlobSampler::time2drift` for blob x.
- Wire active area: y ∈ [7.61, 606.67]; z ∈ [−0.10, 230.573] (APA0/1) and
  [231.96, 462.633] (APA2/3) — a real 1.39 cm no-wire gap between the APA
  pairs (the previous Bee boxes had a 0.4 cm gap).
- Cathode surface |x| = 0.159 cm = half the 3.175 mm `cpa_thick` (the toolkit
  `cpa_plane`, = QLMatching `cathode_x`).  The boxes are now drawn to this
  **physical** cathode so a cathode-crossing track sits at the box edge.
  (Previously |x| = 2.54 cm, the 1-inch clustering per-face FV inset
  `a0f0pA.FV_xmax = −25.4 mm` — a fiducial convention, not the cathode, which
  made cathode-crossers render ~2.4 cm beyond the box.)

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

### Optical channels (X-ARAPUCA, the `op` instance)

160 X-ARAPUCA windows, drawn at their APA's anode plane and assigned to a TPC
box by position (`opTPC(i) = tpcOf(x,y,z)`). The offline OpChannel order is
**side-major then z-half** — taken from the run light ROOT `flashopdet/opdet_geo`
(toolkit `cfg/pgrapher/experiment/pdhd/pdhd-opdet-geom.json`, where
OpChannel == OpDet, `ChannelsPerOpDet = 1`):

| OpChannel | drift side | z-half | TPC box |
|---|---|---|---|
| 0–39    | +x (anode +356) | downstream | 3 |
| 40–79   | +x (anode +356) | upstream   | 1 |
| 80–119  | −x (anode −356) | downstream | 2 |
| 120–159 | −x (anode −356) | upstream   | 0 |

The `op` JSON's `op_pes[i]` / `op_pes_pred[i]` are the measured / Q/L-predicted
PE at OpChannel `i`, so this ordering must match the toolkit's. **It is NOT
`ch = 40·APA` in WCT-APA order** — placing the 40-channel blocks that way drew a
physically one-sided flash on *both* cathode sides (channels 0–39 and 120–159
landed on the wrong side). Fixed 2026-06 in `experiment.js` (`ProtoDUNEHD`).

Within each 40-channel block the geom file is a regular 10 (y) × 4 (z) grid,
ordered **z-window outer (descending z) then y-bar inner (descending y)**: ch 0–9
share the highest z window with y running 578.9 → 32.2 cm, ch 10–19 the next z
window down, and so on. Bee3 reproduces this ordering so `op_pes[ch]` lands in the
right y/z cell — an earlier version iterated the loops transposed and ascending,
so each channel's PE was drawn in the wrong y/z cell within its block (also fixed
2026-06). The grid *centres* stay representative (box y/z extents), not surveyed
GDML positions.

## 3. ProtoDUNE-VD

Eight CRPs in a 2 (drift side) × 2 (y) × 2 (z) layout: anodes 0–3 at the
bottom (wires at x ≈ −341.55, drift +x), anodes 4–7 at the top (wires at
x ≈ +341.55, drift −x), cathode at x = 0. Box index = WCT anode ident.

### TPC boxes (current)

| Box / anode | X (drift) [cm] | Y [cm] | Z (beam) [cm] |
|---|---|---|---|
| 0 | [−341.55, −3.0] | [−336.4, −0.6] | [0.855, 149.82] |
| 1 | [−341.55, −3.0] | [−336.4, −0.6] | [149.82, 298.445] |
| 2 | [−341.55, −3.0] | [+0.6, +336.4] | [0.855, 149.82] |
| 3 | [−341.55, −3.0] | [+0.6, +336.4] | [149.82, 298.445] |
| 4 | [+3.0, +341.55] | [−336.4, −0.6] | [−0.36, 149.65] |
| 5 | [+3.0, +341.55] | [−336.4, −0.6] | [149.65, 300.0] |
| 6 | [+3.0, +341.55] | [+0.6, +336.4] | [−0.36, 149.65] |
| 7 | [+3.0, +341.55] | [+0.6, +336.4] | [149.65, 300.0] |

Derivation (wire file `protodunevd-wires-larsoft-v5`, `wirecell-util wires-info`):

- Collection (W) wire planes at x = ±341.55 cm (induction planes at ±341.51 /
  ±341.53) — the blob-x `xorig`.
- Cathode gap |x| < 3.0 cm = physical cathode half-thickness (60 mm GDML
  CathodeBlock at x = 0) = the clustering per-drift FV boundary. Updated
  2026-07 from the legacy 2.54 cm (50.8 mm was the ProtoDUNE-SP/DocDB-203
  value, which no PDVD GDML uses), together with the toolkit
  `params.jsonnet` `cpa_thick` and `clus.jsonnet` FV correction.
- y halves: each CRP's two faces split at |y| = 0.6 cm; the |y| < 0.6 band is
  a real no-wire gap, and the outer edge is ±336.4.
- z: per-drift-side wire extents are bottom [0.855, 298.445] and top
  [−0.36, 300.0] (the bottom CRPs carry the v5 U/V z-shift calibration, so
  top and bottom genuinely differ by ~1.5 cm). The inner z split uses the
  per-side gap midpoint — bottom 149.82, top 149.65 — because the raw
  per-CRP extents *overlap* by ~2 cm (v5 U/V endpoint shifts) and
  `Experiment.tpcOf()` needs disjoint boxes.

Relation to the clustering FV (not used for the boxes): per-drift FV x is
±[3.0, 335.835] — the FV anode edge sits 5.7 cm inside the wire plane
(`apa_plane` = 57.15 mm), so blob points in the 335.8–341.55 cm "anode band"
are inside the boxes but outside the FV. Overall FV: y ±336.4,
z [0.05, 299.25].

### Optical channels

PDVD's `op` instance (8 cathode + 8 membrane X-ARAPUCA + 24 PMT = 40 channels)
is hand-derived from the `PDVD_PDS_Mapping_v09162025.json` channel order, with
representative placement in the box frame. Unlike PDHD, there is **no toolkit
per-channel opdet geometry file** in the repo to validate it against (only
`pdvd/docs/photon-detector-chain.md`), so the ch→position mapping here is not
cross-checked against a surveyed toolkit reference.

### Previous (pre-2026-06) boxes

`[±3.03, ±313.03] × [0/−337, 337/0] × [0, 149.65, 299.3]` — the anode edge
at |x| = 313.03 was **28.5 cm inside** the actual wire plane (and 22.8 cm
inside even the FV edge), so tracks near the anodes rendered well outside the
drawn detector. The 2026-06 update also set the cathode gap to 2.54 cm
(legacy 50.8 mm cathode), corrected 2026-07 to 3.0 cm (60 mm GDML).

## 4. Consistency summary (toolkit vs Bee, after the update)

| Quantity | Toolkit source | Bee |
|---|---|---|
| PDHD anode (W-plane) x | −353.202 / +353.002 (wire file v1) | box edges, exact |
| PDHD cathode gap | ±2.54 (clus.jsonnet `a*f*pA` FV_x) | box edges, exact |
| PDHD y/z extents | wire file v1 per-APA extents | box edges, exact |
| PDVD anode (W-plane) x | ±341.55 (wire file v5) | box edges, exact |
| PDVD cathode gap | ±3.0 (60 mm GDML cathode; clus.jsonnet FV, 2026-07 correction) | box edges, exact |
| PDVD y/z extents | wire file v5 per-anode extents | box edges, exact (z split at per-side gap midpoint) |
| Drift velocity | PDHD 1.576 / PDVD 1.568 mm/µs (crosser-calibrated, clus.jsonnet/params.jsonnet) | 0.1576 / 0.1568 cm/µs (both explicit in `experiment.js`) |

Neither detector has per-event T0 (time_offset = 0 in the toolkit), so blob x
is the apparent drift position; the box x ranges above are exactly the
apparent-x ranges of in-time charge.
