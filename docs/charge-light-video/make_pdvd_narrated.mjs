#!/usr/bin/env node
// make_pdvd_narrated.mjs — add a Kokoro (on-device) voice-over to the combined PDVD QL video.
// Audio-only pass: the video stream is stream-copied, never re-encoded. Same voice (af_heart)
// as the PDHD/SBND videos — NOT the macOS `say` default.
//
//   node make_pdvd_narrated.mjs
//
// Output: pdvd_ql_matching_narrated.mp4  (+ pdvd_narration.txt sidecar)
//
// LINES are keyed to the combined-video timeline: Part 1 clustering spans 0–26.2 s, Part 2
// sidepanel is offset by +26.2 s. Times are taken from the two .srt cue tracks so narration
// lands on each beat.

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';

const DIR = '/Users/xinqian/Wire-Cell/wire-cell-bee3/bee-video';
const SRC = `${DIR}/pdvd_ql_matching.mp4`;
const OUT = `${DIR}/pdvd_ql_matching_narrated.mp4`;
const TMP = `${DIR}/_audio_pdvd`;
const PY = `${DIR}/.venv-kokoro/bin/python`;
const KTTS = `${DIR}/kokoro_tts.py`;
const VOICE = 'af_heart';    // Kokoro American-female voice (kokoro-onnx, on-device)
const BASE_SPEED = 1.0;
const MAX_SPEED = 1.45;
const PAD = 0.30;

const sh = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
const probeDur = (f) =>
  parseFloat(sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1', f]).toString().trim());

const DUR = probeDur(SRC);   // combined-video duration (matches the cut)

// Narration timeline (start seconds). Part 1 (clustering) 0–26.2 s; Part 2 (sidepanel) +26.2 s.
// Spellings like "Proto DUNE" force the TTS to pronounce it as two words.
// Beat starts (from the two .srt cue tracks): Part 1 clustering spans 0–40.0 s; Part 2 sidepanel
// offset +40.0 s. Slots are sized so every line plays at ~1.0x — no rushing.
const LINES = [
  { t: 0.0,   text: "A Proto DUNE Vertical Drift event. Run number 39252, event number 298581, imaged in three dimensions." },
  { t: 12.0,  text: "The top drift volume is read out by four charge readout planes." },
  { t: 16.5,  text: "Before T zero is known, the charge is placed by its arrival time alone, so some activity reconstructs outside the CRP boxes." },
  { t: 25.5,  text: "Tracks crossing the four planes are joined into single clusters." },
  { t: 31.0,  text: "The bottom drift volume is read out by its own four planes." },
  { t: 35.5,  text: "Again, tracks are joined across the four planes." },
  // --- Part 2 (sidepanel), offset +40.0 s ---
  { t: 40.0,  text: "Now, the charge to light matching, from the full clustered image." },
  { t: 45.2,  text: "A side by side detector view opens up." },
  { t: 48.4,  text: "On the left, the charge as it was measured. On the right, corrected for its arrival time and placed at its true position. Notice the tracks crossing the central cathode." },
  { t: 64.4,  text: "Now just the detector view, showing the light pattern from each flash." },
  { t: 69.4,  text: "Red circles are the light actually measured. Green circles are the light predicted from the charge. When they agree, charge and light come from the same interaction. That is a successful match." },
  { t: 93.4,  text: "A few long tracks are left unmatched. These point to where the light reconstruction and the charge to light matching can be further improved." },
  { t: 102.9, text: "And one flash is in time with the Proto DUNE beam spill. This large beam interaction is the beam event." },
];

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

// 1) TTS per line (Kokoro), fitting each clip into its slot (auto-speed if needed).
console.log(`--- TTS (Kokoro ${VOICE}) ---  combined DUR=${DUR.toFixed(2)}s`);
const clips = [];
for (let i = 0; i < LINES.length; i++) {
  const L = LINES[i];
  const next = i + 1 < LINES.length ? LINES[i + 1].t : DUR;
  const slot = next - L.t - PAD;
  const kwav = `${TMP}/nar_${String(i).padStart(2, '0')}_k.wav`;
  const wav = `${TMP}/nar_${String(i).padStart(2, '0')}.wav`;

  let speed = BASE_SPEED;
  let dur = 0;
  for (let attempt = 0; attempt < 6; attempt++) {
    sh(PY, [KTTS, '--voice', VOICE, '--speed', speed.toFixed(3), '--out', kwav, L.text]);
    sh('ffmpeg', ['-y', '-i', kwav, '-ac', '2', '-ar', '44100', wav]);
    dur = probeDur(wav);
    if (dur <= slot || speed >= MAX_SPEED) break;
    speed = Math.min(MAX_SPEED, speed * (dur / slot) * 1.02);
  }
  const fit = dur <= slot + 0.05 ? 'ok' : 'OVERRUN';
  console.log(`  ${String(L.t).padStart(5)}s  slot=${slot.toFixed(1)}s  dur=${dur.toFixed(2)}s  speed=${speed.toFixed(2)}  ${fit}`);
  clips.push({ ...L, wav, dur });
}

// 2) Lay clips on the narration bed (adelay each, then amix).
console.log('--- narration timeline ---');
const inputs = [];
const filters = [];
clips.forEach((c, i) => {
  inputs.push('-i', c.wav);
  const ms = Math.round(c.t * 1000);
  filters.push(`[${i}:a]adelay=${ms}|${ms}[a${i}]`);
});
const mixLabels = clips.map((_, i) => `[a${i}]`).join('');
const narFilter =
  `${filters.join(';')};${mixLabels}amix=inputs=${clips.length}:normalize=0:dropout_transition=0[mix];` +
  `[mix]apad,atrim=0:${DUR},asetpts=N/SR/TB[nar]`;
const NAR = `${TMP}/narration.wav`;
sh('ffmpeg', ['-y', ...inputs, '-filter_complex', narFilter, '-map', '[nar]', '-ac', '2', '-ar', '44100', NAR]);
console.log(`  narration.wav  ${probeDur(NAR).toFixed(2)}s`);

// 3) Master: narration only, loudness-normalized.
console.log('--- master (narration only, loudnorm) ---');
const MASTER = `${TMP}/master.wav`;
sh('ffmpeg', ['-y', '-i', NAR, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ac', '2', '-ar', '44100', MASTER]);
console.log(`  master.wav  ${probeDur(MASTER).toFixed(2)}s`);

// 4) Mux onto the video (copy video stream untouched).
console.log('--- mux ---');
sh('ffmpeg', ['-y', '-i', SRC, '-i', MASTER,
  '-map', '0:v:0', '-map', '1:a:0',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', OUT]);
console.log(`  wrote ${OUT}  ${probeDur(OUT).toFixed(2)}s`);

// 5) pdvd_narration.txt sidecar.
const sidecar = LINES.map((L) => `[${L.t.toFixed(1).padStart(5)}s] ${L.text}`).join('\n') + '\n';
writeFileSync(`${DIR}/pdvd_narration.txt`, sidecar);
console.log('  wrote pdvd_narration.txt');
console.log('DONE');
