# Gravity Drift

Runner rythmique à inversion de gravité, généré depuis la musique (Eurobeat 140–160 BPM).
Vite + TypeScript + Canvas 2D, 100 % statique.

## Lancer

```sh
npm install
npm run dev          # http://localhost:5173 (et l'IP réseau pour tester sur mobile)
npm run check-level  # le bot valide le niveau de test à ±tolérance
npm run track        # régénère public/audio/test-150.wav
npm run build        # dist/ (déployé sur GitHub Pages par .github/workflows/deploy.yml)
```

## Contrôles

Tap / clic / Espace / ↑ : inverser la gravité · Échap ou ❚❚ : pause · H : hitboxes + fps.

## Architecture

| Fichier | Rôle |
| --- | --- |
| `src/config.ts` | Toutes les constantes de feel (vitesse, gravité, couloir, hitbox, tolérance…) |
| `src/game/types.ts` | `MusicInfo` : format d'entrée unique du générateur (fichier ou YouTube) |
| `src/game/timeline.ts` | Temps morceau ↔ position X (vitesse selon l'intensité de section, fondu) |
| `src/game/physics.ts` | Perso, flip, collisions, profil de flip (utilisé pour placer les obstacles) |
| `src/game/level.ts` | Liste de beats de flip → obstacles garantissant la fenêtre ±tolérance |
| `src/game/sim.ts` | Une tentative : pas fixe 240 Hz, inputs horodatés en temps morceau, scoring |
| `src/game/bot.ts` | Bot de validation (extrêmes, alternés, aléatoires dans la tolérance) |
| `src/game/game.ts` | Horloge musicale → simulation → rendu interpolé, mort / practice / pause |
| `src/audio/track.ts` | Horloge Web Audio (`getOutputTimestamp`, latence calibrable) |
| `src/render/` | Rendu néon procédural (glow sans `shadowBlur`, décors pré-rendus, particules plafonnées) |

Principe de synchro : la position horizontale est une fonction pure du temps du morceau ;
seul le Y est simulé (pas fixe), et les taps sont convertis en temps morceau via
l'horodatage de l'événement. Même résultat à 60 Hz et 120 Hz, et le bot rejoue
exactement la même physique que le jeu.
