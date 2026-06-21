# Charge–light matching demo video

Worked example for [`../making-a-charge-light-video.md`](../making-a-charge-light-video.md):
a ~28 s clip of one ProtoDUNE-HD charge–light match (Run 29107, Event 983) rendered
straight from the Bee viewer — no Bee code changed.

## Files

- **`make_video.mjs`** — the renderer. Playwright drives the *existing* Bee viewer
  through its `window.bee` API, screenshots one PNG per frame, writes a beat-synced
  subtitle track, and calls ffmpeg to assemble the mp4.
- **`subs.srt`** — generated subtitle cues (edit to retime/retext without re-rendering).
- **`charge_light.mp4`** — the rendered clip, captions burned in.

## Run / re-render

```bash
npm i -D playwright && npx playwright install chromium   # one-time
node make_video.mjs                                       # writes charge_light.mp4
```

Point at a different event by editing the constants at the top of `make_video.mjs`
(`SET`, `EVENT`, or swap `URL` for the live BNL host). Edit the `BEATS` array near the
bottom to change the story — each beat is `{ caption, secs, spin, setup }`.

## How it works (the non-obvious bits)

These are the things that bit us; the script bakes in the fixes (full writeup in the
parent guide's "Lessons learned" box):

- Config is at **`bee.scene3d.store.config`** — `bee.store` / `window.store` are `undefined`.
- You **cannot** set `scene.main.rotation.y` by hand; the render loop forces it to 0
  unless `config.camera.rotate` is true. We enable it and install a **virtual clock**
  (`Date.now = () => virt`) so the turntable angle is deterministic.
- We become the **sole render driver** (cancel the viewer's `requestAnimationFrame`
  loop, neutralize reschedules, render each frame with `window.animate()`) — two loops
  flicker.
- Capture is **headless** (ANGLE/SwiftShader) — no popup window to flicker or grab focus.
- This ffmpeg has **no libass**, so captions are drawn as a **DOM overlay** captured in
  each screenshot rather than burned by the `subtitles=` filter.

This `make_video.mjs` is a copy committed for reference; render it from any scratch dir
(keep `node_modules/` and `frames/` out of the repo).
