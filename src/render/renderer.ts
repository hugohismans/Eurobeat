import { CONFIG } from '../config';
import { rng, type Level } from '../game/level';
import { laneAt } from '../game/physics';
import type { Obstacle, Platform, Section } from '../game/types';
import { brighten, css, mixPalette, PALETTES, type Palette, type RGB } from './palette';
import { carGhost, drawCarBody } from './car';
import { FxAtlas } from './fx';
import { buildGantries, buildSun, drawDriftBanner, drawGantries, drawPillars, drawWetGlow, SpeedLines, type View } from './scenery';
import { Particles } from './particles';

const H = CONFIG.world.corridorHeight;

export interface FrameState {
  level: Level;
  /** temps morceau rendu */
  t: number;
  /** position monde du perso */
  px: number;
  py: number;
  /** -1 sol, +1 plafond */
  grav: number;
  grounded: boolean;
  dead: boolean;
  /** temps réel écoulé depuis la frame précédente (s) */
  dt: number;
  debug: boolean;
  /** invulnérable après un choc : la voiture clignote */
  invuln?: boolean;
}

interface Drop {
  x: number;
  y: number;
  len: number;
  v: number;
}

interface Trail {
  x: number;
  lane: number;
  v: number;
  len: number;
  red: boolean;
  deck: 0 | 1;
}

const SIGNS = ['東京', '首都高', '峠', 'ドリフト', '湾岸', '夜', 'ネオン', '走', '頭文字', '環状'];

/**
 * Rendu procédural "Tokyo néon". Pas de shadowBlur (coûteux sur mobile) :
 * les glows sont des traits superposés en mode additif.
 */
export class Renderer {
  readonly particles = new Particles();
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  /** px CSS par unité monde */
  scale = 1;
  private cy = 0;
  private camX = 0;
  private far: HTMLCanvasElement | null = null;
  private near: HTMLCanvasElement | null = null;
  private signs: HTMLCanvasElement | null = null;
  private drops: Drop[] = [];
  private trails: Trail[] = [];
  private shake = 0;
  private flash = 0;
  private fps = 60;
  private hitFlash = 0;
  private ghosts: { x: number; y: number; grav: number; lo: number; hi: number }[] = [];
  private sun: HTMLCanvasElement | null = null;
  private readonly fx = new FxAtlas();
  private lastBeat = -1;
  /** qualité réduite automatiquement si l'appareil n'arrive pas à suivre */
  low = false;
  autoQuality = true;
  private slowTime = 0;
  private gantrySigns: HTMLCanvasElement[] = [];
  private readonly speedLines = new SpeedLines();
  private speedStrength = 0;
  private readonly view: View = {
    w: 0,
    h: 0,
    scale: 1,
    camX: 0,
    ext: 20,
    sx: (x: number) => this.sx(x),
  };
  /** débord horizontal des couches monde (agrandi pendant un looping, quand la vue tourne) */
  private ext = 20;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D indisponible');
    this.ctx = ctx;
    const r = rng(7);
    for (let i = 0; i < CONFIG.render.rainDrops; i++) this.drops.push({ x: r(), y: r(), len: 0.02 + r() * 0.04, v: 0.9 + r() * 0.8 });
    for (let i = 0; i < 14; i++) this.trails.push({ x: r() * 40, lane: r(), v: 8 + r() * 14, len: 1.5 + r() * 3, red: r() < 0.5, deck: (i % 2) as 0 | 1 });
    this.resize();
    // enseignes et panneaux pré-rendus : on les refait quand la police japonaise est chargée
    document.fonts?.load('24px "Dela Gothic One"', '東京ドリフト').then(() => this.buildBackdrops()).catch(() => {});
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, this.low ? 1 : CONFIG.render.maxDpr);
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.dpr = dpr;
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    const { viewBehind, minViewAhead, verticalMargin } = CONFIG.world;
    this.scale = Math.min(h / (H + 2 * verticalMargin), w / (viewBehind + minViewAhead));
    this.cy = h / 2;
    this.buildBackdrops();
  }

  // ---------- coordonnées ----------
  private sx(x: number): number {
    return (x - this.camX) * this.scale;
  }
  private sy(y: number): number {
    return this.cy + (H / 2 - y) * this.scale;
  }

  // ---------- effets déclenchés par le jeu ----------
  flipFx(x: number, fromFloor: boolean, color: string): void {
    const y = fromFloor ? 0 : H;
    const dir = fromFloor ? 1 : -1;
    for (let i = 0; i < 10; i++) {
      this.particles.emit(x + (Math.random() - 0.5) * 0.6, y, -4 - Math.random() * 6, dir * (2 + Math.random() * 6), 0.35, 0.09, color, true, 0, i % 3 ? 'dot' : 'star');
    }
  }

  /** Choc encaissé (la jauge baisse) : étincelles rouges, petite secousse, flash. */
  hitFx(x: number, y: number): void {
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 2 + Math.random() * 9;
      this.particles.emit(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.35 + Math.random() * 0.3, 0.05 + Math.random() * 0.07, i % 3 ? '#ff2848' : '#ffd0d8');
    }
    this.shake = Math.max(this.shake, 0.18);
    this.hitFlash = 1;
  }

  deathFx(x: number, y: number, colors: string[]): void {
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 3 + Math.random() * 14;
      this.particles.emit(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.5 + Math.random() * 0.6, 0.06 + Math.random() * 0.12, colors[i % colors.length], true, 0, i % 4 ? 'dot' : 'star');
    }
    this.shake = 0.35;
    this.flash = 1;
  }

  // ---------- frame ----------
  draw(s: FrameState): void {
    // rotation portrait ↔ paysage : sur iOS l'événement resize arrive avant la nouvelle mise en page,
    // on compare donc la taille réelle à chaque image (lecture sans coût si rien n'a bougé)
    const dpr = Math.min(window.devicePixelRatio || 1, this.low ? 1 : CONFIG.render.maxDpr);
    if (this.canvas.clientWidth && (this.canvas.clientWidth !== this.w || this.canvas.clientHeight !== this.h || dpr !== this.dpr)) this.resize();
    const ctx = this.ctx;
    const { level, t } = s;
    this.fps += (1 / Math.max(s.dt, 1e-3) - this.fps) * 0.05;
    // moins de 45 i/s pendant 3 s : on passe en qualité réduite (définitif pour la session)
    if (this.autoQuality && !this.low) {
      this.slowTime = this.fps < 45 ? this.slowTime + s.dt : Math.max(0, this.slowTime - s.dt);
      if (this.slowTime > 3) {
        this.low = true;
        this.resize();
      }
    }
    this.particles.update(s.dt);

    const music = level.music;
    const beatF = ((t - music.offset / 1000) * music.bpm) / 60;
    const beatPhase = beatF - Math.floor(beatF);
    const pulse = beatF >= 0 ? Math.exp(-beatPhase * 5) : 0;
    const barPulse = beatF >= 0 && Math.floor(beatF) % 4 === 0 ? pulse : 0;
    const { pal, section } = this.paletteAt(music.sections, t);
    const chorus = section?.type === 'chorus';
    const intensity = section?.intensity ?? 0.3;

    this.camX = s.px - CONFIG.world.viewBehind;
    let ox = 0;
    let oy = 0;
    if (this.shake > 0) {
      this.shake -= s.dt;
      const k = Math.max(0, this.shake) * 30;
      ox = (Math.random() - 0.5) * k;
      oy = (Math.random() - 0.5) * k;
    }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, ox * this.dpr, oy * this.dpr);

    const yc = this.sy(H);
    const yf = this.sy(0);
    const deck = Math.max(this.scale * 1.1, 22);

    // ciel
    const g = ctx.createLinearGradient(0, 0, 0, yf);
    g.addColorStop(0, css(pal.skyTop));
    g.addColorStop(1, css(pal.skyBottom));
    ctx.fillStyle = g;
    ctx.fillRect(-20, -20, this.w + 40, this.h + 40);

    const v = this.view;
    Object.assign(v, { w: this.w, h: this.h, scale: this.scale, camX: this.camX, ext: 20 });

    // soleil synthwave, à moitié caché par la ville, qui grossit un peu sur le temps 1
    if (this.sun && !this.low) {
      const r = (this.sun.width / this.stripDpr / 2) * (1 + 0.025 * barPulse);
      ctx.globalAlpha = 0.85;
      ctx.drawImage(this.sun, this.w * 0.66 - r, yf * 0.3 - r, 2 * r, 2 * r);
      ctx.globalAlpha = 1;
    }

    // ville (parallaxe), reflet mouillé sous le sol
    this.drawStrip(this.far!, s.px * this.scale * 0.06, yf, 1);
    this.drawStrip(this.near!, s.px * this.scale * 0.18, yf, 1);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35 + 0.65 * pulse;
    this.drawStrip(this.signs!, s.px * this.scale * 0.18, yf, 1);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.translate(0, 2 * (yf + deck));
    ctx.scale(1, -1);
    ctx.globalAlpha = 0.22;
    this.drawStrip(this.near!, s.px * this.scale * 0.18, yf + deck, 1);
    ctx.restore();
    ctx.globalAlpha = 1;
    const rg = ctx.createLinearGradient(0, yf + deck, 0, this.h);
    rg.addColorStop(0, css(pal.skyTop, 0.4));
    rg.addColorStop(1, css(pal.skyTop, 0.95));
    ctx.fillStyle = rg;
    ctx.fillRect(-20, yf + deck, this.w + 40, this.h);

    // structure de l'autoroute surélevée : piliers dessous, portiques au-dessus
    if (!this.low) drawPillars(ctx, v, yf + deck, pal);
    drawGantries(ctx, v, yc - deck, this.gantrySigns);

    // looping : la vue tourne d'un tour complet autour de la voiture
    const loop = level.loops.find((l) => t >= l.t0 && t <= l.t1);
    this.ext = loop ? Math.hypot(this.w, this.h) : 20;
    ctx.save();
    if (loop) {
      const k = (t - loop.t0) / (loop.t1 - loop.t0);
      const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
      const zoom = 1 - (1 - CONFIG.loop.zoom) * Math.sin(Math.PI * k);
      const cx = this.sx(s.px);
      const cy = this.sy(s.py);
      ctx.translate(cx, cy);
      ctx.rotate(-e * Math.PI * 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-cx, -cy);
    }
    const X0 = -this.ext;
    const XW = this.w + 2 * this.ext;

    // intérieur du couloir assombri pour la lisibilité
    ctx.fillStyle = 'rgba(4,3,16,0.42)';
    ctx.fillRect(X0, yc, XW, yf - yc);

    // tabliers d'autoroute (plafond et sol), grille pulsée, reflet mouillé des néons
    v.ext = this.ext;
    this.drawDeck(yc - deck, yc, pal, true, pulse);
    this.drawDeck(yf, yf + deck, pal, false, pulse);
    if (!this.low) {
      drawWetGlow(ctx, v, yf, deck * 0.9, css(pal.neonA, 0.18 + 0.12 * pulse), true);
      drawWetGlow(ctx, v, yc, deck * 0.9, css(pal.neonB, 0.18 + 0.12 * pulse), false);
    }
    this.drawTrails(s, yc, yf, deck);

    // bords néon pulsés
    const edgeA = brighten(pal.neonA, 0.25 * pulse);
    const edgeB = brighten(pal.neonB, 0.25 * pulse);
    ctx.globalCompositeOperation = 'lighter';
    this.glowLine(X0, yf, X0 + XW, yf, edgeA, 1 + pulse * 0.8);
    this.glowLine(X0, yc, X0 + XW, yc, edgeB, 1 + pulse * 0.8);
    ctx.globalCompositeOperation = 'source-over';

    this.drawPlatforms(level.platforms, pal, pulse);
    if (CONFIG.render.showFlipMarkers) this.drawFlipMarkers(level, t, pal);
    this.drawObstacles(level.obstacles, pal, pulse);
    const lane = laneAt(level.platforms, 0, s.px, s.py);

    // traînée "drift" en refrain
    if (!s.dead && s.grounded && (chorus || intensity > 0.85)) {
      const surf = s.grav < 0 ? lane.lo : lane.hi;
      const dir = s.grav < 0 ? 1 : -1;
      this.particles.emit(s.px - 0.6, surf + dir * 0.08, -3 - Math.random() * 3, dir * (0.4 + Math.random()), 0.6, 0.12, css(pal.neonA, 0.35), true, 0.7, 'smoke');
    }
    // étincelles sur chaque temps du refrain
    const beatIdx = Math.floor(beatF);
    if (beatIdx !== this.lastBeat) {
      this.lastBeat = beatIdx;
      if (chorus && !s.dead) for (let i = 0; i < 3; i++) this.particles.emit(s.px + (Math.random() - 0.3) * 2, s.py + (Math.random() - 0.5) * 2, -6 - Math.random() * 4, (Math.random() - 0.5) * 3, 0.45, 0.16, css(pal.neonB, 0.9), true, 0, 'star');
    }
    this.drawParticles();
    if (!s.dead) this.drawCar(s, pal, chorus || !!loop, lane.lo, lane.hi);
    ctx.restore();

    this.drawRain(s.dt, this.low ? intensity * 0.3 : intensity);

    // lignes de vitesse en refrain / looping, bandeau DRIFT à l'entrée d'un refrain
    const targetSpeed = loop ? 1 : chorus && !s.dead ? 0.55 + 0.45 * pulse : 0;
    this.speedStrength += (targetSpeed - this.speedStrength) * Math.min(1, s.dt * 6);
    v.ext = 20;
    if (!this.low) this.speedLines.draw(ctx, v, s.dt, this.speedStrength);
    if (chorus && section && !s.dead) drawDriftBanner(ctx, v, (t - section.start) / ((240 / music.bpm) * 1.5), pal);

    // flash plein écran sur les temps forts du refrain / à la mort
    if (chorus && barPulse > 0.05) {
      ctx.fillStyle = css(pal.neonA, 0.07 * barPulse);
      ctx.fillRect(-20, -20, this.w + 40, this.h + 40);
    }
    if (this.hitFlash > 0) {
      this.hitFlash = Math.max(0, this.hitFlash - s.dt * 4);
      ctx.fillStyle = `rgba(255,30,70,${0.22 * this.hitFlash})`;
      ctx.fillRect(-20, -20, this.w + 40, this.h + 40);
    }
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - s.dt * 3);
      ctx.fillStyle = `rgba(255,255,255,${0.35 * this.flash})`;
      ctx.fillRect(-20, -20, this.w + 40, this.h + 40);
    }

    if (s.debug) this.drawDebug(s);
  }

  // ---------- couches ----------
  private paletteAt(sections: Section[], t: number): { pal: Palette; section: Section | undefined } {
    const i = sections.findIndex((x) => t < x.end);
    const sec = sections[i < 0 ? sections.length - 1 : i];
    if (!sec) return { pal: PALETTES.intro, section: undefined };
    const next = sections[i + 1];
    const k = next ? Math.max(0, Math.min(1, (t - (sec.end - 0.8)) / 0.8)) : 0;
    return { pal: k > 0 && next ? mixPalette(PALETTES[sec.type], PALETTES[next.type], k) : PALETTES[sec.type], section: sec };
  }

  private drawStrip(strip: HTMLCanvasElement, offsetPx: number, baseY: number, alpha: number): void {
    const ctx = this.ctx;
    const sw = strip.width / this.stripDpr;
    const sh = strip.height / this.stripDpr;
    let x = -(offsetPx % sw);
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * alpha;
    for (; x < this.w; x += sw) ctx.drawImage(strip, x, baseY - sh, sw, sh);
    ctx.globalAlpha = prev;
  }

  private drawDeck(y0: number, y1: number, pal: Palette, top: boolean, pulse: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(10,6,28,0.92)';
    ctx.fillRect(-this.ext, y0, this.w + 2 * this.ext, y1 - y0);
    // grille synthwave en perspective : lignes qui divergent vers l'extérieur
    const edge = top ? y1 : y0;
    const outer = top ? y0 : y1;
    const cx = this.w * 0.5;
    ctx.strokeStyle = css(pal.neonB, 0.22 + 0.25 * pulse);
    ctx.lineWidth = 1;
    ctx.beginPath();
    const spacing = 2;
    const first = Math.floor(this.camX / spacing) * spacing;
    for (let x = first - Math.ceil(this.ext / this.scale / spacing) * spacing; x < this.camX + (this.w + this.ext) / this.scale + spacing * 4; x += spacing) {
      const a = this.sx(x);
      ctx.moveTo(a, edge);
      ctx.lineTo(cx + (a - cx) * 1.6, outer);
    }
    for (let k = 1; k <= 3; k++) {
      const y = edge + (outer - edge) * (k * k) / 10;
      ctx.moveTo(-this.ext, y);
      ctx.lineTo(this.w + this.ext, y);
    }
    ctx.stroke();
  }

  private drawTrails(s: FrameState, yc: number, yf: number, deck: number): void {
    const ctx = this.ctx;
    const span = this.w / this.scale + 10;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const tr of this.trails) {
      tr.x -= tr.v * s.dt * (s.dead ? 0.2 : 1);
      // position relative à la caméra, bouclée
      let rel = (((tr.x - this.camX * 0.6) % span) + span) % span;
      rel -= 4;
      const x = rel * this.scale;
      const y = tr.deck ? yc - deck * (0.25 + tr.lane * 0.5) : yf + deck * (0.25 + tr.lane * 0.5);
      const len = tr.len * this.scale;
      ctx.strokeStyle = tr.red ? 'rgba(255,40,70,0.55)' : 'rgba(255,240,210,0.5)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  private glowLine(x0: number, y0: number, x1: number, y1: number, c: RGB, k: number): void {
    const ctx = this.ctx;
    ctx.lineCap = 'round';
    const passes: [number, number][] = [
      [10 * k, 0.08],
      [5 * k, 0.18],
      [2, 0.95],
    ];
    for (const [w, a] of passes) {
      ctx.strokeStyle = css(c, a);
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  }

  private visibleRange(): [number, number] {
    return [this.camX - 2 - this.ext / this.scale, this.camX + (this.w + this.ext) / this.scale + 2];
  }

  private drawObstacles(obs: Obstacle[], pal: Palette, pulse: number): void {
    const ctx = this.ctx;
    const [vx0, vx1] = this.visibleRange();
    // recherche binaire du premier obstacle visible
    let lo = 0;
    let hi = obs.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (obs[m].x1 < vx0) lo = m + 1;
      else hi = m;
    }
    for (let i = lo; i < obs.length && obs[i].x0 < vx1; i++) {
      const o = obs[i];
      if (o.x1 < vx0) continue;
      const floor = o.side === 'floor';
      const base = this.sy(o.surface);
      const tip = this.sy(floor ? o.surface + o.height : o.surface - o.height);
      const x0 = this.sx(o.x0);
      const x1 = this.sx(o.x1);
      const col = brighten(floor ? pal.neonA : pal.neonB, 0.3 * pulse);
      ctx.beginPath();
      if (o.kind === 'spike') {
        const n = Math.max(1, Math.round((o.x1 - o.x0) / 0.75));
        const w = (x1 - x0) / n;
        ctx.moveTo(x0, base);
        for (let k = 0; k < n; k++) {
          ctx.lineTo(x0 + w * (k + 0.5), tip);
          ctx.lineTo(x0 + w * (k + 1), base);
        }
        ctx.closePath();
      } else {
        ctx.rect(x0, Math.min(base, tip), x1 - x0, Math.abs(base - tip));
      }
      ctx.fillStyle = 'rgba(18,8,40,0.95)';
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = css(col, 0.18);
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.strokeStyle = css(col, 1);
      ctx.lineWidth = 2;
      ctx.stroke();
      if (o.kind === 'block') {
        // hachures d'avertissement
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0, Math.min(base, tip), x1 - x0, Math.abs(base - tip));
        ctx.clip();
        ctx.strokeStyle = css(col, 0.35);
        ctx.lineWidth = 3;
        ctx.beginPath();
        const hgt = Math.abs(base - tip);
        for (let x = x0 - hgt; x < x1; x += 14) {
          ctx.moveTo(x, Math.max(base, tip));
          ctx.lineTo(x + hgt, Math.min(base, tip));
        }
        ctx.stroke();
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /** Poutres néon : faces lumineuses, tranche avant signalée (c'est un mur). */
  private drawPlatforms(pls: Platform[], pal: Palette, pulse: number): void {
    const ctx = this.ctx;
    const [vx0, vx1] = this.visibleRange();
    for (const p of pls) {
      if (p.x1 < vx0 || p.x0 > vx1) continue;
      const x0 = this.sx(p.x0);
      const x1 = this.sx(p.x1);
      const yt = this.sy(p.y1);
      const yb = this.sy(p.y0);
      ctx.fillStyle = 'rgba(16,9,38,0.97)';
      ctx.fillRect(x0, yt, x1 - x0, yb - yt);
      // feux de balisage le long de la poutre, pulsés sur le beat
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = css(brighten(pal.neonB, 0.3), 0.35 + 0.5 * pulse);
      const step = this.scale * 1.5;
      const r = Math.max(1.5, this.scale * 0.06);
      for (let x = x0 + step / 2; x < x1; x += step) ctx.fillRect(x - r, (yt + yb) / 2 - r, 2 * r, 2 * r);
      this.glowLine(x0, yt, x1, yt, brighten(pal.neonA, 0.2 * pulse), 0.8);
      this.glowLine(x0, yb, x1, yb, brighten(pal.neonB, 0.2 * pulse), 0.8);
      // tranche avant : bande d'avertissement
      ctx.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, yt, Math.min(this.scale * 0.6, x1 - x0), yb - yt);
      ctx.clip();
      ctx.fillStyle = '#ff8a2a';
      ctx.fillRect(x0, yt, this.scale * 0.6, yb - yt);
      ctx.strokeStyle = '#1a0a20';
      ctx.lineWidth = Math.max(2, this.scale * 0.12);
      ctx.beginPath();
      for (let y = yt - this.scale; y < yb + this.scale; y += this.scale * 0.35) {
        ctx.moveTo(x0, y);
        ctx.lineTo(x0 + this.scale, y + this.scale * 0.6);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawFlipMarkers(level: Level, t: number, pal: Palette): void {
    const ctx = this.ctx;
    const [vx0, vx1] = this.visibleRange();
    ctx.globalCompositeOperation = 'lighter';
    for (const f of level.flips) {
      if (f.time < t - 0.3) continue;
      const x = level.timeline.x(f.time);
      if (x > vx1) break;
      if (x < vx0) continue;
      const toCeil = f.to === 'ceil';
      const sx = this.sx(x);
      const near = Math.max(0, 1 - Math.abs(f.time - t) / 1.2);
      const a = 0.12 + 0.35 * near;
      const c = toCeil ? pal.neonB : pal.neonA;
      // chevron sur la surface à quitter, pointant vers la destination
      const ys = this.sy(toCeil ? f.lo : f.hi);
      const d = toCeil ? -1 : 1;
      const s = this.scale * 0.32;
      ctx.strokeStyle = css(c, a + 0.2);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx - s, ys + d * s * 0.4);
      ctx.lineTo(sx, ys + d * s * 1.3);
      ctx.lineTo(sx + s, ys + d * s * 0.4);
      ctx.stroke();
      ctx.strokeStyle = css(c, a * 0.5);
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(sx, this.sy(f.lo));
      ctx.lineTo(sx, this.sy(f.hi));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawParticles(): void {
    const ctx = this.ctx;
    for (const p of this.particles.items) {
      if (p.life <= 0) continue;
      const a = p.life / p.max;
      ctx.globalCompositeOperation = p.additive ? 'lighter' : 'source-over';
      ctx.globalAlpha = a;
      const sprite = this.low && p.tex === 'smoke' ? null : this.fx.get(p.tex, p.color);
      if (sprite) {
        // texture : le halo s'étale au-delà du cœur de la particule
        const r = p.size * this.scale * (p.tex === 'smoke' ? 3 : 2.6);
        ctx.drawImage(sprite, this.sx(p.x) - r, this.sy(p.y) - r, r * 2, r * 2);
      } else {
        // secours procédural tant que l'atlas n'est pas chargé
        ctx.fillStyle = p.color;
        const r = p.size * this.scale;
        ctx.fillRect(this.sx(p.x) - r, this.sy(p.y) - r, r * 2, r * 2);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Transformation commune voiture / fantômes : y vers le haut, retournement progressif pendant le flip. */
  private carTransform(px: number, py: number, grav: number, grounded: boolean, drift: boolean, lo: number, hi: number): void {
    const ctx = this.ctx;
    const HALF = CONFIG.player.size / 2;
    const k = (py - lo - HALF) / Math.max(0.01, hi - lo - 2 * HALF);
    const flipY = Math.cos(Math.PI * Math.max(0, Math.min(1, k)));
    ctx.translate(this.sx(px), this.sy(py));
    ctx.scale(this.scale, -this.scale);
    ctx.rotate((drift ? 0.1 : 0.03) * (grav < 0 ? 1 : -1) * (grounded ? 1 : 0.3));
    ctx.scale(1, flipY >= 0 ? Math.max(flipY, 0.12) : Math.min(flipY, -0.12));
    ctx.translate(0, -HALF);
  }

  /** Voiture (render/car.ts) précédée d'une traînée fantôme pendant les flips. */
  private drawCar(s: FrameState, pal: Palette, drift: boolean, lo: number, hi: number): void {
    const ctx = this.ctx;
    // fantômes : positions récentes en l'air
    if (!s.grounded && !this.low) this.ghosts.push({ x: s.px, y: s.py, grav: s.grav, lo, hi });
    else this.ghosts.length = 0;
    if (this.ghosts.length > 5) this.ghosts.shift();
    ctx.globalCompositeOperation = 'lighter';
    this.ghosts.forEach((g, i) => {
      ctx.save();
      this.carTransform(g.x, g.y, g.grav, false, drift, g.lo, g.hi);
      carGhost(ctx, css(pal.neonB, 0.06 + 0.04 * i));
      ctx.restore();
    });
    ctx.globalCompositeOperation = 'source-over';

    ctx.save();
    if (s.invuln) ctx.globalAlpha = Math.floor(performance.now() / 70) % 2 ? 0.25 : 0.9;
    this.carTransform(s.px, s.py, s.grav, s.grounded, drift, lo, hi);
    drawCarBody(ctx, { pal, distance: s.px, boost: drift, px: 1 / this.scale });
    ctx.restore();
  }

  private drawRain(dt: number, intensity: number): void {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(170,200,255,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const n = Math.round(this.drops.length * (0.5 + 0.5 * intensity));
    for (let i = 0; i < n; i++) {
      const d = this.drops[i];
      d.y += d.v * dt * 1.4;
      d.x -= d.v * dt * 0.35;
      if (d.y > 1) {
        d.y -= 1;
        d.x = Math.random() * 1.2;
      }
      if (d.x < -0.1) d.x += 1.2;
      const x = d.x * this.w;
      const y = d.y * this.h;
      ctx.moveTo(x, y);
      ctx.lineTo(x - d.len * this.h * 0.25, y + d.len * this.h);
    }
    ctx.stroke();
  }

  private drawDebug(s: FrameState): void {
    const ctx = this.ctx;
    const hb = CONFIG.player.hitbox / 2;
    ctx.strokeStyle = '#0f0';
    ctx.lineWidth = 1;
    ctx.strokeRect(this.sx(s.px - hb), this.sy(s.py + hb), hb * 2 * this.scale, hb * 2 * this.scale);
    const [vx0, vx1] = this.visibleRange();
    ctx.strokeStyle = '#ff0';
    for (const o of s.level.obstacles) {
      if (o.hx1 < vx0 || o.hx0 > vx1) continue;
      const y0 = o.side === 'floor' ? o.surface : o.surface - o.hh;
      ctx.strokeRect(this.sx(o.hx0), this.sy(y0 + o.hh), (o.hx1 - o.hx0) * this.scale, o.hh * this.scale);
    }
    ctx.fillStyle = '#0f0';
    ctx.font = '12px monospace';
    ctx.fillText(`${this.fps.toFixed(0)} fps  t=${s.t.toFixed(3)}  x=${s.px.toFixed(2)}  y=${s.py.toFixed(2)}`, 8, this.h - 10);
  }

  // ---------- décors pré-rendus ----------
  private stripDpr = 1;

  private buildBackdrops(): void {
    this.stripDpr = Math.min(this.dpr, 1.5);
    const height = Math.max(120, this.sy(0));
    const width = 1400;
    this.far = this.buildCity(width, height, 11, 0.3, 0.68, '#0b0b2a', 0.25);
    this.near = this.buildCity(width, height, 23, 0.2, 0.55, '#120c33', 0.5);
    this.signs = this.buildSigns(width, height, 31);
    this.sun = buildSun(Math.min(this.w, this.h) * 0.2, this.stripDpr);
    this.gantrySigns = buildGantries(this.scale, this.stripDpr);
  }

  private makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
    const c = document.createElement('canvas');
    c.width = Math.round(w * this.stripDpr);
    c.height = Math.round(h * this.stripDpr);
    const ctx = c.getContext('2d')!;
    ctx.scale(this.stripDpr, this.stripDpr);
    return [c, ctx];
  }

  private buildCity(w: number, h: number, seed: number, minH: number, maxH: number, color: string, windows: number): HTMLCanvasElement {
    const [c, ctx] = this.makeCanvas(w, h);
    const r = rng(seed);
    const winColors = ['rgba(41,230,255,', 'rgba(255,63,164,', 'rgba(255,170,60,', 'rgba(200,190,255,'];
    let x = 0;
    while (x < w) {
      const bw = 40 + r() * 110;
      const bh = h * (minH + r() * (maxH - minH));
      const bx = x;
      // dernier bâtiment raccourci pour que la bande boucle sans couture
      const ww = Math.min(bw, w - bx);
      ctx.fillStyle = color;
      ctx.fillRect(bx, h - bh, ww, bh);
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(bx, h - bh, 2, bh);
      const wc = winColors[Math.floor(r() * winColors.length)];
      for (let wy = h - bh + 8; wy < h - 6; wy += 9) {
        for (let wx = bx + 5; wx < bx + ww - 6; wx += 8) {
          if (r() < windows * 0.35) {
            ctx.fillStyle = wc + (0.25 + r() * 0.5) + ')';
            ctx.fillRect(wx, wy, 3, 4);
          }
        }
      }
      x += bw + 2 + r() * 10;
    }
    return c;
  }

  private buildSigns(w: number, h: number, seed: number): HTMLCanvasElement {
    const [c, ctx] = this.makeCanvas(w, h);
    const r = rng(seed);
    const cols = ['#ff3fa4', '#29e6ff', '#ff8a2a', '#b06bff', '#ff2848'];
    let x = 30;
    while (x < w - 60) {
      const text = SIGNS[Math.floor(r() * SIGNS.length)];
      const col = cols[Math.floor(r() * cols.length)];
      const size = 14 + r() * 10;
      const vertical = r() < 0.6;
      const chars = [...text];
      const bw = vertical ? size * 1.5 : size * chars.length + size;
      const bh = vertical ? size * chars.length * 1.15 + size * 0.6 : size * 1.7;
      const by = h * (0.25 + r() * 0.5) - bh;
      ctx.font = `${size}px "Dela Gothic One", "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = 6;
      ctx.strokeRect(x, by, bw, bh);
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, by, bw, bh);
      ctx.fillStyle = col;
      if (vertical) chars.forEach((ch, i) => ctx.fillText(ch, x + bw / 2, by + size * 0.9 + i * size * 1.15));
      else ctx.fillText(text, x + bw / 2, by + bh / 2);
      x += bw + 60 + r() * 160;
    }
    return c;
  }
}
