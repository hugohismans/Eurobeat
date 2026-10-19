import { CONFIG } from '../config';
import type { Level } from './level';
import { applyFlip, collides, createPlayer, HALF, HB_HALF, integrate, laneAt, requestFlip, sideOf, type PlayerState } from './physics';
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
  /** chocs encaissés */
  hits: number;
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
  readonly stats: RunStats = { flips: 0, perfect: 0, great: 0, offbeat: 0, sumAbsMs: 0, matched: 0, combo: 0, maxCombo: 0, hits: 0 };
  /** jauge de vie 0-1 (style Guitar Hero) */
  health = 1;
  /** invulnérable jusqu'à ce temps morceau (après un choc) */
  invulnUntil = -Infinity;
  onFlip?: (e: FlipEvent) => void;
  onHit?: (x: number, y: number) => void;
  /** un choc = mort (validation par le bot, option « mort subite ») */
  suddenDeath: boolean = CONFIG.health.suddenDeath;
  private stretchCursor = 0;

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
    const obs = this.level.obstacles;
    while (this.cursor < obs.length && obs[this.cursor].hx1 < x - HB_HALF) this.cursor++;
    // lane.crash : tranche avant d'une poutre percutée en plein flip
    if (lane.crash || collides(obs, this.cursor, x, p.y)) {
      if (t >= this.invulnUntil) this.hit(t, x);
      if (this.dead) return;
      if (lane.crash) this.recover(t, true);
    }
    if (t >= this.level.end) this.finished = true;
  }

  /** Choc : la jauge baisse ; à zéro, c'est perdu. Sinon invulnérabilité et retour du bon côté. */
  private hit(t: number, x: number): void {
    const s = this.stats;
    s.hits++;
    s.combo = 0;
    this.health = this.suddenDeath ? 0 : Math.max(0, this.health - CONFIG.health.damage);
    if (this.health <= 1e-6) {
      this.health = 0;
      this.dead = true;
      this.deathTime = t;
      return;
    }
    this.invulnUntil = t + CONFIG.health.invulnMs / 1000;
    this.onHit?.(x, this.player.y);
    this.recover(t, false);
  }

  /** Remet le joueur du côté attendu par le niveau à cet instant (sinon il percuterait tout ce qui suit). */
  private recover(t: number, teleport: boolean): void {
    const st = this.level.stretches;
    if (this.stretchCursor >= st.length || st[this.stretchCursor].t0 > t) this.stretchCursor = 0;
    while (this.stretchCursor < st.length - 1 && st[this.stretchCursor].t1 <= t) this.stretchCursor++;
    const exp = st[this.stretchCursor];
    if (!exp) return;
    const p = this.player;
    const inLane = p.y > exp.lo && p.y < exp.hi;
    if (teleport || !inLane) {
      // poutre percutée : replacé directement sur la bonne surface de la bonne voie
      p.grav = exp.side === 'ceil' ? 1 : -1;
      p.y = exp.side === 'ceil' ? exp.hi - HALF : exp.lo + HALF;
      p.vy = 0;
      p.grounded = true;
      this.prevY = p.y;
    } else if (sideOf(p.grav) !== exp.side) {
      applyFlip(p);
    }
    p.bufferedUntil = -Infinity;
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
        this.health = Math.min(1, this.health + CONFIG.health.heal);
      } else s.combo = 0;
    } else {
      s.offbeat++;
      s.combo = 0;
    }
    this.onFlip?.({ time: tap, side, deltaMs });
  }
}
