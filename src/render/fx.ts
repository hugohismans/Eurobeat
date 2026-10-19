/**
 * Textures de particules (Kenney Particle Pack, CC0) : atlas blanc teinté à la volée,
 * avec cache par couleur. Tant que l'image n'est pas chargée (ou si elle manque),
 * le renderer garde son rendu procédural de secours.
 */
export type FxTexture = 'dot' | 'star' | 'smoke' | 'flare';

const CELLS: Record<FxTexture, number> = { dot: 0, star: 1, smoke: 2, flare: 3 };
const CELL = 96;

export class FxAtlas {
  private img: HTMLImageElement | null = null;
  private tinted = new Map<string, HTMLCanvasElement>();

  constructor(url = 'assets/fx/particles.png') {
    const img = new Image();
    img.onload = () => (this.img = img);
    img.src = url;
  }

  get ready(): boolean {
    return this.img !== null;
  }

  /** Texture teintée (la couleur porte aussi l'opacité de base). */
  get(tex: FxTexture, color: string): HTMLCanvasElement | null {
    if (!this.img) return null;
    const key = `${tex}|${color}`;
    let c = this.tinted.get(key);
    if (!c) {
      if (this.tinted.size > 256) this.tinted.clear(); // couleurs interpolées : cache borné
      c = document.createElement('canvas');
      c.width = c.height = CELL;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(this.img, CELLS[tex] * CELL, 0, CELL, CELL, 0, 0, CELL, CELL);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, CELL, CELL);
      this.tinted.set(key, c);
    }
    return c;
  }
}
