// Vérifie l'analyse sur des pistes synthétiques à BPM / offset connus.
// npm run check-analysis              (pistes générées)
// npm run check-analysis -- a.mp3 b.ogg   (analyse de fichiers quelconques, via ffmpeg)
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyze } from '../src/analysis/dsp';

function decode(file: string): { data: Float32Array; sr: number } {
  const sr = 22050;
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(sr), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  return { data: new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4), sr };
}

function run(file: string) {
  const { data, sr } = decode(file);
  const t0 = performance.now();
  const a = analyze(data, sr);
  const ms = performance.now() - t0;
  return { a, ms };
}

const files = process.argv.slice(2);
if (files.length) {
  for (const f of files) {
    const { a, ms } = run(f);
    console.log(`${f}\n  ${a.bpm} BPM, offset ${a.offset} ms, confiance ${a.confidence}, ${a.duration.toFixed(1)} s, analysé en ${ms.toFixed(0)} ms`);
    for (const s of a.sections) console.log(`  ${s.start.toFixed(1).padStart(6)}–${s.end.toFixed(1).padEnd(6)} ${s.type.padEnd(10)} ${s.intensity}`);
  }
  process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), 'gd-'));
const cases: [number, number, string][] = [
  [150, 0.2, 'wav'],
  [143, 0.73, 'wav'],
  [158.5, 1.1, 'wav'],
  [126, 0.05, 'wav'],
  [172, 0.4, 'wav'],
  [150, 0.2, 'mp3'],
  [155, 2.35, 'mp3'],
  // morceau qui démarre sur la musique, temps fort juste avant 0 : attendu une mesure plus loin
  [150, -0.06, 'wav'],
  [160, -0.02, 'mp3'],
];
let ok = true;
for (const [bpm, offset, ext] of cases) {
  const wav = join(dir, `t-${bpm}-${offset}.wav`);
  execFileSync('node', ['scripts/make-test-track.mjs', '--bpm', String(bpm), '--offset', String(offset), '--out', wav]);
  let file = wav;
  if (ext === 'mp3') {
    file = wav.replace('.wav', '.mp3');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-b:a', '160k', file]);
  }
  const { a, ms } = run(file);
  const dBpm = a.bpm - bpm;
  const expected = offset < 0 ? offset + 240 / bpm : offset;
  const dOff = a.offset - expected * 1000;
  const good = Math.abs(dBpm) < 0.05 && Math.abs(dOff) < 15;
  ok &&= good;
  const secs = a.sections.map((s) => `${s.type}@${s.start.toFixed(1)}`).join(' ');
  console.log(`${good ? 'OK ' : 'KO '} ${String(bpm).padEnd(5)} ${ext}  → ${a.bpm} BPM (${dBpm >= 0 ? '+' : ''}${dBpm.toFixed(2)}), offset ${a.offset} ms (${dOff >= 0 ? '+' : ''}${dOff.toFixed(0)}), conf ${a.confidence}, ${ms.toFixed(0)} ms\n     ${secs}`);
}
process.exit(ok ? 0 : 1);
