export type SectionType = 'intro' | 'verse' | 'prechorus' | 'chorus' | 'break' | 'outro';

export interface Section {
  /** secondes */
  start: number;
  end: number;
  type: SectionType;
  /** 0 – 1 */
  intensity: number;
}

/** Format d'entrée unique du générateur, produit par les deux sources (fichier / YouTube). */
export interface MusicInfo {
  bpm: number;
  /** ms du premier temps fort */
  offset: number;
  /** secondes */
  duration: number;
  sections: Section[];
}

export type Side = 'floor' | 'ceil';

export interface Flip {
  /** temps morceau (s) */
  time: number;
  /** surface vers laquelle le joueur doit aller */
  to: Side;
  beat: number;
}

export interface Obstacle {
  /** étendue visuelle (unités monde) */
  x0: number;
  x1: number;
  side: Side;
  height: number;
  kind: 'spike' | 'block';
  /** étendue de collision */
  hx0: number;
  hx1: number;
  hh: number;
}

export interface Checkpoint {
  time: number;
  side: Side;
  section: number;
}

export const SECTION_LABEL: Record<SectionType, string> = {
  intro: 'Intro',
  verse: 'Couplet',
  prechorus: 'Pré-refrain',
  chorus: 'Refrain',
  break: 'Break',
  outro: 'Outro',
};
