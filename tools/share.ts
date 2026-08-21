/**
 * The share of the grid that needed the hardest technique, by board and rung.
 *
 *   node tools/share.ts [samples]
 *
 * A share is a fraction of cells, and a stuck pocket is a clump rather than a
 * cell, so the same puzzle reads as a bigger fraction on a small board than on
 * a large one. SHARE_SCALE in src/core/solver.ts is the median from here,
 * which is what makes a level mean the same thing on every board.
 */
import { blockFor, sampleCandidate } from '../src/core/generator.ts';
import { mulberry32 } from '../src/core/rng.ts';
import { TECHNIQUE_WEIGHT, measure } from '../src/core/solver.ts';
import { SIZES } from '../src/core/types.ts';

const want = Number(process.argv[2] ?? 24);
const rnd = mulberry32(0x51a4e);

for (const size of SIZES) {
  const byRung = new Map<number, number[]>();
  let made = 0;
  const started = Date.now();
  for (let i = 0; i < want * 6 && made < want; i++) {
    const level = ((i % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6;
    const c = sampleCandidate(size, blockFor(size, level) + (rnd() - 0.5) * 0.05, null, rnd, 300);
    if (!c) continue;
    made++;
    const m = measure(c.puzzle);
    if (!m.solved || !m.hardest) continue;
    const rung = TECHNIQUE_WEIGHT[m.hardest];
    if (rung <= 2) continue; // the bottom rung has no within to measure
    if (!byRung.has(rung)) byRung.set(rung, []);
    byRung.get(rung)!.push(m.share);
  }
  const parts: string[] = [];
  const all: number[] = [];
  for (const [rung, shares] of [...byRung.entries()].sort((a, b) => a[0] - b[0])) {
    const s = shares.sort((a, b) => a - b);
    all.push(...s);
    parts.push(`rung${rung} n=${s.length} med ${s[Math.floor(s.length / 2)].toFixed(3)}`);
  }
  const s = all.sort((a, b) => a - b);
  const median = s.length ? s[Math.floor(s.length / 2)] : 0;
  console.log(
    `${String(size).padStart(2)}: ${parts.join('  ')}  ||  all n=${s.length} median ${median.toFixed(3)}` +
      `  (${((Date.now() - started) / 1000).toFixed(0)}s)`,
  );
}
