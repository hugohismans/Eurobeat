import type { MusicClock } from '../audio/track';
import { CONFIG } from '../config';
import { css, PALETTES } from '../render/palette';
import type { Renderer } from '../render/renderer';
import type { Level } from './level';
import { Run, type FlipEvent, type RunStats } from './sim';
import { SECTION_LABEL } from './types';

export type GameState = 'idle' | 'playing' | 'paused' | 'dead' | 'finished';

export interface EndInfo {
  finished: boolean;
  progress: number;
  stats: RunStats;
  expectedFlips: number;
  practice: boolean;
  attempts: number;
}

export interface GameHooks {
  onHud(h: { progress: number; section: string; combo: number; lastDelta: number | null; practice: boolean; attempts: number; health: number; hitFlash: boolean }): void;
  onEnd(info: EndInfo): void;
  onState(s: GameState): void;
}

/**
 * Orchestration : horloge musicale → simulation à pas fixe → rendu interpolé.
 * La simulation ne dépend que du temps morceau ; le framerate n'a aucun effet sur le feel.
 */
export class Game {
  state: GameState = 'idle';
  practice = false;
  debug = false;
  private run: Run | null = null;
  private attempts = 0;
  private lastFrame = 0;
  private lastDelta: number | null = null;
  private deathTimer = 0;
  private raf = 0;

  constructor(
    private readonly level: Level,
    private readonly clock: MusicClock,
    private readonly renderer: Renderer,
    private readonly hooks: GameHooks,
  ) {}

  start(practice: boolean): void {
    this.practice = practice;
    this.attempts = 0;
    this.spawn(0);
    this.loop();
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.deathTimer);
    this.clock.stop();
    this.raf = 0;
  }

  /** Tap (horodatage DOM de l'événement). */
  tap(eventTimeStamp: number): void {
    if (this.state !== 'playing' || !this.run) return;
    this.run.input(this.clock.at(eventTimeStamp));
  }

  pause(): void {
    if (this.state !== 'playing') return;
    this.clock.stop();
    this.setState('paused');
  }

  resume(): void {
    if (this.state !== 'paused' || !this.run) return;
    // reprise avec décompte : le son repart un peu avant, le perso reste figé jusque-là
    this.clock.playFrom(this.run.time - CONFIG.timing.leadIn);
    this.setState('playing');
  }

  restart(practice = this.practice): void {
    clearTimeout(this.deathTimer);
    this.practice = practice;
    this.attempts = 0;
    this.renderer.particles.clear();
    this.spawn(0);
  }

  private spawn(time: number): void {
    const cp = this.level.checkpoints.filter((c) => c.time <= time).at(-1);
    const t = cp ? cp.time : 0;
    const side = cp ? cp.side : 'floor';
    this.run = new Run(this.level, t, side, cp?.lo, cp?.hi);
    this.run.onFlip = (e) => this.onFlip(e);
    this.run.onHit = (x, y) => {
      this.renderer.hitFx(x, y);
      if (navigator.vibrate) navigator.vibrate(35);
    };
    this.attempts++;
    this.lastDelta = null;
    this.clock.playFrom(t - CONFIG.timing.leadIn);
    this.setState('playing');
  }

  private onFlip(e: FlipEvent): void {
    this.lastDelta = e.deltaMs;
    const x = this.level.timeline.x(e.time);
    const pal = PALETTES.chorus;
    this.renderer.flipFx(x, e.side === 'ceil', css(e.side === 'ceil' ? pal.neonB : pal.neonA, 0.9));
  }

  private setState(s: GameState): void {
    this.state = s;
    this.hooks.onState(s);
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = this.lastFrame ? Math.min(0.1, (now - this.lastFrame) / 1000) : 1 / 60;
    this.lastFrame = now;
    const run = this.run;
    if (!run) return;

    let target = run.time;
    if (this.state === 'playing') {
      target = this.clock.now();
      if (target - run.time > 0.25) {
        // l'horloge a sauté (audio interrompu, gros ralentissement) : plutôt que de téléporter
        // la voiture, on recale le son sur sa position, avec décompte
        this.clock.playFrom(run.time - CONFIG.timing.leadIn);
        target = run.time;
      }
      run.advanceTo(target, CONFIG.sim.maxStepsPerFrame);
      if (run.dead) this.onDeath(run);
      else if (run.finished) this.onFinish(run);
    }

    // interpolation : on rend un pas derrière la simulation
    const step = run.dt;
    let rt = Math.max(run.time - step, Math.min(run.time, target - step));
    const alpha = (rt - (run.time - step)) / step;
    let y = run.prevY + (run.player.y - run.prevY) * alpha;
    if (this.state === 'finished') {
      // tour d'honneur : la voiture continue sur la musique
      rt = this.clock.now();
      y = run.player.y;
    }
    const p = run.player;
    this.renderer.draw({
      level: this.level,
      t: rt,
      px: this.level.timeline.x(rt),
      py: run.dead ? p.y : y,
      grav: p.grav,
      grounded: p.grounded,
      dead: run.dead,
      dt,
      debug: this.debug,
      // clignotement pendant l'invulnérabilité qui suit un choc
      invuln: !run.dead && rt < run.invulnUntil,
    });

    if (this.state === 'playing' || this.state === 'paused') this.emitHud(run);
  };

  private progressOf(run: Run): number {
    const end = this.level.timeline.x(this.level.end);
    return Math.max(0, Math.min(1, run.x / end));
  }

  private emitHud(run: Run): void {
    const secs = this.level.music.sections;
    const sec = secs.find((s) => run.time < s.end) ?? secs.at(-1);
    this.hooks.onHud({
      progress: this.progressOf(run),
      section: sec ? SECTION_LABEL[sec.type] : '',
      combo: run.stats.combo,
      lastDelta: this.lastDelta,
      practice: this.practice,
      attempts: this.attempts,
      health: run.health,
      hitFlash: run.time < run.invulnUntil,
    });
  }

  private onDeath(run: Run): void {
    this.setState('dead');
    this.clock.stop();
    const pal = PALETTES.chorus;
    this.renderer.deathFx(run.x, run.player.y, [css(pal.neonA), css(pal.neonB), '#ffffff', '#ff8a2a']);
    if (navigator.vibrate) navigator.vibrate(60);
    if (this.practice) {
      this.deathTimer = window.setTimeout(() => {
        this.renderer.particles.clear();
        this.spawn(run.deathTime);
      }, CONFIG.practice.respawnDelayMs);
    } else {
      this.deathTimer = window.setTimeout(() => this.end(run, false), 550);
    }
  }

  private onFinish(run: Run): void {
    this.setState('finished');
    this.end(run, true);
  }

  private end(run: Run, finished: boolean): void {
    this.hooks.onEnd({
      finished,
      progress: finished ? 1 : this.progressOf(run),
      stats: run.stats,
      expectedFlips: this.level.flips.filter((f) => f.time <= run.time).length,
      practice: this.practice,
      attempts: this.attempts,
    });
  }
}
