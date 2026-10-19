import { rng } from '../game/level';
import { css, type Palette } from './palette';

/** Ce dont les décors ont besoin pour placer les éléments à l'écran. */
export interface View {
  w: number;
  h: number;
  /** px CSS par unité monde */
  scale: number;
  camX: number;
  /** débord horizontal (looping) */
  ext: number;
  sx(x: number): number;
}

function canvas(w: number, h: number, dpr: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * dpr));
  c.height = Math.max(1, Math.round(h * dpr));
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);
  return [c, ctx];
}

/** Soleil synthwave à bandes, pré-rendu (dégradé orange → rose → violet). */
export function buildSun(r: number, dpr: number): HTMLCanvasElement {
  const [c, ctx] = canvas(2 * r, 2 * r, dpr);
  const g = ctx.createLinearGradient(0, 0, 0, 2 * r);
  g.addColorStop(0, '#ffd36b');
  g.addColorStop(0.45, '#ff6a7a');
  g.addColorStop(1, '#a43cff');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.fill();
  // bandes horizontales de plus en plus épaisses vers le bas
  ctx.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < 7; k++) {
    const y = r * (1.0 + k * 0.14);
    ctx.fillRect(0, y, 2 * r, 1.5 + k * r * 0.018);
  }
  return c;
}

/** Panneaux autoroutiers suspendus (style shuto, vert), pré-rendus. */
const GANTRY_TEXTS: [string, string][] = [
  ['首都高', 'C1 →'],
  ['湾岸線', '大黒 2km'],
  ['横羽線', '出口 ←'],
  ['環状線', '芝浦 1km'],
];

export function buildGantries(unit: number, dpr: number): HTMLCanvasElement[] {
  return GANTRY_TEXTS.map(([a, b]) => {
    const w = unit * 3.6;
    const h = unit * 1.5;
    const [c, ctx] = canvas(w, h, dpr);
    ctx.fillStyle = '#0d6b4c';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#dff7ea';
    ctx.lineWidth = Math.max(1, unit * 0.05);
    ctx.strokeRect(unit * 0.08, unit * 0.08, w - unit * 0.16, h - unit * 0.16);
    ctx.fillStyle = '#f2fff8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${unit * 0.55}px "Dela Gothic One", "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif`;
    ctx.fillText(a, w / 2, h * 0.36);
    ctx.font = `bold ${unit * 0.36}px system-ui, sans-serif`;
    ctx.fillText(b, w / 2, h * 0.74);
    return c;
  });
}

/** Halo de lampe au sodium, pré-rendu (évite un dégradé radial par pilier et par image). */
let lampSprite: HTMLCanvasElement | null = null;
function lamp(): HTMLCanvasElement {
  if (lampSprite) return lampSprite;
  const [c, ctx] = canvas(64, 32, 1);
  const g = ctx.createRadialGradient(32, 0, 0, 32, 0, 32);
  g.addColorStop(0, 'rgba(255,170,70,0.38)');
  g.addColorStop(1, 'rgba(255,170,70,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 32);
  return (lampSprite = c);
}

/** Piliers de l'autoroute surélevée sous le tablier du sol, avec lampes au sodium. */
export function drawPillars(ctx: CanvasRenderingContext2D, v: View, top: number, pal: Palette): void {
  if (top >= v.h) return;
  const spacing = 9;
  const pw = 1.1 * v.scale;
  const first = Math.floor((v.camX - v.ext / v.scale) / spacing) * spacing;
  // un seul dégradé pour tous les piliers (coordonnées absolues)
  const g = ctx.createLinearGradient(0, top, 0, v.h);
  g.addColorStop(0, '#120b2c');
  g.addColorStop(1, 'rgba(8,6,20,0.2)');
  const edge = css(pal.neonB, 0.22);
  const halo = lamp();
  const lw = v.scale * 4.4;
  for (let x = first; x < v.camX + (v.w + v.ext) / v.scale + spacing; x += spacing) {
    const sx = v.sx(x);
    ctx.fillStyle = g;
    ctx.fillRect(sx - pw / 2, top, pw, v.h - top);
    ctx.fillStyle = edge;
    ctx.fillRect(sx - pw / 2, top, 1.5, v.h - top);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(halo, sx - lw / 2, top, lw, lw / 2);
    ctx.globalCompositeOperation = 'source-over';
  }
}

/** Portiques de signalisation au-dessus du tablier du plafond. */
export function drawGantries(ctx: CanvasRenderingContext2D, v: View, bottom: number, signs: HTMLCanvasElement[]): void {
  if (bottom <= 0 || !signs.length) return;
  const spacing = 46;
  const first = Math.floor((v.camX - v.ext / v.scale) / spacing) * spacing;
  for (let x = first; x < v.camX + (v.w + v.ext) / v.scale + spacing; x += spacing) {
    const sign = signs[Math.abs(Math.round(x / spacing)) % signs.length];
    const sw = 3.6 * v.scale;
    const sh = sw * (sign.height / sign.width);
    const sx = v.sx(x + 20);
    const y = bottom - sh - v.scale * 0.5;
    // poutre + montants
    ctx.fillStyle = '#1a1338';
    ctx.fillRect(sx - v.scale * 0.6, y - v.scale * 0.25, sw + v.scale * 1.2, v.scale * 0.2);
    ctx.fillRect(sx + sw * 0.2, y + sh, v.scale * 0.12, bottom - y - sh);
    ctx.fillRect(sx + sw * 0.8, y + sh, v.scale * 0.12, bottom - y - sh);
    ctx.drawImage(sign, sx, y, sw, sh);
  }
}

/** Reflet mouillé des bords néon sur les tabliers. */
export function drawWetGlow(ctx: CanvasRenderingContext2D, v: View, y: number, depth: number, color: string, down: boolean): void {
  const g = ctx.createLinearGradient(0, y, 0, y + (down ? depth : -depth));
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-v.ext, down ? y : y - depth, v.w + 2 * v.ext, depth);
}

/** Lignes de vitesse (refrain, looping), en espace écran. */
export class SpeedLines {
  private lines = Array.from({ length: 26 }, (_, i) => {
    const r = rng(100 + i);
    return { x: r(), y: r(), len: 0.08 + r() * 0.18, v: 1.5 + r() * 2 };
  });

  draw(ctx: CanvasRenderingContext2D, v: View, dt: number, strength: number): void {
    if (strength <= 0.01) return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(230,240,255,${0.14 * strength})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const l of this.lines) {
      l.x -= l.v * dt;
      if (l.x < -l.len) l.x += 1 + l.len;
      ctx.moveTo(l.x * v.w, l.y * v.h);
      ctx.lineTo((l.x + l.len) * v.w, l.y * v.h);
    }
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }
}

/** Bandeau « ドリフト / DRIFT » à l'entrée d'un refrain. */
export function drawDriftBanner(ctx: CanvasRenderingContext2D, v: View, k: number, pal: Palette): void {
  if (k <= 0 || k >= 1) return;
  const a = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
  const size = Math.min(v.w * 0.16, v.h * 0.22);
  ctx.save();
  ctx.translate(v.w / 2 + (k - 0.5) * v.w * 0.08, v.h * 0.42);
  ctx.transform(1, 0, -0.18, 1, 0, 0); // italique
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalCompositeOperation = 'lighter';
  ctx.font = `${size}px "Dela Gothic One", "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif`;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = css(pal.neonA, 0.35 * a);
  ctx.lineWidth = size * 0.12;
  ctx.strokeText('ドリフト', 0, 0);
  ctx.fillStyle = css(pal.neonA, 0.55 * a);
  ctx.fillText('ドリフト', 0, 0);
  ctx.font = `${size * 0.38}px "Dela Gothic One", system-ui, sans-serif`;
  ctx.fillStyle = css(pal.neonB, 0.7 * a);
  ctx.fillText('D R I F T', 0, size * 0.72);
  ctx.restore();
}
