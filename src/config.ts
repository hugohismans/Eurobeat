// Toutes les constantes de feel. Unités monde : 1 unité ≈ taille du perso.
// Les obstacles sont recalculés à partir de ces valeurs : changer la gravité
// ou la tolérance garde le niveau finissable.

export const CONFIG = {
  sim: {
    /** Fréquence de la physique (Hz). Indépendante du framerate d'affichage. */
    hz: 240,
    /** Au-delà, on saute du temps plutôt que de rattraper (onglet en arrière-plan…). */
    maxStepsPerFrame: 120,
  },

  world: {
    /** Hauteur du couloir sol → plafond. */
    corridorHeight: 8,
    /** Unités visibles derrière le perso. */
    viewBehind: 4.5,
    /** Unités visibles devant le perso, minimum garanti (portrait). */
    minViewAhead: 13,
    /** Marge verticale visible au-dessus / en dessous du couloir. */
    verticalMargin: 2,
  },

  speed: {
    /** Vitesse de défilement à intensité 0.5 (unités / s). */
    base: 11,
    /** Multiplicateur à intensité 0 et 1. */
    minMul: 0.75,
    maxMul: 1.3,
    /** Durée du fondu de vitesse entre deux sections (s). */
    rampTime: 0.6,
  },

  player: {
    /** Taille visuelle (carré englobant). */
    size: 1,
    /** Hitbox : plus petite que le sprite, centrée. */
    hitbox: 0.7,
  },

  physics: {
    /** Gravité (unités / s²). */
    gravity: 480,
    /** Vitesse verticale max. */
    maxSpeed: 90,
    /** Impulsion donnée au moment du flip, vers la nouvelle surface. */
    flipImpulse: 6,
    /** false = flip seulement au contact d'une surface. true = flip en l'air autorisé. */
    airFlip: false,
    /** Tap trop tôt (en l'air) mémorisé pendant ce délai et appliqué à l'atterrissage (ms). */
    inputBufferMs: 140,
  },

  timing: {
    /** Tolérance humaine autour du beat, garantie par la construction des obstacles (ms). */
    toleranceMs: 80,
    /** Seuils de précision pour le HUD / le score (ms). */
    perfectMs: 35,
    greatMs: 80,
    /** Un tap à plus de ce délai d'un flip attendu est un flip "hors rythme" (ms). */
    matchWindowMs: 220,
    /** Délai audio avant le départ / la reprise (s). Le perso est figé pendant ce temps. */
    leadIn: 1.0,
  },

  obstacles: {
    spikeHeight: 1.3,
    blockHeight: 2.0,
    /** Retrait de la hitbox des pics par rapport au dessin (pointe pardonnée). */
    spikeInsetX: 0.18,
    spikeInsetTop: 0.35,
    /** Marge de sécurité supplémentaire (unités monde). */
    safety: 0.05,
    /** En dessous de cette longueur, pas d'obstacle : le flip n'est pas forcé. */
    minLength: 0.5,
  },

  platform: {
    /** hauteur de la face inférieure de la poutre (voie du bas : 0 → y0) */
    y0: 3.6,
    thickness: 0.8,
  },

  loop: {
    /** zoom arrière pendant le looping (lisibilité) */
    zoom: 0.8,
  },

  health: {
    /** jauge perdue par choc (1 = mort subite) ; fixé par la difficulté */
    damage: 0.34,
    /** jauge regagnée par flip dans le temps */
    heal: 0.04,
    /** invulnérabilité après un choc (ms) : la voiture clignote et est remise du bon côté */
    invulnMs: 700,
    /** un choc = fin de partie (ancien comportement) */
    suddenDeath: false,
  },

  practice: {
    /** Délai avant respawn automatique en practice (ms). */
    respawnDelayMs: 650,
  },

  render: {
    maxDpr: 2,
    maxParticles: 260,
    rainDrops: 90,
    showFlipMarkers: true,
  },

  storage: {
    latencyKey: 'gd.latencyMs',
  },
};

export type Config = typeof CONFIG;
