// Construit le catalogue de morceaux libres : npm run catalog
// 1. télécharge chaque morceau de catalog/tracks.json (s'il manque) et le ré-encode en MP3 128 kbps
// 2. l'analyse (même code que le jeu) et applique les corrections manuelles ("override")
// 3. écrit public/catalog/catalog.json, lu par l'écran Catalogue
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyze, ANALYSIS_VERSION } from '../src/analysis/dsp';
import type { CatalogEntry, CatalogSource } from '../src/catalog';

const root = join(import.meta.dirname, '..');
const sources: CatalogSource[] = JSON.parse(readFileSync(join(root, 'catalog/tracks.json'), 'utf8'));
const force = process.argv.includes('--reencode');
const out: CatalogEntry[] = [];

for (const src of sources) {
  const file = `catalog/${src.id}.mp3`;
  const dest = join(root, 'public', file);
  if (!existsSync(dest) || force) {
    // fichier téléchargé = donnée non fiable : dossier dédié, uniquement lu par ffmpeg
    const dir = mkdtempSync(join(tmpdir(), 'gd-dl-'));
    const raw = join(dir, 'source');
    console.log(`téléchargement ${src.id}…`);
    execFileSync('curl', ['-sSfL', '--max-filesize', '80000000', '-o', raw, src.url]);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-map_metadata', '-1', '-vn', '-ac', '2', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k', dest]);
    rmSync(dir, { recursive: true, force: true });
  }
  const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', dest, '-ac', '1', '-ar', '22050', '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  const analysis = analyze(new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4), 22050);
  const o = src.override ?? {};
  const music = {
    bpm: o.bpm ?? analysis.bpm,
    offset: o.offset ?? analysis.offset,
    duration: analysis.duration,
    sections: o.sections ?? analysis.sections,
  };
  const { url: _url, override: _o, ...meta } = src;
  out.push({ ...meta, file, analysis, music });
  console.log(`${src.id}: ${music.bpm} BPM (analyse ${analysis.bpm}), offset ${music.offset} ms, ${analysis.duration.toFixed(0)} s, ${music.sections.map((s) => s.type).join(' ')}`);
}
writeFileSync(join(root, 'public/catalog/catalog.json'), JSON.stringify({ version: ANALYSIS_VERSION, tracks: out }));

// tableau des licences dans ASSETS.md
const assets = join(root, 'ASSETS.md');
const table = [
  '| Fichier | Titre | Auteur | Licence | Source |',
  '| --- | --- | --- | --- | --- |',
  ...out.map((e) => `| \`public/${e.file}\` | ${e.title}${e.variant ? ` (${e.variant})` : ''} | ${e.artist} | [${e.license}](${e.licenseUrl}) | [page](${e.source}) |`),
].join('\n');
const md = readFileSync(assets, 'utf8').replace(/<!-- catalogue:début -->[\s\S]*<!-- catalogue:fin -->/, `<!-- catalogue:début -->\n${table}\n<!-- catalogue:fin -->`);
writeFileSync(assets, md);
console.log(`public/catalog/catalog.json : ${out.length} morceaux`);
