import { thinBeats } from './difficulty';
import { buildLevel, type Level } from './level';
import type { MusicInfo, Section, SectionType } from './types';

// Niveau codé en dur pour public/audio/test-150.wav (voir scripts/make-test-track.mjs).
export const TEST_TRACK_URL = 'audio/test-150.wav';

const BPM = 150;
const OFFSET_MS = 200;
const BAR = (60 / BPM) * 4;

const LAYOUT: [SectionType, number, number][] = [
  ['intro', 4, 0.25],
  ['verse', 8, 0.5],
  ['prechorus', 4, 0.7],
  ['chorus', 8, 1],
  ['break', 4, 0.15],
  ['chorus', 8, 1],
  ['outro', 4, 0.3],
];

function sections(): Section[] {
  const out: Section[] = [];
  let bar = 0;
  for (const [type, len, intensity] of LAYOUT) {
    const start = bar === 0 ? 0 : OFFSET_MS / 1000 + bar * BAR;
    bar += len;
    out.push({ type, intensity, start, end: OFFSET_MS / 1000 + bar * BAR });
  }
  return out;
}

export const TEST_MUSIC: MusicInfo = {
  bpm: BPM,
  offset: OFFSET_MS,
  duration: OFFSET_MS / 1000 + 40 * BAR + 1.2,
  sections: sections(),
};

/** Motifs par mesure, en temps relatifs au début de la mesure. */
const bar = (b: number, ...beats: number[]) => beats.map((x) => b * 4 + x);

const FLIP_BEATS: number[] = [
  // intro : deux flips d'initiation sur le temps 1
  ...bar(2, 0),
  ...bar(3, 0),
  // couplet : temps 1 et 3, motifs simples
  ...bar(4, 0),
  ...bar(5, 0),
  ...bar(6, 0, 2),
  ...bar(7, 0),
  ...bar(8, 0, 2),
  ...bar(9, 0, 2),
  ...bar(10, 0, 2),
  ...bar(11, 0, 2),
  // pré-refrain : montée, noires puis accélération
  ...bar(12, 0, 2),
  ...bar(13, 0, 2),
  ...bar(14, 0, 1, 2, 3),
  ...bar(15, 0, 1, 2, 3),
  // refrain 1 : noires, syncopes
  ...bar(16, 0, 1, 2, 3),
  ...bar(17, 0, 1.5, 2, 3),
  ...bar(18, 0, 1, 2, 3),
  ...bar(19, 0, 1.5, 3),
  ...bar(20, 0, 1, 2, 3),
  ...bar(21, 0, 1.5, 2, 3),
  ...bar(22, 0, 1, 2, 2.5, 3),
  ...bar(23, 0, 2),
  // break : on respire (aucun flip)
  // refrain 2 : plus dense, croches
  ...bar(28, 0, 1, 1.5, 2, 3),
  ...bar(29, 0, 1.5, 2, 3),
  ...bar(30, 0, 0.5, 1, 2, 3),
  ...bar(31, 0, 1.5, 2.5, 3),
  ...bar(32, 0, 1, 1.5, 2, 3),
  ...bar(33, 0, 1.5, 2, 3),
  ...bar(34, 0, 0.5, 1, 2, 2.5, 3),
  ...bar(35, 0, 2),
  // outro
  ...bar(36, 0),
  ...bar(37, 0),
  ...bar(38, 0),
];

export function createTestLevel(): Level {
  return buildLevel(TEST_MUSIC, thinBeats(FLIP_BEATS), 150);
}
