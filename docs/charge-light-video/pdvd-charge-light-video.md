# ProtoDUNE-VD charge–light matching video (Run 39252, Event 298581)

A ~1 min 55 s narrated event-display video for one ProtoDUNE **Vertical Drift** charge–light
match, rendered straight from the Bee viewer — no Bee code changed. It is the PDVD counterpart of
the PDHD/SBND videos (see [`../making-a-charge-light-video.md`](../making-a-charge-light-video.md)
and the PDHD scripts in this directory).

- **Event source (local):** `http://localhost:8000/set/eec93799-7a6f-4474-8196-688ddbdd91bb/event/0/`
- **Voice:** kokoro `af_heart` (on-device ONNX) — the same neural voice as the other videos, *not*
  the macOS `say` default.
- **Deliverable:** `pdvd_ql_matching_narrated.mp4` (1280×1000, 30 fps, ~115 s).

## Files

The three scripts are committed here as reference copies; they are run from the scratch
`bee-video/` working directory (which also holds `node_modules/`, the kokoro venv/models, and the
rendered frames/mp4s — none of which belong in git).

- **`make_pdvd_clustering.mjs`** — Part 1 (top/bottom TPC clustering reveal).
- **`make_pdvd_sidepanel.mjs`** — Part 2 (side-panel charge–light matching + beam finale).
- **`make_pdvd_narrated.mjs`** — concatenates the two parts and muxes the kokoro voice-over.

### Rebuild

```bash
cd bee-video                        # the scratch working dir (Playwright + kokoro live here)
node make_pdvd_clustering.mjs       # -> pdvd_clustering.mp4 (+ .srt)   ~40 s
node make_pdvd_sidepanel.mjs        # -> pdvd_sidepanel.mp4  (+ .srt)   ~75 s
printf "file 'pdvd_clustering.mp4'\nfile 'pdvd_sidepanel.mp4'\n" > concat_pdvd.txt
ffmpeg -y -f concat -safe 0 -i concat_pdvd.txt -c copy -movflags +faststart pdvd_ql_matching.mp4
node make_pdvd_narrated.mjs         # -> pdvd_ql_matching_narrated.mp4  (voice-over)
```

Each `make_*` script also has `GATE=` single-frame renders for tuning a scene before the full
multi-hundred-frame render (clustering: `GATE=1|2|3`; sidepanel: `GATE=B|N|C`).

## Storyboard

**Part 1 — clustering reveal (`make_pdvd_clustering.mjs`, ~40 s).** The top TPC is anode boxes
4–7 (layer `img-side-top`), the bottom TPC is boxes 0–3 (`img-side-bot`); each TPC's four CRPs
tile 2×2 in (y,z). Beats:

1. Title / establishing charge cloud, with the four top CRP boxes drawn in red.
2. Cluster colors — "the top TPC is read out by four charge readout planes (CRPs)".
3. **T0 explanation** — zoom out to reveal charge reconstructed *outside* the CRP boxes: before
   light-matching gives T0, only the charge arrival time is known, so the drift position is off.
4. Along-drift view (look down the drift axis) + converging seam arrows — tracks crossing the four
   planes are joined into single clusters.
5–6. Bottom TPC: cluster colors + four CRP boxes, then the along-drift joined view.

**Part 2 — side-panel matching (`make_pdvd_sidepanel.mjs`, ~75 s).** Layer `img-global`.

- **Seg A** (full split): charge → clusters → side panel on; matched loop (SUBSET=16 flashes,
  1 s each) — left = as-measured, right = T0-corrected detector frame.
- **Seg B** (right-half crop, detector frame only): matched loop (16 flashes, 1.5 s each, spin) —
  red measured PE vs green predicted PE circles.
- **Seg C** (full frame): non-matched clusters shown on their own, with a top label reporting the
  **match census** (58 clusters matched to light · only 3 long tracks unmatched) so the few long
  unmatched tracks read as small next to the whole set.
- **Seg D** (right-half crop): the **beam-flash finale** — shown as the detector side only.

## Narration & pacing

Narration lines live in `make_pdvd_narrated.mjs`; their start times come from the two generated
`.srt` cue tracks (Part 1 spans 0–40 s, Part 2 is offset +40 s). Beats are sized so **every line
plays at ~1.0× — no rushing**; the opening line (which reads the run/event numbers) gets a ~12 s
establishing shot. The non-matched line notes the unmatched long tracks are where light
reconstruction and charge–light matching can be further improved.

## PDVD-specific technical notes (the things that bit us)

- **Config is at `bee.scene3d.store.config`** (`bee.store` / `window.store` are undefined). All
  `config.op.*` flags simply call `bee.op.draw()`. The usual wiring tricks apply: sole render
  driver (cancel rAF, `window.animate()` per frame), virtual clock `Date.now = () => window.__virt`
  for a deterministic turntable, headless ANGLE/SwiftShader, captions as a `#__cap` DOM overlay.
- **Layers:** `img-side-top` / `img-side-bot` are the per-TPC layers (carry `cluster_id`);
  `img-global` is the whole event. `clustering-global` has **uncalibrated x (~±1.5e8)** — do NOT
  use it for spatial framing or the cathode-crosser scan; use `img-global` (proper cm, cathode at
  x=0).
- **Geometry:** `exp.tpc.location` holds 8 per-CRP boxes `[xmin,xmax,ymin,ymax,zmin,zmax]` (global
  cm); `driftDir = [1,1,1,1,-1,-1,-1,-1]`; drift velocity 0.148073. Hide the faint built-in 8-box
  helper with `config.helper.showTPC = false; bee.helper.showTPC()` so only the active TPC's four
  red CRP boxes show.
- **Along-drift view:** `scene.main.rotation.z = +π/2`, so geometry-local X (drift) maps to WORLD
  Y. To look down the drift and see the clean 2×2 CRP tiling you need **`xzView`'s geometry** (camera
  on world Y, up world X), set **directly** — `xzView`/`yzView` use TweenLite which never advances
  under the neutralized rAF, and `xwView` adds a wire-angle rotation that spills the T0 drift-sprawl
  back into screen-vertical.
- **Predicted (green) PE circle:** op.js already fans it off the measured (red) one for
  `protodunevd` (op.js ~L354–370) — **no `fixPred` fixup needed** (unlike SBND's `-2*halfy` dump).
- **Beam flash:** `nextMatchingBeam()` is **unreliable** here (PDVD beam-window defaults land it on
  t ≈ −2350 µs). Land by **exact index** = nearest `op_t`/`op_t1` to the target time, asserting the
  match is within 0.5 µs. For this event the beam flash is **idx 130, op_t 1794.62 µs, peTotal
  ≈ 53164** (the requested 1794.82 is within 0.2 µs; peTotal ~10× any neighbor confirms it). The
  finale label shows the true data value, 1794.62 µs. Per-TPC clocks: `op_t` bottom, `op_t1` top.
- **Match census:** matched vs non-matched clusters come from `bee.op.allMatchingIds()` and
  `bee.op.nonMatchingIds()`. Raw counts are 58 matched / 65 non-matched of 123, but 62 of the
  non-matched are tiny noise fragments — only 3 are long tracks (a size threshold of ≥300 points
  cleanly separates them), which is why the label reads "58 matched · 3 long unmatched".
