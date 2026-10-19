// Génère public/audio/test-150.wav : une piste "Eurobeat" synthétique à 150 BPM,
// structure connue (sert de vérité terrain pour l'analyse de l'étape 2).
// Usage : node scripts/make-test-track.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 22050;
const BPM = 150;
const OFFSET = 0.2; // s, premier temps fort
const BEAT = 60 / BPM;
const BAR = BEAT * 4;

// Doit rester aligné avec src/game/testLevel.ts
const SECTIONS = [
  ['intro', 4],
  ['verse', 8],
  ['prechorus', 4],
  ['chorus', 8],
  ['break', 4],
  ['chorus', 8],
  ['outro', 4],
];
const totalBars = SECTIONS.reduce((a, s) => a + s[1], 0);
const duration = OFFSET + totalBars * BAR + 1.2;
const N = Math.ceil(duration * SR);
const out = new Float32Array(N);

let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

function add(t0, len, fn) {
  const i0 = Math.max(0, Math.floor(t0 * SR));
  const i1 = Math.min(N, Math.floor((t0 + len) * SR));
  for (let i = i0; i < i1; i++) out[i] += fn((i - i0) / SR);
}

function kick(t, g = 1) {
  let ph = 0;
  add(t, 0.3, (x) => {
    const f = 45 + 110 * Math.exp(-x * 35);
    ph += (2 * Math.PI * f) / SR;
    return Math.sin(ph) * Math.exp(-x * 9) * 0.9 * g;
  });
}
function snare(t, g = 1) {
  add(t, 0.2, (x) => (rnd() * 0.6 + Math.sin(2 * Math.PI * 190 * x) * 0.4) * Math.exp(-x * 22) * 0.5 * g);
}
function hat(t, g = 1) {
  let lp = 0;
  add(t, 0.05, (x) => {
    const n = rnd();
    lp += (n - lp) * 0.5;
    return (n - lp) * Math.exp(-x * 90) * 0.35 * g;
  });
}
function saw(t, len, note, g, cutoff = 0.25) {
  const f = midi(note);
  let lp = 0;
  add(t, len, (x) => {
    const s = ((x * f) % 1) * 2 - 1;
    lp += (s - lp) * cutoff;
    const env = Math.min(1, x * 200) * Math.exp(-x * 3) * (x < len - 0.01 ? 1 : 0);
    return lp * env * g;
  });
}
function square(t, len, note, g) {
  const f = midi(note);
  add(t, len, (x) => ((x * f) % 1 < 0.5 ? 1 : -1) * Math.exp(-x * 7) * g);
}
function pad(t, len, notes, g) {
  for (const n of notes) {
    const f = midi(n);
    add(t, len, (x) => {
      const env = Math.min(1, x / 0.6) * Math.min(1, (len - x) / 0.4);
      return (((x * f) % 1) * 2 - 1) * env * g * 0.5 + Math.sin(2 * Math.PI * f * 1.003 * x) * env * g * 0.5;
    });
  }
}

// Am - F - G - Em (racines MIDI)
const PROG = [45, 41, 43, 40];
const CHORDS = [
  [57, 60, 64],
  [53, 57, 60],
  [55, 59, 62],
  [52, 55, 59],
];

let bar = 0;
for (const [type, len] of SECTIONS) {
  for (let b = 0; b < len; b++, bar++) {
    const t0 = OFFSET + bar * BAR;
    const ci = bar % 4;
    const last = b === len - 1;
    const kicks = type !== 'break';
    const full = type === 'verse' || type === 'prechorus' || type === 'chorus';
    for (let k = 0; k < 4; k++) {
      const tb = t0 + k * BEAT;
      if (kicks) kick(tb, type === 'intro' || type === 'outro' ? 0.8 : 1);
      if (kicks) hat(tb + BEAT / 2, type === 'chorus' ? 1 : 0.7);
      if (full && (k === 1 || k === 3)) snare(tb, type === 'chorus' ? 1 : 0.8);
    }
    if (type === 'prechorus' && last) for (let s = 0; s < 8; s++) snare(t0 + (s * BEAT) / 2, 0.4 + s * 0.08);
    if (full || type === 'outro') {
      // basse octave Eurobeat en croches
      for (let e = 0; e < 8; e++) saw(t0 + (e * BEAT) / 2, BEAT / 2, PROG[ci] + (e % 2 ? 12 : 0), 0.22);
    }
    if (type === 'chorus') {
      const ch = CHORDS[ci];
      for (let s = 0; s < 16; s++) {
        const n = ch[s % 3] + 12 + (s % 6 >= 3 ? 12 : 0);
        square(t0 + (s * BEAT) / 4, BEAT / 4, n, 0.06);
      }
    }
    if (type === 'break' || type === 'intro') pad(t0, BAR, CHORDS[ci], type === 'break' ? 0.07 : 0.035);
  }
}

// normalisation + soft clip
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(out[i]));
const pcm = Buffer.alloc(44 + N * 2);
pcm.write('RIFF', 0);
pcm.writeUInt32LE(36 + N * 2, 4);
pcm.write('WAVEfmt ', 8);
pcm.writeUInt32LE(16, 16);
pcm.writeUInt16LE(1, 20);
pcm.writeUInt16LE(1, 22);
pcm.writeUInt32LE(SR, 24);
pcm.writeUInt32LE(SR * 2, 28);
pcm.writeUInt16LE(2, 32);
pcm.writeUInt16LE(16, 34);
pcm.write('data', 36);
pcm.writeUInt32LE(N * 2, 40);
for (let i = 0; i < N; i++) {
  const v = Math.tanh((out[i] / peak) * 1.4) * 0.95;
  pcm.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
}
const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'audio', 'test-150.wav');
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, pcm);
console.log(`écrit ${file} (${duration.toFixed(1)} s, ${(pcm.length / 1e6).toFixed(1)} Mo)`);
