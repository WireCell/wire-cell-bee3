// make_pdvd_sidepanel.mjs — PDVD "side-panel (detector-frame) charge–light matching" video.
//
// Ported from make_sbnd_sidepanel.mjs to the ProtoDUNE Vertical Drift set. Drives the existing
// Bee viewer via window.bee, screenshots one PNG per frame (right-half-cropped for the
// detector-only loop), writes a beat-synced subtitle track, ffmpeg assembles the mp4. No Bee
// code is modified.
//   node make_pdvd_sidepanel.mjs
//
// Storyboard:
//   Seg A (full split): img-global -> Show Charge -> Show Cluster, enable side panel, zoom.
//                       Loop 1 (1 s/match): left = actual measurement, right = T0-corrected.
//   Seg B (right half): rotate the detector frame; Loop 2 (2 s/match): red = measured PE,
//                       green = predicted PE circles per flash.
//   Seg C (full frame): NON-MATCHED clusters — a few long tracks that match no light, with a
//                       top label reporting how many clusters DID match (the few long unmatched
//                       ones read as small next to the whole set).
//   Seg D (right half): beam-flash finale — land EXACTLY on the beam flash (op_t ~ 1794.82 us,
//                       idx by nearest time), show ONLY the right/detector side, isolate + label.
//
// PDVD specifics (resolved by probe_pdvd.mjs):
//   * op.js already fans the predicted (green) circle off the measured (red) one for
//     'protodunevd' (op.js:354-370) — so NO fixPred() fixup is needed (unlike SBND).
//   * nextMatchingBeam() is unreliable here (PDVD beam-window defaults land it on t~-2350 us),
//     so the finale lands on the beam flash by EXACT INDEX (nearest op_t/op_t1 to 1794.82).
//   * clustering-global has uncalibrated x (~1e8), so the crosser scan uses img-global.
//
// GATE=B : one frame after side panel + first matched step -> gateB.png
// GATE=N : one frame of the non-matched beat            -> gateN.png
// GATE=C : one frame of the beam-flash finale           -> gateC.png

import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

// ----------------------------------------------------------------------------
// Constants — PDVD set (Run 39252, Event 298581).
// ----------------------------------------------------------------------------
const SET = 'eec93799-7a6f-4474-8196-688ddbdd91bb';
const EVENT = 0;
const URL = `http://127.0.0.1:8000/set/${SET}/event/${EVENT}/`;

const W = 1280, H = 1000;                     // even numbers (libx264 requirement)
const FPS = 30;
const SPIN = 2 * Math.PI / 10;                // turntable: one full turn / 10 s (rad/s)
const SUBSET = 16;                            // matched flashes to walk in the loops (39 total)
const RIGHT_CLIP = { x: W / 2, y: 0, width: W / 2, height: H };

const BEAM_T = 1794.82;                        // target beam flash time (us); land on nearest.

// Cathode-crossing arrow anchors, PDVD global cm (drift x, cathode at x=0, |x| up to ~341).
const ARROW_X0 = 210, ARROW_X1 = 25, ARROW_NMIN = 350;

const GATE = process.env.GATE || '';          // 'B' | 'N' | 'C'

// ----------------------------------------------------------------------------
// Launch headless (ANGLE/SwiftShader).
// ----------------------------------------------------------------------------
for (const d of ['frames_pdvd_a', 'frames_pdvd_b', 'frames_pdvd_c', 'frames_pdvd_d']) { rmSync(d, { recursive: true, force: true }); mkdirSync(d, { recursive: true }); }

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
const setFlashLabel = (t) => ev((t) => { const e = document.getElementById('__flash'); if (e) { e.textContent = t || ''; e.style.display = t ? 'block' : 'none'; } }, t || '');
const setFlashPos = (pct) => ev((p) => { const e = document.getElementById('__flash'); if (e) e.style.left = p; }, pct);

async function setupPage() {
  await page.addStyleTag({ content: `
    .dg.main { display: none !important; }
    #sst-docker { display: none !important; }
    nav, .navbar, #event-info, #event-text, #statusbar, #loadingbar, #infobar { display: none !important; }
  ` });
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
    if (!document.getElementById('__flash')) {
      const f = document.createElement('div');
      f.id = '__flash';
      Object.assign(f.style, {
        display: 'none', position: 'fixed', left: '50%', top: '34px', transform: 'translateX(-50%)',
        padding: '8px 16px', zIndex: 99999,
        font: '700 22px/1.3 Helvetica, Arial, sans-serif', color: '#ffe000', textAlign: 'center',
        background: 'rgba(0,0,0,0.6)', borderRadius: '8px', whiteSpace: 'pre-line',
        pointerEvents: 'none', letterSpacing: '0.3px',
      });
      document.body.appendChild(f);
    }
  });
  await ev(() => {
    window.__virt = 0;
    Date.now = () => window.__virt;
    window.bee.scene3d.store.config.camera.rotate = true;
    window.bee.scene3d.store.config.material.overlay = false;   // selecting a layer hides others
    window.cancelAnimationFrame(window.bee.scene3d.animationId);
    window.requestAnimationFrame = () => 0;
  });
}
await setupPage();

const setAngle = (a) => ev((a) => { window.__virt = a / 0.0001; window.animate(); }, a);

// Name-tolerant layer pick; wait until the layer's point data is present (avoids a draw race).
const pick = async (sub) => {
  const k = await ev((s) => {
    const key = Object.keys(window.bee.sst.list).find(n => n.toLowerCase() === s) ||
                Object.keys(window.bee.sst.list).find(n => n.toLowerCase().includes(s));
    if (key) window.bee.sst.list[key].selected();
    return key;
  }, sub);
  await page.waitForFunction(() => {
    const s = window.bee.current_sst;
    return s && s.loaded && s.data && s.data.x && s.data.x.length > 0;
  }, null, { timeout: 30000 });
  return k;
};

const setMaterial = ({ charge, cluster }) => ev(({ charge, cluster }) => {
  const m = window.bee.scene3d.store.config.material;
  m.showCharge = charge; m.showCluster = cluster;
  window.bee.redrawAllSST(false); window.animate();
}, { charge, cluster });

// Optical side panel on (split reco | detector frame). PDVD needs NO green-circle fixup.
const sidePanelOn = () => ev(() => {
  Object.assign(window.bee.scene3d.store.config.op, { showFlash: true, showPred: true, matchTiming: false, sidePanel: true });
  window.bee.op.draw(); window.bee.scene3d.resetCamera(); window.animate();
});

const zoomBy = (f) => ev((f) => {
  const cam = window.bee.scene3d.camera.active;
  cam.zoom *= f; cam.updateProjectionMatrix(); window.animate();
}, f);

// Step to the next matched flash/bundle (isolates its matched cluster via showMatchingCluster).
const stepMatched = async () => { await ev(() => { window.bee.op.nextMatching(); window.bee.op.draw(); window.animate(); }); };
const resetFlash = () => ev(() => { window.bee.op.currentFlash = 0; });

const recolor = () => ev(() => { window.bee.redrawAllSST(true); window.animate(); });
const resetTilt = () => ev(() => { window.bee.scene3d.scene.main.rotation.x = 0; window.bee.scene3d.resetCamera(); window.animate(); });

// Non-matched clusters: clusters that match no flash, shown on their own.
const nonMatchingOn = () => ev(() => {
  Object.assign(window.bee.scene3d.store.config.op, { showFlash: false, sidePanel: false, matchTiming: false, showMatchingCluster: false, showNonMatchingCluster: true });
  window.bee.op.draw(); window.animate();
});

// Cluster-match census for the non-matched beat: how many clusters matched to light, and how many
// of the UNMATCHED ones are actually long tracks (npts >= longMin) vs tiny noise. Shows the few
// long non-matched clusters are small next to the whole matched population.
const nonMatchCounts = (longMin = 300) => ev((longMin) => {
  const op = window.bee.op, sst = window.bee.current_sst, cl = sst.data.cluster_id;
  const sizes = {};
  for (let i = 0; i < cl.length; i++) { const c = Number(cl[i]); if (c > 0) sizes[c] = (sizes[c] || 0) + 1; }
  const present = Object.keys(sizes).map(Number);
  const matchedGlobal = op.allMatchingIds();
  let matched = 0; for (const c of present) if (matchedGlobal.has(c)) matched++;
  const non = op.nonMatchingIds().filter(c => c > 0);
  const longUnmatched = non.filter(c => (sizes[c] || 0) >= longMin).length;
  return { matched, longUnmatched, total: present.length };
}, longMin);

// Cathode-crossing arrows in img-global (proper x; clustering-global's x is uncalibrated).
const addArrows = () => ev(({ x0, x1, nmin }) => {
  const bee = window.bee, exp = bee.scene3d.store.experiment, THREE = window.THREE;
  const key = Object.keys(bee.sst.list).find(n => n.toLowerCase() === 'img-global');
  const s = bee.sst.list[key]; const d = s.data;
  const x = d.x, y = d.y, z = d.z, cid = d.cluster_id;
  const m = {};
  for (let i = 0; i < x.length; i++) { const c = Number(cid[i]); (m[c] || (m[c] = { n: 0, xmin: 1e9, xmax: -1e9, ys: 0, zs: 0 })); const o = m[c]; o.n++; if (x[i] < o.xmin) o.xmin = x[i]; if (x[i] > o.xmax) o.xmax = x[i]; o.ys += y[i]; o.zs += z[i]; }
  const crossers = Object.values(m).map(o => ({ n: o.n, span: o.xmax - o.xmin, crosses: o.xmin < 0 && o.xmax > 0, ymean: o.ys / o.n, zmean: o.zs / o.n }))
    .filter(a => a.crosses && a.n > nmin).sort((a, b) => b.span - a.span).slice(0, 3);
  window.__arrows = [];
  for (const t of crossers) {
    const origin = new THREE.Vector3(...exp.toLocalXYZ(x0, t.ymean, t.zmean));
    const target = new THREE.Vector3(...exp.toLocalXYZ(x1, t.ymean, t.zmean));
    const dir = target.clone().sub(origin); const len = dir.length(); dir.normalize();
    const arrow = new THREE.ArrowHelper(dir, origin, len, 0xffe000, len * 0.30, len * 0.20);
    if (arrow.line && arrow.line.material) arrow.line.material.linewidth = 3;
    bee.scene3d.scene.main.add(arrow); window.__arrows.push(arrow);
  }
  window.animate();
  return crossers.length;
}, { x0: ARROW_X0, x1: ARROW_X1, nmin: ARROW_NMIN });
const clearArrows = () => ev(() => { if (window.__arrows) { for (const a of window.__arrows) window.bee.scene3d.scene.main.remove(a); window.__arrows = []; } window.animate(); });

// Beam flash finale: land on the flash whose time is nearest BEAM_T, searching BOTH crate clocks
// (op_t bottom, op_t1 top). Assert near-exact; isolate its matched cluster. Shown in the SPLIT
// side panel (left reco | right T0-corrected detector frame). Returns the value.
const beamFlash = async () => {
  const t = await ev((BEAM_T) => {
    Object.assign(window.bee.scene3d.store.config.op, { showFlash: true, showPred: true, matchTiming: false, sidePanel: true, showMatchingCluster: true, showNonMatchingCluster: false });
    const op = window.bee.op;
    const clocks = [op.data.op_t, op.data.op_t1].filter(Boolean);
    let best = 0, bd = 1e9;
    for (const arr of clocks) for (let i = 0; i < arr.length; i++) { const dd = Math.abs(arr[i] - BEAM_T); if (dd < bd) { bd = dd; best = i; } }
    if (bd > 0.5) throw new Error(`no flash near ${BEAM_T} us (closest off by ${bd.toFixed(2)})`);
    op.currentFlash = best;
    op.draw(); window.bee.scene3d.resetCamera(); window.animate();
    return { t: op.data.op_t[best], idx: best, pe: op.data.op_peTotal ? op.data.op_peTotal[best] : null };
  }, BEAM_T);
  return t;
};
const fmtUs = (t) => `Beam-coincident flash\nt = ${(+t).toFixed(2)} µs  ·  ProtoDUNE beam event`;

// ----------------------------------------------------------------------------
// Frame loop.
// ----------------------------------------------------------------------------
const counters = { pdvd_a: 0, pdvd_b: 0, pdvd_c: 0, pdvd_d: 0 };
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
  await page.screenshot({ path: `frames_${seg}/${String(counters[seg]++).padStart(5, '0')}.png`, ...(clip ? { clip } : {}) });
};

async function beat({ seg = 'pdvd_a', clip = null, caption, secs, spin = false, setup, settle = 150, step = null, stepEvery = 0 }) {
  if (setup) { await setup(); await page.waitForTimeout(settle); }
  if (caption !== undefined) await setCaption(caption);
  const start = T;
  const n = Math.round(FPS * secs);
  const stepN = step && stepEvery ? Math.round(FPS * stepEvery) : 0;
  for (let i = 0; i < n; i++) {
    if (stepN && i > 0 && i % stepN === 0) await step();
    if (spin) angle += SPIN / FPS;
    await shoot(seg, clip);
  }
  T += n / FPS;
  if (caption) pushCue(caption, start, T);
}

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
// GATE renders.
// ----------------------------------------------------------------------------
if (GATE === 'B') {
  await pick('img-global'); await setMaterial({ charge: false, cluster: true });
  await sidePanelOn(); await zoomBy(1.6); await page.waitForTimeout(700);
  await stepMatched(); await page.waitForTimeout(200);
  await setCaption('GATE B — side panel: left reco | right detector frame');
  await ev(() => { window.__virt = 0; window.animate(); });
  await page.screenshot({ path: 'gateB.png' });
  await browser.close(); console.log('GATE B: wrote gateB.png'); process.exit(0);
}
if (GATE === 'N') {
  await pick('img-global'); await setMaterial({ charge: false, cluster: true });
  await nonMatchingOn(); await ev(() => window.bee.scene3d.resetCamera()); await zoomBy(1.8); await page.waitForTimeout(300);
  const c = await nonMatchCounts();
  await setFlashPos('50%'); await setFlashLabel(`${c.matched} clusters matched to light\nonly ${c.longUnmatched} long tracks remain unmatched`);
  await setCaption('GATE N — non-matched clusters + match census');
  await ev(() => { window.__virt = 0; window.animate(); });
  await page.screenshot({ path: 'gateN.png' });
  await browser.close(); console.log(`GATE N: wrote gateN.png (matched=${c.matched} longUnmatched=${c.longUnmatched} total=${c.total})`); process.exit(0);
}
if (GATE === 'C') {
  await pick('img-global'); await setMaterial({ charge: false, cluster: true });
  const info = await beamFlash();
  await zoomBy(1.8); await page.waitForTimeout(300);
  await setCaptionPos('75%'); await setFlashPos('75%');
  await setFlashLabel(fmtUs(info.t));
  await setCaption('GATE C — beam flash (right side only)');
  await ev(() => { window.__virt = 0; window.animate(); });
  await page.screenshot({ path: 'gateC.png', clip: RIGHT_CLIP });
  await browser.close(); console.log(`GATE C: wrote gateC.png (idx=${info.idx} t=${(+info.t).toFixed(2)} pe=${info.pe})`); process.exit(0);
}

// ----------------------------------------------------------------------------
// THE STORYBOARD.
// ----------------------------------------------------------------------------

// --- Segment A (full frame): establishing + loop 1 --------------------------
await beat({ seg: 'pdvd_a', secs: 2.6, spin: true, caption: 'ProtoDUNE VD charge–light matching\n3-D image · charge reconstructed',
  setup: async () => { await pick('img-global'); await setMaterial({ charge: true, cluster: false }); await ev(() => window.bee.scene3d.resetCamera()); await page.waitForTimeout(500); } });
await beat({ seg: 'pdvd_a', secs: 2.6, spin: true, caption: 'Per-cluster colors after clustering',
  setup: () => setMaterial({ charge: false, cluster: true }) });
await beat({ seg: 'pdvd_a', secs: 3.2, spin: true, settle: 700,
  caption: 'To place the charge in time, match it to the detected light\n— detector-frame side panel',
  setup: async () => { await sidePanelOn(); await zoomBy(1.6); } });
await loopMatched({ seg: 'pdvd_a', clip: null, secPer: 1.0, spin: false,
  caption: 'Left: actual measurement   ·   Right: T0-corrected positions\nTracks placed at their true drift position, crossing the central cathode' });

// --- Segment B (right-half crop): transition + loop 2 -----------------------
await setCaptionPos('75%');
await beat({ seg: 'pdvd_b', clip: RIGHT_CLIP, secs: 5.0, spin: true, settle: 300,
  caption: 'Detector frame (T0-corrected) — light pattern per flash',
  setup: async () => { await resetFlash(); await stepMatched(); await zoomBy(1.1); } });
await resetFlash();
await loopMatched({ seg: 'pdvd_b', clip: RIGHT_CLIP, secPer: 1.5, spin: true,
  caption: 'Red: measured light pattern\nGreen: predicted from the charge   ·   agreement = a match' });

// --- Segment C (full frame): non-matched + beam flash finale ----------------
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => window.bee?.current_sst?.pointCloud, null, { timeout: 60000 });
await page.waitForTimeout(1500);
await setupPage();
await setCaptionPos('50%');
angle = 0;

// C1) non-matched clusters — a few long tracks that match no light. Top label reports how many
//     clusters DID match, so the few long unmatched ones read as small next to the whole set.
let counts = null;
await beat({ seg: 'pdvd_c', secs: 9.5, spin: true, settle: 400,
  caption: 'A few long tracks match no light — shown on their own.\nRoom to improve light reconstruction and charge–light matching',
  setup: async () => {
    await pick('img-global'); await setMaterial({ charge: false, cluster: true });
    await nonMatchingOn(); await ev(() => window.bee.scene3d.resetCamera()); await zoomBy(1.5);
    counts = await nonMatchCounts();
    await setFlashPos('50%');
    await setFlashLabel(`${counts.matched} clusters matched to light\nonly ${counts.longUnmatched} long tracks remain unmatched`);
  } });
await setFlashLabel('');
console.log(`clusters: matched=${counts?.matched} longUnmatched=${counts?.longUnmatched} total=${counts?.total}`);

// C2) beam flash finale — land EXACTLY on the beam flash; show ONLY the RIGHT side of the side
//     panel (the T0-corrected detector frame), cropped like the Seg B detector loop.
await setCaptionPos('75%'); await setFlashPos('75%');
let beamInfo = null;
await beat({ seg: 'pdvd_d', clip: RIGHT_CLIP, secs: 12.0, spin: true, settle: 600,
  caption: 'This flash is in time with the ProtoDUNE beam spill\n— the beam event',
  setup: async () => {
    await setFlashLabel('');
    await pick('img-global'); await setMaterial({ charge: false, cluster: true });
    beamInfo = await beamFlash();
    await zoomBy(1.8);
    await setFlashLabel(fmtUs(beamInfo.t));
    await page.waitForTimeout(400);
  } });
await setFlashLabel('');
console.log(`beam flash: idx=${beamInfo?.idx} t=${(+beamInfo?.t).toFixed(2)} us pe=${beamInfo?.pe}`);

await browser.close();

// ----------------------------------------------------------------------------
// Subtitle track.
// ----------------------------------------------------------------------------
writeFileSync('pdvd_sidepanel.srt', cues.map(c => `${c.i}\n${c.a} --> ${c.b}\n${c.text}\n`).join('\n'));
console.log(`frames: a=${counters.pdvd_a} b=${counters.pdvd_b} c=${counters.pdvd_c} d=${counters.pdvd_d}; cues=${cues.length}`);

// ----------------------------------------------------------------------------
// Assemble: encode each segment, padding the right-half crop back to W×H, then concat.
// ----------------------------------------------------------------------------
const enc = (dir, out, pad) => execSync(
  `ffmpeg -y -framerate ${FPS} -i ${dir}/%05d.png ` +
  (pad ? `-vf "pad=${W}:${H}:(ow-iw)/2:0:black,setsar=1" ` : `-vf "setsar=1" `) +
  `-c:v libx264 -crf 18 -pix_fmt yuv420p ${out}`, { stdio: 'inherit' });
enc('frames_pdvd_a', 'seg_pdvd_a.mp4', false);
enc('frames_pdvd_b', 'seg_pdvd_b.mp4', true);
enc('frames_pdvd_c', 'seg_pdvd_c.mp4', false);
enc('frames_pdvd_d', 'seg_pdvd_d.mp4', true);   // beam finale: right-half detector frame, padded

writeFileSync('concat_pdvd_sp.txt', "file 'seg_pdvd_a.mp4'\nfile 'seg_pdvd_b.mp4'\nfile 'seg_pdvd_c.mp4'\nfile 'seg_pdvd_d.mp4'\n");
try {
  execSync(`ffmpeg -y -f concat -safe 0 -i concat_pdvd_sp.txt -c copy -movflags +faststart pdvd_sidepanel.mp4`, { stdio: 'inherit' });
} catch {
  console.log('(stream-copy concat failed, re-encoding)');
  execSync(`ffmpeg -y -f concat -safe 0 -i concat_pdvd_sp.txt -c:v libx264 -crf 18 -pix_fmt yuv420p -movflags +faststart pdvd_sidepanel.mp4`, { stdio: 'inherit' });
}
console.log('wrote pdvd_sidepanel.mp4');
