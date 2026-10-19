import { click, type AudioTrack } from '../audio/track';
import { musicFromAnalysis } from '../analysis/analyze';
import type { Analysis } from '../analysis/dsp';
import { CONFIG } from '../config';
import { currentDifficulty } from '../game/difficulty';
import { generateLevel, levelStats } from '../game/generate';
import type { Level } from '../game/level';
import type { MusicInfo } from '../game/types';
import { TimelineView } from './timeline';

export interface PrepTrack {
  name: string;
  hash: string;
  track: AudioTrack;
  analysis: Analysis;
  music: MusicInfo;
}

export interface PrepHooks {
  onPlay(practice: boolean): void;
  onBack(): void;
  onSave(music: MusicInfo): void;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** Écran de préparation : tempo, premier temps fort, sections, écoute au métronome. */
export class PrepScreen {
  private cur: PrepTrack | null = null;
  private timeline: TimelineView;
  private taps: number[] = [];
  private scheduler = 0;
  private raf = 0;
  private nextBeat = 0;
  private saveTimer = 0;
  private statsTimer = 0;
  private levelCache: { key: string; level: Level } | null = null;
  private readonly dots = [...document.querySelectorAll<HTMLElement>('.beat-dots i')];
  private readonly bpmInput = $<HTMLInputElement>('bpm-input');

  constructor(private readonly hooks: PrepHooks) {
    this.timeline = new TimelineView($<HTMLCanvasElement>('timeline'), () => this.music, { times: [], values: [] }, (m) => this.update(m));

    document.querySelectorAll<HTMLButtonElement>('[data-bpm]').forEach((b) =>
      b.addEventListener('click', () => {
        const v = b.dataset.bpm!;
        const bpm = v === 'half' ? this.music.bpm / 2 : v === 'double' ? this.music.bpm * 2 : this.music.bpm + Number(v);
        this.setBpm(bpm);
      }),
    );
    this.bpmInput.addEventListener('change', () => this.setBpm(Number(this.bpmInput.value)));
    document.querySelectorAll<HTMLButtonElement>('[data-off]').forEach((b) =>
      b.addEventListener('click', () => {
        const v = b.dataset.off!;
        const beat = 60000 / this.music.bpm;
        let off = this.music.offset + (v === 'beat' ? beat : v === '-beat' ? -beat : Number(v));
        if (off < 0) off += 4 * beat;
        this.update({ ...this.music, offset: Math.round(off) });
      }),
    );
    $('btn-tap').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.tapTempo(e.timeStamp);
    });
    $('btn-preview').addEventListener('click', () => (this.previewing ? this.stopPreview() : this.preview(0)));
    $('btn-preview-chorus').addEventListener('click', () => {
      const ch = this.music.sections.find((s) => s.type === 'chorus');
      this.preview(Math.max(0, (ch?.start ?? 0) - 1));
    });
    $('btn-reset').addEventListener('click', () => this.cur && this.update(musicFromAnalysis(this.cur.analysis)));
    $('btn-prep-play').addEventListener('click', () => this.play(false));
    $('btn-prep-practice').addEventListener('click', () => this.play(true));
    $('btn-export').addEventListener('click', () => this.exportJson());
    $('btn-prep-back').addEventListener('click', () => {
      this.close();
      this.hooks.onBack();
    });
    new ResizeObserver(() => this.timeline.draw()).observe($('timeline'));
  }

  get music(): MusicInfo {
    return this.cur!.music;
  }

  get current(): PrepTrack | null {
    return this.cur;
  }

  open(t: PrepTrack): void {
    this.cur = t;
    this.taps = [];
    $('prep-title').textContent = t.name;
    const conf = t.analysis.confidence;
    const badge = $('prep-confidence');
    badge.textContent = conf >= 2 ? 'détection fiable' : 'à vérifier';
    badge.className = `badge ${conf >= 2 ? 'ok' : 'warn'}`;
    this.timeline.setEnergy({ times: t.analysis.barTimes, values: t.analysis.barEnergy });
    this.levelCache = null;
    this.render();
    this.refreshStats();
    requestAnimationFrame(() => this.timeline.draw());
  }

  close(): void {
    this.stopPreview();
  }

  private play(practice: boolean): void {
    this.stopPreview();
    this.hooks.onPlay(practice);
  }

  private setBpm(bpm: number): void {
    if (!Number.isFinite(bpm)) return this.render();
    this.update({ ...this.music, bpm: Math.round(Math.max(40, Math.min(300, bpm)) * 100) / 100 });
  }

  private update(m: MusicInfo): void {
    if (!this.cur) return;
    this.cur.music = m;
    this.nextBeat = this.beatIndexAt(this.cur.track.now());
    this.render();
    this.refreshStats();
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.hooks.onSave(m), 300);
  }

  private render(): void {
    const m = this.music;
    const a = this.cur!.analysis;
    if (document.activeElement !== this.bpmInput) this.bpmInput.value = m.bpm.toFixed(2);
    $('offset-value').textContent = `${m.offset} ms`;
    const mins = Math.floor(m.duration / 60);
    const secs = Math.round(m.duration % 60).toString().padStart(2, '0');
    const edited = m.bpm !== a.bpm || m.offset !== a.offset ? ` · détecté : ${a.bpm} BPM, ${a.offset} ms` : '';
    $('prep-meta').textContent = `${mins}:${secs} · ${m.sections.length} sections${edited}`;
    this.timeline.draw();
  }

  // ---------- niveau généré : réutilisé au lancement tant que rien ne change ----------
  levelFor(): Level {
    const t = this.cur!;
    const key = JSON.stringify([t.music, currentDifficulty(), CONFIG.physics.airFlip]);
    if (this.levelCache?.key !== key) this.levelCache = { key, level: generateLevel(t.music, t.hash) };
    return this.levelCache.level;
  }

  /** Statistiques du niveau, recalculées après une pause dans les réglages. */
  refreshStats(): void {
    if (!this.cur) return;
    const el = $('prep-level');
    el.textContent = 'Génération du niveau…';
    clearTimeout(this.statsTimer);
    this.statsTimer = window.setTimeout(() => {
      if (!this.cur) return;
      const s = levelStats(this.levelFor());
      const extras = [s.platforms && `${s.platforms} plateforme${s.platforms > 1 ? 's' : ''}`, s.loops && `${s.loops} looping${s.loops > 1 ? 's' : ''}`].filter(Boolean);
      el.innerHTML = '';
      const stars = document.createElement('b');
      stars.textContent = '★'.repeat(s.stars) + '☆'.repeat(5 - s.stars);
      el.append(`${s.flips} flips · ${s.density} / min${extras.length ? ' · ' + extras.join(' · ') : ''} · `, stars);
    }, 250);
  }

  // ---------- tap tempo ----------
  private tapTempo(ts: number): void {
    if (this.taps.length && ts - this.taps[this.taps.length - 1] > 2000) this.taps = [];
    this.taps.push(ts);
    if (this.taps.length > 12) this.taps.shift();
    const n = this.taps.length;
    const info = $('tap-info');
    if (n < 4) {
      info.textContent = `· ${n}/4`;
      return;
    }
    const bpm = (60000 * (n - 1)) / (this.taps[n - 1] - this.taps[0]);
    info.textContent = `· ${bpm.toFixed(1)}`;
    this.setBpm(Math.round(bpm * 10) / 10);
  }

  // ---------- écoute avec métronome ----------
  private get previewing(): boolean {
    return this.scheduler !== 0;
  }

  private beatIndexAt(t: number): number {
    return Math.ceil(((t - this.music.offset / 1000) * this.music.bpm) / 60);
  }

  private preview(from: number): void {
    this.stopPreview();
    const track = this.cur!.track;
    track.playFrom(from);
    this.nextBeat = this.beatIndexAt(from);
    $('btn-preview').textContent = '■ Stop';
    // programmation des clics en avance (fenêtre glissante de 200 ms)
    this.scheduler = window.setInterval(() => {
      const now = track.now() + track.latencyMs / 1000;
      const beat = 60 / this.music.bpm;
      for (;;) {
        const t = this.music.offset / 1000 + this.nextBeat * beat;
        if (t > now + 0.2) break;
        if (t >= now - 0.02) click(track.context, track.ctxTimeOf(t), this.nextBeat % 4 === 0, 0.35);
        this.nextBeat++;
      }
      if (now > this.music.duration) this.stopPreview();
    }, 25);
    const frame = () => {
      this.raf = requestAnimationFrame(frame);
      const t = track.now() + track.latencyMs / 1000;
      const bf = ((t - this.music.offset / 1000) * this.music.bpm) / 60;
      const idx = Math.floor(bf);
      const flash = bf - idx < 0.25 && bf >= 0;
      this.dots.forEach((d, i) => d.classList.toggle('on', flash && ((idx % 4) + 4) % 4 === i));
      this.timeline.playhead = t;
      this.timeline.draw();
    };
    this.raf = requestAnimationFrame(frame);
  }

  private stopPreview(): void {
    if (this.scheduler) clearInterval(this.scheduler);
    this.scheduler = 0;
    cancelAnimationFrame(this.raf);
    this.cur?.track.stop();
    this.dots.forEach((d) => d.classList.remove('on'));
    $('btn-preview').textContent = '▶ Écouter avec le métronome';
    this.timeline.playhead = null;
    if (this.cur) this.timeline.draw();
  }

  // ---------- export ----------
  private exportJson(): void {
    const t = this.cur!;
    const data = { format: 'gravity-drift/track', version: 1, name: t.name, hash: t.hash, music: t.music };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${t.name.replace(/\.[^.]+$/, '').replace(/[^\w\-]+/g, '_')}.gd.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
}
