import { CONFIG } from '../config';
import { playBot } from './bot';
import { beatTime, buildLevel, rng, type Level } from './level';
import { FlipProfile } from './physics';
import type { MusicInfo, SectionType } from './types';

// Générateur PROVISOIRE (étape 2) : motifs par type de section, puis réparation par le bot.
// L'étape 3 le remplacera (difficulté, variété, statistiques).

/** Motifs par mesure, en temps (0 = temps 1). */
const PATTERNS: Record<SectionType, number[][]> = {
  intro: [[0], []],
  verse: [[0, 2], [0], [0, 2], [0, 3]],
  prechorus: [[0, 1, 2, 3], [0, 2], [0, 1, 2, 3]],
  chorus: [[0, 1, 2, 3], [0, 1.5, 2, 3], [0, 1, 2, 2.5, 3], [0, 1.5, 3], [0, 1, 1.5, 2, 3]],
  break: [[]],
  outro: [[0], [0, 2]],
};

export function seedFrom(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

export function generateLevel(music: MusicInfo, seedText: string): Level {
  const seed = seedFrom(`${seedText}|${music.bpm}|${music.offset}|${CONFIG.physics.airFlip}`);
  const rand = rng(seed);
  const beatSec = 60 / music.bpm;
  const halfOk = beatSec / 2 >= new FlipProfile().traversal + 0.03;
  const beats: number[] = [];
  const firstBar = 2; // laisser le temps de se mettre dans le rythme
  const nBars = Math.floor((music.duration - music.offset / 1000) / (4 * beatSec));
  let phraseA: number[] = [];
  let phraseB: number[] = [];
  let lastType: SectionType | null = null;
  for (let b = firstBar; b < nBars - 1; b++) {
    const t = beatTime(music, b * 4);
    const sec = music.sections.find((s) => t >= s.start - 1e-6 && t < s.end);
    if (!sec) continue;
    const pats = PATTERNS[sec.type];
    // motifs tirés par phrase de 4 mesures : A B A B, pour une répétition musicale
    if (b % 4 === 0 || sec.type !== lastType) {
      phraseA = pats[Math.floor(rand() * pats.length)];
      phraseB = pats[Math.floor(rand() * pats.length)];
    }
    lastType = sec.type;
    const pat = b % 2 === 0 ? phraseA : phraseB;
    // pas de flip dans la dernière mesure avant un break (on respire)
    const next = music.sections.find((s) => s.start > t && s.start <= t + 4 * beatSec + 1e-6);
    for (const x of pat) {
      if (!halfOk && x % 1 !== 0) continue;
      if (next?.type === 'break' && x > 0) continue;
      beats.push(b * 4 + x);
    }
  }

  // réparation : retirer les flips qui rendent un passage impossible à ±tolérance
  const tol = (CONFIG.timing.toleranceMs - 2) / 1000;
  let level = buildLevel(music, beats, seed);
  for (let guard = 0; guard < 200; guard++) {
    const fail = [() => 0, () => -tol, () => tol, (i: number) => (i % 2 ? -tol : tol), (i: number) => (i % 2 ? tol : -tol)]
      .map((fn) => playBot(level, fn))
      .find((r) => !r.ok);
    if (!fail) break;
    const beat = level.flips[fail.nearFlip!].beat;
    beats.splice(beats.indexOf(beat), 1);
    level = buildLevel(music, beats, seed);
  }
  return level;
}
