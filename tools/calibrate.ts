/**
 * What the rating scale actually looks like.
 *
 *   node tools/calibrate.ts [samples-per-shape]
 *
 * Generates puzzles across the shapes the plan uses, asking for no particular
 * difficulty, and prints the spread of ratings and the technique each one
 * topped out on. `BANDS` in src/core/generator.ts comes from this: the ladder
 * is fitted to the puzzles the generator really produces rather than guessed.
 */
import { classify, sampleCandidate } from '../src/core/generator.ts';
import { mulberry32 } from '../src/core/rng.ts';
import { Solver } from '../src/core/solver.ts';

const perShape = Number(process.argv[2] ?? 12);

const shapes: [number, number][] = [
  [8, 0.42],
  [8, 0.36],
  [9, 0.38],
  [9, 0.32],
  [9, 0.26],
  [10, 0.32],
  [10, 0.26],
  [11, 0.28],
  [11, 0.24],
];

const rnd = mulberry32(0xc0ffee);
const ratings: number[] = [];
const byTechnique = new Map<string, number>();
const started = Date.now();

for (const [size, block] of shapes) {
  const found: number[] = [];
  const shapeStart = Date.now();
  for (let i = 0; i < perShape * 3 && found.length < perShape; i++) {
    const candidate = sampleCandidate(size, block, null, rnd);
    if (!candidate) continue;
    found.push(candidate.rating);
    ratings.push(candidate.rating);
    const hardest = new Solver(candidate.puzzle).grind().hardest ?? 'none';
    byTechnique.set(hardest, (byTechnique.get(hardest) ?? 0) + 1);
  }
  const sorted = [...found].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  console.log(
    `${size}x${size} block ${block.toFixed(2)}  n=${found.length}  ` +
      `min ${at(0)?.toFixed(1)}  med ${at(0.5)?.toFixed(1)}  max ${at(1)?.toFixed(1)}  ` +
      `${((Date.now() - shapeStart) / Math.max(1, found.length)).toFixed(0)}ms each`,
  );
}

const sorted = [...ratings].sort((a, b) => a - b);
const quantile = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

console.log(`\n${sorted.length} puzzles in ${((Date.now() - started) / 1000).toFixed(1)}s`);
console.log(
  'hardest technique needed: ' +
    [...byTechnique.entries()].map(([k, n]) => `${k} ${n}`).join(', '),
);
console.log(
  `suggested BANDS = [0, ${[1, 2, 3, 4, 5].map((i) => quantile(i / 6).toFixed(1)).join(', ')}]`,
);

const spread = new Map<number, number>();
for (const rating of ratings) spread.set(classify(rating), (spread.get(classify(rating)) ?? 0) + 1);
console.log(
  'with the bands as they stand: ' +
    [1, 2, 3, 4, 5, 6].map((level) => `L${level} ${spread.get(level) ?? 0}`).join(', '),
);
