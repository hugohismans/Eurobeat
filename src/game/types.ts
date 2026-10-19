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
  /** voie du joueur au moment du flip */
  lo: number;
  hi: number;
}

export interface Obstacle {
  /** étendue visuelle (unités monde) */
  x0: number;
  x1: number;
  /** 'floor' : posé sur une surface et pointe vers le haut · 'ceil' : suspendu, pointe vers le bas */
  side: Side;
  /** y de la surface d'accroche (0, plafond, ou face d'une plateforme) */
  surface: number;
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
  /** voie du joueur à ce moment (sol / plafond effectifs) */
  lo: number;
  hi: number;
}

/** Poutre intermédiaire : coupe le couloir en deux voies, sa tranche avant est un mur. */
export interface Platform {
  x0: number;
  x1: number;
  /** face inférieure / supérieure */
  y0: number;
  y1: number;
}

/** Looping : rotation complète de la caméra, sans flip ni obstacle. */
export interface Loop {
  t0: number;
  t1: number;
}

/** Portion entre deux évènements (flip, entrée / sortie de plateforme) : le joueur reste d'un côté d'une voie. */
export interface Stretch {
  t0: number;
  t1: number;
  side: Side;
  /** bornes de la voie (sol et plafond effectifs) */
  lo: number;
  hi: number;
}

export const SECTION_LABEL: Record<SectionType, string> = {
  intro: 'Intro',
  verse: 'Couplet',
  prechorus: 'Pré-refrain',
  chorus: 'Refrain',
  break: 'Break',
  outro: 'Outro',
};
