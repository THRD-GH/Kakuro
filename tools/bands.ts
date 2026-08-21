/**
 * Fits the level bands to each board.
 *
 *   node tools/bands.ts [samples-per-board]
 *
 * The ladder is calibrated per board, and it has to be. A 20x20 that falls to
 * the combination union everywhere does not exist — somewhere in two hundred
 * cells something always wants more — so a ladder defined purely by technique
 * left the easiest levels unreachable on the largest boards however long the
 * search ran. Ranking a puzzle against its own board instead makes every level
 * exist everywhere by construction: a white belt 20x20 is the easiest kind of
 * 20x20, not a 9x9 stretched.
 *
 * Prints BANDS_BY_SIZE for src/core/generator.ts.
 */
import { blockFor, sampleCandidate } from '../src/core/generator.ts';
import { mulberry32 } from '../src/core/rng.ts';
import { measure } from '../src/core/solver.ts';
import { SIZES } from '../src/core/types.ts';
import type { Level } from '../src/core/types.ts';

const want = Number(process.argv[2] ?? 36);
const rnd = mulberry32(0xba4d5);
const table: Record<number, number[]> = {};

for (const size of SIZES) {
  const ratings: number[] = [];
  const started = Date.now();
  for (let i = 0; ratings.length < want && i < want * 8; i++) {
    // Sweep the density the six levels ask for, so the sample spans the range
    // of puzzle the generator can actually make on this board.
    const level = ((i % 6) + 1) as Level;
    const candidate = sampleCandidate(size, blockFor(size, level) + (rnd() - 0.5) * 0.05, null, rnd, 300);
    if (!candidate) continue;
    const scored = measure(candidate.puzzle);
    if (scored.solved) ratings.push(scored.rating);
  }

  const sorted = ratings.sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const edges = [0, at(1 / 6), at(2 / 6), at(3 / 6), at(4 / 6), at(5 / 6)].map((v) => Number(v.toFixed(1)));
  table[size] = edges;
  console.log(
    `${String(size).padStart(2)}: n=${sorted.length} ` +
      `range ${sorted[0].toFixed(1)}–${sorted[sorted.length - 1].toFixed(1)} ` +
      `edges ${edges.join(' ')}  (${((Date.now() - started) / 1000).toFixed(0)}s)`,
  );
}

console.log('\nexport const BANDS_BY_SIZE: Record<number, number[]> = {');
for (const size of SIZES) console.log(`  ${size}: [${table[size].join(', ')}],`);
console.log('};');
