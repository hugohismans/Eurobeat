import { audioContext, click, heardTime } from '../audio/track';

const BPM = 120;
const COUNT_IN = 4;
const CLICKS = 20;

/**
 * Calibration de latence : le joueur tape sur des clics ; la médiane de l'écart
 * tap − clic entendu devient la latence appliquée aux deux sources.
 */
export class Calibration {
  private clicks: number[] = [];
  private deltas: number[] = [];
  private raf = 0;
  private running = false;
  result: number | null = null;

  constructor(
    root: HTMLElement,
    private readonly pulse: HTMLElement,
    private readonly status: HTMLElement,
    private readonly onResult: (ms: number | null) => void,
  ) {
    root.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      this.tap(e.timeStamp);
    });
    window.addEventListener('keydown', (e) => {
      if (this.running && e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        this.tap(e.timeStamp);
      }
    });
  }

  start(): void {
    const ctx = audioContext();
    this.stop();
    this.deltas = [];
    this.result = null;
    const t0 = ctx.currentTime + 0.6;
    this.clicks = Array.from({ length: CLICKS }, (_, i) => t0 + (i * 60) / BPM);
    this.clicks.forEach((t, i) => click(ctx, t, i % 4 === 0, 0.6));
    this.running = true;
    this.status.textContent = 'Écoute 4 clics, puis tape en rythme…';
    const frame = () => {
      this.raf = requestAnimationFrame(frame);
      const now = heardTime(ctx);
      const on = this.clicks.some((c) => now >= c && now < c + 0.09);
      this.pulse.classList.toggle('on', on);
      if (now > this.clicks[this.clicks.length - 1] + 0.6) this.finish();
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.running = false;
    this.pulse.classList.remove('on', 'tap');
  }

  private tap(timeStamp: number): void {
    if (!this.running) return;
    const ctx = audioContext();
    const age = Math.max(0, (performance.now() - timeStamp) / 1000);
    const t = heardTime(ctx) - (age < 1 ? age : 0);
    // clic le plus proche, hors décompte
    let best = -1;
    for (let i = COUNT_IN; i < this.clicks.length; i++) if (best < 0 || Math.abs(this.clicks[i] - t) < Math.abs(this.clicks[best] - t)) best = i;
    if (best < 0) return;
    const d = t - this.clicks[best];
    if (Math.abs(d) > 0.25) return;
    this.deltas.push(d * 1000);
    this.pulse.classList.add('tap');
    setTimeout(() => this.pulse.classList.remove('tap'), 80);
    this.status.textContent = `${this.deltas.length} taps · écart ${d >= 0 ? '+' : ''}${(d * 1000).toFixed(0)} ms`;
  }

  private finish(): void {
    this.stop();
    if (this.deltas.length < 6) {
      this.status.textContent = `Pas assez de taps (${this.deltas.length}). Recommence en tapant sur chaque clic.`;
      this.onResult(null);
      return;
    }
    const s = [...this.deltas].sort((a, b) => a - b);
    const med = s[s.length >> 1];
    const spread = s[Math.floor(s.length * 0.75)] - s[Math.floor(s.length * 0.25)];
    this.result = Math.round(med);
    this.status.textContent = `Latence mesurée : ${this.result} ms (dispersion ${spread.toFixed(0)} ms, ${s.length} taps).`;
    this.onResult(this.result);
  }
}
