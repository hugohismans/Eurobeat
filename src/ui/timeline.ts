import type { MusicInfo, SectionType } from '../game/types';
import { SECTION_LABEL } from '../game/types';
import { css, PALETTES } from '../render/palette';

const ORDER: SectionType[] = ['intro', 'verse', 'prechorus', 'chorus', 'break', 'outro'];

/** Intensité par défaut quand le joueur change le type d'une section. */
export const DEFAULT_INTENSITY: Record<SectionType, number> = { intro: 0.3, verse: 0.5, prechorus: 0.7, chorus: 1, break: 0.15, outro: 0.3 };

/**
 * Timeline des sections : énergie par mesure en fond, sections colorées par type.
 * Toucher une section fait défiler son type.
 */
export class TimelineView {
  private ctx: CanvasRenderingContext2D;
  playhead: number | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private getMusic: () => MusicInfo,
    private energy: { times: number[]; values: number[] },
    private readonly onChange: (m: MusicInfo) => void,
  ) {
    this.ctx = canvas.getContext('2d')!;
    canvas.addEventListener('click', (e) => this.onClick(e));
  }

  setEnergy(e: { times: number[]; values: number[] }): void {
    this.energy = e;
    this.draw();
  }

  private onClick(e: MouseEvent): void {
    const r = this.canvas.getBoundingClientRect();
    const music = this.getMusic();
    const t = ((e.clientX - r.left) / r.width) * music.duration;
    const i = music.sections.findIndex((s) => t >= s.start && t < s.end);
    if (i < 0) return;
    const sections = music.sections.map((s) => ({ ...s }));
    const next = ORDER[(ORDER.indexOf(sections[i].type) + 1) % ORDER.length];
    sections[i].type = next;
    sections[i].intensity = DEFAULT_INTENSITY[next];
    this.onChange({ ...music, sections });
  }

  draw(): void {
    const c = this.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (!w || !h) return;
    if (c.width !== Math.round(w * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const music = this.getMusic();
    const x = (t: number) => (t / music.duration) * w;
    ctx.fillStyle = '#0a0820';
    ctx.fillRect(0, 0, w, h);

    for (const s of music.sections) {
      const col = PALETTES[s.type].neonA;
      ctx.fillStyle = css(col, 0.22);
      ctx.fillRect(x(s.start), 0, x(s.end) - x(s.start), h);
      ctx.fillStyle = css(col, 1);
      ctx.fillRect(x(s.start), h - 4, x(s.end) - x(s.start), 4);
    }
    // énergie par mesure
    const { times, values } = this.energy;
    const bw = times.length > 1 ? x(times[1]) - x(times[0]) : 4;
    ctx.fillStyle = 'rgba(238,240,255,0.45)';
    times.forEach((t, i) => {
      const bh = (h - 26) * values[i];
      ctx.fillRect(x(t), h - 6 - bh, Math.max(1, bw - 1), bh);
    });
    // frontières + étiquettes
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    for (const s of music.sections) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(x(s.start), 0, 1, h);
      const label = SECTION_LABEL[s.type];
      const room = x(s.end) - x(s.start) - 6;
      if (room > 18) {
        ctx.fillStyle = css(PALETTES[s.type].neonA, 1);
        ctx.fillText(room > ctx.measureText(label).width ? label : label.slice(0, 3), x(s.start) + 4, 4);
      }
    }
    if (this.playhead !== null) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(x(this.playhead) - 1, 0, 2, h);
    }
  }
}
