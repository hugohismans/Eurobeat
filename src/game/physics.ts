import { CONFIG } from '../config';
import type { Obstacle, Side } from './types';

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
const HALF = CONFIG.player.size / 2;
export const HB_HALF = CONFIG.player.hitbox / 2;

export function sideOf(grav: 1 | -1): Side {
  return grav > 0 ? 'ceil' : 'floor';
}

export function createPlayer(side: Side): PlayerState {
  const grav = side === 'ceil' ? 1 : -1;
  return { y: grav > 0 ? H - HALF : HALF, vy: 0, grav, grounded: true, bufferedUntil: -Infinity, bufferedAt: 0 };
}

function applyFlip(p: PlayerState): void {
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
 * Avance d'un pas fixe. Retourne le temps du tap d'origine si un flip mémorisé
 * s'est déclenché à l'atterrissage (pour le scoring), sinon null.
 */
export function stepPlayer(p: PlayerState, dt: number, t: number): number | null {
  const { gravity, maxSpeed } = CONFIG.physics;
  p.vy += p.grav * gravity * dt;
  if (p.vy > maxSpeed) p.vy = maxSpeed;
  if (p.vy < -maxSpeed) p.vy = -maxSpeed;
  p.y += p.vy * dt;
  p.grounded = false;
  if (p.y <= HALF) {
    p.y = HALF;
    if (p.grav < 0) {
      p.vy = 0;
      p.grounded = true;
    }
  } else if (p.y >= H - HALF) {
    p.y = H - HALF;
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
    if (o.side === 'floor' ? b < o.hh : top > H - o.hh) return true;
  }
  return false;
}

/**
 * Profil d'un flip depuis le repos : temps pour que le bord avant de la hitbox
 * dépasse une distance donnée depuis la surface de départ. Calculé avec le même
 * intégrateur que le jeu pour que la construction des obstacles soit exacte.
 */
export class FlipProfile {
  private readonly d: number[] = [];
  readonly dt = 1 / CONFIG.sim.hz;

  constructor() {
    const p = createPlayer('floor');
    applyFlip(p);
    for (let i = 0; i < CONFIG.sim.hz * 2; i++) {
      stepPlayer(p, this.dt, 0);
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
    return this.firstAbove(H - h - (HALF + HB_HALF));
  }

  private firstAbove(dist: number): number {
    for (let i = 0; i < this.d.length; i++) if (this.d[i] > dist) return (i + 1) * this.dt;
    return this.traversal;
  }
}
