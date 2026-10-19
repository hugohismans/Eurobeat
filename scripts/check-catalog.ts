// Contrôle du catalogue : npm run check-catalog (nécessite ffmpeg)
// 1. la grille finale (BPM + premier temps fort, corrections comprises) tombe sur les grosses caisses
// 2. le niveau généré est finissable à ±tolérance dans les trois modes
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractFeatures, FFT_SIZE, HOP, onsetEnvelope } from '../src/analysis/dsp';
import type { CatalogEntry } from '../src/catalog';
import { validateLevel } from '../src/game/bot';
import { applyDifficulty, DIFFICULTY_ORDER } from '../src/game/difficulty';
import { generateLevel, levelStats } from '../src/game/generate';

const root = join(import.meta.dirname, '..');
const { tracks } = JSON.parse(readFileSync(join(root, 'public/catalog/catalog.json'), 'utf8')) as { tracks: CatalogEntry[] };
const only = process.argv.slice(2);
const sr = 22050;
let ok = true;

for (const e of tracks) {
  if (only.length && !only.includes(e.id)) continue;
  const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', join(root, 'public', e.file), '-ac', '1', '-ar', String(sr), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  const feat = extractFeatures(new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4), sr);
  const lo = onsetEnvelope(feat.lowFlux, feat.fr);
  const at = (t: number) => {
    const f = (t * sr - FFT_SIZE / 2) / HOP;
    const i = Math.floor(f);
    return (lo[i] ?? 0) * (1 - (f - i)) + (lo[i + 1] ?? 0) * (f - i);
  };
  // profil moyen des graves sur un temps (24 positions) : le pic (grosse caisse) doit tomber sur la grille.
  // Basse en octaves : un pic au demi-temps presque aussi fort que celui du temps est accepté.
  const { bpm, offset, duration } = e.music;
  const beat = 60 / bpm;
  const N = 24;
  const prof = new Array(N).fill(0);
  for (let t = offset / 1000; t < duration - 1; t += beat) for (let j = 0; j < N; j++) prof[j] += at(t + (j * beat) / N);
  const max = Math.max(...prof);
  const peak = prof.indexOf(max);
  const onBeat = Math.max(prof[N - 1], prof[0], prof[1]);
  const gridOk = peak <= 1 || peak >= N - 1 || onBeat >= 0.9 * max;
  const shiftMs = Math.round(((peak > N / 2 ? peak - N : peak) * beat * 1000) / N);
  const levels = DIFFICULTY_ORDER.map((d) => {
    applyDifficulty(d);
    const lvl = generateLevel(e.music, `cat:${e.id}`);
    return { d, v: validateLevel(lvl, 30), s: levelStats(lvl) };
  });
  const levelsOk = levels.every((l) => l.v.ok);
  ok &&= gridOk && levelsOk;
  const name = `${e.title}${e.variant ? ` (${e.variant})` : ''}`;
  console.log(
    `${gridOk && levelsOk ? 'OK' : 'KO'}  ${name.padEnd(34)} ${String(bpm).padStart(6)} BPM  pic des graves ${shiftMs >= 0 ? '+' : ''}${shiftMs} ms (temps : ${Math.round((onBeat / max) * 100)} %)  ` +
      levels.map((l) => `${l.d} ${l.s.flips}${'★'.repeat(l.s.stars)}${l.v.ok ? '' : ' ÉCHEC'}`).join(' · '),
  );
}
process.exit(ok ? 0 : 1);
