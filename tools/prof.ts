/**
 * Where the generator's time goes, for one grid of a given shape.
 *
 *   node tools/prof.ts [size] [block-ratio]
 */
import { makeFiller, makeLayout } from '../src/core/layout.ts';
import { runsFrom } from '../src/core/encode.ts';
import { mulberry32 } from '../src/core/rng.ts';
import { Solver, solutions } from '../src/core/solver.ts';

const size = Number(process.argv[2] ?? 11);
const block = Number(process.argv[3] ?? 0.28);
const rnd = mulberry32(17);

let layout = null;
let attempts = 0;
while (!layout && attempts < 200) {
  attempts++;
  layout = makeLayout(size, block, rnd);
}
if (!layout) throw new Error(`no legal layout in ${attempts} attempts`);
console.log(`${size}x${size} block ${block}: layout took ${attempts} attempt(s)`);

const fill = makeFiller(layout);
const values = fill(rnd, null)!;
const puzzle = { size, solution: values, runs: runsFrom(values, size), difficulty: 1 as const, seed: 0, rating: 0 };

let t = Date.now();
const ground = new Solver(puzzle).grind();
console.log(`grind        ${Date.now() - t}ms   solved=${ground.solved} effort=${ground.effort}`);

t = Date.now();
const found = solutions(puzzle, 12);
console.log(`solutions12  ${Date.now() - t}ms   found=${found.length}`);

t = Date.now();
for (let i = 0; i < 20; i++) fill(rnd, null);
console.log(`20 fills     ${Date.now() - t}ms`);

t = Date.now();
let made = 0;
for (let i = 0; i < 40; i++) if (makeLayout(size, block, rnd)) made++;
console.log(`40 layouts   ${Date.now() - t}ms   ${made} legal`);
