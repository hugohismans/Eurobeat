# Gravity Drift

Runner rythmique à inversion de gravité, généré depuis la musique (Eurobeat 140–160 BPM).
Vite + TypeScript + Canvas 2D, 100 % statique.

## Lancer

```sh
npm install
npm run dev          # http://localhost:5173 (et l'IP réseau pour tester sur mobile)
npm run check-level     # le bot valide le niveau de test à ±tolérance
npm run check-analysis  # BPM / offset / sections sur des pistes générées (nécessite ffmpeg)
npm run check-analysis -- morceau.mp3   # analyse d'un fichier quelconque
npm run track        # régénère public/audio/test-150.wav
npm run catalog      # télécharge, ré-encode et analyse les morceaux de catalog/tracks.json
npm run check-catalog  # grille calée sur la grosse caisse + niveaux finissables, pour chaque morceau
npm run build        # dist/ (déployé sur GitHub Pages par .github/workflows/deploy.yml)
```

## Catalogue

Les morceaux libres de droits (CC0 / CC BY uniquement) sont décrits dans `catalog/tracks.json` :
titre, auteur, licence, page source, URL du fichier et corrections manuelles éventuelles
(`override` : `bpm`, `offset`, `sections`). `npm run catalog` produit `public/catalog/` (MP3 160 kbps
+ `catalog.json`) et met à jour le tableau des licences d'`ASSETS.md`. Pour régler un morceau, ouvre-le
dans le jeu, corrige-le sur l'écran de préparation, « Exporter JSON », puis reporte les valeurs dans `override`.

## Contrôles

Tap / clic / Espace / ↑ : inverser la gravité · Échap ou ❚❚ : pause · H : hitboxes + fps.

## Architecture

| Fichier | Rôle |
| --- | --- |
| `src/config.ts` | Toutes les constantes de feel (vitesse, gravité, couloir, hitbox, tolérance…) |
| `src/game/types.ts` | `MusicInfo` : format d'entrée unique du générateur (fichier ou YouTube) |
| `src/game/timeline.ts` | Temps morceau ↔ position X (vitesse selon l'intensité de section, fondu) |
| `src/game/physics.ts` | Perso, flip, collisions, profil de flip (utilisé pour placer les obstacles) |
| `src/game/level.ts` | Plan (flips, plateformes, loopings) → tronçons par voie → obstacles garantissant la fenêtre ±tolérance |
| `src/game/sim.ts` | Une tentative : pas fixe 240 Hz, inputs horodatés en temps morceau, scoring |
| `src/game/bot.ts` | Bot de validation (extrêmes, alternés, aléatoires dans la tolérance) |
| `src/game/game.ts` | Horloge musicale → simulation → rendu interpolé, mort / practice / pause |
| `src/audio/track.ts` | Horloge Web Audio (`getOutputTimestamp`, latence calibrable) |
| `src/audio/decode.ts` | Décodage des fichiers du joueur : décodeur du navigateur, puis libFLAC (WebAssembly, chargé à la demande) si un FLAC lui résiste ; haute résolution et multicanal ramenés à la fréquence du contexte, en stéréo |
| `src/analysis/dsp.ts` | Analyse pure : flux spectral, tempo (autocorrélation + alignement de grille), temps 1, sections (auto-similarité + énergie) |
| `src/analysis/worker.ts` | L'analyse tourne dans un Web Worker |
| `src/analysis/cache.ts` | Cache IndexedDB (analyse + corrections, clé = SHA-256 du fichier, jamais l'audio) |
| `src/game/generate.ts` | Générateur : loopings (montée vers un refrain), plateformes (phrases de refrain), motifs par phrase (AABA, respirations), garde-fous, réparation par le bot, statistiques et étoiles |
| `src/game/difficulty.ts` | Modes Facile / Moyen / Expert (tolérance, taille des obstacles, vitesse, densité) |
| `src/ui/prep.ts` | Écran de préparation : BPM (÷2, ×2, fin, tap tempo), temps 1, écoute au métronome, sections, export JSON |
| `src/ui/calibrate.ts` | Calibration de latence au tap |
| `src/render/renderer.ts` | Rendu néon (glow sans `shadowBlur`), looping, qualité adaptative (réduite si < 45 i/s) |
| `src/render/car.ts` | Coupé japonais années 80 générique, vectoriel, jantes qui tournent, flamme d'échappement |
| `src/render/scenery.ts` | Soleil synthwave, piliers et portiques d'autoroute, reflets mouillés, lignes de vitesse, bandeau DRIFT |
| `src/render/fx.ts` | Particules texturées (Kenney, CC0) teintées à la volée, secours procédural |

Principe de synchro : la position horizontale est une fonction pure du temps du morceau ;
seul le Y est simulé (pas fixe), et les taps sont convertis en temps morceau via
l'horodatage de l'événement. Même résultat à 60 Hz et 120 Hz, et le bot rejoue
exactement la même physique que le jeu.
