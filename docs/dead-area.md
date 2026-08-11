# Dead-Area Rendering in Bee3

This document explains (1) how dead-channel regions are rendered in the 3D event display,
(2) the required input file format, and (3) the multi-anode extension added for detectors
with multiple TPC drift volumes.

---

## 1. How the dead area is plotted

Dead-channel regions are represented as thin shaded slabs on the anode plane of a TPC.
Each slab is 2 cm thick along the drift (X) axis and covers a polygon in the Y-Z (wire)
plane.

### Pipeline

| Layer | File |
|-------|------|
| Client controller | `events/static/js/bee/physics/deadarea.js` |
| Geometry builder (Web Worker) | `events/static/js/worker_deadarea.js` |
| Browser bundle | `events/static/js/bee/dist/bee.js` (built with Parcel) |

Flow:

1. **File discovery** — on page load the `DeadArea` constructor fetches
   `/set/<set_id>/event/<event_id>/deadarea/`, which returns a JSON list of every
   `channel-deadarea*` file present for the event.

2. **Load all files** — `init()` loops over the full list and GETs each file's JSON via the
   generic `/set/<set_id>/event/<event_id>/<name>` route (served by `events/views.data`).

3. **Geometry per file** — `initWorker(rawJson)` spawns a Web Worker for each file,
   posts the polygon array and the target anode geometry, receives back a
   `Float32Array` of vertex positions and normals, and creates one `THREE.Mesh` per file.
   All meshes are added to a shared `THREE.Group` attached to the main Three.js scene.

4. **Rendering** — meshes use `THREE.MeshBasicMaterial` (double-sided, transparent).
   The opacity slider in the "Dead Area" GUI panel applies to all meshes simultaneously.

### Color scheme for multi-anode detectors

For detectors with multiple anodes (e.g., SBND with two TPCs), dead areas from different
anodes are rendered in distinct colors to aid visual differentiation:

- **apa0 / tpc0** — Grey (`0x888888`)
- **apa1 / tpc1** — Red (`0xFF0000`)
- **Other anodes** — Grey (default)

The color is determined by the dead-area filename label (the suffix after `channel-deadarea-`).
If the label contains `apa0` or `tpc0`, the mesh renders grey; if it contains `apa1` or
`tpc1`, the mesh renders red. This coloring is applied in `deadarea.js` (line 156) and
provides immediate visual feedback about which anode face a dead region belongs to.

### Anode-plane placement

The Bee local coordinate origin is the **geometric center of the union of all TPC bounding
boxes** (`Experiment.tpc.center`). Within that frame:

- **Legacy (bare-array) files:** the slab starts at `x = -halfx` (where `halfx` is half
  the full detector X extent, i.e. the most-negative anode face of the detector envelope)
  and extends 2 cm inward (`x = -halfx + 2`). This is the original, single-slab behaviour.

- **Per-TPC (wrapper) files:** the slab starts at the anode face of the declared TPC and
  extends 2 cm inward along that TPC's drift direction. See §3 for the format.

> **Known technical note:** The Web Worker loads its own copy of the old Three.js `r85`
> bundle via `importScripts('lib/three.min.js')` because it uses legacy APIs
> (`THREE.Geometry`, `SplineCurve3`, `.merge()`, `.fromGeometry()`) that were removed in
> later Three.js versions. The main page uses Three.js r145. This mismatch is intentional
> (the worker is isolated) and left unchanged here; migrating the worker to modern Three.js
> BufferGeometry APIs is a separate follow-up task.

---

## 2. Input file format

### Zip bundle layout

```
upload.zip
└── data/
    └── <event_id>/          # event_id is a decimal string ("0", "1", …)
        ├── <event_id>-channel-deadarea.json            # one or more dead-area files
        ├── <event_id>-channel-deadarea-tpc0.json
        ├── <event_id>-channel-deadarea-tpc1.json
        └── <event_id>-<other-layers>.json
```

Any file whose name (after stripping the `<event_id>-` prefix) starts with
`channel-deadarea` is treated as a dead-area layer by `EventSet.deadarea_list()`
(`events/models.py:98-104`). The suffix after `channel-deadarea` is arbitrary and becomes
the label shown in the GUI.

### Legacy format (backward-compatible)

A top-level JSON **array** of polygons. Each polygon is an array of 2-tuples `[Y, Z]`
in centimetres in the **LArSoft global coordinate frame** (same units as the `y`/`z` arrays
in the reconstruction JSON files).

```json
[
  [ [y0, z0], [y1, z1], [y2, z2], [y3, z3] ],
  [ [y0, z0], [y1, z1], [y2, z2] ],
  ...
]
```

- No metadata wrapper, no `runNo`/`geom`/TPC index.
- The anode X is inferred entirely from `store.experiment.tpc.halfxyz[0]` (the global
  detector envelope half-extent), so every polygon lands on the outermost negative-X face
  of the detector union — suitable for single-TPC detectors such as MicroBooNE.
- Polygon winding does not matter: `THREE.DoubleSide` is set on the material.

### Per-TPC format (new, for multi-anode detectors)

A JSON **object** with the following fields:

```json
{
  "version": 2,
  "tpc": 0,
  "polygons": [
    [ [y0, z0], [y1, z1], [y2, z2], [y3, z3] ],
    [ [y0, z0], [y1, z1], [y2, z2] ]
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `version` | integer | Schema version identifier. Use `2`. |
| `tpc` | integer | Zero-based TPC index into `experiment.tpc.location`. Determines which anode face the slab lands on. |
| `polygons` | array | Same structure as the legacy top-level array: array of polygons, each a list of `[Y, Z]` cm pairs. |

The anode X for TPC index `i` is computed as:

```
anode_x_global = center(i).x - driftDir(i) * halfXYZ(i).x
```

where `center(i)`, `halfXYZ(i)`, and `driftDir(i)` are defined in
`events/static/js/bee/physics/experiment.js:39-53`. The slab extends 2 cm **inward** along
the drift direction (`anode_dx = driftDir(i) * 2`), so it always sits inside the active
volume.

---

## 3. Multi-anode support

### Motivation

Multi-TPC detectors (SBND, ProtoDUNE-HD, ICARUS, DUNE10kt, …) have one anode face per
TPC drift volume. The legacy code placed every dead-region polygon on a single slab at the
most-negative X face of the detector envelope, which is wrong for all anodes other than TPC
0 in a two-TPC detector.

### Design

- **Input:** produce one `channel-deadarea*.json` file per anode using the new wrapper
  format, specifying the correct `tpc` index.
- **Client:** `DeadArea` now loads **all** files in `deadarea_list`, creating one mesh per
  file. The meshes are grouped under a single `THREE.Group` so the opacity slider affects
  them uniformly.
- **Backward compatibility:** a legacy bare-array file behaves identically to before — it
  renders at the union outer-anode (`x = -halfxyz[0]`), so existing uploads need no changes.

### TPC index mapping (SBND example)

For SBND (`experiment.js`, class `SBND`):

| TPC index | `tpc.location` | drift direction | anode x (global) |
|-----------|----------------|-----------------|-------------------|
| 0 | `[-201.75, -0.45, …]` | +1 (rightward) | −201.75 cm |
| 1 | `[0.45, 201.75, …]` | −1 (leftward) | +201.75 cm |

Example for an SBND event with dead channels in both TPCs:

```
data/0/
├── 0-channel-deadarea-tpc0.json   →  {"version":2,"tpc":0,"polygons":[ [[y,z],…], … ]}
└── 0-channel-deadarea-tpc1.json   →  {"version":2,"tpc":1,"polygons":[ [[y,z],…], … ]}
```

Both slabs will appear simultaneously in the 3D display; the opacity slider controls both.

### Producing multi-anode files from Wire-Cell

The producer (Wire-Cell toolkit, external to this repo) must:

1. Group dead channels by their TPC (face) index.
2. Convert the dead wire ranges into polygonal outlines on the anode plane (Y-Z in LArSoft
   global cm) — Wire-Cell already does this; the new requirement is to separate the output
   by TPC index.
3. Write one `channel-deadarea-tpc<N>.json` file per TPC, using the new wrapper format.

For single-TPC detectors (MicroBooNE) the legacy bare-array format remains the simplest
option; the wrapper format with `"tpc":0` is equally valid.

---

## 4. Key source locations

| Concern | File | Lines |
|---------|------|-------|
| Server file discovery | `events/models.py` | `deadarea_list()` 98-104, `has_DeadArea()` 94-96 |
| Server endpoints | `events/views.py` | `deadarea_info` 197-204, `data` 172-195 |
| URL routes | `events/urls.py` | deadarea route line 8 |
| Client controller | `events/static/js/bee/physics/deadarea.js` | full file |
| Geometry worker | `events/static/js/worker_deadarea.js` | full file |
| Per-TPC geometry helpers | `events/static/js/bee/physics/experiment.js` | `halfXYZ` 39-43, `center` 45-49, `driftDir` 51-53, `updateDimensions` 68-75 |
| Opacity slider | `events/static/js/bee/gui.js` | 133-140 |
| Analogous per-TPC loop (optical) | `events/static/js/bee/physics/op.js` | 34-94 |
