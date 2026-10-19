/** Horloge musicale commune aux deux sources (fichier : Web Audio, plus tard : YouTube). */
export interface MusicClock {
  /** Temps morceau entendu (s), corrigé de la latence. */
  now(): number;
  /** Temps morceau correspondant à un horodatage d'événement DOM. */
  at(eventTimeStamp: number): number;
  /** Démarre la lecture à la position songTime (peut être négative : silence avant le début). */
  playFrom(songTime: number): void;
  stop(): void;
  latencyMs: number;
}

let sharedCtx: AudioContext | null = null;

/** Temps contexte actuellement entendu (corrigé de la latence de sortie quand le navigateur la connaît). */
export function heardTime(ctx: AudioContext): number {
  const ts = ctx.getOutputTimestamp?.();
  if (ts && ts.contextTime && ts.performanceTime) {
    return ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
  }
  return ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
}

/** Clic de métronome programmé au temps contexte `when`. */
export function click(ctx: AudioContext, when: number, accent: boolean, gain = 0.5): void {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.frequency.value = accent ? 1760 : 1100;
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(gain, when + 0.002);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
  osc.connect(g).connect(ctx.destination);
  osc.start(when);
  osc.stop(when + 0.06);
}

/** À appeler dans un geste utilisateur (exigence mobile). */
export function audioContext(): AudioContext {
  if (!sharedCtx) {
    // iOS : sortir du canal "sonnerie" pour ne pas être coupé par le mode silencieux
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) nav.audioSession.type = 'playback';
    sharedCtx = new AudioContext({ latencyHint: 'interactive' });
  }
  if (sharedCtx.state !== 'running') void sharedCtx.resume();
  return sharedCtx;
}

export class AudioTrack implements MusicClock {
  latencyMs = 0;
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode;
  /** temps contexte (entendu) correspondant au temps morceau 0 */
  private origin = 0;
  private last = -Infinity;
  private playing = false;
  private frozenAt = 0;

  constructor(
    private readonly ctx: AudioContext,
    readonly buffer: AudioBuffer,
  ) {
    this.gain = ctx.createGain();
    this.gain.connect(ctx.destination);
  }

  static async fromUrl(ctx: AudioContext, url: string): Promise<AudioTrack> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`audio ${url}: ${res.status}`);
    return AudioTrack.fromArrayBuffer(ctx, await res.arrayBuffer());
  }

  static async fromArrayBuffer(ctx: AudioContext, data: ArrayBuffer): Promise<AudioTrack> {
    return new AudioTrack(ctx, await ctx.decodeAudioData(data));
  }

  get duration(): number {
    return this.buffer.duration;
  }

  private heard(): number {
    return heardTime(this.ctx);
  }

  get context(): AudioContext {
    return this.ctx;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /** Temps contexte (repère currentTime) où le temps morceau `songTime` sera joué : pour programmer des sons. */
  ctxTimeOf(songTime: number): number {
    return this.origin + songTime;
  }

  now(): number {
    if (!this.playing) return this.frozenAt;
    const t = this.heard() - this.origin - this.latencyMs / 1000;
    // getOutputTimestamp peut reculer légèrement : on garde une horloge monotone
    if (t < this.last) return this.last;
    this.last = t;
    return t;
  }

  at(eventTimeStamp: number): number {
    const age = (performance.now() - eventTimeStamp) / 1000;
    return this.now() - (age >= 0 && age < 1 ? age : 0);
  }

  playFrom(songTime: number): void {
    this.stop();
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.gain);
    this.gain.gain.cancelScheduledValues(ctx.currentTime);
    this.gain.gain.setValueAtTime(1, ctx.currentTime);
    const start = ctx.currentTime + 0.03;
    if (songTime >= 0) src.start(start, songTime);
    else src.start(start - songTime, 0);
    // heard() est dans le repère contexte : l'échantillon songTime sera entendu quand heard() = start
    this.origin = start - songTime;
    this.source = src;
    this.playing = true;
    this.last = -Infinity;
  }

  /** Fondu de sortie (mort). */
  fadeOut(seconds = 0.25): void {
    const g = this.gain.gain;
    g.cancelScheduledValues(this.ctx.currentTime);
    g.setValueAtTime(g.value, this.ctx.currentTime);
    g.linearRampToValueAtTime(0, this.ctx.currentTime + seconds);
  }

  stop(): void {
    if (this.playing) this.frozenAt = this.now();
    this.playing = false;
    if (this.source) {
      try {
        this.source.stop();
      } catch {
        /* déjà arrêtée */
      }
      this.source.disconnect();
      this.source = null;
    }
  }
}
