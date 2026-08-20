/**
 * Which grid shapes produce which levels.
 *
 *   node tools/shapes.ts [samples-per-shape]
 *
 * Asks for no particular difficulty and files what comes out, so the PLAN in
 * src/core/generator.ts can point each level at a shape that actually yields
 * it rather than at one that has to be searched for.
 */
import { classify, sampleCandidate } from '../src/core/generator.ts';
import { mulberry32 } from '../src/core/rng.ts';
import { Solver } from '../src/core/solver.ts';

const per = Number(process.argv[2] ?? 20);

const shapes: [number, number][] = [
  [8, 0.44],
  [8, 0.38],
  [9, 0.42],
  [9, 0.34],
  [10, 0.4],
  [10, 0.32],
  [11, 0.38],
  [11, 0.3],
  [11, 0.24],
];

for (const [size, block] of shapes) {
  const rnd = mulberry32(0xbeef);
  const levels = new Map<number, number>();
  const started = Date.now();
  let made = 0;
  const seen: string[] = [];
  for (let i = 0; i < per * 3 && made < per; i++) {
    const candidate = sampleCandidate(size, block, null, rnd);
    if (!candidate) continue;
    made++;
    const level = classify(candidate.rating);
    levels.set(level, (levels.get(level) ?? 0) + 1);
    const hardest = new Solver(candidate.puzzle).grind().hardest ?? '-';
    seen.push(`${candidate.rating.toFixed(1)}/${hardest.slice(0, 4)}`);
  }
  console.log(
    `${size}x${size} block ${block.toFixed(2)}: ` +
      [1, 2, 3, 4, 5, 6].map((l) => `L${l} ${levels.get(l) ?? 0}`).join('  ') +
      `   ${((Date.now() - started) / Math.max(1, made)).toFixed(0)}ms each`,
  );
  console.log('    ' + seen.sort().join(' '));
}
