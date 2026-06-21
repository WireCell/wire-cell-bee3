# Making a charge–light matching video from a Bee event

Goal: turn **one** run-29107 PDHD event in Bee into a short, polished video that
shows off a good charge–light match — rotating the 3-D view, toggling the flash
match, opening the side-panel ("true detector frame") mode, switching between the
`img-global` and `clustering-global` layers, and changing colors.

This document explores the options and gives copy-paste instructions. **No code
is changed** anywhere; everything here drives the *existing* Bee viewer, either by
hand or through its already-exposed JavaScript API.

---

## 0. The key fact that makes this easy

The whole viewer is exposed on the page as a single global object, `window.bee`
(`bee.js:61` — and **only** `window.bee`; there is no `window.store`). The shared
data/config store hangs off the sub-objects:

```js
window.bee                       // the Bee app (the only global)
window.bee.scene3d.store.config  // every view setting (camera, op/flash, material, …)
window.bee.scene3d.store.config.op   // flash-matching toggles + sidePanel
window.bee.scene3d               // camera + render loop
window.bee.op                    // optical / flash-matching controller (op.store === scene3d.store)
window.bee.sst.list              // the data layers, keyed by name
```

So **every operation you do by hand has a one-line scripted equivalent.** That is
what lets us automate a smooth, reproducible video. You can verify this yourself:
open any Bee event, open the browser dev-console, and type `bee` — you'll see the
whole tree.

> ### ⚠️ Lessons learned (verified by actually building the video on this build)
>
> The first pass of this guide had a few API details wrong; here is what the
> running PDHD bundle actually does. The working script in
> `docs/charge-light-video/make_video.mjs` already bakes all of this in.
>
> 1. **Config is at `bee.scene3d.store.config`, *not* `bee.store.config`.** Only
>    `window.bee` is exposed; `window.bee.store` and `window.store` are both
>    `undefined`. The same store object is reachable as `bee.op.store` and
>    `bee.gui.store`.
> 2. **You cannot set `scene.main.rotation.y` by hand.** The render loop
>    (`scene.js:153`) *forces* `rotation.y = 0` every frame unless
>    `config.camera.rotate` is `true` — in which case it sets
>    `rotation.y = Date.now() * 0.0001` (a wall-clock turntable, ≈63 s/turn). To
>    get a **deterministic** angle, enable `camera.rotate` **and install a virtual
>    clock**: `Date.now = () => myVirtualMs`, then step `myVirtualMs` per frame
>    (`angle = virt * 0.0001`).
> 3. **Don't run two render loops — they flicker.** If you force renders while the
>    viewer's own `requestAnimationFrame` loop is alive, the screen flashes between
>    them. Become the **sole driver**: cancel the loop
>    (`cancelAnimationFrame(bee.scene3d.animationId)`), neutralize reschedules
>    (`window.requestAnimationFrame = () => 0`), then render each frame yourself
>    with `window.animate()` (it renders **synchronously**, so it also defeats the
>    RAF throttling that headed-but-unfocused windows impose).
> 4. **Layer order for this PDHD upload** is `1`=`clustering-global`,
>    `2`=`clustering-group02`, `3`=`clustering-group13`, `4`=`img-global`. So
>    img-global is hot-key **`4`**, not `2`. Prefer the name-tolerant `pick()`
>    helper (matches a substring) over a fixed number.
> 5. **Event *index* 0 of this set = Run 29107, Event 983** (a clean recommended
>    match, with optical data). The set/event in the URL is a 0-based index, not the
>    physics event number — read `bee.store`'s header (the top bar shows
>    `Run 29107 | Event 983`).
> 6. **Hide the right-hand dat.GUI** (`.dg.main { display:none }`) before capturing
>    — otherwise it overlaps the side-panel's true-detector frame.
>
> **Confirm on your live link first** (the deployed BNL build may differ): paste
> into the dev-console (F12 → Console) and check the output:
>
> ```js
> bee;                                   // app object (not undefined)
> Object.keys(bee.sst.list);             // exact layer strings
> bee.scene3d.store.config.op;           // the op toggles exist
> !!bee.op;                              // true => this event has optical/flash data
> ```
>
> If the layer strings differ from `img-global` / `clustering-global`, prefer the
> **hot-keys** (§1a) or the substring `pick()` — both need no exact internal names.

Two ways to capture, covered below:

- **Option A — record the screen while you (or a script) drive Bee.** Fastest, zero
  install, full fidelity. Best if you want to narrate/pace it live.
- **Option B — Playwright drives Bee and captures frames; `ffmpeg` assembles an
  mp4.** Fully reproducible, smooth constant-speed rotation, deterministic
  choreography. Best for a clean final product.

Both work against the **live BNL Bee link** you already have — no local server
needed unless you specifically want a private/offline copy (see §5).

---

## 1. The control surface (what you can drive, and how)

### 1a. Keyboard shortcuts (from `dispatcher.js`)

Bee binds these globally (via Mousetrap). Playwright can press them; you can press
them during a manual screen recording too. Press `?` in Bee to see the live list.

| Key | Action | Code |
|---|---|---|
| `x` / `y` / `z` | snap camera to YZ / XZ / XY view | `scene3d.yzView()` … |
| `u` / `v` / `w` | snap to U / V / W wire-plane projection | `scene3d.xuView()` … |
| `r` | reset camera | `scene3d.resetCamera()` |
| **`shift`+`f`** | **start rotation** (turntable) + go fullscreen | `scene3d.play()` |
| `esc` | stop rotation / exit fullscreen | `scene3d.stop()` |
| `shift`+`↑` / `shift`+`↓` | zoom in / out | `camera.zoom ±= 0.1` |
| `=` / `-` | layer opacity ± | `current_sst.increaseOpacity()` |
| `{` / `}` | fully transparent / opaque | |
| `+` / `_` | point size ± | `current_sst.increaseSize()` |
| **`o`** | **re-color clusters (random palette)** | `redrawAllSST(true)` |
| `1`…`9` | **select data layer N** (`img-global`, `clustering-global`, …) | `sst.selected()` |
| `<` / `>` | previous / next flash | `op.prev()` / `op.next()` |
| **`,`** / **`.`** | **previous / next *matched* flash** | `op.prevMatching()` / `op.nextMatching()` |
| `q` | toggle charge coloring | `gui.toggleCharge()` |
| `b` | toggle the ROI box | `gui.toggleBox()` |
| `shift`+`n` / `shift`+`p` | next / previous event | `gui.increaseEvent(±1)` |

> The number keys map to `store.event.sst` **in order**. For this PDHD upload the
> layers are `img-global`, `clustering-global` (plus the optical `op` and dead-area
> groups), so `1` and `2` switch between the imaging and clustering point clouds —
> exactly the "img-global ↔ clustering-global" toggle you asked about.

### 1b. The `window.bee` API for the operations you named

Anything not on a hot-key (side panel, specific flash, exact rotation angle, color
scale) is a direct property set followed by a redraw. The pattern is always
**"set `store.config.…` then call the matching draw method"** (this is literally
what the GUI does on each control change):

```js
const cfg = bee.scene3d.store.config;   // the config object (NOT bee.store — that's undefined)

// ---- Flash matching ----
cfg.op.showFlash           = true;
cfg.op.showMatchingCluster = true;   // draw the matched cluster(s)
cfg.op.showPred            = true;    // predicted PE pattern
cfg.op.matchTiming         = true;    // the "matching box"
bee.op.draw();                        // apply
bee.op.nextMatching();                // step to the next *matched* flash
bee.op.prevMatching();

// ---- Side-by-side "true detector frame" panel (Option B in the code) ----
cfg.op.sidePanel = true;
bee.op.draw();

// ---- Switch data layer (img-global ↔ clustering-global) ----
bee.sst.list['clustering-global'].selected();      // or 'img-global'
// (equivalent to pressing 1 / 4 — see the layer order in the lessons box above)

// ---- Color ----
bee.redrawAllSST(true);                             // random per-cluster colors (key 'o')
cfg.material.colorScale = 1.4;                       // 0–1.9 charge color scale
bee.redrawAllSST();

// ---- Camera ----
bee.scene3d.yzView(); bee.scene3d.xzView(); bee.scene3d.xyView();
bee.scene3d.resetCamera();
bee.scene3d.camera.active.zoom = 1.4; bee.scene3d.camera.active.updateProjectionMatrix();

// ---- Rotation (read the lessons box — you canNOT just set rotation.y) ----
cfg.camera.rotate = true;            // enable the turntable; the render loop then owns rotation.y
Date.now = () => myVirtualMs;        // install a virtual clock for a DETERMINISTIC angle…
window.animate();                    // …and force one synchronous render at that angle
// (angle in radians = myVirtualMs * 0.0001)
```

> **Manual rotation by drag** also works in a hand-driven session (the viewer uses
> Three.js `OrbitControls`, `scene.js:145`), so you can just grab and spin with the
> mouse. For *automation*, setting `rotation.y` directly does nothing — the render
> loop overwrites it every frame (lesson #2 above). Drive it through
> `camera.rotate` + a virtual `Date.now` instead, as the script does.

---

## 2. Option A — manual screen recording (fastest, no install)

You already know the UI, so this is often the quickest route to a good clip.

1. Open your event link in Chrome/Safari, e.g.
   `https://www.phy.bnl.gov/twister/bee/set/<set-id>/event/<N>/`
   (use the event you've judged a clean match).
2. Set up the shot by hand or paste the snippets from §1b into the dev-console.
3. Start a **smooth auto-rotation** with `shift`+`f` (turntable) — this gives you a
   hands-free constant spin while you press keys for the rest.
4. Record the screen:
   - **macOS built-in:** `⌘`+`shift`+`5` → "Record Selected Portion" → drag over the
     Bee canvas → Record. Stop from the menu bar. Saves a `.mov`.
   - **OBS Studio** (`brew install --cask obs`) if you want a window-capture source,
     overlays, or a webcam/voiceover. Export mp4 directly.
5. While recording, walk through the story with the hot-keys: `,`/`.` to step
   matched flashes, `1`/`2` to flip img-global ↔ clustering-global, `o` to recolor,
   side panel via the GUI checkbox (or the console line). `esc` stops the spin.

Trim/convert afterward if needed:

```bash
ffmpeg -i screen.mov -vf "crop=1280:1280:..." -c:v libx264 -crf 18 -pix_fmt yuv420p out.mp4
```

**Pros:** zero setup, full GPU fidelity, you control pacing/narration.
**Cons:** not reproducible; mouse jitter; constant-speed rotation only via `shift`+`f`.

---

## 3. Option B — Playwright drives Bee, ffmpeg assembles the video (recommended for a polished result)

Playwright launches a real Chromium, runs your choreography by calling the same
`window.bee.*` methods, and captures either (b1) a video of the session or (b2)
one screenshot per frame that ffmpeg stitches into a crisp, constant-fps mp4.
Frame-by-frame (b2) is what I'd use for the final piece — you get exact control of
rotation speed, pauses on each "beat," and resolution.

### Install (one-time)

```bash
mkdir -p ~/bee-video && cd ~/bee-video
npm init -y
npm i -D playwright
npx playwright install chromium
```

### `make_video.mjs` — frame-by-frame turntable with scripted beats

> **Use the tested script, not this sketch.** The block below is the original
> *illustrative* skeleton; it predates the lessons box (it still uses the wrong
> `bee.store.config` path, sets `rotation.y` directly, launches headed, and burns
> subtitles with libass). The **working, rendered** version lives at
> `docs/charge-light-video/make_video.mjs` (§8) and incorporates every fix:
> `bee.scene3d.store.config`, the virtual-clock turntable as sole render driver,
> headless capture, and DOM-overlay captions. Read this sketch for the *shape*; run
> that file.

```js
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const URL = 'https://www.phy.bnl.gov/twister/bee/set/<SET-ID>/event/<N>/';
const OUT = 'frames';
const W = 1280, H = 1280;
const FPS = 30;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
await page.goto(URL, { waitUntil: 'networkidle' });

// Wait until the app + first layer are ready.
await page.waitForFunction(() => window.bee?.current_sst?.pointCloud, null, { timeout: 60000 });

// --- helpers ---
const ev = (fn, arg) => page.evaluate(fn, arg);
const key = (k) => page.keyboard.press(k);              // version-stable hot-keys
// Dynamic, name-tolerant layer pick (handles capitalization / prefix differences):
const pick = (sub) => ev((s) => {
  const k = Object.keys(bee.sst.list).find(n => n.toLowerCase().includes(s));
  if (k) bee.sst.list[k].selected();
  return k;
}, sub);
const hasOp = await ev(() => !!window.bee.op);          // does this event have flashes?

// Initial look: clustering layer, matched flash shown, nice view.
await pick('clustering');
await ev(() => {
  if (bee.op) {
    Object.assign(bee.store.config.op, { showFlash: true, showMatchingCluster: true, showPred: true });
    bee.op.draw();
  }
  bee.scene3d.resetCamera();
});
await page.waitForTimeout(500);

let frame = 0;
const shoot = async () => page.screenshot({ path: `${OUT}/${String(frame++).padStart(5,'0')}.png` });

// Beat 1: one full smooth turntable rotation (deterministic, set the angle ourselves)
const turns = 1, secs = 8, N = FPS * secs;
for (let i = 0; i < N; i++) {
  const ang = (i / N) * turns * 2 * Math.PI;
  await ev((a) => {
    const s = bee.scene3d.scene;
    s.main.rotation.y = a; s.slice.rotation.y = a; s.detector.rotation.y = a;
  }, ang);
  await shoot();
}

// Beat 2: flip to img-global, hold 1 s
await pick('img');
for (let i = 0; i < FPS; i++) await shoot();

// Beat 3: step through a few matched flashes (hot-key '.' = nextMatching)
if (hasOp) for (let k = 0; k < 4; k++) {
  await key('.');
  for (let i = 0; i < FPS * 1.2; i++) await shoot();
}

// Beat 4: open the side panel (true detector frame) — no hot-key, use the API. Hold 2 s
if (hasOp) await ev(() => { bee.store.config.op.sidePanel = true; bee.op.draw(); });
for (let i = 0; i < FPS * 2; i++) await shoot();

// Beat 5: recolor clusters (hot-key 'o' = random palette)
await key('o');
for (let i = 0; i < FPS * 1.5; i++) await shoot();

await browser.close();

// Assemble mp4
execSync(
  `ffmpeg -y -framerate ${FPS} -i ${OUT}/%05d.png ` +
  `-c:v libx264 -crf 18 -pix_fmt yuv420p -movflags +faststart charge_light.mp4`,
  { stdio: 'inherit' }
);
console.log('wrote charge_light.mp4');
```

Run it:

```bash
node make_video.mjs
```

Edit the `URL`, the layer names if different, and the per-beat durations to taste.
The structure is just "do an action, then shoot N frames" — add/reorder beats freely
(zoom with `bee.scene3d.camera.active.zoom`, snap views with `yzView()` etc.).

### (b1) Even simpler: let Playwright record the whole session

If you don't need per-frame precision, record the context to a `.webm` and skip the
frame loop:

```js
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  recordVideo: { dir: 'video', size: { width: W, height: H } },
});
const page = await ctx.newPage();
// … drive bee with page.evaluate / page.keyboard.press('.') / waitForTimeout …
await ctx.close();   // finalizes video/<hash>.webm
```

then `ffmpeg -i video/*.webm -c:v libx264 -crf 18 -pix_fmt yuv420p out.mp4`.
Driving via hot-keys here is just `await page.keyboard.press('.')`, `press('1')`,
`press('o')`, `press('Shift+F')`, etc. (Playwright uses capitalized key names and
`Shift+F`, not `shift+f`; Mousetrap receives the resulting keystroke.)

**Pros:** reproducible, smooth, scriptable choreography, no manual mouse work; runs
against the live link.
**Cons:** ~minutes to install Playwright; you tune timings in code.

---

## 4. Caveats / gotchas (verified against the source)

- **The built-in "photo booth" cinematic tour does *not* fire for PDHD.** In
  `scene.js:474` the scripted zoom/box/TPC tour is gated on
  `experiment.name == "protodune"` — but PDHD's experiment name is **`protodunehd`**
  (`physics/experiment.js:858`). So `shift`+`f` gives you the plain **turntable**
  rotation only. To get a choreographed zoom/box/TPC reveal on PDHD, drive those
  beats yourself (Option B) — that's exactly what the script above does.
- **In-page `canvas.toDataURL()` returns blank.** The renderer is created without
  `preserveDrawingBuffer` (`scene.js:129`), so you can't grab the canvas pixels from
  JS. This does **not** affect us: `page.screenshot()` and Playwright video both
  capture at the compositor level and work fine.
- **Turntable speed is wall-clock based** (`rotation.y = Date.now()*0.0001`,
  `scene.js:159`) → ~0.1 rad/s ≈ **one full turn per ~63 s**. For a snappier spin in
  a captured video, set `rotation.y` per frame yourself (as in the script) instead of
  using the `camera.rotate` flag.
- **Headless works here — use it.** On this machine, headless Chromium renders the
  WebGL scene at full quality via ANGLE/SwiftShader with
  `args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader']`.
  Headless is strongly preferred: **no popup window** to flicker, sit in a screen
  corner, or steal focus while it captures. Only flip to `headless: false` if a
  layer ever looks unlit.
- **This ffmpeg has no libass.** `ffmpeg -filters | grep subtitles` is empty, so the
  `subtitles=`/`ass=` burn-in filter **fails** ("Error opening output files"). We
  side-step it by drawing the caption as a DOM overlay that lands inside each
  screenshot (see §7). The soft-subtitle mux (`-c:s mov_text`) does *not* need
  libass and works.
- **The optical overlay dims/clips the cloud.** With `op.matchTiming = true` (or the
  matched-cluster mode) `op.draw()` calls `current_sst.drawInsideSlice(...)`, which
  restricts the visible charge to the matched flash's thin drift slice — great for
  *showing a single match*, but it makes a poor opening shot. Open on the full cloud
  with the overlay **off**, then enable it for the matching beats (the script does this
  via its `flashOn()` / `flashOff()` helpers).
- **Settings persist in `localStorage`** (`Lockr`, `store.js`). If a prior hand-session
  left odd opacity/box state, the script's explicit `Object.assign(...config...)` +
  `resetCamera()` at the top overrides it; for a manual session, "Preset → default"
  (the `#preset-default` button) clears and reloads.
- **Pick the event first.** Decide which of the 30 events shows the cleanest match
  (your hand-scanned 983 / 991 / 999 / 1007 are good candidates), then hard-code that
  event URL. Avoid event 1015 — it's the bright multi-flash outlier, visually busy.

---

## 5. Live link vs. local upload (only if you need offline/private)

You do **not** need a local server for any of the above — the live BNL link supports
every operation. Use the local route only if the live set is unavailable, you want an
offline copy, or you want to tweak data.

Local upload of your `upload-combined-run029107-30evt.zip`
(currently in `…/PDHD_Charge_Light_Matching/ql_labels/`):

```bash
cd ~/Wire-Cell/wire-cell-bee3
git pull                      # get the latest PDHD geometry fixes (op-channel/cathode-side,
                              #   driftVelocity 0.1565) — these were recent commits
source venv/bin/activate      # or rely on direnv

# one-time, if not already set up (see docs/local-setup.md):
#   pip install "Django==4.1.2"
#   create bee/bee.conf with a SECRET_KEY, then: python manage.py migrate
#   mkdir -p tmp/WireGeometry/archive

# rebuild the JS bundle so the latest scene.js/op.js fixes are in the served bundle:
cd events/static/js/bee && npm install && \
  npx parcel build --no-source-maps --public-url ./ bee.js wires-vue.js && cd -

python manage.py runserver    # http://127.0.0.1:8000/
```

Then upload the zip (its contents start with `data/`, which the upload view requires):

- Browse to `http://127.0.0.1:8000/upload/` and POST the zip via the form, **or**

  ```bash
  curl -F "file=@ql_labels/upload-combined-run029107-30evt.zip" \
       http://127.0.0.1:8000/upload/      # returns a UUID
  ```

- The server extracts to `tmp/<uuid>/data/`; open
  `http://127.0.0.1:8000/collection/<uuid>/` to find the event, then the event's 3-D
  display URL. Point the Playwright `URL` (or your browser) at that instead of the BNL
  host. Because it's `127.0.0.1`, Bee logs `bee` to the console for you (`bee.js:61`;
  note there is no `store` global — config is at `bee.scene3d.store.config`).

> **Why `git pull` matters here:** the bundle you serve locally is only as current as
> your checkout. Recent fixes (op-channel→cathode-side mapping, within-block y/z, and
> the 0.16→0.1565 cm/µs drift velocity) live in `scene.js`/`op.js`/`experiment.js`;
> rebuild the bundle (the `parcel build` step) after pulling or the browser keeps the
> old compiled `dist/bee.js`.

---

## 6. Recommended recipe (one clean event, polished)

1. From the live set, pick the cleanest-matching event (e.g. 983 or 999).
2. Use **Option B, frame-by-frame** against that live URL.
3. Beat list that tells the story in ~30 s:
   - clustering-global, matched flash + prediction on, **one slow full turntable**;
   - flip to **img-global** (show the same match on raw imaging) and back;
   - step **3–4 matched flashes** (`nextMatching`) with a ~1 s hold each;
   - open the **side panel** (true detector frame) for the headline match, hold 2 s;
   - **recolor** (`o`) as a finisher.
4. `ffmpeg` to mp4 (`-crf 18 -pix_fmt yuv420p`), add a title card / voiceover in any
   editor if desired.

This gives a reproducible clip that you can re-render for a different event by
changing one URL.

---

## 7. Subtitles (two ways)

This machine's ffmpeg has **no libass**, so the usual burn-in filter
(`-vf "subtitles=subs.srt"` / `ass=`) **fails** with *"Error opening output files"*.
Two approaches that work here:

### 7a. Burned-in captions via a DOM overlay (what the script uses)

Instead of letting ffmpeg draw text, we draw the caption as a styled `<div>` on the
page so it is captured *inside every screenshot*. It is always perfectly in sync
(the cue times come from the same beat loop) and needs no subtitle filter at all:

```js
// once, after load — create the overlay
await page.evaluate(() => {
  const d = document.createElement('div'); d.id = '__cap';
  Object.assign(d.style, {
    position: 'fixed', left: '50%', bottom: '34px', transform: 'translateX(-50%)',
    padding: '10px 18px', font: '600 24px/1.3 Helvetica, sans-serif', color: '#fff',
    background: 'rgba(0,0,0,0.62)', borderRadius: '8px', whiteSpace: 'pre-line', zIndex: 99999,
  });
  document.body.appendChild(d);
});
// at each beat — set the text (use \n for a second line)
const setCaption = (t) => page.evaluate(t => { document.getElementById('__cap').textContent = t; }, t);
```

ffmpeg then just stitches the frames (no filter):

```bash
ffmpeg -y -framerate 30 -i frames/%05d.png -c:v libx264 -crf 18 -pix_fmt yuv420p \
  -movflags +faststart charge_light.mp4
```

### 7b. Soft (toggleable) subtitles — an `.srt` muxed as `mov_text`

The script also writes a standard `subs.srt` (cue times derived from the beats) and
muxes it into a second file as a **soft** subtitle track. `mov_text` is the MP4
subtitle codec and needs no libass, so this works on the same ffmpeg:

```bash
ffmpeg -y -i charge_light.mp4 -i subs.srt -c copy -c:s mov_text \
  -metadata:s:s:0 language=eng charge_light_softsubs.mp4
```

Players that support it (QuickTime, VLC, web `<video>` with a track) can then turn
the captions on/off. Edit `subs.srt` by hand to retime/retext without re-rendering.

> **If you later get an ffmpeg with libass** (`brew install ffmpeg` normally bundles
> it; check with `ffmpeg -filters | grep subtitles`), you can burn a styled `.srt`
> directly: `-vf "subtitles=subs.srt:force_style='FontName=Helvetica,FontSize=22,Outline=2'"`.
> Until then, use 7a.

---

## 8. The worked example in this repo

`docs/charge-light-video/` holds the **actually-rendered** example:

- `make_video.mjs` — the working script (headless, virtual-clock turntable, DOM
  captions, SRT sidecar). Point its `URL`/`EVENT` at your set and run `node make_video.mjs`.
- `subs.srt` — the generated subtitle track.
- `charge_light.mp4` — the rendered ~28 s clip (Run 29107, Event 983): hero turntable
  of the full cluster cloud → img-global → optical flashes matched → step matched
  flashes → side-by-side true-detector frame → per-cluster recolor.
- `README.md` — one-paragraph run instructions.

Setup is just (in any scratch dir, kept out of this repo):

```bash
npm i -D playwright && npx playwright install chromium
node make_video.mjs
```
