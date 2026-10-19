# Assets

La voiture, la ville, l'autoroute et la plupart des effets sont dessinés par le code (Canvas 2D,
`src/render/`) : c'est aussi le rendu de secours si un fichier ci-dessous manque.

| Fichier | Origine | Licence |
| --- | --- | --- |
| `public/audio/test-150.wav` | Synthétisé par `scripts/make-test-track.mjs` | Projet |
| `public/assets/fonts/dela-gothic-one-subset.woff2` | [Dela Gothic One](https://fonts.google.com/specimen/Dela+Gothic+One), The Dela Gothic Project Authors, réduite aux caractères du jeu (API Google Fonts `text=`) | [SIL OFL 1.1](public/assets/fonts/OFL.txt) |
| `public/assets/fx/particles.png` | [Particle Pack](https://kenney.nl/assets/particle-pack), Kenney : `circle_05`, `star_06`, `smoke_04`, `flare_01` réduits à 96 px et assemblés en atlas | [CC0 1.0](public/assets/fx/LICENSE-kenney-particle-pack.txt) |

## Musiques du catalogue

Généré par `npm run catalog` depuis `catalog/tracks.json` (ne pas éditer à la main).

<!-- catalogue:début -->
| Fichier | Titre | Auteur | Licence | Source |
| --- | --- | --- | --- | --- |
| `public/catalog/fever-stadium.mp3` | Fever Stadium | MintoDog | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [page](https://opengameart.org/node/162191) |
| `public/catalog/fever-stadium-climax.mp3` | Fever Stadium (Climax) | MintoDog | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [page](https://opengameart.org/node/162191) |
| `public/catalog/sky-blue-street.mp3` | Sky Blue Street | MintoDog | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [page](https://opengameart.org/content/sky-blue-street) |
| `public/catalog/sky-blue-street-climax.mp3` | Sky Blue Street (Climax) | MintoDog | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [page](https://opengameart.org/content/sky-blue-street) |
| `public/catalog/neon-sign-circuit.mp3` | Neon Sign Circuit | MintoDog | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [page](https://opengameart.org/content/neon-sign-circuit-remake) |
| `public/catalog/neon-sign-circuit-climax.mp3` | Neon Sign Circuit (Climax) | MintoDog | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [page](https://opengameart.org/content/neon-sign-circuit-remake) |
| `public/catalog/darkness-road.mp3` | Darkness Road | MintoDog | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [page](https://opengameart.org/content/darkness-roadremake) |
| `public/catalog/darkness-road-climax.mp3` | Darkness Road (Climax) | MintoDog | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [page](https://opengameart.org/content/darkness-roadremake) |
| `public/catalog/hot-roadway.mp3` | Hot Roadway | MintoDog | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [page](https://opengameart.org/content/hot-roadway-remake) |
| `public/catalog/hot-roadway-climax.mp3` | Hot Roadway (Climax) | MintoDog | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [page](https://opengameart.org/content/hot-roadway-remake) |
| `public/catalog/pure-raceway.mp3` | Pure Raceway | MintoDog | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [page](https://opengameart.org/content/pure-raceway) |
| `public/catalog/pure-raceway-climax.mp3` | Pure Raceway (Climax) | MintoDog | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [page](https://opengameart.org/content/pure-raceway) |
| `public/catalog/cool-highway.mp3` | Cool Highway | MintoDog | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [page](https://opengameart.org/content/cool-highway-remake) |
| `public/catalog/cool-highway-climax.mp3` | Cool Highway (Climax) | MintoDog | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [page](https://opengameart.org/content/cool-highway-remake) |
| `public/catalog/joyful-jungle.mp3` | Joyful Jungle | MintoDog | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [page](https://opengameart.org/content/joyful-jungle) |
| `public/catalog/joyful-jungle-climax.mp3` | Joyful Jungle (Climax) | MintoDog | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [page](https://opengameart.org/content/joyful-jungle) |
| `public/catalog/blossom-mountain.mp3` | Blossom Mountain | MintoDog | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [page](https://opengameart.org/content/blossom-mountainremake) |
| `public/catalog/blossom-mountain-climax.mp3` | Blossom Mountain (Climax) | MintoDog | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [page](https://opengameart.org/content/blossom-mountainremake) |
| `public/catalog/super-santa-claus.mp3` | Super Santa Claus | MintoDog | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [page](https://opengameart.org/content/super-santa-claus) |
| `public/catalog/technomania101.mp3` | Technomania101 | Fupi | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [page](https://opengameart.org/content/technomania101-2000s-europop-electronic-dance-music) |
| `public/catalog/i-dont-understand.mp3` | I Don't Understand | Snabisch | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | [page](https://opengameart.org/content/i-don%C2%B4t-understand) |
| `public/catalog/italo-nights.mp3` | Italo Nights | cosmac | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | [page](https://opengameart.org/content/italo-nights) |
| `public/catalog/glory-days.mp3` | Glory Days | Tricks & Traps | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [page](https://opengameart.org/content/free-rhythm-game-music-pack-1) |
| `public/catalog/retroracing-nightlife.mp3` | Retroracing Nightlife | Bogart VGM | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | [page](https://opengameart.org/content/retroracing-nightlife) |
| `public/catalog/retroracing-one-more-round.mp3` | Retroracing One More Round | Bogart VGM | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | [page](https://opengameart.org/content/retroracing-one-more-round) |
| `public/catalog/90s-racer-techno.mp3` | 90s Racer Techno | Bogart VGM | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | [page](https://opengameart.org/content/90s-racer-techno) |
| `public/catalog/shiny-tech.mp3` | Shiny Tech | Kevin MacLeod | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | [page](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100078) |
| `public/catalog/club-diver.mp3` | Club Diver | Kevin MacLeod | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | [page](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1200020) |
| `public/catalog/show-your-moves.mp3` | Show Your Moves | Kevin MacLeod | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | [page](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100751) |
<!-- catalogue:fin -->
