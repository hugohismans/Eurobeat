import { CONFIG } from '../config';
import { FlipProfile, HB_HALF } from './physics';
import { Timeline } from './timeline';
import type { Checkpoint, Flip, MusicInfo, Obstacle, Side } from './types';

export interface Level {
  music: MusicInfo;
  timeline: Timeline;
  flips: Flip[];
  obstacles: Obstacle[];
  checkpoints: Checkpoint[];
  /** fin jouable (s) */
  end: number;
}

export function beatTime(music: MusicInfo, beat: number): number {
  return music.offset / 1000 + (beat * 60) / music.bpm;
}

export function sideAt(flips: Flip[], t: number): Side {
  let side: Side = 'floor';
  for (const f of flips) {
    if (f.time > t) break;
    side = f.to;
  }
  return side;
}

/** Petit PRNG déterministe (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Construit le niveau à partir d'une liste de beats de flip (alternance sol / plafond).
 * Entre deux flips, le joueur est sur une surface : on pose des obstacles sur la
 * surface opposée, bornés pour qu'un flip à ±tolérance du beat passe toujours,
 * et qu'un flip plus tôt / plus tard que la tolérance soit puni.
 */
export function buildLevel(music: MusicInfo, flipBeats: number[], seed = 1): Level {
  const timeline = new Timeline(music);
  const profile = new FlipProfile();
  const tol = CONFIG.timing.toleranceMs / 1000;
  const { spikeHeight, blockHeight, spikeInsetX, spikeInsetTop, safety, minLength } = CONFIG.obstacles;
  const rand = rng(seed);

  const beats = [...new Set(flipBeats)].sort((a, b) => a - b);
  const flips: Flip[] = [];
  let side: Side = 'floor';
  for (const beat of beats) {
    side = side === 'floor' ? 'ceil' : 'floor';
    flips.push({ beat, time: beatTime(music, beat), to: side });
  }

  const end = Math.min(music.duration, (flips.at(-1)?.time ?? 0) + 4 * (60 / music.bpm));
  const obstacles: Obstacle[] = [];
  for (let i = 0; i < flips.length; i++) {
    const f = flips[i];
    const tNext = flips[i + 1]?.time ?? end;
    const opposite: Side = f.to === 'floor' ? 'ceil' : 'floor';
    const span = tNext - f.time;
    // flip en l'air : un flip suivant en avance peut partir avant l'atterrissage,
    // le profil "depuis le repos" ne vaut plus. On ne force pas ces flips rapprochés.
    if (CONFIG.physics.airFlip && flips[i + 1] && span < profile.traversal + 2 * tol) continue;
    const kind: Obstacle['kind'] = span > 1.2 && rand() < 0.5 ? 'block' : 'spike';
    const height = kind === 'spike' ? spikeHeight : blockHeight;
    const hh = kind === 'spike' ? height - spikeInsetTop : height;
    const insetX = kind === 'spike' ? spikeInsetX : 0;

    // dernier instant où un joueur en retard est encore dans l'obstacle
    const tStart = f.time + tol + profile.clearTime(hh);
    // premier instant où un joueur en avance sur le flip suivant l'atteint
    const tEnd = flips[i + 1] ? tNext - tol + profile.reachTime(hh) : end;
    const hx0 = timeline.x(tStart) + HB_HALF + safety;
    const hx1 = timeline.x(tEnd) - HB_HALF - safety;
    if (hx1 - hx0 < minLength) continue;
    obstacles.push({ x0: hx0 - insetX, x1: hx1 + insetX, hx0, hx1, hh, height, side: opposite, kind });
  }
  obstacles.sort((a, b) => a.hx0 - b.hx0);

  const checkpoints: Checkpoint[] = music.sections.map((s, i) => ({ time: s.start, side: sideAt(flips, s.start), section: i }));

  return { music, timeline, flips, obstacles, checkpoints, end };
}
