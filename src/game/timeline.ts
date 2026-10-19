import { CONFIG } from '../config';
import type { MusicInfo } from './types';

/**
 * Conversion temps morceau ↔ position horizontale.
 * La vitesse dépend de l'intensité de la section, avec un fondu entre sections.
 * Table échantillonnée : x(t) est exact et identique pour le jeu et le bot.
 */
export class Timeline {
  private readonly step = 0.005;
  private readonly xs: Float64Array;
  private readonly vEnd: number;
  readonly vStart: number;
  readonly duration: number;

  constructor(private readonly music: MusicInfo) {
    this.duration = music.duration;
    const n = Math.ceil(music.duration / this.step) + 2;
    this.xs = new Float64Array(n);
    let x = 0;
    for (let i = 0; i < n; i++) {
      this.xs[i] = x;
      x += this.speedAt(i * this.step + this.step / 2) * this.step;
    }
    this.vStart = this.speedAt(0);
    this.vEnd = this.speedAt(music.duration);
  }

  /** Vitesse instantanée (unités / s). */
  speedAt(t: number): number {
    const s = this.music.sections;
    if (s.length === 0) return CONFIG.speed.base;
    const ramp = CONFIG.speed.rampTime;
    let i = s.findIndex((sec) => t < sec.end);
    if (i < 0) i = s.length - 1;
    let v = speedFor(s[i].intensity);
    // fondu vers la section suivante sur [end - ramp/2, end + ramp/2]
    const next = s[i + 1];
    if (next && t > s[i].end - ramp / 2) {
      const k = smooth((t - (s[i].end - ramp / 2)) / ramp);
      v = v + (speedFor(next.intensity) - v) * k;
    }
    const prev = s[i - 1];
    if (prev && t < s[i].start + ramp / 2) {
      const k = smooth((t - (s[i].start - ramp / 2)) / ramp);
      v = speedFor(prev.intensity) + (v - speedFor(prev.intensity)) * k;
    }
    return v;
  }

  x(t: number): number {
    if (t <= 0) return t * this.vStart;
    const f = t / this.step;
    const i = Math.floor(f);
    if (i >= this.xs.length - 1) return this.xs[this.xs.length - 1] + (t - (this.xs.length - 1) * this.step) * this.vEnd;
    return this.xs[i] + (this.xs[i + 1] - this.xs[i]) * (f - i);
  }

  /** Inverse de x(t). */
  time(x: number): number {
    if (x <= 0) return x / this.vStart;
    const last = this.xs.length - 1;
    if (x >= this.xs[last]) return last * this.step + (x - this.xs[last]) / this.vEnd;
    let lo = 0;
    let hi = last;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (this.xs[m] <= x) lo = m;
      else hi = m;
    }
    return (lo + (x - this.xs[lo]) / (this.xs[hi] - this.xs[lo])) * this.step;
  }
}

export function speedFor(intensity: number): number {
  const { base, minMul, maxMul } = CONFIG.speed;
  const i = Math.max(0, Math.min(1, intensity));
  return base * (minMul + (maxMul - minMul) * i);
}

function smooth(k: number): number {
  const c = Math.max(0, Math.min(1, k));
  return c * c * (3 - 2 * c);
}
