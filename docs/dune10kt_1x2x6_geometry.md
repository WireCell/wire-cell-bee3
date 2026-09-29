# DUNE FD-HD 1x2x6 geometry in wire-cell-bee3

The `DUNE10kt1x2x6` class in
[`events/static/js/bee/physics/experiment.js`](../events/static/js/bee/physics/experiment.js)
draws the DUNE far-detector horizontal-drift 1x2x6 workspace, the geometry of the WCT wire file
`dune10kt-1x2x6-wires-larsoft-v1.json.bz2`. A Bee event selects it with `"geom": "dune10kt-1x2x6"`.
It was added for the wcfm campaign (wcp-porting-validation `wcfm/docs/16`, `17`), whose zips had been
tagged `protodunehd` for lack of an FD entry.

## Layout

| item | value (cm, LArSoft global frame) | source |
|---|---|---|
| APAs | 12, WCT anode ident `a`: row `a % 2` (0 = y < 0), column `floor(a / 2)` | wires file |
| faces | both live; face 0 drifts to +x, face 1 to −x | wires file |
| boxes | 24 = one per (APA, face) | |
| x | collection plane \|x\| = 3.00155 to cathode surface \|x\| = 362.91625 (363.075 − 0.3175/2) | `wirecell-util wires-info`; toolkit `cfg/pgrapher/experiment/dune10kt-1x2x6/params.jsonnet` (apa_cpa, cpa_thick) |
| y | −600.120 to −0.994 and 0.994 to 600.120 | `wires-info` |
| z | six columns 230.638 long at a 232.39 pitch: 0 to 1392.588 | `wires-info` |
| wire angles | U −35.7, V +35.7, W 0 (from vertical) | wires file |
| drift speed | 0.16 cm/µs (the wcfm chain's 1.6 mm/µs) | |

The existing `dune10kt_workspace` class is the older 1x2x2 workspace: same x = 0 anodes and z pitch,
only two z columns.

## Box order and drift direction

Box `2*(2*col + row)` is the −x face and the next box the +x face of that APA position, so
`location[0]` holds the minimum corner and `location[23]` the maximum corner that
`updateDimensions()` reads for the overall extent.

The anode is on each box's **inner** side (x ≈ 0), unlike PDHD, whose anodes are at the outer walls.
Bee's convention is `driftDir(i) = +1` when the anode sits on the box's −x side:
- `op.js` draws the anode band at `-driftDir*halfx` from the box centre;
- the flash-time shift is `x − v·t·driftDir`.

The base class's index-parity `driftDir` would be backwards for this box order. So the class
overrides it geometrically: +1 for the +x boxes, −1 for the −x boxes. A quick check in node gives an
anode at x = +3.00 for box 1 and x = −3.00 for box 0 (PDHD box 0: x = −353.2, at its wall).

## Projection mirroring (known limitation)

Direction of SP channel number along +Z (segment-0 wires):

| APA row | face 0 (+x drift) | face 1 (−x drift) |
|---|---|---|
| y > 0 (odd ident) | U +Z, V −Z | U −Z, V +Z |
| y < 0 (even ident) | U −Z, V +Z | U +Z, V −Z |

The y > 0 row numbers channels like PDHD, so `projMirror` uses the PDHD rule: mirror V in nominal
drift, U in reverse. The y < 0 row is the opposite, so its U/V projections appear mirrored against the
SP image. `projMirror(index, reverseDrift)` has no TPC argument to tell the rows apart.

## No optical detectors

No optical detectors are defined, and the beam direction is not set.

## Deployment

A local change does not reach the live Bee server. Rebuild the Parcel bundle and deploy
(`docs/linux-deployment.md`) **before** any zip carries `"geom": "dune10kt-1x2x6"`. Until then, the
live server falls back to MicroBooNE for the unknown name (`createExperiment`).
