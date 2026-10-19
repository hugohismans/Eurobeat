import { brighten, css, mix, type Palette, type RGB } from './palette';

/**
 * Coupé japonais années 80 générique (hayon, long capot, phares escamotables), dessiné en
 * vectoriel. Repère local : unités monde, y vers le haut, x vers l'avant, roues posées sur y = 0.
 * Aucune marque ni logo.
 */

/** Contour de la carrosserie (sans les passages de roue). */
const BODY: [number, number][] = [
  [-0.84, 0.1],
  [-0.87, 0.2],
  [-0.86, 0.31],
  [-0.79, 0.37],
  [-0.62, 0.4],
  [-0.41, 0.6],
  [0.06, 0.625],
  [0.31, 0.43],
  [0.62, 0.395],
  [0.8, 0.37],
  [0.88, 0.31],
  [0.89, 0.18],
  [0.85, 0.1],
];

/** Vitrage latéral (custode + portière). */
const GLASS: [number, number][] = [
  [-0.55, 0.415],
  [-0.38, 0.575],
  [0.05, 0.598],
  [0.26, 0.435],
];

const WHEELS = [-0.54, 0.55];
const WHEEL_R = 0.155;

function path(ctx: CanvasRenderingContext2D, pts: [number, number][]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

export interface CarStyle {
  pal: Palette;
  /** distance parcourue (rotation des roues) */
  distance: number;
  /** flamme d'échappement (refrain, looping) */
  boost: boolean;
  /** épaisseur d'un pixel écran dans le repère local */
  px: number;
}

/** Silhouette seule, pour la traînée fantôme pendant les flips. */
export function carGhost(ctx: CanvasRenderingContext2D, color: string): void {
  path(ctx, BODY);
  ctx.fillStyle = color;
  ctx.fill();
}

export function drawCarBody(ctx: CanvasRenderingContext2D, s: CarStyle): void {
  const { pal, px } = s;
  const paint: RGB = mix([238, 236, 255], pal.neonB, 0.18);
  const dark: RGB = [16, 12, 34];
  const t = performance.now() / 1000;

  // faisceau des phares
  ctx.globalCompositeOperation = 'lighter';
  const beam = ctx.createLinearGradient(0.8, 0, 4.2, 0);
  beam.addColorStop(0, 'rgba(255,244,214,0.32)');
  beam.addColorStop(1, 'rgba(255,244,214,0)');
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(0.82, 0.4);
  ctx.lineTo(4.2, 0.75);
  ctx.lineTo(4.2, -0.1);
  ctx.lineTo(0.82, 0.3);
  ctx.closePath();
  ctx.fill();
  // néon sous caisse
  ctx.fillStyle = css(pal.neonA, 0.5);
  ctx.fillRect(-0.72, -0.03, 1.46, 0.07);
  // flamme d'échappement
  if (s.boost) {
    const f = 0.18 + 0.1 * Math.sin(t * 47) + 0.05 * Math.sin(t * 83);
    ctx.fillStyle = 'rgba(255,140,40,0.85)';
    ctx.beginPath();
    ctx.moveTo(-0.86, 0.15);
    ctx.lineTo(-0.86 - f, 0.12);
    ctx.lineTo(-0.86, 0.09);
    ctx.fill();
    ctx.fillStyle = 'rgba(120,220,255,0.9)';
    ctx.beginPath();
    ctx.moveTo(-0.86, 0.135);
    ctx.lineTo(-0.86 - f * 0.5, 0.12);
    ctx.lineTo(-0.86, 0.105);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  // carrosserie deux tons : haut clair, bas sombre
  path(ctx, BODY);
  ctx.fillStyle = css(paint);
  ctx.fill();
  ctx.save();
  path(ctx, BODY);
  ctx.clip();
  ctx.fillStyle = css(dark);
  ctx.fillRect(-1, -0.1, 2, 0.38);
  // filet de livrée néon à la jonction des deux tons
  ctx.fillStyle = css(pal.neonA);
  ctx.fillRect(-1, 0.27, 2, 0.03);
  // passages de roue
  ctx.fillStyle = '#07050f';
  for (const wx of WHEELS) {
    ctx.beginPath();
    ctx.arc(wx, 0.12, WHEEL_R + 0.045, Math.PI, 0);
    ctx.fill();
  }
  ctx.restore();

  // vitrage, montant central, reflet
  path(ctx, GLASS);
  const glass = ctx.createLinearGradient(-0.5, 0.6, 0.2, 0.42);
  glass.addColorStop(0, css(mix(dark, pal.neonB, 0.35)));
  glass.addColorStop(1, css(mix(dark, pal.neonA, 0.25)));
  ctx.fillStyle = glass;
  ctx.fill();
  ctx.strokeStyle = css(paint);
  ctx.lineWidth = 0.035;
  ctx.beginPath();
  ctx.moveTo(-0.13, 0.42);
  ctx.lineTo(-0.11, 0.6);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = px * 1.5;
  ctx.beginPath();
  ctx.moveTo(-0.3, 0.57);
  ctx.lineTo(-0.42, 0.44);
  ctx.moveTo(0.08, 0.58);
  ctx.lineTo(-0.04, 0.44);
  ctx.stroke();

  // aileron
  ctx.fillStyle = css(dark);
  ctx.fillRect(-0.88, 0.43, 0.24, 0.035);
  ctx.fillRect(-0.8, 0.38, 0.025, 0.05);
  ctx.fillRect(-0.7, 0.39, 0.025, 0.05);

  // phare escamotable relevé + optique
  ctx.fillStyle = css(dark);
  ctx.fillRect(0.6, 0.39, 0.15, 0.06);
  ctx.fillStyle = '#fff6da';
  ctx.fillRect(0.735, 0.395, 0.018, 0.05);
  ctx.fillRect(0.85, 0.2, 0.04, 0.05);
  // feux arrière
  ctx.fillStyle = '#ff2848';
  ctx.fillRect(-0.885, 0.26, 0.04, 0.07);

  // contour néon
  ctx.globalCompositeOperation = 'lighter';
  path(ctx, BODY);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = css(pal.neonB, 0.22);
  ctx.lineWidth = px * 6;
  ctx.stroke();
  ctx.strokeStyle = css(brighten(pal.neonB, 0.35), 0.95);
  ctx.lineWidth = px * 1.6;
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';

  // roues : pneu, jante néon, branches qui tournent
  const rot = -s.distance / WHEEL_R;
  for (const wx of WHEELS) {
    ctx.beginPath();
    ctx.arc(wx, 0.12, WHEEL_R, 0, Math.PI * 2);
    ctx.fillStyle = '#05040c';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(wx, 0.12, WHEEL_R * 0.62, 0, Math.PI * 2);
    ctx.fillStyle = '#1b1830';
    ctx.fill();
    ctx.strokeStyle = css(brighten(pal.neonB, 0.2), 0.95);
    ctx.lineWidth = px * 1.4;
    ctx.stroke();
    ctx.beginPath();
    for (let k = 0; k < 5; k++) {
      const a = rot + (k * Math.PI * 2) / 5;
      ctx.moveTo(wx, 0.12);
      ctx.lineTo(wx + Math.cos(a) * WHEEL_R * 0.58, 0.12 + Math.sin(a) * WHEEL_R * 0.58);
    }
    ctx.strokeStyle = css(paint, 0.8);
    ctx.lineWidth = px * 1.2;
    ctx.stroke();
  }
}
