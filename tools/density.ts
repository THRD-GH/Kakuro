/** Does a denser black pattern make a big board easy again? */
import { classify, sampleCandidate } from '../src/core/generator.ts';
import { mulberry32 } from '../src/core/rng.ts';
const rnd = mulberry32(0x7777);
for (const size of [16, 20]) {
  for (const block of [0.34, 0.40, 0.46, 0.52]) {
    const counts = new Map<number, number>(); const t0 = Date.now(); let made = 0;
    for (let i = 0; i < 14; i++) {
      const c = sampleCandidate(size, block, null, rnd, 400);
      if (!c) continue;
      made++;
      const l = classify(c.rating, size);
      counts.set(l, (counts.get(l) ?? 0) + 1);
    }
    console.log(`${size}x${size} b${block.toFixed(2)}: ` +
      [1,2,3,4,5,6].map(l => `L${l} ${counts.get(l) ?? 0}`).join(' ') +
      `  (${made}/14 made, ${((Date.now()-t0)/made||0).toFixed(0)}ms each)`);
  }
}
