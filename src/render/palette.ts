import type { SectionType } from '../game/types';

export type RGB = [number, number, number];

export interface Palette {
  skyTop: RGB;
  skyBottom: RGB;
  /** néon principal (bords du couloir, obstacles au sol) */
  neonA: RGB;
  /** néon secondaire (plafond, accents) */
  neonB: RGB;
}

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

export const PALETTES: Record<SectionType, Palette> = {
  intro: { skyTop: hex('#05061a'), skyBottom: hex('#24104a'), neonA: hex('#9b5cff'), neonB: hex('#29e6ff') },
  verse: { skyTop: hex('#040a1f'), skyBottom: hex('#0f2a55'), neonA: hex('#29e6ff'), neonB: hex('#ff3fa4') },
  prechorus: { skyTop: hex('#0a0618'), skyBottom: hex('#4a1838'), neonA: hex('#ff8a2a'), neonB: hex('#ff3fa4') },
  chorus: { skyTop: hex('#12041e'), skyBottom: hex('#5a0f4c'), neonA: hex('#ff2e9a'), neonB: hex('#29e6ff') },
  break: { skyTop: hex('#02030c'), skyBottom: hex('#0b1438'), neonA: hex('#4a7dff'), neonB: hex('#9b5cff') },
  outro: { skyTop: hex('#05061a'), skyBottom: hex('#2a1250'), neonA: hex('#9b5cff'), neonB: hex('#ff8a2a') },
};

export function mix(a: RGB, b: RGB, k: number): RGB {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

export function mixPalette(a: Palette, b: Palette, k: number): Palette {
  return { skyTop: mix(a.skyTop, b.skyTop, k), skyBottom: mix(a.skyBottom, b.skyBottom, k), neonA: mix(a.neonA, b.neonA, k), neonB: mix(a.neonB, b.neonB, k) };
}

export function css(c: RGB, alpha = 1): string {
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${alpha})`;
}

export function brighten(c: RGB, k: number): RGB {
  return mix(c, [255, 255, 255], k);
}
