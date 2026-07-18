// make_pdvd_clustering.mjs — "clustering reveal" for one ProtoDUNE Vertical Drift event, per TPC.
//
// PDVD has a TOP and a BOTTOM drift volume, each read out by FOUR Charge Readout Planes (CRPs)
// tiled 2x2 in (y,z). For the TOP TPC we walk the build-up:
//   3-D imaging points -> charge-weighted -> cluster-colored, then a top-down (along-drift) view
//   holding the four CRP boundary boxes + converging "seam" arrows to show that tracks crossing
//   the four planes are joined into single clusters. Then we repeat for the BOTTOM TPC.
//
// Drives the *existing* Bee viewer via window.bee (no Bee code modified), screenshots one PNG per
// frame, writes a beat-synced .srt, and lets ffmpeg assemble the mp4.
//   node make_pdvd_clustering.mjs
//
// GATE renders (single frame, then exit) to tune framing before the full render:
//   GATE=1  top TPC, 3-D cluster view + 4 CRP boxes                -> gate_p1.png
//   GATE=2  top TPC, along-drift (W) view + boxes + seam arrows    -> gate_p2.png
//   GATE=3  bottom TPC, 3-D cluster view + 4 CRP boxes             -> gate_p3.png
//
// Layers / geometry resolved by probe_pdvd.mjs:
//   img-side-top = TOP TPC (anode boxes 4-7, drift -x), img-side-bot = BOTTOM (boxes 0-3, drift +x);
//   exp.tpc.location holds 8 per-CRP boxes [xmin,xmax,ymin,ymax,zmin,zmax] (global cm).

import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

// ----------------------------------------------------------------------------
// Constants — PDVD set (Run 39252, Event 298581).
// ----------------------------------------------------------------------------
const SET = 'eec93799-7a6f-4474-8196-688ddbdd91bb';
const EVENT = 0;
const URL = `http://127.0.0.1:8000/set/${SET}/event/${EVENT}/`;

const OUT = 'frames_pdvd_clus';
const W = 1280, H = 1000;                     // even numbers (libx264 requirement)
const FPS = 30;
const SPIN = 2 * Math.PI / 12;                // gentle turntable: one full turn / 12 s (rad/s)
const OUT_MP4 = 'pdvd_clustering.mp4';
const OUT_SRT = 'pdvd_clustering.srt';

const ZOOM = 1.4;                             // main 3-D zoom after every resetCamera
const TOP_ZOOM = 1.35;                        // along-drift (W) view zoom — wider y-z footprint

// Per-TPC image layers (carry cluster_id) and their four CRP box indices in exp.tpc.location.
const TOP = 'img-side-top';  const TOP_BOXES = [4, 5, 6, 7];
const BOT = 'img-side-bot';  const BOT_BOXES = [0, 1, 2, 3];

// Seam arrows: in the along-drift view the four CRPs meet in a 2x2 cross near the frame centre.
// Four glyphs converge on that cross (tuned from a GATE=2 render). cx/cy = cross centre px,
// gapx/gapy = half-offset of each arrowhead from the cross.
const SEAM = { cx: 640, cy: 500, gapx: 150, gapy: 120 };

const GATE = process.env.GATE || '';          // '1' | '2' | '3'

// ----------------------------------------------------------------------------
// Launch headless (ANGLE/SwiftShader).
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

await page.addStyleTag({ content: `
  .dg.main { display: none !important; }
  #sst-docker { display: none !important; }
  nav, .navbar, #event-info, #event-text, #statusbar, #loadingbar, #infobar { display: none !important; }
` });

// Caption overlay (captured inside each screenshot; also emitted as an .srt sidecar).
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

// Seam arrows (shown only in the along-drift beats): four glyphs that converge on the CRP cross.
await page.evaluate((S) => {
  const box = document.createElement('div');
  box.id = '__arrows';
  Object.assign(box.style, { display: 'none', position: 'fixed', left: '0', top: '0', zIndex: 99999, pointerEvents: 'none' });
  const mk = (id, ch, x, y) => {
    const a = document.createElement('div');
    a.id = id; a.textContent = ch;
    Object.assign(a.style, {
      position: 'fixed', left: x + 'px', top: y + 'px',
      font: '800 48px/1 Helvetica, Arial, sans-serif', color: '#ffeb3b',
      textShadow: '0 0 4px #000, 0 0 8px #000', willChange: 'transform',
    });
    return a;
  };
  // left/right converge on the vertical (z) seam; up/down converge on the horizontal (y) seam.
  box.appendChild(mk('__arrowL', '▶', S.cx - S.gapx - 24, S.cy - 24));
  box.appendChild(mk('__arrowR', '◀', S.cx + S.gapx, S.cy - 24));
  box.appendChild(mk('__arrowU', '▼', S.cx - 18, S.cy - S.gapy - 24));
  box.appendChild(mk('__arrowD', '▲', S.cx - 18, S.cy + S.gapy));
  document.body.appendChild(box);
}, SEAM);

const ev = (fn, arg) => page.evaluate(fn, arg);
const setCaption = (t) => ev((t) => { document.getElementById('__cap').textContent = t || ''; }, t || '');
const setArrows = (on) => ev((on) => { document.getElementById('__arrows').style.display = on ? 'block' : 'none'; }, on);
const bobArrows = (i) => ev((i) => {
  const d = 12 * Math.abs(Math.sin(i * Math.PI / 12));  // 0..12 px bob toward the cross
  const L = document.getElementById('__arrowL'), R = document.getElementById('__arrowR');
  const U = document.getElementById('__arrowU'), D = document.getElementById('__arrowD');
  if (L) L.style.transform = `translateX(${d}px)`;
  if (R) R.style.transform = `translateX(${-d}px)`;
  if (U) U.style.transform = `translateY(${d}px)`;
  if (D) D.style.transform = `translateY(${-d}px)`;
}, i);

// ----------------------------------------------------------------------------
// Become the SOLE render driver with a virtual clock (see the guide's "lessons").
// ----------------------------------------------------------------------------
await page.evaluate(() => {
  window.__virt = 0;
  Date.now = () => window.__virt;
  window.bee.scene3d.store.config.camera.rotate = true;
  window.cancelAnimationFrame(window.bee.scene3d.animationId);
  window.requestAnimationFrame = () => 0;
  window.bee.scene3d.store.config.material.overlay = false;   // show one layer at a time
  // Hide the built-in faint-gray 8-box detector helper so only our red CRP boxes for the ACTIVE
  // TPC show (helper.js draws all 8 CRPs; they overlap top/bottom in the along-drift view).
  window.bee.scene3d.store.config.helper.showTPC = false;
  window.bee.helper.showTPC();
});

const setAngle = (a) => ev((a) => { window.__virt = a / 0.0001; window.animate(); }, a);

// Select a layer by exact name; wait for its point data to actually load (avoids a draw race).
const selectLayer = async (name) => {
  await ev((name) => { window.bee.sst.list[name].selected(); }, name);
  await page.waitForFunction(() => {
    const s = window.bee.current_sst;
    return s && s.loaded && s.data && s.data.x && s.data.x.length > 0;
  }, null, { timeout: 30000 });
};

const setMode = ({ charge, cluster }) => ev(({ charge, cluster }) => {
  const m = window.bee.scene3d.store.config.material;
  m.showCharge = charge; m.showCluster = cluster;
  window.bee.redrawAllSST(false); window.animate();
}, { charge, cluster });

const recolor = () => ev(() => { window.bee.redrawAllSST(true); window.animate(); });

const applyZoom = () => ev((z) => {
  const cam = window.bee.scene3d.camera.active;
  cam.zoom *= z; cam.updateProjectionMatrix(); window.animate();
}, ZOOM);

// Multiply the current zoom (no resetCamera) — used to zoom OUT and reveal the T0-drift sprawl
// that reconstructs outside the CRP boxes.
const zoomMul = (f) => ev((f) => {
  const cam = window.bee.scene3d.camera.active;
  cam.zoom *= f; cam.updateProjectionMatrix(); window.animate();
}, f);

// Along-drift view: look straight down the drift axis so the four CRPs read as a clean 2x2 (y,z)
// grid and the T0-uncorrected drift-sprawl recedes into screen depth. scene.main is rotated +90
// deg about Z, so geometry-local X (drift) lives on WORLD Y — the camera must look along world Y
// (up = world X). That is xzView()'s geometry, but set DIRECTLY (xzView/yzView use TweenLite,
// which never advances under our neutralized rAF; xwView would work synchronously but adds the W
// wire-angle rotation that mixes drift back into screen-vertical). Re-target zoom to TOP_ZOOM.
const topView = () => ev(({ tz, z }) => {
  const s = window.bee.scene3d, cam = s.camera.active, tgt = s.controller.active.target;
  cam.up.set(1, 0, 0);
  cam.position.set(tgt.x, s.store.config.camera.depth, tgt.z);
  s.controller.active.update();
  cam.zoom *= tz / z; cam.updateProjectionMatrix();
  window.animate();
}, { tz: TOP_ZOOM, z: ZOOM });

// Draw the four CRP boundary BoxHelpers for a TPC WITHOUT clipping the point cloud (replicates
// only the BoxHelper part of Box Mode, sst.js:276-289, leaving box_mode=false so the joined
// cross-CRP tracks keep drawing in full).
const drawCrpBoxes = (indices) => ev((indices) => {
  const bee = window.bee, exp = bee.scene3d.store.experiment, THREE = window.THREE;
  if (window.__crpboxes) for (const o of window.__crpboxes) bee.scene3d.scene.main.remove(o);
  window.__crpboxes = [];
  for (const idx of indices) {
    const r = exp.tpc.location[idx];          // [xmin,xmax,ymin,ymax,zmin,zmax] (global cm)
    const [xmin, ymin, zmin] = exp.toLocalXYZ(r[0], r[2], r[4]);
    const [xmax, ymax, zmax] = exp.toLocalXYZ(r[1], r[3], r[5]);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(Math.abs(xmax - xmin), Math.abs(ymax - ymin), Math.abs(zmax - zmin)),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
    const box = new THREE.BoxHelper(mesh); box.material.color.setHex(0xff0000);
    const obj = new THREE.Object3D(); obj.add(box);
    obj.position.set((xmax + xmin) / 2, (ymax + ymin) / 2, (zmax + zmin) / 2);
    bee.scene3d.scene.main.add(obj); window.__crpboxes.push(obj);
  }
  window.animate();
}, indices);
const clearCrpBoxes = () => ev(() => {
  if (window.__crpboxes) { for (const o of window.__crpboxes) window.bee.scene3d.scene.main.remove(o); window.__crpboxes = []; }
  window.animate();
});

// ----------------------------------------------------------------------------
// GATE renders (single frame, then exit).
// ----------------------------------------------------------------------------
if (GATE) {
  if (GATE === '1' || GATE === '2') {
    await selectLayer(TOP); await setMode({ charge: false, cluster: true });
    await ev(() => window.bee.scene3d.resetCamera()); await applyZoom(); await drawCrpBoxes(TOP_BOXES);
    if (GATE === '2') { await topView(); await setArrows(true); await bobArrows(6); }
  } else if (GATE === '3') {
    await selectLayer(BOT); await setMode({ charge: false, cluster: true });
    await ev(() => window.bee.scene3d.resetCamera()); await applyZoom(); await drawCrpBoxes(BOT_BOXES);
  }
  await setCaption(`GATE ${GATE}`);
  await page.waitForTimeout(200);
  await ev(() => { window.__virt = 0; window.animate(); });
  await page.screenshot({ path: `gate_p${GATE}.png` });
  await browser.close();
  console.log(`GATE ${GATE}: wrote gate_p${GATE}.png`);
  process.exit(0);
}

// ----------------------------------------------------------------------------
// Frame loop.
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

async function runBeat({ caption, secs, spin = true, setup, step, stepEvery, arrows = false, flat = false }) {
  if (setup) { await setup(); await page.waitForTimeout(150); }
  if (caption) await setCaption(caption);
  await setArrows(arrows);
  const savedAngle = angle;
  if (flat) angle = 0;
  const start = frame / FPS;
  const n = Math.round(FPS * secs);
  const stepN = step && stepEvery ? Math.round(FPS * stepEvery) : 0;
  for (let i = 0; i < n; i++) {
    if (step && stepN && i > 0 && i % stepN === 0) await step();
    if (arrows) await bobArrows(i);
    if (spin) angle += SPIN / FPS;
    await shoot();
  }
  if (flat) angle = savedAngle;
  if (caption) cues.push({ i: cues.length + 1, a: fmt(start), b: fmt(frame / FPS), text: caption });
}

// ----------------------------------------------------------------------------
// THE STORYBOARD.
// ----------------------------------------------------------------------------
const BEATS = [
  // --- TOP TPC (four CRPs) --------------------------------------------------
  // 1) establishing: 3-D imaging points -> charge -> cluster colors, with the 4 CRP boxes.
  {
    caption: 'ProtoDUNE Vertical Drift — top drift volume\nRun 39252 · Event 298581',
    secs: 5.0, spin: true,
    setup: async () => { await selectLayer(TOP); await setMode({ charge: false, cluster: false }); await ev(() => window.bee.scene3d.resetCamera()); await applyZoom(); await drawCrpBoxes(TOP_BOXES); },
  },
  {
    caption: 'Reconstructed 3-D charge',
    secs: 7.0, spin: true,
    setup: () => setMode({ charge: true, cluster: false }),
  },
  {
    caption: 'The top TPC is read out by four charge readout planes (CRPs)',
    secs: 4.5, spin: true,
    setup: () => setMode({ charge: false, cluster: true }),
    step: () => recolor(), stepEvery: 0.6,
  },
  // 1b) T0 explanation: zoom out to reveal charge reconstructed OUTSIDE the CRP boxes. Before
  //     light-matching gives T0, only the charge arrival time is known, so the drift position is
  //     off and some activity lands beyond the box.
  {
    caption: 'Before T0, charge is placed by arrival time alone —\nsome activity reconstructs outside the CRP boxes',
    secs: 9.0, spin: true,
    setup: () => zoomMul(0.72),
  },
  // 2) along-drift view: hold the 2x2 CRP grid + converging seam arrows -> tracks joined.
  {
    caption: 'Tracks crossing the four planes are joined into single clusters',
    secs: 5.5, spin: false, arrows: true, flat: true,
    setup: async () => { await ev(() => window.bee.scene3d.resetCamera()); await applyZoom(); await topView(); },
    step: () => recolor(), stepEvery: 0.8,
  },

  // --- BOTTOM TPC (four CRPs) ----------------------------------------------
  {
    caption: 'The bottom drift volume — its own four CRPs',
    secs: 4.5, spin: true,
    setup: async () => { await clearCrpBoxes(); await selectLayer(BOT); await setMode({ charge: false, cluster: true }); await ev(() => window.bee.scene3d.resetCamera()); await applyZoom(); await drawCrpBoxes(BOT_BOXES); },
    step: () => recolor(), stepEvery: 0.6,
  },
  {
    caption: 'Tracks are joined across the four planes the same way',
    secs: 4.5, spin: false, arrows: true, flat: true,
    setup: () => topView(), step: () => recolor(), stepEvery: 0.8,
  },
];

for (const beat of BEATS) await runBeat(beat);
await browser.close();

// ----------------------------------------------------------------------------
// Subtitle track.
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
