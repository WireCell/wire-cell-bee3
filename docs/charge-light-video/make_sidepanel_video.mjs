// make_sidepanel_video.mjs — render the "side-panel (detector-frame) charge–light
// matching" demo video from one Bee event.
//
// Drives the *existing* Bee viewer through its window.bee API, screenshots one PNG per
// frame (right-half-cropped for the detector-only loop), writes a beat-synced subtitle
// track, and lets ffmpeg assemble a subtitled mp4. No Bee code is modified.
//
//   node make_sidepanel_video.mjs
//
// Storyboard (see docs/making-a-charge-light-video.md):
//   1. img-global -> Show Charge -> Show Cluster, enable side panel, zoom in.
//   2. Loop 1 (full split, 1 s/bundle): step matched flashes; left=actual, right=T0-corrected.
//   3. Transition: crop to the RIGHT (detector) half, rotate.
//   4. Loop 2 (right-half only, 2 s/bundle): red=measured, green=predicted-by-charge circles.
//   5. img-global "Non-matched clusters" (3 s).
//   6. clustering-global W view across the cathode + arrows (3 s).
//   7. Final rotating clustering-global "Final T0-corrected clusters" (5 s).

import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

// ----------------------------------------------------------------------------
// Constants — change these.
// ----------------------------------------------------------------------------
const SET = 'c361eeba-d900-4876-ad78-9eb1818947a8';
const EVENT = 0;                              // event *index* (0 -> Run 29107, Event 983)
const URL = `http://127.0.0.1:8000/set/${SET}/event/${EVENT}/`;

const W = 1280, H = 1000;                     // even numbers (libx264 requirement)
const FPS = 30;
const SPIN = 2 * Math.PI / 10;                // turntable rate: one full turn / 10 s (rad/s)
const SUBSET = 15;                            // matched bundles to step through per loop
const RIGHT_CLIP = { x: W / 2, y: 0, width: W / 2, height: H };

// ----------------------------------------------------------------------------
// Launch headless (ANGLE/SwiftShader) — no popup window to flicker or grab focus.
// ----------------------------------------------------------------------------
for (const d of ['frames_a', 'frames_b', 'frames_c']) { rmSync(d, { recursive: true, force: true }); mkdirSync(d, { recursive: true }); }

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.bee?.current_sst?.pointCloud, null, { timeout: 60000 });
await page.waitForTimeout(1500);

const ev = (fn, arg) => page.evaluate(fn, arg);
const setCaption = (t) => ev((t) => { const e = document.getElementById('__cap'); if (e) e.textContent = t || ''; }, t || '');
const setCaptionPos = (pct) => ev((p) => { const e = document.getElementById('__cap'); if (e) e.style.left = p; }, pct);

// (Re)apply page-side state: hide the dat.GUI panel, (re)create the caption overlay, and
// become the SOLE render driver with a virtual clock. Called after the initial load AND
// again after the segment-C reload (a reload clears all of this) so each segment starts
// from a clean viewer. The caption is a DOM element captured inside each screenshot
// (this ffmpeg has no libass); `left` moves to 75% for the right-half-cropped loop.
//   * config lives at bee.scene3d.store.config (bee.store is undefined).
//   * the render loop forces rotation.y = 0 unless config.camera.rotate is true, then sets
//     rotation.y = Date.now()*0.0001 — so we fake Date.now() for a deterministic turntable
//     and call window.animate() to force a synchronous render per frame.
//   * GSAP/TweenLite (resetCamera, x/y/z views) captured the real rAF at load, so its tweens
//     still tick in wall-clock time — we just wait for them to settle.
async function setupPage() {
  await page.addStyleTag({ content: `.dg.main { display: none !important; }` });
  await ev(() => {
    if (!document.getElementById('__cap')) {
      const d = document.createElement('div');
      d.id = '__cap';
      Object.assign(d.style, {
        position: 'fixed', left: '50%', bottom: '40px', transform: 'translateX(-50%)',
        maxWidth: '70%', padding: '10px 18px', zIndex: 99999,
        font: '600 24px/1.35 Helvetica, Arial, sans-serif', color: '#fff', textAlign: 'center',
        background: 'rgba(0,0,0,0.62)', borderRadius: '8px', whiteSpace: 'pre-line',
        pointerEvents: 'none', letterSpacing: '0.2px',
      });
      document.body.appendChild(d);
    }
  });
  await ev(() => {
    window.__virt = 0;
    Date.now = () => window.__virt;
    window.bee.scene3d.store.config.camera.rotate = true;
    // overlay=false so selecting a layer HIDES all others (this build defaults it true,
    // which draws img-global + clustering-global + the group layers on top of each other
    // — the "double image"). With it false, selected() zeroes opacity on every other layer.
    window.bee.scene3d.store.config.material.overlay = false;
    window.cancelAnimationFrame(window.bee.scene3d.animationId);
    window.requestAnimationFrame = () => 0;
  });
}
await setupPage();

const setAngle = (a) => ev((a) => { window.__virt = a / 0.0001; window.animate(); }, a);

// Name-tolerant layer pick ('img' -> img-global, 'clustering-global').
const pick = (sub) => ev((s) => {
  const k = Object.keys(window.bee.sst.list).find(n => n.toLowerCase() === s) ||
            Object.keys(window.bee.sst.list).find(n => n.toLowerCase().includes(s));
  if (k) window.bee.sst.list[k].selected();
  return k;
}, sub);

// Material flags (Show Charge / Show Cluster), applied via redrawAllSST().
const setMaterial = ({ charge, cluster }) => ev(({ charge, cluster }) => {
  const m = window.bee.scene3d.store.config.material;
  m.showCharge = charge; m.showCluster = cluster;
  window.bee.redrawAllSST(false); window.animate();
}, { charge, cluster });

// Optical side panel on (split reco | detector frame) / off (back to a single 3-D view).
const sidePanelOn = () => ev(() => {
  Object.assign(window.bee.scene3d.store.config.op, { showFlash: true, showPred: true, matchTiming: false, sidePanel: true });
  window.bee.op.draw(); window.bee.scene3d.resetCamera(); window.animate();
});
const sidePanelOff = () => ev(() => {
  const c = window.bee.scene3d.store.config.op;
  Object.assign(c, { showFlash: false, showPred: false, matchTiming: false, sidePanel: false });
  if (window.bee.op.group_op) window.bee.scene3d.scene.main.remove(window.bee.op.group_op);
  window.bee.current_sst.drawInsideThreeFrames(); window.animate();
});

const zoomBy = (f) => ev((f) => {
  const cam = window.bee.scene3d.camera.active;
  cam.zoom *= f; cam.updateProjectionMatrix(); window.animate();
}, f);

// Step to the next matched flash/bundle (the "." key). draw() honors sidePanel, so both
// panels update. resetFlash() rewinds so loop 2 traverses the same first SUBSET bundles.
const stepMatched = () => ev(() => { window.bee.op.nextMatching(); window.bee.op.draw(); window.animate(); });
const resetFlash = () => ev(() => { window.bee.op.currentFlash = 0; });

// "Matching Box": restrict the reco-frame charge to the matched flash's drift slice, so
// the LEFT panel isolates the matched cluster (not the whole event) during the loops.
const matchTimingOn = () => ev(() => { window.bee.scene3d.store.config.op.matchTiming = true; window.bee.op.draw(); window.animate(); });
// Restore a layer to its FULL drift range (all clusters). NOTE: redrawAllSST() draws the
// full cloud, whereas drawInsideThreeFrames() *slices* to the current matched flash — so we
// use redrawAllSST here to undo the leftover matched-flash slice from the side-panel loops.
const showFull = () => ev(() => { window.bee.redrawAllSST(false); window.animate(); });

// "Non-matching" optical filter (clusters matched to NO flash) on/off.
const nonMatchingOn = () => ev(() => { window.bee.scene3d.store.config.op.showNonMatchingCluster = true; window.bee.redrawAllSST(false); window.animate(); });
const nonMatchingOff = () => ev(() => { window.bee.scene3d.store.config.op.showNonMatchingCluster = false; window.bee.redrawAllSST(false); window.animate(); });

const wView = () => ev(() => { window.bee.scene3d.xwView(); window.animate(); });
// One slow "press o": random per-cluster recolor (bee.redrawAllSST(true)).
const recolor = () => ev(() => { window.bee.redrawAllSST(true); window.animate(); });
const resetTilt = () => ev(() => { window.bee.scene3d.scene.main.rotation.x = 0; window.bee.scene3d.resetCamera(); window.animate(); });

// Arrows highlighting the cathode-crossing clusters in clustering-global. Origin/target
// are both transformed through exp.toLocalXYZ so placement is robust to local scaling;
// the arrows live in scene.main, so they tilt/rotate with the W view and turntable.
const addArrows = () => ev(() => {
  const bee = window.bee, exp = bee.scene3d.store.experiment, THREE = window.THREE;
  const s = bee.sst.list['clustering-global']; const d = s.data;
  const x = d.x, y = d.y, z = d.z, cid = d.cluster_id;
  let gxmin = 1e9, gxmax = -1e9; for (let i = 0; i < x.length; i++) { if (x[i] < gxmin) gxmin = x[i]; if (x[i] > gxmax) gxmax = x[i]; }
  const mid = (gxmin + gxmax) / 2;
  const m = {};
  for (let i = 0; i < x.length; i++) { const c = Number(cid[i]); (m[c] || (m[c] = { n: 0, xmin: 1e9, xmax: -1e9, ys: 0, zs: 0 })); const o = m[c]; o.n++; if (x[i] < o.xmin) o.xmin = x[i]; if (x[i] > o.xmax) o.xmax = x[i]; o.ys += y[i]; o.zs += z[i]; }
  const crossers = Object.values(m).map(o => ({ n: o.n, span: o.xmax - o.xmin, crosses: o.xmin < mid && o.xmax > mid, ymean: o.ys / o.n, zmean: o.zs / o.n }))
    .filter(a => a.crosses && a.n > 500).sort((a, b) => b.span - a.span).slice(0, 3);
  window.__arrows = [];
  for (const t of crossers) {
    // Point along the drift (x) axis toward the cathode plane (x=0). xwView looks down the
    // y-axis and rotates the scene about x, so an x-aligned arrow stays in-plane and reads as
    // a real arrow (a y-aligned one foreshortens to a dot).
    const origin = new THREE.Vector3(...exp.toLocalXYZ(210, t.ymean, t.zmean));
    const target = new THREE.Vector3(...exp.toLocalXYZ(35, t.ymean, t.zmean));
    const dir = target.clone().sub(origin); const len = dir.length(); dir.normalize();
    const arrow = new THREE.ArrowHelper(dir, origin, len, 0xffe000, len * 0.34, len * 0.24);
    if (arrow.line && arrow.line.material) arrow.line.material.linewidth = 3;
    bee.scene3d.scene.main.add(arrow); window.__arrows.push(arrow);
  }
  window.animate();
  return crossers.length;
});
const clearArrows = () => ev(() => { if (window.__arrows) { for (const a of window.__arrows) window.bee.scene3d.scene.main.remove(a); window.__arrows = []; } window.animate(); });

// ----------------------------------------------------------------------------
// Frame loop. Each segment has its own 0-based PNG counter (ffmpeg reads each dir
// separately). `T` is the absolute time in the final concatenated video, used for
// subtitle cues so they stay in sync regardless of segment boundaries.
// ----------------------------------------------------------------------------
const counters = { a: 0, b: 0, c: 0 };
let angle = 0, T = 0;
const cues = [];
const fmt = (s) => {
  const ms = Math.round(s * 1000);
  const hh = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const mm = String(Math.floor(ms % 3600000 / 60000)).padStart(2, '0');
  const ss = String(Math.floor(ms % 60000 / 1000)).padStart(2, '0');
  const mmm = String(ms % 1000).padStart(3, '0');
  return `${hh}:${mm}:${ss},${mmm}`;
};
const pushCue = (text, a, b) => { if (text) cues.push({ i: cues.length + 1, a: fmt(a), b: fmt(b), text }); };
const shoot = async (seg, clip) => {
  await setAngle(angle);
  const dir = `frames_${seg}`;
  await page.screenshot({ path: `${dir}/${String(counters[seg]++).padStart(5, '0')}.png`, ...(clip ? { clip } : {}) });
};

// A held/spinning beat in one segment.
async function beat({ seg = 'a', clip = null, caption, secs, spin = false, setup, settle = 150, step = null, stepEvery = 0 }) {
  if (setup) { await setup(); await page.waitForTimeout(settle); }
  if (caption !== undefined) await setCaption(caption);
  const start = T;
  const n = Math.round(FPS * secs);
  const stepN = step && stepEvery ? Math.round(FPS * stepEvery) : 0;   // frames between step() calls
  for (let i = 0; i < n; i++) {
    if (stepN && i > 0 && i % stepN === 0) await step();
    if (spin) angle += SPIN / FPS;
    await shoot(seg, clip);
  }
  T += n / FPS;
  if (caption) pushCue(caption, start, T);
}

// Step through SUBSET matched bundles, holding secPer on each.
async function loopMatched({ seg, clip, caption, secPer, spin }) {
  await setCaption(caption);
  const start = T;
  for (let i = 0; i < SUBSET; i++) {
    await stepMatched();
    await page.waitForTimeout(50);
    const n = Math.round(FPS * secPer);
    for (let j = 0; j < n; j++) { if (spin) angle += SPIN / FPS; await shoot(seg, clip); }
    T += n / FPS;
  }
  pushCue(caption, start, T);
}

// ----------------------------------------------------------------------------
// THE STORYBOARD.
// ----------------------------------------------------------------------------

// --- Segment A (full frame): establishing + loop 1 --------------------------
// 1a) img-global, Show Charge.
await beat({ seg: 'a', secs: 2.2, spin: true, caption: 'ProtoDUNE-HD charge–light matching\n3-D imaging · charge reconstructed',
  setup: async () => { await pick('img-global'); await setMaterial({ charge: true, cluster: false }); await ev(() => window.bee.scene3d.resetCamera()); await page.waitForTimeout(500); } });
// 1b) Show Cluster (per-cluster colors).
await beat({ seg: 'a', secs: 2.2, spin: true, caption: 'Per-cluster colors after clustering',
  setup: () => setMaterial({ charge: false, cluster: true }) });
// 1c) Enable the detector-frame side panel and zoom in.
await beat({ seg: 'a', secs: 3.0, spin: true, settle: 700,
  caption: 'Charge–light matching · detector-frame side panel',
  setup: async () => { await sidePanelOn(); await zoomBy(1.7); } });
// 2) Loop 1: step matched bundles in the full split view, 1 s each, static.
// No matchTiming: the LEFT panel shows the full img-global event ("actual measurement",
// many cathode-crossing tracks); the RIGHT shows the current matched cluster T0-corrected.
await loopMatched({ seg: 'a', clip: null, secPer: 1.0, spin: false,
  caption: 'Left: actual measurement   ·   Right: T0-corrected positions\nMany cathode-crossing tracks   (subset of matches)' });

// --- Segment B (right-half crop): transition + loop 2 -----------------------
await setCaptionPos('75%');                   // recenter caption within the right-half crop
// 3) Transition: rotate the detector frame alone.
await beat({ seg: 'b', clip: RIGHT_CLIP, secs: 4.0, spin: true, settle: 300,
  caption: 'Detector frame (T0-corrected) — light pattern per flash',
  setup: async () => { await resetFlash(); await stepMatched(); await zoomBy(1.15); } });
// 4) Loop 2: step matched bundles, right-half only, 2 s each, gentle spin.
await resetFlash();
await loopMatched({ seg: 'b', clip: RIGHT_CLIP, secPer: 2.0, spin: true,
  caption: 'Red: measured light pattern\nGreen: predicted light pattern by charge   (subset of matches)' });

// --- Segment C (full frame): non-matching, W view, final spin ---------------
// Reload to a pristine viewer first: the side-panel stepping leaves clustering-global in a
// sliced/recolored state that no redraw fully undoes. A clean page makes the final beats
// render the full, dense, per-cluster cloud (exactly like the establishing shot).
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => window.bee?.current_sst?.pointCloud, null, { timeout: 60000 });
await page.waitForTimeout(1500);
await setupPage();
await setCaptionPos('50%');
// 5) Non-matched clusters on img-global — gentle turntable from the straight default view.
angle = 0;
await beat({ seg: 'c', secs: 4.0, spin: true, settle: 400,
  caption: 'Non-matched clusters',
  setup: async () => { await pick('img-global'); await setMaterial({ charge: false, cluster: true }); await nonMatchingOn(); await ev(() => window.bee.scene3d.resetCamera()); await page.waitForTimeout(500); } });
// 6) W view across the cathode + arrows on cathode-crossing clusters.
const nArrows = await (async () => {
  await nonMatchingOff();
  await pick('clustering-global');
  await setMaterial({ charge: false, cluster: true });   // dense, per-cluster colors (clean state)
  await wView();
  await page.waitForTimeout(400);
  return addArrows();
})();
// Zero the turntable angle so rotation.y=0: the W view then sits straight (drift X vertical,
// cathode horizontal), matching the native "W" button. A non-zero turntable angle would
// spin the box in-plane and make it look crooked.
angle = 0;
await beat({ seg: 'c', secs: 6.0, spin: false,
  caption: 'Clustering across the cathode plane after T0 correction',
  step: () => recolor(), stepEvery: 1.0 });              // gradual 'o' recolor in the W view
console.log(`arrows placed: ${nArrows}`);
// 7) Final rotating 3-D, clusters only — gradually pressing 'o' to recolor.
await beat({ seg: 'c', secs: 6.0, spin: true, settle: 600,
  caption: 'Final T0-corrected clusters',
  step: () => recolor(), stepEvery: 1.2,                 // a slow 'o' recolor every ~1.2 s
  setup: async () => { await clearArrows(); await resetTilt(); await setMaterial({ charge: false, cluster: true }); await page.waitForTimeout(500); } });

await browser.close();

// ----------------------------------------------------------------------------
// Subtitle track (cue times are absolute video time -> always in sync).
// ----------------------------------------------------------------------------
writeFileSync('sidepanel.srt', cues.map(c => `${c.i}\n${c.a} --> ${c.b}\n${c.text}\n`).join('\n'));
console.log(`frames: a=${counters.a} b=${counters.b} c=${counters.c}; cues=${cues.length}`);

// ----------------------------------------------------------------------------
// Assemble: encode each segment, padding the right-half crop back to W×H (no scaling,
// no distortion), then concat the three equal-size segments into one mp4.
// ----------------------------------------------------------------------------
const enc = (dir, out, pad) => execSync(
  `ffmpeg -y -framerate ${FPS} -i ${dir}/%05d.png ` +
  (pad ? `-vf "pad=${W}:${H}:(ow-iw)/2:0:black,setsar=1" ` : `-vf "setsar=1" `) +
  `-c:v libx264 -crf 18 -pix_fmt yuv420p ${out}`, { stdio: 'inherit' });
enc('frames_a', 'seg_a.mp4', false);
enc('frames_b', 'seg_b.mp4', true);
enc('frames_c', 'seg_c.mp4', false);

writeFileSync('concat.txt', "file 'seg_a.mp4'\nfile 'seg_b.mp4'\nfile 'seg_c.mp4'\n");
try {
  execSync(`ffmpeg -y -f concat -safe 0 -i concat.txt -c copy -movflags +faststart sidepanel.mp4`, { stdio: 'inherit' });
} catch {
  console.log('(stream-copy concat failed, re-encoding)');
  execSync(`ffmpeg -y -f concat -safe 0 -i concat.txt -c:v libx264 -crf 18 -pix_fmt yuv420p -movflags +faststart sidepanel.mp4`, { stdio: 'inherit' });
}
console.log('wrote sidepanel.mp4');
