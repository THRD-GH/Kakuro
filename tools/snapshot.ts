// A fingerprint of what the generator produces, so a change meant to be a
// speed-up can be proved not to have moved a single puzzle.
import { createHash } from 'node:crypto';
import { LEVELS, SIZES } from '../src/core/types.ts';
import type { Level, Size } from '../src/core/types.ts';
import { generatePuzzle } from '../src/core/generator.ts';

const NUMBERS = [1, 2, 7, 33, 158];
const lines: string[] = [];
let ms = 0;

for (const size of SIZES) {
  for (const level of LEVELS) {
    for (const number of NUMBERS) {
      const at = process.hrtime.bigint();
      let mark: string;
      try {
        const p = generatePuzzle({ size: size as Size, level: level as Level, number });
        mark = `${p.solution.join('')}|${p.difficulty}|${p.rating.toFixed(6)}`;
      } catch (e) {
        mark = `threw:${(e as Error).message}`;
      }
      ms += Number(process.hrtime.bigint() - at) / 1e6;
      lines.push(`${size}-${level}-${number} ${createHash('sha1').update(mark).digest('hex').slice(0, 12)}`);
    }
  }
}

console.log(lines.join('\n'));
console.log(`\ntotal ${ms.toFixed(0)}ms over ${lines.length} puzzles`);
