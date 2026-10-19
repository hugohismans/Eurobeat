import { CONFIG } from '../config';
import type { FxTexture } from './fx';

/** Particules en coordonnées monde, pool fixe (pas d'allocation en jeu). */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  grow: number;
  color: string;
  additive: boolean;
  tex: FxTexture;
}

export class Particles {
  readonly items: Particle[] = [];
  private head = 0;

  constructor(private readonly cap = CONFIG.render.maxParticles) {}

  emit(x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, additive = true, grow = 0, tex: FxTexture = 'dot'): void {
    let p: Particle;
    if (this.items.length < this.cap) {
      p = { x, y, vx, vy, life, max: life, size, grow, color, additive, tex };
      this.items.push(p);
      return;
    }
    // pool plein : on recycle la plus ancienne
    p = this.items[this.head];
    this.head = (this.head + 1) % this.cap;
    Object.assign(p, { x, y, vx, vy, life, max: life, size, grow, color, additive, tex });
  }

  update(dt: number): void {
    for (const p of this.items) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 1.5 * dt;
      p.vy *= 1 - 1.5 * dt;
      p.size += p.grow * dt;
    }
  }

  clear(): void {
    for (const p of this.items) p.life = 0;
  }
}
