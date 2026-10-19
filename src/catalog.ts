import type { Analysis } from './analysis/dsp';
import type { MusicInfo, Section } from './game/types';

/** Entrée de catalog/tracks.json (source, éditée à la main). */
export interface CatalogSource {
  id: string;
  title: string;
  artist: string;
  style: string;
  license: string;
  licenseUrl: string;
  /** page du morceau, qui montre la licence */
  source: string;
  /** morceaux d'un même titre (version normale / Climax) : une seule carte dans le catalogue */
  group?: string;
  /** nom de la variante (ex. « Climax », plus rapide) */
  variant?: string;
  /** attribution demandée par l'auteur, le cas échéant */
  attribution?: string;
  /** fichier audio d'origine (téléchargé par scripts/build-catalog.ts) */
  url: string;
  /** corrections manuelles de l'analyse */
  override?: { bpm?: number; offset?: number; sections?: Section[] };
}

/** Entrée de public/catalog/catalog.json (générée). */
export interface CatalogEntry extends Omit<CatalogSource, 'url' | 'override'> {
  /** chemin relatif du MP3 */
  file: string;
  analysis: Analysis;
  music: MusicInfo;
}

let cache: Promise<CatalogEntry[]> | null = null;

export function loadCatalog(): Promise<CatalogEntry[]> {
  cache ??= fetch('catalog/catalog.json')
    .then((r) => {
      if (!r.ok) throw new Error(`catalogue : ${r.status}`);
      return r.json() as Promise<{ tracks: CatalogEntry[] }>;
    })
    .then((c) => c.tracks)
    .catch((e) => {
      cache = null;
      throw e;
    });
  return cache;
}
