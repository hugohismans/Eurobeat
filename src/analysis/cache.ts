import type { MusicInfo } from '../game/types';
import type { Analysis } from './dsp';

/** Entrée de cache : l'analyse brute et les corrections du joueur, jamais l'audio. */
export interface TrackRecord {
  hash: string;
  name: string;
  analysis: Analysis;
  /** MusicInfo corrigé (BPM, offset, sections) */
  music: MusicInfo;
  updatedAt: number;
}

const DB = 'gravity-drift';
const STORE = 'tracks';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'hash' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// IndexedDB peut être indisponible (navigation privée…) : le cache devient alors un simple no-op.
export async function getTrack(hash: string): Promise<TrackRecord | undefined> {
  try {
    return await tx('readonly', (s) => s.get(hash));
  } catch {
    return undefined;
  }
}

export async function putTrack(r: TrackRecord): Promise<void> {
  try {
    await tx('readwrite', (s) => s.put(r));
  } catch {
    /* cache indisponible */
  }
}

export async function listTracks(): Promise<TrackRecord[]> {
  try {
    const all = await tx<TrackRecord[]>('readonly', (s) => s.getAll());
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function deleteTrack(hash: string): Promise<void> {
  try {
    await tx('readwrite', (s) => s.delete(hash));
  } catch {
    /* cache indisponible */
  }
}
