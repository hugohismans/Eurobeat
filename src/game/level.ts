import { CONFIG } from '../config';
import { FlipProfile, HB_HALF } from './physics';
import { Timeline } from './timeline';
import type { Checkpoint, Flip, Loop, MusicInfo, Obstacle, Platform, Side, Stretch } from './types';

export interface Level {
  music: MusicInfo;
  timeline: Timeline;
  flips: Flip[];
  obstacles: Obstacle[];
  platforms: Platform[];
  loops: Loop[];
  stretches: Stretch[];
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

export interface LevelPlan {
  /** beats de flip (alternance sol / plafond) */
  flipBeats: number[];
  /** plateformes intermédiaires, en beats */
  platforms?: { from: number; to: number }[];
  /** loopings, en beats */
  loops?: { from: number; to: number }[];
}

/** Voie de la plateforme : sous la poutre si on arrive par le sol, dessus si on arrive par le plafond. */
export function platformLanes(): { lower: [number, number]; upper: [number, number] } {
  const { y0, thickness } = CONFIG.platform;
  return { lower: [0, y0], upper: [y0 + thickness, CONFIG.world.corridorHeight] };
}

/**
 * Construit le niveau. Le temps est découpé en tronçons aux flips et aux entrées / sorties de
 * plateforme ; dans chaque tronçon le joueur reste d'un côté d'une voie, et l'on pose des
 * obstacles sur la surface opposée de cette voie, bornés pour qu'un flip à ±tolérance du beat
 * passe toujours, et qu'un flip plus tôt / plus tard que la tolérance soit puni.
 */
export function buildLevel(music: MusicInfo, plan: LevelPlan | number[], seed = 1): Level {
  const p: LevelPlan = Array.isArray(plan) ? { flipBeats: plan } : plan;
  const timeline = new Timeline(music);
  const H = CONFIG.world.corridorHeight;
  const tol = CONFIG.timing.toleranceMs / 1000;
  const { spikeHeight, blockHeight, spikeInsetX, spikeInsetTop, safety, minLength } = CONFIG.obstacles;
  const rand = rng(seed);
  const profiles = new Map<number, FlipProfile>();
  const profile = (L: number) => {
    const k = Math.round(L * 100);
    if (!profiles.has(k)) profiles.set(k, new FlipProfile(L));
    return profiles.get(k)!;
  };

  const beats = [...new Set(p.flipBeats)].sort((a, b) => a - b);
  const flips: Flip[] = [];
  let side: Side = 'floor';
  for (const beat of beats) {
    side = side === 'floor' ? 'ceil' : 'floor';
    flips.push({ beat, time: beatTime(music, beat), to: side, lo: 0, hi: H });
  }
  const end = Math.min(music.duration, (flips.at(-1)?.time ?? 0) + 4 * (60 / music.bpm));

  // plateformes : x monde, temps d'entrée (avant de la hitbox sur la tranche) et de sortie
  const { y0, thickness } = CONFIG.platform;
  const platforms: Platform[] = (p.platforms ?? []).map((pl) => ({
    x0: timeline.x(beatTime(music, pl.from)),
    x1: timeline.x(beatTime(music, pl.to)),
    y0,
    y1: y0 + thickness,
  }));
  platforms.sort((a, b) => a.x0 - b.x0);
  const loops: Loop[] = (p.loops ?? []).map((l) => ({ t0: beatTime(music, l.from), t1: beatTime(music, l.to) }));

  // évènements : flips, entrées, sorties
  type Ev = { t: number; kind: 'flip' | 'entry' | 'exit' | 'start' | 'end'; pl?: Platform };
  const evs: Ev[] = [{ t: 0, kind: 'start' }, ...flips.map((f) => ({ t: f.time, kind: 'flip' as const }))];
  for (const pl of platforms) {
    evs.push({ t: timeline.time(pl.x0 - HB_HALF), kind: 'entry', pl });
    evs.push({ t: timeline.time(pl.x1 + HB_HALF), kind: 'exit', pl });
  }
  evs.push({ t: end, kind: 'end' });
  evs.sort((a, b) => a.t - b.t);

  const stretches: Stretch[] = [];
  const obstacles: Obstacle[] = [];
  let current: Platform | null = null;
  let lane: [number, number] = [0, H];
  for (let i = 0; i + 1 < evs.length; i++) {
    const a = evs[i];
    const b = evs[i + 1];
    if (a.kind === 'entry' && a.pl) {
      current = a.pl;
      lane = sideAt(flips, a.t) === 'floor' ? [0, current.y0] : [current.y1, H];
    } else if (a.kind === 'exit') {
      current = null;
      lane = [0, H];
    }
    const s = sideAt(flips, a.t + 1e-6);
    stretches.push({ t0: a.t, t1: b.t, side: s, lo: lane[0], hi: lane[1] });
    if (b.kind === 'flip') {
      const f = flips.find((x) => Math.abs(x.time - b.t) < 1e-9)!;
      f.lo = lane[0];
      f.hi = lane[1];
    }
    if (a.kind === 'start' || b.t - a.t <= 0) continue;

    const L = lane[1] - lane[0];
    const prof = profile(L);
    const inLane = L < H - 1e-6;
    const kind: Obstacle['kind'] = !inLane && b.t - a.t > 1.2 && rand() < 0.5 ? 'block' : 'spike';
    // dans une voie, pics bas : ils se franchissent vite et s'atteignent tard, ce qui laisse forcer les croches
    const height = kind === 'spike' ? Math.min(spikeHeight, inLane ? L * 0.22 : spikeHeight) : blockHeight;
    const hh = kind === 'spike' ? height - spikeInsetTop : height;
    const insetX = kind === 'spike' ? spikeInsetX : 0;

    // début : dernier instant où un joueur en retard sur le flip est encore dans l'obstacle
    let hx0: number;
    if (a.kind === 'flip') hx0 = timeline.x(a.t + tol + prof.clearTime(hh)) + HB_HALF + safety;
    else hx0 = (a.kind === 'entry' ? a.pl!.x0 : a.kind === 'exit' ? a.pl!.x1 : timeline.x(a.t)) + safety;
    // fin : premier instant où un joueur en avance sur le flip suivant l'atteint
    let hx1: number;
    if (b.kind === 'flip') hx1 = timeline.x(b.t - tol + prof.reachTime(hh)) - HB_HALF - safety;
    else hx1 = (b.kind === 'entry' ? b.pl!.x0 : b.kind === 'exit' ? b.pl!.x1 : timeline.x(b.t)) - safety;

    const obstacleSide: Side = s === 'floor' ? 'ceil' : 'floor';
    const surface = obstacleSide === 'floor' ? lane[0] : lane[1];
    // découpe autour des loopings (moment de spectacle, sans obstacle)
    let parts: [number, number][] = [[hx0, hx1]];
    for (const l of loops) {
      const lx0 = timeline.x(l.t0) - HB_HALF;
      const lx1 = timeline.x(l.t1) + HB_HALF;
      parts = parts.flatMap(([u, v]) => (v < lx0 || u > lx1 ? [[u, v] as [number, number]] : [[u, lx0 - safety], [lx1 + safety, v]] as [number, number][]));
    }
    for (const [u, v] of parts) {
      if (v - u < minLength) continue;
      obstacles.push({ x0: u - insetX, x1: v + insetX, hx0: u, hx1: v, hh, height, side: obstacleSide, surface, kind });
    }
  }
  obstacles.sort((a, b) => a.hx0 - b.hx0);

  const checkpoints: Checkpoint[] = music.sections.map((sec, i) => {
    const st = stretches.find((x) => sec.start >= x.t0 && sec.start < x.t1) ?? stretches[0];
    return { time: sec.start, side: sideAt(flips, sec.start), section: i, lo: st?.lo ?? 0, hi: st?.hi ?? H };
  });

  return { music, timeline, flips, obstacles, platforms, loops, stretches, checkpoints, end };
}
