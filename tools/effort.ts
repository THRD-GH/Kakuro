/** Raw effort shares per technique tier, to scale the within-rung split. */
import { sampleCandidate } from '../src/core/generator.ts';
import { mulberry32 } from '../src/core/rng.ts';
import { Solver } from '../src/core/solver.ts';
const rnd = mulberry32(0x2468);
const tiers = new Map();
for (const size of [9, 11, 14, 18]) {
  for (let i = 0; i < 10; i++) {
    const c = sampleCandidate(size, 0.28 + (i % 4) * 0.04, null, rnd, 400);
    if (!c) continue;
    const g = new Solver(c.puzzle).grind();
    const white = c.puzzle.solution.filter((d) => d > 0).length;
    const share = g.effort / white;
    if (!tiers.has(g.hardest)) tiers.set(g.hardest, []);
    tiers.get(g.hardest).push(share);
  }
}
for (const [tech, shares] of tiers) {
  const s = shares.sort((a, b) => a - b);
  console.log(`${(tech ?? '-').padEnd(22)} n=${String(s.length).padStart(2)}  min ${s[0].toFixed(3)}  med ${s[Math.floor(s.length/2)].toFixed(3)}  max ${s[s.length-1].toFixed(3)}`);
}
