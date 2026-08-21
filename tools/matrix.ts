/** Targeted generation: can the search hit every (size, level) on demand? */
import { blockFor, classify, sampleCandidate } from '../src/core/generator.ts';
import { mulberry32 } from '../src/core/rng.ts';
import type { Level } from '../src/core/types.ts';

const rnd = mulberry32(0xc0de);
const want = Number(process.argv[2] ?? 2);        // puzzles per cell
const capMs = Number(process.argv[3] ?? 6000);    // give-up time per cell

for (const size of [9, 12, 16, 20]) {
  const row: string[] = [];
  for (const level of [1, 2, 3, 4, 5, 6] as Level[]) {
    const t0 = Date.now();
    let hits = 0;
    for (let attempt = 0; attempt < 60 && hits < want && Date.now() - t0 < capMs; attempt++) {
      const block = blockFor(size, level) + (attempt % 5 - 2) * 0.02;
      const c = sampleCandidate(size, block, level, rnd, 400);
      if (c && classify(c.rating) === level) hits++;
    }
    const each = hits > 0 ? Math.round((Date.now() - t0) / hits) : 0;
    row.push(hits >= want ? `L${level} ${String(each).padStart(4)}ms` : `L${level}  MISS  `);
  }
  console.log(`${String(size).padStart(2)}x${size}: ${row.join(' ')}`);
}
