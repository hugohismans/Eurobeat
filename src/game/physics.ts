import { CONFIG } from '../config';
import type { Obstacle, Platform, Side } from './types';

/** y = centre du perso, 0 = sol, corridorHeight = plafond. */
export interface PlayerState {
  y: number;
  vy: number;
  /** -1 = vers le sol, +1 = vers le plafond */
  grav: 1 | -1;
  grounded: boolean;
  /** temps morceau jusqu'auquel un tap en l'air reste mémorisé (-Infinity = aucun) */
  bufferedUntil: number;
  bufferedAt: number;
}

const H = CONFIG.world.corridorHeight;
export const HALF = CONFIG.player.size / 2;
export const HB_HALF = CONFIG.player.hitbox / 2;

export function sideOf(grav: 1 | -1): Side {
  return grav > 0 ? 'ceil' : 'floor';
}

/** Joueur posé sur la surface `side` d'une voie [lo, hi]. */
export function createPlayer(side: Side, lo = 0, hi = H): PlayerState {
  const grav = side === 'ceil' ? 1 : -1;
  return { y: grav > 0 ? hi - HALF : lo + HALF, vy: 0, grav, grounded: true, bufferedUntil: -Infinity, bufferedAt: 0 };
}

export function applyFlip(p: PlayerState): void {
  p.grav = p.grav > 0 ? -1 : 1;
  p.vy = p.grav * CONFIG.physics.flipImpulse;
  p.grounded = false;
  p.bufferedUntil = -Infinity;
}

/**
 * Demande de flip au temps `t`. Retourne le temps effectif du flip, ou null s'il est mémorisé.
 */
export function requestFlip(p: PlayerState, t: number): number | null {
  if (p.grounded || CONFIG.physics.airFlip) {
    applyFlip(p);
    return t;
  }
  p.bufferedUntil = t + CONFIG.physics.inputBufferMs / 1000;
  p.bufferedAt = t;
  return null;
}

/**
 * Intègre un pas dans une voie [lo, hi]. Retourne le temps du tap d'origine si un flip
 * mémorisé s'est déclenché à l'atterrissage (pour le scoring), sinon null.
 */
export function integrate(p: PlayerState, dt: number, t: number, lo: number, hi: number): number | null {
  const { gravity, maxSpeed } = CONFIG.physics;
  p.vy += p.grav * gravity * dt;
  if (p.vy > maxSpeed) p.vy = maxSpeed;
  if (p.vy < -maxSpeed) p.vy = -maxSpeed;
  p.y += p.vy * dt;
  p.grounded = false;
  if (p.y <= lo + HALF) {
    p.y = lo + HALF;
    if (p.grav < 0) {
      p.vy = 0;
      p.grounded = true;
    }
  } else if (p.y >= hi - HALF) {
    p.y = hi - HALF;
    if (p.grav > 0) {
      p.vy = 0;
      p.grounded = true;
    }
  }
  if (p.grounded && t <= p.bufferedUntil) {
    const at = p.bufferedAt;
    applyFlip(p);
    return at;
  }
  return null;
}

/**
 * Voie du joueur à l'abscisse x : chaque plateforme chevauchée devient son sol (s'il est
 * au-dessus) ou son plafond (s'il est en dessous). `crash` si la hitbox touche une poutre.
 */
export function laneAt(platforms: Platform[], from: number, x: number, y: number): { lo: number; hi: number; crash: boolean } {
  let lo = 0;
  let hi = H;
  let crash = false;
  const l = x - HB_HALF;
  const r = x + HB_HALF;
  for (let i = from; i < platforms.length; i++) {
    const pl = platforms[i];
    if (pl.x0 > r) break;
    if (pl.x1 < l) continue;
    if (y < (pl.y0 + pl.y1) / 2) hi = Math.min(hi, pl.y0);
    else lo = Math.max(lo, pl.y1);
    if (y + HB_HALF > pl.y0 && y - HB_HALF < pl.y1) crash = true;
  }
  return { lo, hi, crash };
}

/** Collision hitbox perso (centré en x) / obstacles. `from` = index de départ (obstacles triés par hx0). */
export function collides(obstacles: Obstacle[], from: number, x: number, y: number): boolean {
  const l = x - HB_HALF;
  const r = x + HB_HALF;
  const b = y - HB_HALF;
  const top = y + HB_HALF;
  for (let i = from; i < obstacles.length; i++) {
    const o = obstacles[i];
    if (o.hx0 > r) break;
    if (o.hx1 < l) continue;
    if (o.side === 'floor' ? b < o.surface + o.hh && top > o.surface : top > o.surface - o.hh && b < o.surface) return true;
  }
  return false;
}

/**
 * Profil d'un flip depuis le repos dans une voie de hauteur `laneHeight` : temps pour que le bord
 * avant de la hitbox dépasse une distance donnée depuis la surface de départ. Calculé avec le même
 * intégrateur que le jeu pour que la construction des obstacles soit exacte.
 */
export class FlipProfile {
  private readonly d: number[] = [];
  readonly dt = 1 / CONFIG.sim.hz;

  constructor(readonly laneHeight = H) {
    const p = createPlayer('floor', 0, laneHeight);
    applyFlip(p);
    for (let i = 0; i < CONFIG.sim.hz * 2; i++) {
      integrate(p, this.dt, 0, 0, laneHeight);
      this.d.push(p.y - HALF);
      if (p.grounded) break;
    }
  }

  /** Durée de la traversée complète. */
  get traversal(): number {
    return this.d.length * this.dt;
  }

  /** Temps pour que le bas de la hitbox dépasse la hauteur h (obstacle sur la surface quittée). */
  clearTime(h: number): number {
    return this.firstAbove(h - (HALF - HB_HALF));
  }

  /** Temps pour que le haut de la hitbox atteigne un obstacle de hauteur h sur la surface d'arrivée. */
  reachTime(h: number): number {
    return this.firstAbove(this.laneHeight - h - (HALF + HB_HALF));
  }

  private firstAbove(dist: number): number {
    for (let i = 0; i < this.d.length; i++) if (this.d[i] > dist) return (i + 1) * this.dt;
    return this.traversal;
  }
}

/** Temps de chute libre (depuis le repos, sans impulsion) sur une distance : sortie de plateforme. */
export function fallTime(distance: number): number {
  const p: PlayerState = { y: HALF, vy: 0, grav: 1, grounded: false, bufferedUntil: -Infinity, bufferedAt: 0 };
  const dt = 1 / CONFIG.sim.hz;
  let t = 0;
  while (p.y - HALF < distance && t < 2) {
    integrate(p, dt, 0, 0, distance + 2 * HALF);
    t += dt;
  }
  return t;
}
