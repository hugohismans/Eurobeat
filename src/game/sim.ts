import { CONFIG } from '../config';
import type { Level } from './level';
import { collides, createPlayer, HB_HALF, integrate, laneAt, requestFlip, sideOf, type PlayerState } from './physics';
import type { Side } from './types';

export interface RunStats {
  flips: number;
  perfect: number;
  great: number;
  offbeat: number;
  sumAbsMs: number;
  matched: number;
  combo: number;
  maxCombo: number;
}

export interface FlipEvent {
  /** temps du tap */
  time: number;
  side: Side;
  /** écart au flip attendu (ms), null si hors rythme */
  deltaMs: number | null;
}

/**
 * Une tentative : physique à pas fixe pilotée par le temps du morceau.
 * Aucune dépendance au rendu ni à l'audio : le bot l'utilise tel quel.
 */
export class Run {
  readonly dt = 1 / CONFIG.sim.hz;
  readonly player: PlayerState;
  /** y au pas précédent, pour l'interpolation du rendu */
  prevY: number;
  time: number;
  dead = false;
  finished = false;
  deathTime = 0;
  readonly stats: RunStats = { flips: 0, perfect: 0, great: 0, offbeat: 0, sumAbsMs: 0, matched: 0, combo: 0, maxCombo: 0 };
  onFlip?: (e: FlipEvent) => void;

  private inputs: number[] = [];
  private cursor = 0;
  private pcursor = 0;
  private readonly used = new Set<number>();

  constructor(
    readonly level: Level,
    readonly spawnTime: number,
    spawnSide: Side,
    lo?: number,
    hi?: number,
  ) {
    this.player = createPlayer(spawnSide, lo, hi);
    this.prevY = this.player.y;
    this.time = spawnTime;
  }

  /** Tap au temps morceau t (déjà corrigé de la latence). */
  input(t: number): void {
    if (this.dead || this.finished) return;
    if (t < this.time - 0.05) return; // tap pendant le décompte
    // insertion triée (les taps arrivent presque toujours dans l'ordre)
    const v = Math.max(t, this.time);
    let i = this.inputs.length;
    while (i > 0 && this.inputs[i - 1] > v) i--;
    this.inputs.splice(i, 0, v);
  }

  /** Avance la simulation jusqu'au temps cible. Retourne le nombre de pas effectués. */
  advanceTo(target: number, maxSteps = Infinity): number {
    let n = 0;
    while (!this.dead && !this.finished && this.time + this.dt <= target) {
      if (n++ >= maxSteps) {
        this.time = target - this.dt; // trop en retard : on saute
        break;
      }
      this.step();
    }
    return n;
  }

  get x(): number {
    return this.level.timeline.x(this.time);
  }

  private step(): void {
    const t = this.time + this.dt;
    const p = this.player;
    this.prevY = p.y;

    while (this.inputs.length && this.inputs[0] <= t) {
      const tap = this.inputs.shift()!;
      if (requestFlip(p, tap) !== null) this.scoreFlip(tap);
    }
    const x = this.level.timeline.x(t);
    const pls = this.level.platforms;
    while (this.pcursor < pls.length && pls[this.pcursor].x1 < x - HB_HALF - 1) this.pcursor++;
    const lane = laneAt(pls, this.pcursor, x, p.y);
    const buffered = integrate(p, this.dt, t, lane.lo, lane.hi);
    if (buffered !== null) this.scoreFlip(buffered);

    this.time = t;
    if (lane.crash) {
      // tranche avant d'une poutre percutée en plein flip
      this.dead = true;
      this.deathTime = t;
      return;
    }
    const obs = this.level.obstacles;
    while (this.cursor < obs.length && obs[this.cursor].hx1 < x - HB_HALF) this.cursor++;
    if (collides(obs, this.cursor, x, p.y)) {
      this.dead = true;
      this.deathTime = t;
      return;
    }
    if (t >= this.level.end) this.finished = true;
  }

  private scoreFlip(tap: number): void {
    const side = sideOf(this.player.grav);
    const s = this.stats;
    s.flips++;
    const win = CONFIG.timing.matchWindowMs / 1000;
    let best = -1;
    let bestD = Infinity;
    const flips = this.level.flips;
    for (let i = 0; i < flips.length; i++) {
      const d = tap - flips[i].time;
      if (d > win) continue;
      if (d < -win) break;
      if (flips[i].to !== side || this.used.has(i)) continue;
      if (Math.abs(d) < Math.abs(bestD)) {
        bestD = d;
        best = i;
      }
    }
    let deltaMs: number | null = null;
    if (best >= 0) {
      this.used.add(best);
      deltaMs = bestD * 1000;
      const a = Math.abs(deltaMs);
      s.matched++;
      s.sumAbsMs += a;
      if (a <= CONFIG.timing.perfectMs) s.perfect++;
      if (a <= CONFIG.timing.greatMs) {
        s.great++;
        s.combo++;
        s.maxCombo = Math.max(s.maxCombo, s.combo);
      } else s.combo = 0;
    } else {
      s.offbeat++;
      s.combo = 0;
    }
    this.onFlip?.({ time: tap, side, deltaMs });
  }
}
