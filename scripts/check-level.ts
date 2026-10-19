// Valide le niveau de test avec le bot, pour chaque difficulté : npm run check-level
import { CONFIG } from '../src/config';
import { playBot, validateLevel } from '../src/game/bot';
import { applyDifficulty, DIFFICULTIES, DIFFICULTY_ORDER } from '../src/game/difficulty';
import { FlipProfile } from '../src/game/physics';
import { createTestLevel } from '../src/game/testLevel';

console.log(`traversée: ${(new FlipProfile().traversal * 1000).toFixed(0)} ms`);
let ok = true;
for (const d of DIFFICULTY_ORDER) {
  applyDifficulty(d);
  const level = createTestLevel();
  const v = validateLevel(level);
  ok &&= v.ok;
  // contrôle inverse : hors tolérance, le joueur doit mourir
  const out = (CONFIG.timing.toleranceMs + 40) / 1000;
  const late = playBot(level, () => out).ok;
  const early = playBot(level, () => -out).ok;
  console.log(
    `${DIFFICULTIES[d].label.padEnd(7)} ±${CONFIG.timing.toleranceMs} ms · ${level.flips.length} flips, ${level.obstacles.length} forcés · ` +
      `${v.ok ? 'finissable' : `${v.failures.length} scénarios en échec`} · hors tolérance : ${late ? 'survit en retard (!)' : 'meurt en retard'}, ${early ? 'survit en avance (!)' : 'meurt en avance'}`,
  );
  for (const f of v.failures.slice(0, 5)) {
    const fl = level.flips[f.result.nearFlip!];
    console.log(`   ÉCHEC ${f.scenario}: mort à ${f.result.deathTime!.toFixed(3)} s près du flip #${f.result.nearFlip} (beat ${fl.beat})`);
  }
}
process.exit(ok ? 0 : 1);
