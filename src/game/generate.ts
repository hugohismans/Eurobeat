import { CONFIG } from '../config';
import { playBot } from './bot';
import { currentDifficulty, DIFFICULTIES, thinBeats } from './difficulty';
import { beatTime, buildLevel, platformLanes, rng, type Level, type LevelPlan } from './level';
import { fallTime, FlipProfile } from './physics';
import type { MusicInfo, Section, SectionType } from './types';

// Générateur de niveau : structure (loopings, plateformes) d'après les sections, puis motifs
// rythmiques par phrase, puis réparation par le bot. Déterministe : même entrée = même niveau.

/** Motifs par mesure, en temps (0 = temps 1). Couloir : traversée longue, peu de croches. */
const CORRIDOR: Record<SectionType, number[][]> = {
  intro: [[0], [], [0], [0, 2]],
  verse: [[0, 2], [0], [0, 2], [0, 3], [0, 1, 2], [0, 2, 3]],
  prechorus: [[0, 1, 2, 3], [0, 2], [0, 1, 2, 3], [0, 2, 3], [0, 1.5, 2, 3]],
  chorus: [[0, 1, 2, 3], [0, 1.5, 2, 3], [0, 1, 2, 2.5, 3], [0, 1.5, 3], [0, 1, 1.5, 2, 3], [0, 2, 2.5, 3]],
  break: [[]],
  outro: [[0], [0, 2], [0]],
};

/** Section → motifs un cran plus légers : les longues sections alternent pleine, moyenne, pleine, légère. */
const LIGHTER: Record<SectionType, SectionType> = { intro: 'intro', verse: 'intro', prechorus: 'verse', chorus: 'prechorus', break: 'break', outro: 'outro' };

/** Voie de plateforme : traversée deux fois plus courte, les croches deviennent jouables. */
const LANE: number[][] = [
  [0, 0.5, 1, 2, 3],
  [0, 1, 1.5, 2, 3],
  [0, 1, 2, 2.5, 3],
  [0, 1.5, 2, 3, 3.5],
  [0, 1, 2, 3],
  [0, 0.5, 2, 2.5, 3],
];

export interface LevelStats {
  flips: number;
  platforms: number;
  loops: number;
  /** flips par minute sur les passages joués */
  density: number;
  /** 1 à 5 */
  stars: number;
}

export function seedFrom(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

export function generateLevel(music: MusicInfo, seedText: string): Level {
  const seed = seedFrom(`${seedText}|${music.bpm}|${music.offset}|${CONFIG.physics.airFlip}|${currentDifficulty()}`);
  const rand = rng(seed);
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  const beatSec = 60 / music.bpm;
  const tol = CONFIG.timing.toleranceMs / 1000;
  const full = new FlipProfile();
  const lanes = platformLanes();
  const lane = new FlipProfile(lanes.lower[1] - lanes.lower[0]);
  // croches possibles seulement si la traversée tient dans un demi-temps
  const halfOkCorridor = beatSec / 2 >= full.traversal + 0.03;
  const halfOkLane = beatSec / 2 >= lane.traversal + 0.03;
  const nBars = Math.floor((music.duration - music.offset / 1000) / (4 * beatSec));
  const firstBar = 2; // laisser le temps de se mettre dans le rythme
  const sectionAt = (bar: number): Section | undefined => {
    const t = beatTime(music, bar * 4);
    return music.sections.find((s) => t >= s.start - 1e-6 && t < s.end);
  };

  // 1) loopings : la mesure qui précède une montée nette d'intensité vers un refrain
  const loops: LevelPlan['loops'] = [];
  for (let b = firstBar + 2; b < nBars - 2; b++) {
    const cur = sectionAt(b);
    const prev = sectionAt(b - 1);
    if (!cur || !prev || cur === prev || cur.type !== 'chorus') continue;
    if (cur.intensity - prev.intensity >= 0.2 || prev.type === 'break' || prev.type === 'prechorus') loops.push({ from: (b - 1) * 4, to: b * 4 });
  }
  const inLoop = (beat: number) => loops.some((l) => beat >= l.from && beat < l.to);

  // 2) plateformes : dans les refrains, une phrase de 4 mesures sur deux environ
  const platforms: { from: number; to: number }[] = [];
  for (const sec of music.sections) {
    if (sec.type !== 'chorus') continue;
    const b0 = Math.ceil((sec.start - music.offset / 1000) / (4 * beatSec) - 1e-6);
    const b1 = Math.floor((sec.end - music.offset / 1000) / (4 * beatSec) + 1e-6);
    let toggle = rand() < 0.5;
    for (let b = Math.max(b0, firstBar + 1); b + 4 <= Math.min(b1, nBars - 1); b += 4) {
      toggle = !toggle;
      if (!toggle) continue;
      // entrée au temps 4 de la mesure précédente, sortie juste après le temps 1 de la phrase suivante
      const p = { from: b * 4 - 1, to: (b + 4) * 4 + 0.5 };
      if (inLoop(p.from) || inLoop(p.to) || loops.some((l) => l.from >= p.from && l.from < p.to)) continue;
      platforms.push(p);
    }
  }
  const platformAt = (beat: number) => platforms.find((p) => beat >= p.from && beat < p.to);

  // 3) motifs rythmiques par phrase (A B A B, ou A A B A), couloir ou voie
  let beats: number[] = [];
  let phrase: number[][] = [];
  let lastKey = '';
  for (let b = firstBar; b < nBars - 1; b++) {
    const sec = sectionAt(b);
    if (!sec) continue;
    const inPlat = !!platformAt(b * 4 + 0.5);
    // longue section : une phrase sur quatre plus légère, pour respirer
    const secBars = (sec.end - sec.start) / (4 * beatSec);
    const phraseIdx = Math.floor((beatTime(music, b * 4) - sec.start) / (16 * beatSec) + 1e-6);
    const steps = !inPlat && secBars > 16 ? [0, 1, 0, 2][phraseIdx % 4] : 0;
    let type = sec.type;
    for (let k = 0; k < steps; k++) type = LIGHTER[type];
    const key = `${type}|${inPlat}`;
    if (b % 4 === 0 || key !== lastKey) {
      const lib = inPlat ? LANE : CORRIDOR[type];
      const A = pick(lib);
      const B = pick(lib);
      phrase = rand() < 0.5 ? [A, B, A, B] : [A, A, B, A];
    }
    lastKey = key;
    const pat = phrase[b % 4];
    // pas de flip dans la dernière mesure avant un break (on respire)
    const nextSec = sectionAt(b + 1);
    for (const x of pat) {
      const beat = b * 4 + x;
      if (x % 1 !== 0 && !(inPlat ? halfOkLane : halfOkCorridor)) continue;
      if (nextSec?.type === 'break' && nextSec !== sec && x > 0) continue;
      beats.push(beat);
    }
  }
  beats = thinBeats(beats);

  // 4) garde-fous : rien pendant un looping ; joueur posé à l'entrée d'une poutre, et
  //    retombé sur le vrai sol / plafond avant le flip qui suit la sortie
  const toBeats = (sec: number) => sec / beatSec;
  const preEntry = toBeats(tol + full.traversal + 0.06);
  const preExit = toBeats(tol + lane.traversal + 0.03);
  const postExit = toBeats(fallTime(CONFIG.world.corridorHeight - lanes.upper[0]) + tol + 0.08);
  beats = beats.filter((beat) => {
    if (inLoop(beat)) return false;
    for (const p of platforms) {
      if (beat > p.from - preEntry && beat < p.from + 0.25) return false;
      if (beat > p.to - preExit && beat < p.to + postExit) return false;
    }
    return true;
  });

  // 5) réparation : retirer les flips qui rendent un passage impossible à ±tolérance
  const plan: LevelPlan = { flipBeats: beats, platforms, loops };
  const t2 = (CONFIG.timing.toleranceMs - 2) / 1000;
  let level = buildLevel(music, plan, seed);
  for (let guard = 0; guard < 300; guard++) {
    const fail = [() => 0, () => -t2, () => t2, (i: number) => (i % 2 ? -t2 : t2), (i: number) => (i % 2 ? t2 : -t2)]
      .map((fn) => playBot(level, fn))
      .find((r) => !r.ok);
    if (!fail) break;
    const beat = level.flips[fail.nearFlip!].beat;
    plan.flipBeats = plan.flipBeats.filter((x) => x !== beat);
    level = buildLevel(music, plan, seed);
  }
  return level;
}

/** Statistiques affichées : densité et difficulté estimée (1 à 5 étoiles). */
export function levelStats(level: Level): LevelStats {
  const flips = level.flips;
  const played = Math.max(1, (flips.at(-1)?.time ?? 0) - (flips[0]?.time ?? 0));
  const density = (flips.length / played) * 60;
  // densité de pointe sur 8 s glissantes
  let peak = 0;
  for (let i = 0, j = 0; i < flips.length; i++) {
    while (flips[i].time - flips[j].time > 8) j++;
    peak = Math.max(peak, i - j + 1);
  }
  const gaps = flips.slice(1).map((f, i) => f.time - flips[i].time);
  const fast = gaps.filter((g) => g < 0.3).length / Math.max(1, gaps.length);
  const tolFactor = 80 / DIFFICULTIES[currentDifficulty()].toleranceMs;
  const score = (density / 60 + (peak / 8) * 0.6 + fast * 2) * tolFactor;
  const stars = Math.max(1, Math.min(5, Math.round(score * 0.9)));
  return { flips: flips.length, platforms: level.platforms.length, loops: level.loops.length, density: Math.round(density), stars };
}
