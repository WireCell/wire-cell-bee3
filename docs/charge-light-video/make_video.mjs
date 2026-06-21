// make_video.mjs — render a charge–light matching demo video from one Bee event.
//
// Drives the *existing* Bee viewer through its window.bee API, screenshots one
// PNG per frame, writes a beat-synced subtitle track, and lets ffmpeg assemble a
// subtitled mp4. No Bee code is modified.
//
//   node make_video.mjs
//
// Edit the BEATS array (bottom) to change the story; edit the constants below to
// retarget the event or the server.  See docs/making-a-charge-light-video.md.

import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

// ----------------------------------------------------------------------------
// Constants — change these.
// ----------------------------------------------------------------------------
// Local Bee server (the UUID is specific to *your* local upload). For the live
// BNL set, use e.g. 'https://www.phy.bnl.gov/twister/bee/set/<SET-ID>/event/0/'.
const SET = 'c361eeba-d900-4876-ad78-9eb1818947a8';
const EVENT = 0;                              // event *index* in the set (0 -> Run 29107, Event 983)
const URL = `http://127.0.0.1:8000/set/${SET}/event/${EVENT}/`;

const OUT = 'frames';
const W = 1280, H = 1000;                     // even numbers (libx264 requirement)
const FPS = 30;
const SPIN = 2 * Math.PI / 8;                 // turntable rate: one full turn / 8 s (rad/s)

// ----------------------------------------------------------------------------
// Launch headless. WebGL renders fine here via ANGLE/SwiftShader and there is no
// popup window to flicker or sit in a screen corner. (If a layer ever looks
// unlit, flip headless:false for full GPU.)
// ----------------------------------------------------------------------------
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.goto(URL, { waitUntil: 'networkidle' });

// Wait until the app + first data layer are ready.
await page.waitForFunction(() => window.bee?.current_sst?.pointCloud, null, { timeout: 60000 });
await page.waitForTimeout(1500);

// Hide the right-hand dat.GUI panel for a clean shot (it otherwise overlaps the
// side-panel's detector frame). The left layer label / sliders stay.
await page.addStyleTag({ content: `.dg.main { display: none !important; }` });

// Caption overlay. This ffmpeg build has no libass, so we cannot burn subtitles
// with the `subtitles`/`ass` filter. Instead we draw the caption as a DOM element
// that is captured *inside* each screenshot — real pixels, perfectly in sync, no
// post-processing. (We still also write a .srt sidecar below for soft subs.)
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
const setCaption = (t) => ev((t) => { document.getElementById('__cap').textContent = t || ''; }, t || '');

// ----------------------------------------------------------------------------
// Wiring notes (verified against this build — see the guide's "lessons" section):
//   * Only window.bee is exposed (no window.store). Config lives at
//     bee.scene3d.store.config  (same object as bee.op.store.config).
//   * The render loop FORCES scene.*.rotation.y = 0 every frame unless
//     config.camera.rotate is true — so you cannot set rotation.y by hand.
//     We enable camera.rotate and install a virtual clock (the loop computes
//     rotation.y = Date.now() * 0.0001), which makes the angle deterministic.
//   * Headed-but-unfocused windows throttle requestAnimationFrame, so we call
//     window.animate() to force a synchronous render before each screenshot.
// ----------------------------------------------------------------------------
await page.evaluate(() => {
  window.__virt = 0;
  Date.now = () => window.__virt;             // virtual clock for the turntable
  window.bee.scene3d.store.config.camera.rotate = true;
  // Become the SOLE render driver: cancel the viewer's own requestAnimationFrame
  // loop and neutralize future reschedules, so the only renders are our explicit
  // window.animate() calls below. (Two render loops fighting => visible flicker.)
  window.cancelAnimationFrame(window.bee.scene3d.animationId);
  window.requestAnimationFrame = () => 0;
});

const ev = (fn, arg) => page.evaluate(fn, arg);
const key = (k) => page.keyboard.press(k);

// Name-tolerant layer pick ('clustering' -> clustering-global, 'img' -> img-global).
const pick = (sub) => ev((s) => {
  const k = Object.keys(window.bee.sst.list).find(n => n.toLowerCase().includes(s));
  if (k) window.bee.sst.list[k].selected();
  return k;
}, sub);

const hasOp = await ev(() => !!window.bee.op);

// Set the turntable angle (radians) and force a synchronous render.
const setAngle = (a) => ev((a) => {
  window.__virt = a / 0.0001;                 // rotation.y = virt * 0.0001  => virt = a/0.0001
  window.animate();
}, a);

// ----------------------------------------------------------------------------
// Initial look: the full clustering-global cloud, no optical overlay yet (the
// matched-flash / matchTiming modes restrict the display to one flash's drift
// slice, so we save them for their own beats and open on the whole event).
// ----------------------------------------------------------------------------
await pick('clustering');
await ev(() => window.bee.scene3d.resetCamera());
await page.waitForTimeout(400);

// Helpers to turn the optical overlay on/off cleanly between beats.
const flashOn = () => ev(() => {
  const c = window.bee.scene3d.store.config.op;
  Object.assign(c, { showFlash: true, showPred: true, matchTiming: true, sidePanel: false });
  window.bee.op.draw();
});
const flashOff = () => ev(() => {
  const c = window.bee.scene3d.store.config.op;
  Object.assign(c, { showFlash: false, showPred: false, matchTiming: false, sidePanel: false });
  if (window.bee.op.group_op) window.bee.scene3d.scene.main.remove(window.bee.op.group_op);
  window.bee.current_sst.drawInsideThreeFrames();
});

// ----------------------------------------------------------------------------
// Frame loop: walk the BEATS, advancing the angle each frame; spinning beats
// rotate, holding beats freeze. Subtitle cues are derived from cumulative time.
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

async function runBeat({ caption, secs, spin = false, setup }) {
  if (setup) { await setup(); await page.waitForTimeout(150); }
  if (caption) await setCaption(caption.replace(/\n/g, '\n'));  // update the burned-in overlay
  const start = frame / FPS;
  const n = Math.round(FPS * secs);
  for (let i = 0; i < n; i++) {
    if (spin) angle += SPIN / FPS;
    await shoot();
  }
  if (caption) {
    cues.push({ i: cues.length + 1, a: fmt(start), b: fmt(frame / FPS), text: caption });
  }
}

// ----------------------------------------------------------------------------
// THE STORYBOARD — edit freely. Each beat: caption (subtitle), secs, spin?, setup().
// ----------------------------------------------------------------------------
const BEATS = [
  // Hero: the full reconstructed event, no optical overlay — bright and dense.
  {
    caption: 'ProtoDUNE-HD charge–light matching\nRun 29107  ·  Event 983',
    secs: 7, spin: true,
    setup: async () => { await pick('clustering'); await flashOff(); },
  },
  // The raw imaging point cloud the clusters are built from.
  {
    caption: 'Raw 3-D imaging point cloud (img-global)',
    secs: 3.5, spin: true,
    setup: () => pick('img'),
  },
  // Back to clusters.
  {
    caption: 'Reconstructed charge clusters (clustering-global)',
    secs: 3, spin: true,
    setup: async () => { await pick('clustering'); await flashOff(); },
  },
  ...(hasOp ? [
    // Turn on the optical flashes + predicted PE; matchTiming isolates the
    // matched flash's drift slice — the "matching box".
    {
      caption: 'Each charge cluster is matched to an optical flash',
      secs: 3, spin: true,
      setup: () => flashOn(),
    },
    // Step through several matched flashes.
    {
      caption: 'Stepping through matched flashes  (predicted vs. detected light)',
      secs: 1.6, spin: false, setup: () => key('.'),
    },
    { caption: null, secs: 1.6, spin: false, setup: () => key('.') },
    { caption: null, secs: 1.6, spin: false, setup: () => key('.') },
    // Side-by-side: reconstructed frame (left) vs. true detector frame (right).
    {
      caption: 'True detector frame  ·  reco (left) vs. detector (right)',
      secs: 4.5, spin: true,
      setup: () => ev(() => {
        window.bee.scene3d.store.config.op.sidePanel = true;
        window.bee.op.draw();
      }),
    },
  ] : []),
  // Finisher: full cloud again, recolored per cluster. drawInsideThreeFrames(true)
  // restores the FULL drift range *and* applies random per-cluster colors in one
  // call — more robust than the 'o' hot-key, which re-slices via redrawAllSST if a
  // slice got enabled during the matching beats.
  {
    caption: 'Per-cluster recoloring',
    secs: 2.5, spin: true,
    setup: async () => {
      await pick('clustering');
      await ev(() => {
        const c = window.bee.scene3d.store.config.op;
        Object.assign(c, { showFlash: false, showPred: false, matchTiming: false, sidePanel: false });
        if (window.bee.op?.group_op) window.bee.scene3d.scene.main.remove(window.bee.op.group_op);
        window.bee.current_sst.drawInsideThreeFrames(true);   // full cloud + random colors
      });
    },
  },
];

for (const beat of BEATS) await runBeat(beat);

await browser.close();

// ----------------------------------------------------------------------------
// Write the subtitle track (SRT) — cue times come straight from the beat timing,
// so subtitles stay in sync automatically when you edit beat durations.
// ----------------------------------------------------------------------------
const srt = cues.map(c => `${c.i}\n${c.a} --> ${c.b}\n${c.text}\n`).join('\n');
writeFileSync('subs.srt', srt);
console.log(`wrote ${frame} frames, ${cues.length} subtitle cues`);

// ----------------------------------------------------------------------------
// Assemble the mp4. Captions are already in the frames (DOM overlay above), so no
// subtitle filter is needed — which is good, because this ffmpeg has no libass.
// ----------------------------------------------------------------------------
execSync(
  `ffmpeg -y -framerate ${FPS} -i ${OUT}/%05d.png ` +
  `-c:v libx264 -crf 18 -pix_fmt yuv420p -movflags +faststart charge_light.mp4`,
  { stdio: 'inherit' }
);
console.log('wrote charge_light.mp4');

// Optional: also produce a copy with the .srt muxed as a *soft* subtitle track
// (toggleable in players that support it). mov_text needs no libass. Comment out
// if you only want the burned-in version.
try {
  execSync(
    `ffmpeg -y -i charge_light.mp4 -i subs.srt -c copy -c:s mov_text ` +
    `-metadata:s:s:0 language=eng charge_light_softsubs.mp4`,
    { stdio: 'inherit' }
  );
  console.log('wrote charge_light_softsubs.mp4 (toggleable subtitle track)');
} catch { console.log('(soft-sub mux skipped)'); }
