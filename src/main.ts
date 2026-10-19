import './style.css';
import { analyzeBuffer, hashBytes, isCurrent, musicFromAnalysis } from './analysis/analyze';
import { deleteTrack, getTrack, listTracks, putTrack } from './analysis/cache';
import { AudioTrack, audioContext } from './audio/track';
import { CONFIG } from './config';
import { applyDifficulty, currentDifficulty, DIFFICULTIES, type Difficulty } from './game/difficulty';
import { Game, type EndInfo, type GameState } from './game/game';
import { generateLevel } from './game/generate';
import { sideAt, type Level } from './game/level';
import { Run } from './game/sim';
import { createTestLevel, TEST_TRACK_URL } from './game/testLevel';
import { Renderer } from './render/renderer';
import { Calibration } from './ui/calibrate';
import { bindInput } from './ui/input';
import { PrepScreen } from './ui/prep';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>('game');
const renderer = new Renderer(canvas);
/** niveau de la démo d'accueil */
let demoLevel: Level;
let testTrack: AudioTrack | null = null;
/** morceau en cours : piste de test ou fichier du joueur (passé par l'écran de préparation) */
let session: { kind: 'test' | 'file'; level: Level; track: AudioTrack } | null = null;
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
  // appliquée aux pistes au lancement (startGame / openFile)
  if (session) session.track.latencyMs = latencyMs;
  try {
    localStorage.setItem(CONFIG.storage.latencyKey, String(latencyMs));
  } catch {
    /* stockage indisponible : réglage de session uniquement */
  }
}
setLatency(latencyMs);
document.querySelectorAll<HTMLButtonElement>('[data-lat]').forEach((b) => b.addEventListener('click', () => setLatency(latencyMs + Number(b.dataset.lat))));

// difficulté : appliquée avant toute construction de niveau, mémorisée
const DIFF_KEY = 'gd.difficulty';
function setDifficulty(d: Difficulty): void {
  applyDifficulty(d);
  try {
    localStorage.setItem(DIFF_KEY, d);
  } catch {
    /* stockage indisponible */
  }
  document.querySelectorAll<HTMLButtonElement>('[data-diff]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.diff === d)));
  $('hud-difficulty').textContent = DIFFICULTIES[d].label.toUpperCase();
}
function loadDifficulty(): Difficulty {
  try {
    const d = localStorage.getItem(DIFF_KEY);
    if (d && d in DIFFICULTIES) return d as Difficulty;
  } catch {
    /* stockage indisponible */
  }
  return 'medium';
}
setDifficulty(loadDifficulty());
demoLevel = createTestLevel();
document.querySelectorAll<HTMLButtonElement>('[data-diff]').forEach((b) =>
  b.addEventListener('click', () => {
    setDifficulty(b.dataset.diff as Difficulty);
    demoLevel = createTestLevel();
    if (!game) startAttract();
  }),
);

const airFlip = $<HTMLInputElement>('opt-airflip');
airFlip.checked = CONFIG.physics.airFlip;
airFlip.addEventListener('change', () => {
  CONFIG.physics.airFlip = airFlip.checked;
  demoLevel = createTestLevel(); // les obstacles dépendent de ce réglage
});

// ---------- écrans ----------
const screens = ['menu', 'loading', 'prep', 'calibrate', 'pause', 'end'] as const;
type Screen = (typeof screens)[number] | null;
let screen: Screen = 'menu';
function show(next: Screen): void {
  screen = next;
  for (const s of screens) $(s).classList.toggle('hidden', s !== next);
  $('hud').classList.toggle('hidden', next !== null && next !== 'pause' && next !== 'end');
  if (next === 'menu') void renderRecent();
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
    `${st.offbeat} hors rythme · écart moyen ${avg} ms · ${DIFFICULTIES[currentDifficulty()].label}` +
    (e.practice ? ` · ${e.attempts} essais` : '');
  $('btn-switch').textContent = e.practice ? 'Mode normal' : 'Mode practice';
  show('end');
}

// ---------- démarrage ----------
function startGame(level: Level, track: AudioTrack, kind: 'test' | 'file', practice: boolean): void {
  audioContext(); // dans le geste utilisateur
  stopAttract();
  track.latencyMs = latencyMs;
  session = { kind, level, track };
  game?.destroy();
  game = new Game(level, track, renderer, { onHud, onEnd, onState });
  show(null);
  game.start(practice);
}

async function playTestTrack(practice: boolean): Promise<void> {
  const ctx = audioContext(); // dans le geste utilisateur
  try {
    if (!testTrack) {
      loading('Chargement de la piste de test…', 0.3);
      testTrack = await AudioTrack.fromUrl(ctx, TEST_TRACK_URL);
    }
  } catch (e) {
    show('menu');
    error(`Impossible de charger la piste : ${(e as Error).message}`);
    return;
  }
  startGame(createTestLevel(), testTrack, 'test', practice);
}

function toMenu(): void {
  game?.destroy();
  game = null;
  if (session?.kind === 'file' && prep.current) {
    // retour à la préparation du morceau
    renderer.particles.clear();
    show('prep');
    prep.open(prep.current);
  } else {
    show('menu');
  }
  session = null;
  startAttract();
}

// ---------- fichier audio : décodage, analyse (Worker), cache ----------
function loading(text: string, p: number): void {
  show('loading');
  $('loading-text').textContent = text;
  $('loading-bar').style.width = `${Math.round(p * 100)}%`;
}

async function openFile(file: File): Promise<void> {
  const ctx = audioContext();
  try {
    loading(`Lecture de ${file.name}…`, 0.05);
    const bytes = await file.arrayBuffer();
    const hash = await hashBytes(bytes);
    loading('Décodage…', 0.1);
    const track = await AudioTrack.fromArrayBuffer(ctx, bytes); // détache `bytes`
    let rec = await getTrack(hash);
    if (!rec || !isCurrent(rec.analysis)) {
      const analysis = await analyzeBuffer(track.buffer, (p) => loading('Analyse : tempo, premier temps fort, sections…', 0.15 + p * 0.85));
      rec = { hash, name: file.name, analysis, music: musicFromAnalysis(analysis), updatedAt: Date.now() };
      await putTrack(rec);
    }
    track.latencyMs = latencyMs;
    show('prep');
    prep.open({ name: rec.name, hash, track, analysis: rec.analysis, music: rec.music });
  } catch (e) {
    show('menu');
    error(`Fichier illisible (${(e as Error).message}). Formats conseillés : MP3, OGG, WAV.`);
  }
}

const prep = new PrepScreen({
  onPlay: (practice) => {
    const cur = prep.current!;
    loading('Génération du niveau…', 1);
    // laisser l'écran se peindre avant le calcul (≈ 200 ms)
    setTimeout(() => startGame(generateLevel(cur.music, cur.hash), cur.track, 'file', practice), 30);
  },
  onBack: () => show('menu'),
  onSave: (music) => {
    const cur = prep.current;
    if (cur) void putTrack({ hash: cur.hash, name: cur.name, analysis: cur.analysis, music, updatedAt: Date.now() });
  },
});

const fileInput = $<HTMLInputElement>('file-input');
fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0];
  fileInput.value = '';
  if (f) void openFile(f);
});

// glisser-déposer (PC)
window.addEventListener('dragover', (e) => {
  if (screen !== 'menu') return;
  e.preventDefault();
  document.body.classList.add('dragging');
});
window.addEventListener('dragleave', () => document.body.classList.remove('dragging'));
window.addEventListener('drop', (e) => {
  e.preventDefault();
  document.body.classList.remove('dragging');
  const f = e.dataTransfer?.files?.[0];
  if (f && screen === 'menu') void openFile(f);
});

async function renderRecent(): Promise<void> {
  const list = await listTracks();
  const ul = $('recent-list');
  ul.replaceChildren(
    ...list.map((r) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = r.name;
      const bpm = document.createElement('small');
      bpm.textContent = `${r.music.bpm} BPM`;
      const del = document.createElement('button');
      del.textContent = '✕';
      del.setAttribute('aria-label', `Oublier ${r.name}`);
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        await deleteTrack(r.hash);
        void renderRecent();
      });
      li.addEventListener('click', () => fileInput.click());
      li.append(name, bpm, del);
      return li;
    }),
  );
  $('recent').classList.toggle('hidden', list.length === 0);
}

// ---------- calibration ----------
const calibration = new Calibration($('calibrate'), $('calib-pulse'), $('calib-status'), (ms) => $('btn-calib-apply').classList.toggle('hidden', ms === null));
$('btn-calibrate').addEventListener('click', () => {
  $('calib-status').textContent = '';
  $('btn-calib-apply').classList.add('hidden');
  show('calibrate');
});
$('btn-calib-start').addEventListener('click', () => calibration.start());
$('btn-calib-apply').addEventListener('click', () => {
  if (calibration.result !== null) setLatency(calibration.result);
  show('menu');
});
$('btn-calib-back').addEventListener('click', () => {
  calibration.stop();
  show('menu');
});

$('btn-play').addEventListener('click', () => void playTestTrack(false));
$('btn-practice').addEventListener('click', () => void playTestTrack(true));
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
  stopAttract();
  const level = demoLevel;
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
  Object.assign(window, { __gd: { get level() { return session?.level; }, get game() { return game; }, get track() { return session?.track; }, prep } });
}
