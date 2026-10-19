export interface InputHandlers {
  /** horodatage DOM de l'événement (performance.now) */
  tap(timeStamp: number): void;
  pause(): void;
  confirm(): void;
  toggleDebug(): void;
  isPlaying(): boolean;
}

const FLIP_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyZ', 'KeyS']);

/**
 * Un seul input : pointerdown (tactile + souris) et clavier, même logique.
 * Les taps sur les boutons ne déclenchent pas de flip.
 */
export function bindInput(stage: HTMLElement, h: InputHandlers): void {
  stage.addEventListener(
    'pointerdown',
    (e) => {
      if ((e.target as HTMLElement).closest('button, input, label, .panel')) return;
      if (!h.isPlaying()) return;
      e.preventDefault();
      h.tap(e.timeStamp);
    },
    { passive: false },
  );
  // pas de menu contextuel / zoom / sélection pendant le jeu
  stage.addEventListener('contextmenu', (e) => e.preventDefault());
  stage.addEventListener('touchstart', (e) => {
    if (h.isPlaying() && e.cancelable) e.preventDefault();
  }, { passive: false });
  document.addEventListener('dblclick', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' || e.code === 'KeyP') {
      e.preventDefault();
      h.pause();
      return;
    }
    if (e.code === 'KeyH') {
      h.toggleDebug();
      return;
    }
    if (FLIP_KEYS.has(e.code)) {
      e.preventDefault();
      if (e.repeat) return;
      if (h.isPlaying()) h.tap(e.timeStamp);
      else if (e.code === 'Space') h.confirm();
      return;
    }
    if (e.code === 'Enter') h.confirm();
  });
}
