import type { MusicInfo } from '../game/types';
import { ANALYSIS_VERSION, toMono22k, type Analysis } from './dsp';
import type { AnalyzeMessage } from './worker';

/** Empreinte du fichier (SHA-256 des octets), clé du cache et graine du niveau. */
export async function hashBytes(data: ArrayBuffer): Promise<string> {
  if (crypto.subtle) {
    const h = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
  }
  // contexte non sécurisé (http sur IP locale) : FNV-1a, suffisant pour un cache
  let h = 0x811c9dc5;
  const u = new Uint8Array(data);
  for (let i = 0; i < u.length; i += 7) h = Math.imul(h ^ u[i], 0x01000193);
  return `fnv${(h >>> 0).toString(16)}-${u.length}`;
}

/** Analyse dans un Web Worker (l'UI reste fluide). */
export function analyzeBuffer(buffer: AudioBuffer, onProgress: (p: number) => void): Promise<Analysis> {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const { data, sr } = toMono22k(channels, buffer.sampleRate);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<AnalyzeMessage>) => {
      const m = e.data;
      if (m.type === 'progress') onProgress(m.value);
      else {
        worker.terminate();
        if (m.type === 'done') resolve(m.analysis);
        else reject(new Error(m.message));
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || 'analyse impossible'));
    };
    worker.postMessage({ data, sr }, [data.buffer]);
  });
}

export function musicFromAnalysis(a: Analysis): MusicInfo {
  return { bpm: a.bpm, offset: a.offset, duration: a.duration, sections: a.sections.map((s) => ({ ...s })) };
}

export function isCurrent(a: Analysis): boolean {
  return a.version === ANALYSIS_VERSION;
}
