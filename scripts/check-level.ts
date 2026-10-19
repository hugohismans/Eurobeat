// Valide le niveau de test avec le bot : npm run check-level
import { CONFIG } from '../src/config';
import { playBot, validateLevel } from '../src/game/bot';
import { FlipProfile } from '../src/game/physics';
import { createTestLevel } from '../src/game/testLevel';

const level = createTestLevel();
const profile = new FlipProfile();
console.log(`flips: ${level.flips.length}, obstacles (flips forcés): ${level.obstacles.length}`);
console.log(`traversée: ${(profile.traversal * 1000).toFixed(0)} ms`);

const v = validateLevel(level);
for (const f of v.failures.slice(0, 10)) {
  const fl = level.flips[f.result.nearFlip!];
  console.log(`ÉCHEC ${f.scenario}: mort à ${f.result.deathTime!.toFixed(3)} s près du flip #${f.result.nearFlip} (beat ${fl.beat})`);
}
console.log(v.ok ? 'OK : finissable à ±tolérance' : `${v.failures.length} scénarios en échec`);

// Contrôle inverse : hors tolérance, le joueur doit mourir.
const out = (CONFIG.timing.toleranceMs + 40) / 1000;
const late = playBot(level, () => out);
const early = playBot(level, () => -out);
console.log(`hors tolérance (+${out * 1000} ms): ${late.ok ? 'survit (!)' : 'meurt'}, (-${out * 1000} ms): ${early.ok ? 'survit (!)' : 'meurt'}`);
process.exit(v.ok ? 0 : 1);
