/**
 * Does the generator deliver what it was asked for?
 *
 *   node tools/level-check.ts [size] [per-level]
 *
 * Every puzzle it makes should be unique, finishable by technique alone, and
 * at the level it was asked for. The first two are promises the game makes to
 * the player; the third is one it makes to the ladder.
 */
import { classify, generatePuzzle } from '../src/core/generator.ts';
import { Solver, countSolutions } from '../src/core/solver.ts';
import { LEVELS, isSize } from '../src/core/types.ts';
import type { Level } from '../src/core/types.ts';

const size = Number(process.argv[2] ?? 9);
if (!isSize(size)) throw new Error(`${size} is not a board on offer`);
const per = Number(process.argv[3] ?? 5);

for (const level of LEVELS as Level[]) {
  const started = Date.now();
  const rows: string[] = [];
  let onBand = 0;
  let unique = 0;
  let solvable = 0;

  for (let number = 1; number <= per; number++) {
    const puzzle = generatePuzzle({ size, level, number });
    const ground = new Solver(puzzle).grind();
    const measured = classify(puzzle.rating);
    if (measured === level) onBand++;
    if (countSolutions(puzzle, 2) === 1) unique++;
    if (ground.solved) solvable++;
    rows.push(`${puzzle.rating.toFixed(1)}(L${measured},${ground.hardest ?? '-'})`);
  }

  console.log(
    `${size}x${size} L${level}: ${onBand}/${per} on band, ${unique}/${per} unique, ` +
      `${solvable}/${per} logic-solvable, ${Math.round((Date.now() - started) / per)}ms each`,
  );
  console.log('   ' + rows.join(' '));
}
