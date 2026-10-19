// Analyse hors ligne d'un morceau : onsets (flux spectral), tempo, premier temps fort, sections.
// Fonctions pures, sans DOM : tournent dans un Web Worker et sous Node (tests).

import type { Section, SectionType } from '../game/types';

export const FFT_SIZE = 1024;
export const HOP = 256;
/** nombre de bandes du profil spectral */
const TB = 32;
/** bandes < ~1.2 kHz, pour la détection du temps 1 */
const HARM = 20;

export interface Analysis {
  version: number;
  bpm: number;
  /** ms du premier temps fort */
  offset: number;
  duration: number;
  sections: Section[];
  /** pic / moyenne du score de tempo (≥ 1.5 : fiable) */
  confidence: number;
  /** énergie normalisée par mesure (0-1), pour l'affichage de la timeline */
  barEnergy: number[];
  /** temps de début de chaque mesure (s) */
  barTimes: number[];
}

/** Incrémenter quand l'analyse change : les résultats en cache sont alors recalculés. */
export const ANALYSIS_VERSION = 3;

/** Biais mesuré du détecteur (s) : le flux culmine un peu après l'attaque réelle. */
const ONSET_LATENCY = -0.012;

// ---------------------------------------------------------------- FFT

function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

// ---------------------------------------------------------------- features par trame

export interface Features {
  /** trames / s */
  fr: number;
  /** flux spectral total, basses (< 150 Hz), médiums (150 Hz – 3 kHz) */
  flux: Float32Array;
  lowFlux: Float32Array;
  midFlux: Float32Array;
  /** RMS temporel par trame */
  rms: Float32Array;
  /** énergie des basses par trame */
  low: Float32Array;
  /** spectre log compressé, 32 bandes log de 40 Hz à 8 kHz (harmonie + timbre) */
  tonal: Float32Array[];
}

export function extractFeatures(x: Float32Array, sr: number, progress?: (p: number) => void): Features {
  const n = Math.max(0, Math.floor((x.length - FFT_SIZE) / HOP) + 1);
  const win = new Float64Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FFT_SIZE);
  const half = FFT_SIZE / 2;
  const binHz = sr / FFT_SIZE;
  const lowEnd = Math.max(2, Math.round(150 / binHz));
  const midEnd = Math.round(3000 / binHz);
  // bandes tonales log-espacées
  const tonalEdges: number[] = [];
  for (let b = 0; b <= TB; b++) tonalEdges.push(Math.max(1, Math.round((40 * Math.pow(8000 / 40, b / TB)) / binHz)));

  const flux = new Float32Array(n);
  const lowFlux = new Float32Array(n);
  const midFlux = new Float32Array(n);
  const rms = new Float32Array(n);
  const low = new Float32Array(n);
  const tonal: Float32Array[] = [];
  const re = new Float64Array(FFT_SIZE);
  const im = new Float64Array(FFT_SIZE);
  let prev = new Float64Array(half);
  let cur = new Float64Array(half);

  for (let f = 0; f < n; f++) {
    const o = f * HOP;
    let e = 0;
    for (let i = 0; i < FFT_SIZE; i++) {
      const v = x[o + i];
      e += v * v;
      re[i] = v * win[i];
      im[i] = 0;
    }
    rms[f] = Math.sqrt(e / FFT_SIZE);
    fftInPlace(re, im);
    let fl = 0;
    let fll = 0;
    let flm = 0;
    let le = 0;
    for (let k = 1; k < half; k++) {
      const mag = Math.hypot(re[k], im[k]);
      const c = Math.log1p(100 * mag);
      cur[k] = c;
      const d = c - prev[k];
      if (d > 0) {
        fl += d;
        if (k < lowEnd) fll += d;
        else if (k < midEnd) flm += d;
      }
      if (k < lowEnd) le += mag * mag;
    }
    flux[f] = fl;
    lowFlux[f] = fll;
    midFlux[f] = flm;
    low[f] = le;
    const t = new Float32Array(TB);
    for (let b = 0; b < TB; b++) {
      let s = 0;
      const k1 = Math.max(tonalEdges[b] + 1, tonalEdges[b + 1]);
      for (let k = tonalEdges[b]; k < k1; k++) s += cur[k];
      t[b] = s / (k1 - tonalEdges[b]);
    }
    tonal.push(t);
    [prev, cur] = [cur, prev];
    if (progress && f % 2000 === 0) progress((f / n) * 0.6);
  }
  return { fr: sr / HOP, flux, lowFlux, midFlux, rms, low, tonal };
}

/** Enveloppe d'onsets : flux moins moyenne locale, redressé, légèrement lissé. */
export function onsetEnvelope(flux: Float32Array, fr: number): Float32Array {
  const n = flux.length;
  const w = Math.round(fr * 0.4);
  const out = new Float32Array(n);
  let acc = 0;
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + flux[i];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - w);
    const b = Math.min(n, i + w + 1);
    const mean = (pre[b] - pre[a]) / (b - a);
    out[i] = Math.max(0, flux[i] - mean);
  }
  // lissage [1 2 1]
  const sm = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    acc = (out[i - 1] ?? 0) + 2 * out[i] + (out[i + 1] ?? 0);
    sm[i] = acc / 4;
  }
  return sm;
}

function sampleAt(a: Float32Array | Float64Array, x: number): number {
  const i = Math.floor(x);
  if (i < 0 || i + 1 >= a.length) return 0;
  const f = x - i;
  return a[i] * (1 - f) + a[i + 1] * f;
}

// ---------------------------------------------------------------- tempo

export interface TempoResult {
  bpm: number;
  /** phase du premier temps de la grille (trames) */
  phase: number;
  confidence: number;
}

/** Tempo constant (musique électronique) : autocorrélation puis alignement de grille fin. */
export function estimateTempo(o: Float32Array, fr: number, minBpm = 120, maxBpm = 180): TempoResult {
  const n = o.length;
  const maxLag = Math.ceil(((60 * fr) / minBpm) * 4) + 2;
  const acf = new Float64Array(maxLag + 1);
  for (let lag = 1; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += o[i] * o[i + lag];
    acf[lag] = s / (n - lag);
  }
  // 1) grossier : peigne sur l'autocorrélation
  let best = minBpm;
  let bestS = -Infinity;
  let sum = 0;
  let cnt = 0;
  for (let bpm = minBpm; bpm <= maxBpm + 1e-9; bpm += 0.1) {
    const p = (60 * fr) / bpm;
    const s = sampleAt(acf, p) + sampleAt(acf, 2 * p) * 0.8 + sampleAt(acf, 3 * p) * 0.6 + sampleAt(acf, 4 * p) * 0.6 + sampleAt(acf, p / 2) * 0.3;
    sum += s;
    cnt++;
    if (s > bestS) {
      bestS = s;
      best = bpm;
    }
  }
  const confidence = bestS / (sum / cnt);

  // 2) fin : maximiser la somme de l'enveloppe sur la grille, sur tout le morceau
  let fine = best;
  let finePhase = 0;
  let fineS = -Infinity;
  for (let bpm = best - 0.6; bpm <= best + 0.6 + 1e-9; bpm += 0.01) {
    const { phase, score } = bestPhase(o, (60 * fr) / bpm);
    if (score > fineS) {
      fineS = score;
      fine = bpm;
      finePhase = phase;
    }
  }
  // arrondi à l'entier si quasi équivalent (la plupart des productions sont à BPM entier)
  const rounded = Math.round(fine);
  if (Math.abs(rounded - fine) < 0.06) {
    const r = bestPhase(o, (60 * fr) / rounded);
    if (r.score >= fineS * 0.995) {
      fine = rounded;
      finePhase = r.phase;
    }
  }
  return { bpm: Math.round(fine * 100) / 100, phase: finePhase, confidence };
}

/**
 * Phase de la grosse caisse : pic du profil des graves sur toute la durée d'un temps.
 * Le flux total peut s'accrocher aux charlestons (contretemps, doubles-croches) ; si le pic des
 * graves est ailleurs, il l'emporte. Près du demi-temps, la basse en octaves peut dominer les
 * contretemps : on n'y bascule qu'avec une avance nette.
 */
function kickPhase(low: Float32Array, phase: number, p: number): number {
  const prof = (ph: number) => {
    let s = 0;
    let c = 0;
    for (let x = ph; x < low.length - 1; x += p) {
      s += sampleAt(low, x);
      c++;
    }
    return c ? s / c : 0;
  };
  const near = (ph: number) => Math.max(...[-2, -1, 0, 1, 2].map((d) => prof(ph + d)));
  let best = phase;
  let bs = -Infinity;
  for (let ph = 0; ph < p; ph += 0.25) {
    const v = prof(ph);
    if (v > bs) {
      bs = v;
      best = ph;
    }
  }
  const dist = (a: number, b: number) => {
    const d = Math.abs(a - b) % p;
    return Math.min(d, p - d);
  };
  if (dist(best, phase) <= 3) return phase;
  if (dist(best, phase + p / 2) <= 3) return near(best) > near(phase) * 1.1 ? best : phase;
  return best;
}

/** Affinage sous-trame de la phase sur les attaques (±3 trames, pas de 0.1). */
function refinePhase(o: Float32Array, phase: number, p: number): number {
  let best = phase;
  let bs = -Infinity;
  for (let ph = phase - 3; ph <= phase + 3 + 1e-9; ph += 0.1) {
    let s = 0;
    for (let x = ph; x < o.length - 1; x += p) s += sampleAt(o, x);
    if (s > bs) {
      bs = s;
      best = ph;
    }
  }
  return (best + p) % p;
}

function bestPhase(o: Float32Array, p: number): { phase: number; score: number } {
  let bp = 0;
  let bs = -Infinity;
  for (let ph = 0; ph < p; ph += 0.5) {
    let s = 0;
    let c = 0;
    for (let x = ph; x < o.length - 1; x += p) {
      s += sampleAt(o, x);
      c++;
    }
    s /= c;
    if (s > bs) {
      bs = s;
      bp = ph;
    }
  }
  return { phase: bp, score: bs };
}

// ---------------------------------------------------------------- premier temps fort

/**
 * Parmi les 4 positions possibles du temps 1 dans la grille : changement harmonique
 * (basse / accords) en début de mesure + caisse claire sur 2 et 4.
 */
export function findDownbeat(feat: Features, o: Float32Array, bpm: number, phase: number): { beatIndex: number; firstOnset: number } {
  const p = (60 * feat.fr) / bpm;
  const nBeats = Math.floor((o.length - phase) / p);
  // spectre tonal moyen par temps
  const beatTonal: Float64Array[] = [];
  const beatMid: number[] = [];
  for (let b = 0; b < nBeats; b++) {
    const a = Math.round(phase + b * p);
    const z = Math.min(o.length, Math.round(phase + (b + 1) * p));
    // bandes graves / médiums seulement (basse et accords)
    const v = new Float64Array(HARM);
    for (let f = a; f < z; f++) for (let k = 0; k < HARM; k++) v[k] += feat.tonal[f][k];
    for (let k = 0; k < HARM; k++) v[k] /= Math.max(1, z - a);
    beatTonal.push(v);
    // caisse claire : flux médium autour du temps
    let m = 0;
    for (let f = a - 2; f <= a + 2; f++) m = Math.max(m, feat.midFlux[f] ?? 0);
    beatMid.push(m);
  }
  const nov: number[] = beatTonal.map((v, b) => {
    if (b === 0) return 0;
    let d = 0;
    const u = beatTonal[b - 1];
    for (let k = 0; k < HARM; k++) d += Math.abs(v[k] - u[k]);
    return d;
  });
  const mean = (arr: number[], j: number) => {
    let s = 0;
    let c = 0;
    for (let b = j; b < arr.length; b += 4) {
      s += arr[b];
      c++;
    }
    return c ? s / c : 0;
  };
  const novM = [0, 1, 2, 3].map((j) => mean(nov, j));
  const midM = [0, 1, 2, 3].map((j) => mean(beatMid, j));
  const nNorm = Math.max(...novM) || 1;
  const mNorm = Math.max(...midM) || 1;
  let bestJ = 0;
  let bestS = -Infinity;
  for (let j = 0; j < 4; j++) {
    const snare = (midM[(j + 1) % 4] + midM[(j + 3) % 4] - midM[j] - midM[(j + 2) % 4]) / mNorm;
    const s = novM[j] / nNorm + 0.5 * snare;
    if (s > bestS) {
      bestS = s;
      bestJ = j;
    }
  }
  // premier onset significatif
  let peak = 0;
  for (const v of o) peak = Math.max(peak, v);
  let first = 0;
  while (first < o.length && o[first] < peak * 0.15) first++;
  return { beatIndex: bestJ, firstOnset: first / feat.fr };
}

// ---------------------------------------------------------------- sections

export function detectSections(feat: Features, bpm: number, offset: number, duration: number): { sections: Section[]; barEnergy: number[]; barTimes: number[] } {
  const bar = (240 / bpm);
  const barTimes: number[] = [];
  for (let t = offset; t + bar * 0.5 < duration; t += bar) barTimes.push(t);
  if (barTimes.length === 0) return { sections: [{ start: 0, end: duration, type: 'verse', intensity: 0.5 }], barEnergy: [], barTimes };

  // énergie par mesure : RMS (dB) + basses (dB) + densité d'onsets
  const raw = barTimes.map((t) => {
    const a = Math.floor(t * feat.fr);
    const z = Math.min(feat.rms.length, Math.floor((t + bar) * feat.fr));
    let e = 0;
    let l = 0;
    let fl = 0;
    for (let f = a; f < z; f++) {
      e += feat.rms[f] ** 2;
      l += feat.low[f];
      fl += feat.flux[f];
    }
    const c = Math.max(1, z - a);
    return [10 * Math.log10(e / c + 1e-9), 10 * Math.log10(l / c + 1e-9), fl / c];
  });
  const norm = (k: number) => {
    const v = raw.map((r) => r[k]);
    const sorted = [...v].sort((a, b) => a - b);
    const lo = sorted[Math.floor(sorted.length * 0.05)];
    const hi = sorted[Math.floor(sorted.length * 0.95)];
    return v.map((x) => Math.max(0, Math.min(1, (x - lo) / (hi - lo || 1))));
  };
  const [nr, nl, nf] = [norm(0), norm(1), norm(2)];
  const barEnergy = nr.map((_, i) => 0.4 * nr[i] + 0.25 * nl[i] + 0.35 * nf[i]);

  // segmentation par phrases de 4 mesures, rupture si l'énergie change nettement
  // silence de fin ignoré (rattaché à la dernière section)
  let usable = barEnergy.length;
  while (usable > 4 && barEnergy[usable - 1] < 0.05) usable--;
  const bounds = phraseBoundaries(feat, barTimes, bar, barEnergy, usable);
  const segs: { from: number; to: number; e: number }[] = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    segs.push({ from: bounds[i], to: bounds[i + 1], e: mean(barEnergy.slice(bounds[i], bounds[i + 1])) });
  }
  // fusion des segments courts (4 mesures) quasi identiques à un voisin : bruit, pas une section
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 0; i < segs.length && segs.length > 1; i++) {
      const s = segs[i];
      if (s.to - s.from >= 8) continue;
      const cands = [segs[i - 1], segs[i + 1]].filter((x) => x && Math.abs(x.e - s.e) < 0.05);
      if (!cands.length) continue;
      const target = cands.sort((a, b) => Math.abs(a.e - s.e) - Math.abs(b.e - s.e))[0];
      const len = (x: typeof s) => x.to - x.from;
      target.e = (target.e * len(target) + s.e * len(s)) / (len(target) + len(s));
      target.from = Math.min(target.from, s.from);
      target.to = Math.max(target.to, s.to);
      segs.splice(i, 1);
      changed = true;
      break;
    }
  }

  // étiquetage : breaks (chute nette), puis refrain = groupe énergique qui se répète
  const hi = Math.max(...segs.map((s) => s.e));
  const isBreak = segs.map((s, i) => i > 0 && i < segs.length - 1 && s.e < hi * 0.5);
  const rest = segs.filter((_, i) => !isBreak[i]).map((s) => s.e);
  const lo = Math.min(...rest);
  const rel = (e: number) => (hi - lo < 0.04 ? 0.5 : Math.max(0, (e - lo) / (hi - lo)));
  const vec = barVectors(feat, barTimes, bar, barEnergy, usable);
  const segVec = segs.map((s) => {
    const v = new Float64Array(vec[0].length);
    for (let b = s.from; b < s.to; b++) for (let k = 0; k < v.length; k++) v[k] += vec[b][k] / (s.to - s.from);
    return v;
  });
  const D = segVec.map((a) => segVec.map((b) => dist(a, b)));
  const pairs = D.flatMap((row, i) => row.filter((_, j) => j > i));
  const sortedPairs = [...pairs].sort((a, b) => a - b);
  const tau = pairs.length ? Math.min(sortedPairs[Math.floor(pairs.length * 0.35)], 0.8 * sortedPairs[Math.floor(pairs.length / 2)]) : 0;
  const types: SectionType[] = segs.map((_, i) => (isBreak[i] ? 'break' : 'verse'));
  const eligible = (i: number) => !isBreak[i] && rel(segs[i].e) >= 0.6;
  let seed = -1;
  let seedScore = -Infinity;
  segs.forEach((_, i) => {
    if (!eligible(i)) return;
    const twin = Math.min(...segs.map((__, j) => (j !== i && eligible(j) ? D[i][j] : Infinity)));
    const score = rel(segs[i].e) + (twin <= tau ? 0.5 : 0);
    if (score > seedScore) {
      seedScore = score;
      seed = i;
    }
  });
  if (seed >= 0) segs.forEach((_, j) => {
    if (j === seed || (eligible(j) && D[seed][j] <= tau)) types[j] = 'chorus';
  });
  if (types[0] !== 'chorus' && rel(segs[0].e) < 0.6) types[0] = 'intro';
  const lastI = segs.length - 1;
  if (lastI > 0 && types[lastI] !== 'chorus' && rel(segs[lastI].e) < 0.6) types[lastI] = 'outro';
  for (let i = 0; i < lastI; i++) {
    if (types[i] === 'verse' && types[i + 1] === 'chorus' && segs[i].to - segs[i].from <= 8) types[i] = 'prechorus';
  }
  if (typeof process !== 'undefined' && process.env?.GD_DEBUG) console.log('segs', segs.map((s, i) => `${s.from}-${s.to} e${s.e.toFixed(2)} ${types[i]}`).join(' | '), 'tau', tau.toFixed(2));

  const sections: Section[] = segs.map((s, i) => {
    const r = isBreak[i] ? 0 : rel(s.e);
    let intensity = 0.2 + 0.8 * r;
    if (types[i] === 'chorus') intensity = Math.max(intensity, 0.85);
    if (types[i] === 'break') intensity = Math.min(intensity, 0.25);
    return {
      start: i === 0 ? 0 : barTimes[s.from],
      end: i === segs.length - 1 ? duration : barTimes[s.to] ?? duration,
      type: types[i],
      intensity: Math.round(intensity * 100) / 100,
    };
  });
  return { sections: mergeSame(sections), barEnergy: barEnergy.map((e) => Math.round(e * 1000) / 1000), barTimes };
}

/**
 * Frontières de sections, alignées sur les phrases de 4 mesures : pics de nouveauté
 * (noyau en damier sur la matrice d'auto-similarité des mesures : harmonie + énergie),
 * plus toute rupture d'énergie franche.
 */
function phraseBoundaries(feat: Features, barTimes: number[], bar: number, energy: number[], usable: number): number[] {
  const vec = barVectors(feat, barTimes, bar, energy, usable);
  const d = (i: number, j: number) => dist(vec[i], vec[j]);
  const L = 8;
  const cand: { b: number; n: number }[] = [];
  for (let b = 4; b < usable - 2; b += 4) {
    const l0 = Math.max(0, b - L);
    const r1 = Math.min(usable, b + L);
    let cross = 0;
    let cc = 0;
    let within = 0;
    let wc = 0;
    for (let i = l0; i < r1; i++) {
      for (let j = i + 1; j < r1; j++) {
        if (i < b === j < b) {
          within += d(i, j);
          wc++;
        } else {
          cross += d(i, j);
          cc++;
        }
      }
    }
    const jump = Math.abs(mean(energy.slice(b, Math.min(usable, b + 4))) - mean(energy.slice(Math.max(0, b - 4), b)));
    cand.push({ b, n: cross / Math.max(1, cc) - within / Math.max(1, wc) + jump });
  }
  const ns = cand.map((c) => c.n);
  const sd = Math.sqrt(mean(ns.map((x) => (x - mean(ns)) ** 2)));
  const thr = mean(ns) + 0.3 * sd;
  const thrHigh = mean(ns) + 0.9 * sd;
  if (typeof process !== 'undefined' && process.env?.GD_DEBUG) console.log('novelty', cand.map((c) => `${c.b}:${c.n.toFixed(2)}`).join(' '), 'thr', thr.toFixed(2));
  const out = [0];
  cand.forEach((c, i) => {
    const isPeak = (cand[i - 1]?.n ?? -Infinity) <= c.n && (cand[i + 1]?.n ?? -Infinity) <= c.n;
    if ((isPeak && c.n > thr) || c.n > thrHigh) out.push(c.b);
  });
  out.push(usable);
  return [...new Set(out)].sort((a, b) => a - b);
}

/** Vecteur par mesure (profil spectral + énergie ×3), normalisé z par dimension. */
export function barVectors(feat: Features, barTimes: number[], bar: number, energy: number[], usable: number): Float64Array[] {
  const dim = TB + 3;
  const vec = barTimes.slice(0, usable).map((t, b) => {
    const a = Math.floor(t * feat.fr);
    const z = Math.min(feat.tonal.length, Math.floor((t + bar) * feat.fr));
    const v = new Float64Array(dim);
    for (let f = a; f < z; f++) for (let k = 0; k < TB; k++) v[k] += feat.tonal[f][k];
    for (let k = 0; k < TB; k++) v[k] /= Math.max(1, z - a);
    v[TB] = v[TB + 1] = v[TB + 2] = energy[b];
    return v;
  });
  for (let k = 0; k < dim; k++) {
    const m = mean(vec.map((v) => v[k]));
    const sd = Math.sqrt(mean(vec.map((v) => (v[k] - m) ** 2))) || 1;
    for (const v of vec) v[k] = (v[k] - m) / sd;
  }
  return vec;
}

export function dist(a: Float64Array, b: Float64Array): number {
  let s = 0;
  for (let k = 0; k < a.length; k++) s += (a[k] - b[k]) ** 2;
  return Math.sqrt(s / a.length);
}

function mean(a: number[]): number {
  return a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
}

function mergeSame(s: Section[]): Section[] {
  const out: Section[] = [];
  for (const x of s) {
    const last = out.at(-1);
    if (last && last.type === x.type) {
      last.end = x.end;
      last.intensity = Math.max(last.intensity, x.intensity);
    } else out.push({ ...x });
  }
  return out;
}

// ---------------------------------------------------------------- pipeline

export function analyze(x: Float32Array, sr: number, progress?: (p: number) => void): Analysis {
  const duration = x.length / sr;
  const feat = extractFeatures(x, sr, progress);
  const o = onsetEnvelope(feat.flux, feat.fr);
  progress?.(0.7);
  const tempo = estimateTempo(o, feat.fr);
  // temps ou contretemps ? les charlestons en contretemps peuvent dominer le flux total :
  // on garde la phase où la grosse caisse (flux des basses) est la plus forte
  const p = (60 * feat.fr) / tempo.bpm;
  const lowEnv = onsetEnvelope(feat.lowFlux, feat.fr);
  tempo.phase = kickPhase(lowEnv, tempo.phase, p);
  tempo.phase = refinePhase(lowEnv, tempo.phase, p);
  progress?.(0.85);
  const { beatIndex, firstOnset } = findDownbeat(feat, o, tempo.bpm, tempo.phase);
  const beat = 60 / tempo.bpm;
  // trame f ↔ temps : centre de la fenêtre d'analyse
  const gridStart = (tempo.phase * HOP + FFT_SIZE / 2) / sr - ONSET_LATENCY;
  let downbeat = gridStart + beatIndex * beat;
  // premier temps fort au début de la musique (pas avant le premier son, à une mesure près)
  while (downbeat - 4 * beat >= firstOnset - 0.1) downbeat -= 4 * beat;
  while (downbeat < firstOnset - 0.1) downbeat += 4 * beat;
  // morceau qui démarre sur la musique : le temps fort peut tomber juste avant 0.
  // On passe au suivant (une mesure plus loin) : ramener à 0 décalerait toute la grille.
  while (downbeat < 0) downbeat += 4 * beat;
  const offset = downbeat;
  const { sections, barEnergy, barTimes } = detectSections(feat, tempo.bpm, offset, duration);
  progress?.(1);
  return {
    version: ANALYSIS_VERSION,
    bpm: tempo.bpm,
    offset: Math.round(offset * 1000),
    duration,
    sections,
    confidence: Math.round(tempo.confidence * 100) / 100,
    barEnergy,
    barTimes,
  };
}

/** Mixage mono + décimation simple vers ~22 kHz (suffisant pour les onsets). */
export function toMono22k(channels: Float32Array[], sr: number): { data: Float32Array; sr: number } {
  const n = channels[0].length;
  const factor = sr >= 44000 ? 2 : 1;
  const out = new Float32Array(Math.floor(n / factor));
  const k = 1 / (channels.length * factor);
  for (let i = 0; i < out.length; i++) {
    let s = 0;
    for (const ch of channels) for (let j = 0; j < factor; j++) s += ch[i * factor + j];
    out[i] = s * k;
  }
  return { data: out, sr: sr / factor };
}
