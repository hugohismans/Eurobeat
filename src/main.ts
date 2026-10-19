import './style.css';
import { AudioTrack, audioContext } from './audio/track';
import { CONFIG } from './config';
import { Game, type EndInfo, type GameState } from './game/game';
import { sideAt, type Level } from './game/level';
import { Run } from './game/sim';
import { createTestLevel, TEST_TRACK_URL } from './game/testLevel';
import { Renderer } from './render/renderer';
import { bindInput } from './ui/input';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>('game');
const renderer = new Renderer(canvas);
let level: Level = createTestLevel();
let track: AudioTrack | null = null;
let game: Game | null = null;
let attractRaf = 0;

// ---------- réglages persistants ----------
function loadLatency(): number {
  try {
    return Number(localStorage.getItem(CONFIG.storage.latencyKey)) || 0;
  } catch {
    return 0;
  }
}
let latencyMs = loadLatency();
function setLatency(v: number): void {
  latencyMs = Math.max(-300, Math.min(500, v));
  $('latency').textContent = `${latencyMs} ms`;
  if (track) track.latencyMs = latencyMs;
  try {
    localStorage.setItem(CONFIG.storage.latencyKey, String(latencyMs));
  } catch {
    /* stockage indisponible : réglage de session uniquement */
  }
}
setLatency(latencyMs);
document.querySelectorAll<HTMLButtonElement>('[data-lat]').forEach((b) => b.addEventListener('click', () => setLatency(latencyMs + Number(b.dataset.lat))));

const airFlip = $<HTMLInputElement>('opt-airflip');
airFlip.checked = CONFIG.physics.airFlip;
airFlip.addEventListener('change', () => {
  CONFIG.physics.airFlip = airFlip.checked;
  level = createTestLevel(); // les obstacles dépendent de ce réglage
});

// ---------- écrans ----------
const screens = ['menu', 'loading', 'pause', 'end'] as const;
type Screen = (typeof screens)[number] | null;
function show(screen: Screen): void {
  for (const s of screens) $(s).classList.toggle('hidden', s !== screen);
  $('hud').classList.toggle('hidden', screen === 'menu' || screen === 'loading');
}

function error(msg: string): void {
  const el = $('error');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 6000);
}

// ---------- HUD ----------
const hud = {
  bar: $('hud-progress-bar'),
  pct: $('hud-progress'),
  section: $('hud-section'),
  combo: $('hud-combo'),
  delta: $('hud-delta'),
  practice: $('hud-practice'),
};
const hudCache: Record<string, string> = {};
function setText(el: HTMLElement, key: string, v: string): void {
  if (hudCache[key] === v) return;
  hudCache[key] = v;
  el.textContent = v;
}

function onHud(h: { progress: number; section: string; combo: number; lastDelta: number | null; practice: boolean; attempts: number }): void {
  const pct = Math.floor(h.progress * 100);
  setText(hud.pct, 'pct', `${pct} %`);
  if (hudCache.bar !== String(pct)) {
    hudCache.bar = String(pct);
    hud.bar.style.width = `${h.progress * 100}%`;
  }
  setText(hud.section, 'sec', h.section);
  setText(hud.combo, 'combo', h.combo >= 2 ? `${h.combo}×` : '');
  setText(hud.practice, 'prac', h.practice ? `PRACTICE · essai ${h.attempts}` : '');
  hud.practice.classList.toggle('hidden', !h.practice);
  let d = '';
  let cls = 'delta';
  if (h.lastDelta !== null) {
    const a = Math.abs(h.lastDelta);
    d = `${h.lastDelta > 0 ? '+' : h.lastDelta < 0 ? '−' : '±'}${a.toFixed(0)} ms`;
    cls += a <= CONFIG.timing.perfectMs ? ' perfect' : a <= CONFIG.timing.greatMs ? ' great' : ' off';
  }
  setText(hud.delta, 'delta', d);
  if (hud.delta.className !== cls) hud.delta.className = cls;
}

function onState(s: GameState): void {
  if (s === 'paused') show('pause');
  else if (s === 'playing') show(null);
}

function onEnd(e: EndInfo): void {
  const st = e.stats;
  $('end-title').textContent = e.finished ? (e.practice ? 'Practice terminé' : 'Fini !') : 'Crash';
  $('end-progress').textContent = `${Math.floor(e.progress * 100)} %`;
  $('end-accuracy').textContent = e.expectedFlips ? `${Math.round((st.great / e.expectedFlips) * 100)} %` : '–';
  $('end-combo').textContent = String(st.maxCombo);
  const avg = st.matched ? (st.sumAbsMs / st.matched).toFixed(0) : '–';
  $('end-detail').textContent =
    `${st.flips} flips · ${st.perfect} parfaits (±${CONFIG.timing.perfectMs} ms) · ${st.great} dans le temps (±${CONFIG.timing.greatMs} ms) · ` +
    `${st.offbeat} hors rythme · écart moyen ${avg} ms` +
    (e.practice ? ` · ${e.attempts} essais` : '');
  $('btn-switch').textContent = e.practice ? 'Mode normal' : 'Mode practice';
  show('end');
}

// ---------- démarrage ----------
async function startGame(practice: boolean): Promise<void> {
  const ctx = audioContext(); // dans le geste utilisateur
  stopAttract();
  try {
    if (!track) {
      show('loading');
      track = await AudioTrack.fromUrl(ctx, TEST_TRACK_URL);
      track.latencyMs = latencyMs;
    }
  } catch (e) {
    show('menu');
    startAttract();
    error(`Impossible de charger la piste : ${(e as Error).message}`);
    return;
  }
  game?.destroy();
  game = new Game(level, track, renderer, { onHud, onEnd, onState });
  show(null);
  game.start(practice);
}

function toMenu(): void {
  game?.destroy();
  game = null;
  show('menu');
  startAttract();
}

$('btn-play').addEventListener('click', () => void startGame(false));
$('btn-practice').addEventListener('click', () => void startGame(true));
$('btn-resume').addEventListener('click', () => game?.resume());
$('btn-restart').addEventListener('click', () => game?.restart());
$('btn-menu').addEventListener('click', toMenu);
$('btn-again').addEventListener('click', () => game?.restart());
$('btn-switch').addEventListener('click', () => game?.restart(!game.practice));
$('btn-end-menu').addEventListener('click', toMenu);
$('btn-pause').addEventListener('click', () => game?.pause());

bindInput($('stage'), {
  tap: (ts) => game?.tap(ts),
  pause: () => {
    if (!game) return;
    if (game.state === 'playing') game.pause();
    else if (game.state === 'paused') game.resume();
  },
  confirm: () => {
    if (!game) return;
    if (game.state === 'paused') game.resume();
    else if (!$('end').classList.contains('hidden')) game.restart();
  },
  toggleDebug: () => {
    if (game) game.debug = !game.debug;
  },
  isPlaying: () => game?.state === 'playing',
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) game?.pause();
});
window.addEventListener('resize', () => renderer.resize());

// ---------- écran d'accueil : démo jouée par le bot (sans audio) ----------
function startAttract(): void {
  const from = level.music.sections[1]?.start ?? 0;
  let run: Run | null = null;
  let t0 = 0;
  let last = performance.now();
  const frame = (now: number) => {
    attractRaf = requestAnimationFrame(frame);
    if (!run || run.finished || run.dead) {
      run = new Run(level, from, sideAt(level.flips, from));
      level.flips.forEach((f) => run!.input(f.time));
      t0 = now;
    }
    const t = from + (now - t0) / 1000;
    run.advanceTo(t);
    renderer.draw({ level, t: run.time, px: run.x, py: run.player.y, grav: run.player.grav, grounded: run.player.grounded, dead: false, dt: Math.min(0.1, (now - last) / 1000), debug: false });
    last = now;
  };
  attractRaf = requestAnimationFrame(frame);
}
function stopAttract(): void {
  cancelAnimationFrame(attractRaf);
}

show('menu');
startAttract();

// accès console / tests automatisés en dev uniquement
if (import.meta.env.DEV) {
  Object.assign(window, { __gd: { get level() { return level; }, get game() { return game; }, get track() { return track; } } });
}
