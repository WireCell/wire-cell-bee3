// make_clustering_video.mjs — render a "clustering reveal" demo video from one Bee event.
//
// Walks one APA group at a time through the build-up of a clustering result:
//   raw 3-D imaging points  ->  charge-weighted  ->  cluster-colored  ->  recolor.
// Then repeats (cluster view only) for the other APA group.
//
// Drives the *existing* Bee viewer via window.bee, screenshots one PNG per frame,
// writes a beat-synced subtitle track, and lets ffmpeg assemble the mp4. No Bee
// code is modified.  See docs/making-a-charge-light-video.md for the gory details.
//
//   node make_clustering_video.mjs
//
// Edit the BEATS array (bottom) to change the story.

import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

// ----------------------------------------------------------------------------
// Constants — change these.
// ----------------------------------------------------------------------------
const SET = 'c361eeba-d900-4876-ad78-9eb1818947a8';
const EVENT = 0;                              // event *index* in the set (0 -> Run 29107, Event 983)
const URL = `http://127.0.0.1:8000/set/${SET}/event/${EVENT}/`;

const OUT = 'frames_clustering';
const W = 1280, H = 1000;                     // even numbers (libx264 requirement)
const FPS = 30;
const SPIN = 2 * Math.PI / 12;                // gentle turntable: one full turn / 12 s (rad/s)
const OUT_MP4 = 'clustering.mp4';
const OUT_SRT = 'clustering.srt';

// Layer names (exact). Both carry imaging points + charge + cluster ids.
const G02 = 'clustering-group02';             // APA0 & APA2
const G13 = 'clustering-group13';             // APA1 & APA3

// ----------------------------------------------------------------------------
// Launch headless (ANGLE/SwiftShader). No popup window to flicker or grab focus.
// ----------------------------------------------------------------------------
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.bee?.current_sst?.pointCloud, null, { timeout: 60000 });
await page.waitForTimeout(1500);

// Hide the right-hand dat.GUI panel for a clean shot.
await page.addStyleTag({ content: `.dg.main { display: none !important; }` });

// Caption overlay (this ffmpeg has no libass, so we draw captions as a DOM element
// captured *inside* each screenshot — real pixels, perfectly in sync). We also emit
// an .srt sidecar for soft subs.
await page.evaluate(() => {
  const d = document.createElement('div');
  d.id = '__cap';
  Object.assign(d.style, {
    position: 'fixed', left: '50%', bottom: '34px', transform: 'translateX(-50%)',
    maxWidth: '78%', padding: '10px 18px', zIndex: 99999,
    font: '600 24px/1.3 Helvetica, Arial, sans-serif', color: '#fff', textAlign: 'center',
    background: 'rgba(0,0,0,0.62)', borderRadius: '8px', whiteSpace: 'pre-line',
    pointerEvents: 'none', letterSpacing: '0.2px',
  });
  document.body.appendChild(d);
});

const ev = (fn, arg) => page.evaluate(fn, arg);
const setCaption = (t) => ev((t) => { document.getElementById('__cap').textContent = t || ''; }, t || '');

// ----------------------------------------------------------------------------
// Become the SOLE render driver with a virtual clock (see the guide's "lessons").
//   * config lives at bee.scene3d.store.config (bee.store is undefined).
//   * the render loop forces rotation.y = 0 unless config.camera.rotate is true,
//     then sets rotation.y = Date.now()*0.0001 — so we fake Date.now() to make the
//     turntable angle deterministic, and force a synchronous render per frame.
// ----------------------------------------------------------------------------
await page.evaluate(() => {
  window.__virt = 0;
  Date.now = () => window.__virt;
  window.bee.scene3d.store.config.camera.rotate = true;
  window.cancelAnimationFrame(window.bee.scene3d.animationId);
  window.requestAnimationFrame = () => 0;
  // Show one layer at a time: with overlay=false, selecting a layer zeroes the
  // opacity of every other loaded layer (so img-global / the other group vanish).
  window.bee.scene3d.store.config.material.overlay = false;
});

const setAngle = (a) => ev((a) => {
  window.__virt = a / 0.0001;                 // rotation.y = virt * 0.0001
  window.animate();
}, a);

// Select a layer by exact name (loads it lazily; hides the others with overlay=false).
const selectLayer = (name) => ev((name) => {
  window.bee.sst.list[name].selected();
}, name);

// Set the two display-mode flags and redraw (mirrors the GUI's Show Charge / Show
// Cluster checkboxes, which call bee.redrawAllSST() onChange).
const setMode = ({ charge, cluster }) => ev(({ charge, cluster }) => {
  const m = window.bee.scene3d.store.config.material;
  m.showCharge = charge;
  m.showCluster = cluster;
  window.bee.redrawAllSST(false);
  window.animate();
}, { charge, cluster });

// One slow "press o" — randomize per-cluster colors.
const recolor = () => ev(() => { window.bee.redrawAllSST(true); window.animate(); });

// ----------------------------------------------------------------------------
// Frame loop: walk BEATS, advancing the turntable angle every frame. A beat may
// also fire a `step()` action partway through (e.g. one recolor every ~0.4 s).
// ----------------------------------------------------------------------------
let frame = 0, angle = 0;
const cues = [];
const shoot = async () => {
  await setAngle(angle);
  await page.screenshot({ path: `${OUT}/${String(frame++).padStart(5, '0')}.png` });
};
const fmt = (s) => {
  const ms = Math.round(s * 1000);
  const hh = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const mm = String(Math.floor(ms % 3600000 / 60000)).padStart(2, '0');
  const ss = String(Math.floor(ms % 60000 / 1000)).padStart(2, '0');
  const mmm = String(ms % 1000).padStart(3, '0');
  return `${hh}:${mm}:${ss},${mmm}`;
};

async function runBeat({ caption, secs, spin = true, setup, step, stepEvery }) {
  if (setup) { await setup(); await page.waitForTimeout(150); }
  if (caption) await setCaption(caption);
  const start = frame / FPS;
  const n = Math.round(FPS * secs);
  const stepN = step && stepEvery ? Math.round(FPS * stepEvery) : 0;   // frames between steps
  for (let i = 0; i < n; i++) {
    if (step && stepN && i > 0 && i % stepN === 0) await step();
    if (spin) angle += SPIN / FPS;
    await shoot();
  }
  if (caption) cues.push({ i: cues.length + 1, a: fmt(start), b: fmt(frame / FPS), text: caption });
}

// ----------------------------------------------------------------------------
// THE STORYBOARD — edit freely. Each beat: caption (subtitle), secs, spin?, setup(),
// optional step()/stepEvery (seconds) for repeated actions like the slow recolor.
// ----------------------------------------------------------------------------
const BEATS = [
  // --- clustering-group02 : APA0 & APA2 -------------------------------------
  // 1) raw imaging points (no charge, no cluster) -> uniform color cloud.
  {
    caption: '3-D imaging results\nAPA0 & APA2',
    secs: 3.2, spin: true,
    setup: async () => { await selectLayer(G02); await setMode({ charge: false, cluster: false }); await ev(() => window.bee.scene3d.resetCamera()); },
  },
  // 2) Show Charge -> charge-weighted color.
  {
    caption: '3-D charge reconstructed\nAPA0 & APA2',
    secs: 3.0, spin: true,
    setup: () => setMode({ charge: true, cluster: false }),
  },
  // 3) Show Cluster -> per-cluster colors.
  {
    caption: '3-D image after clustering\nAPA0 & APA2',
    secs: 3.0, spin: true,
    setup: () => setMode({ charge: false, cluster: true }),
  },
  // 4) slow recolor (press 'o' every ~0.5 s).
  {
    caption: 'Different colors represent different clusters',
    secs: 3.0, spin: true,
    step: () => recolor(), stepEvery: 0.5,
  },

  // --- clustering-group13 : APA1 & APA3 (cluster view + recolor) -------------
  // Closing group02 is automatic: selecting group13 with overlay=false hides it.
  {
    caption: 'APA1 & APA3 — clustering result',
    secs: 3.0, spin: true,
    setup: async () => { await selectLayer(G13); await setMode({ charge: false, cluster: true }); },
  },
  {
    caption: 'Different colors represent different clusters',
    secs: 3.0, spin: true,
    step: () => recolor(), stepEvery: 0.5,
  },
];

for (const beat of BEATS) await runBeat(beat);
await browser.close();

// ----------------------------------------------------------------------------
// Subtitle track (cue times derive from beat timing -> always in sync).
// ----------------------------------------------------------------------------
writeFileSync(OUT_SRT, cues.map(c => `${c.i}\n${c.a} --> ${c.b}\n${c.text}\n`).join('\n'));
console.log(`wrote ${frame} frames, ${cues.length} subtitle cues`);

// ----------------------------------------------------------------------------
// Assemble the mp4 (captions already burned into the frames).
// ----------------------------------------------------------------------------
execSync(
  `ffmpeg -y -framerate ${FPS} -i ${OUT}/%05d.png ` +
  `-c:v libx264 -crf 18 -pix_fmt yuv420p -movflags +faststart ${OUT_MP4}`,
  { stdio: 'inherit' }
);
console.log(`wrote ${OUT_MP4}`);
