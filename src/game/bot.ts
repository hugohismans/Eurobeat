import { CONFIG } from '../config';
import { rng, type Level } from './level';
import { Run } from './sim';

export interface BotResult {
  ok: boolean;
  deathTime?: number;
  /** index du flip attendu le plus proche de la mort */
  nearFlip?: number;
}

/** Joue le niveau en tapant chaque flip attendu décalé de offsets(i) secondes. */
export function playBot(level: Level, offset: (i: number) => number): BotResult {
  const run = new Run(level, 0, 'floor');
  run.suddenDeath = true; // un niveau valide se finit sans aucun choc
  level.flips.forEach((f, i) => run.input(f.time + offset(i)));
  run.advanceTo(level.end + 1);
  if (!run.dead) return { ok: true };
  let near = 0;
  level.flips.forEach((f, i) => {
    if (Math.abs(f.time - run.deathTime) < Math.abs(level.flips[near].time - run.deathTime)) near = i;
  });
  return { ok: false, deathTime: run.deathTime, nearFlip: near };
}

export interface Validation {
  ok: boolean;
  failures: { scenario: string; result: BotResult }[];
  forcedFlips: number;
}

/** Vérifie le niveau à ±tolérance (extrêmes, alternés, aléatoires). */
export function validateLevel(level: Level, randomRuns = 200): Validation {
  const tol = (CONFIG.timing.toleranceMs - 2) / 1000;
  const scenarios: [string, (i: number) => number][] = [
    ['parfait', () => 0],
    ['tout en avance', () => -tol],
    ['tout en retard', () => tol],
    ['retard puis avance', (i) => (i % 2 ? -tol : tol)],
    ['avance puis retard', (i) => (i % 2 ? tol : -tol)],
  ];
  for (let s = 0; s < randomRuns; s++) {
    const r = rng(1000 + s);
    const offs = level.flips.map(() => (r() * 2 - 1) * tol);
    scenarios.push([`aléatoire #${s}`, (i) => offs[i]]);
  }
  const failures = scenarios
    .map(([scenario, fn]) => ({ scenario, result: playBot(level, fn) }))
    .filter((f) => !f.result.ok);
  return { ok: failures.length === 0, failures, forcedFlips: level.obstacles.length };
}
