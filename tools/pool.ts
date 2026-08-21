// Would a bigger pool hold up? Generates numbers past the current POOL_SIZE
// and reports what fails, what lands off-band, and what it costs.
import { LEVELS, SIZES } from '../src/core/types.ts';
import type { Level, Size } from '../src/core/types.ts';
import { generatePuzzle } from '../src/core/generator.ts';

const NUMBERS = [401, 450, 500, 550, 600];
let threw = 0;
let offBand = 0;
let slowest = 0;
let total = 0;

console.log('size lvl | fail  off-band |  worst    mean');
for (const size of SIZES) {
  for (const level of LEVELS) {
    let fail = 0;
    let off = 0;
    let worst = 0;
    let sum = 0;
    for (const number of NUMBERS) {
      const at = process.hrtime.bigint();
      try {
        const puzzle = generatePuzzle({ size: size as Size, level: level as Level, number });
        if (puzzle.difficulty !== level) off++;
      } catch {
        fail++;
      }
      const ms = Number(process.hrtime.bigint() - at) / 1e6;
      sum += ms;
      if (ms > worst) worst = ms;
    }
    threw += fail;
    offBand += off;
    total += NUMBERS.length;
    if (worst > slowest) slowest = worst;
    console.log(
      `${String(size).padStart(4)} ${level}   | ${String(fail).padStart(4)}  ${String(off).padStart(8)} |` +
        ` ${worst.toFixed(0).padStart(6)}ms ${(sum / NUMBERS.length).toFixed(0).padStart(6)}ms`,
    );
  }
}
console.log(`\n${total} generated · ${threw} threw · ${offBand} off-band · slowest ${slowest.toFixed(0)}ms`);
