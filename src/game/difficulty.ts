import { CONFIG } from '../config';

export type Difficulty = 'easy' | 'medium' | 'expert';

export interface DifficultyPreset {
  label: string;
  /** fenêtre ±ms garantie autour du beat (les obstacles sont raccourcis en conséquence) */
  toleranceMs: number;
  spikeHeight: number;
  blockHeight: number;
  /** multiplicateur de la vitesse de défilement */
  speedMul: number;
  inputBufferMs: number;
  /** jauge perdue par choc : 0.2 → 5 chocs d'affilée pour perdre */
  hitDamage: number;
  /** jauge regagnée par flip dans le temps */
  heal: number;
  /** sparse : temps entiers, au moins 2 temps entre deux flips · straight : temps entiers · full : croches et syncopes */
  density: 'sparse' | 'straight' | 'full';
}

// Expert = réglage d'origine de config.ts. À ajuster ici.
export const DIFFICULTIES: Record<Difficulty, DifficultyPreset> = {
  easy: { label: 'Facile', toleranceMs: 140, spikeHeight: 0.8, blockHeight: 1.2, speedMul: 0.85, inputBufferMs: 180, hitDamage: 0.2, heal: 0.06, density: 'sparse' },
  medium: { label: 'Moyen', toleranceMs: 110, spikeHeight: 1.0, blockHeight: 1.5, speedMul: 0.93, inputBufferMs: 160, hitDamage: 0.25, heal: 0.05, density: 'straight' },
  expert: { label: 'Expert', toleranceMs: 80, spikeHeight: 1.3, blockHeight: 2.0, speedMul: 1, inputBufferMs: 140, hitDamage: 0.34, heal: 0.04, density: 'full' },
};

export const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'medium', 'expert'];

const BASE_SPEED = CONFIG.speed.base;
let current: Difficulty = 'expert';

export function currentDifficulty(): Difficulty {
  return current;
}

/** Applique le préréglage à CONFIG : à faire avant de construire un niveau. */
export function applyDifficulty(d: Difficulty): void {
  const p = DIFFICULTIES[d];
  current = d;
  CONFIG.timing.toleranceMs = p.toleranceMs;
  // le combo et la précision "dans le temps" suivent la fenêtre de survie
  CONFIG.timing.greatMs = p.toleranceMs;
  CONFIG.obstacles.spikeHeight = p.spikeHeight;
  CONFIG.obstacles.blockHeight = p.blockHeight;
  CONFIG.speed.base = BASE_SPEED * p.speedMul;
  CONFIG.physics.inputBufferMs = p.inputBufferMs;
  CONFIG.health.damage = p.hitDamage;
  CONFIG.health.heal = p.heal;
}

/** Allège une liste de beats de flip selon la densité du mode courant. */
export function thinBeats(beats: number[], d: Difficulty = current): number[] {
  const density = DIFFICULTIES[d].density;
  if (density === 'full') return beats;
  const ints = beats.filter((b) => b % 1 === 0);
  if (density === 'straight') return ints;
  const out: number[] = [];
  for (const b of [...ints].sort((x, y) => x - y)) if (!out.length || b - out[out.length - 1] >= 2) out.push(b);
  return out;
}
