/**
 * Checks every shipped puzzle, independently of the thing that made it.
 *
 *   node tools/verify-packs.ts
 *
 * The generator proves uniqueness by finishing the technique ladder, which is
 * sound but is also the generator marking its own homework. This counts the
 * answers by exhaustive search instead, and separately confirms the ladder can
 * finish the grid and that it lands in the level it is filed under.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodePuzzle } from '../src/core/encode.ts';
import { classify } from '../src/core/generator.ts';
import { Solver, countSolutions, rate } from '../src/core/solver.ts';
import { LEVELS, SIZES } from '../src/core/types.ts';

const packs = join(process.cwd(), 'public', 'packs');
let checked = 0;
const problems: string[] = [];

for (const size of SIZES) {
 for (const level of LEVELS) {
  let records: string[];
  try {
    records = JSON.parse(readFileSync(join(packs, `${size}-${level}.json`), 'utf8')) as string[];
  } catch {
    continue;
  }

  const started = Date.now();
  const misfiled: number[] = [];
  for (let i = 0; i < records.length; i++) {
    const number = i + 1;
    const puzzle = decodePuzzle(records[i], level, number);
    checked++;
    if (puzzle.size !== size) {
      problems.push(`${size}-${level}-${number}: filed under ${size} but is a ${puzzle.size}`);
      continue;
    }

    if (puzzle.runs.some((run) => run.cells.length < 2 || run.cells.length > 9)) {
      problems.push(`${size}-${level}-${number}: a run is not between two and nine cells`);
      continue;
    }

    const ground = new Solver(puzzle).grind();
    if (!ground.solved) {
      problems.push(`${size}-${level}-${number}: the technique ladder cannot finish it`);
      continue;
    }
    if (ground.values.some((digit, cell) => digit !== puzzle.solution[cell])) {
      problems.push(`${size}-${level}-${number}: the ladder reaches a different answer`);
      continue;
    }

    const count = countSolutions(puzzle, 2);
    if (count !== 1) problems.push(`${size}-${level}-${number}: ${count} answers, not one`);

    const white = puzzle.solution.filter((digit) => digit > 0).length;
    if (classify(rate(ground, white)) !== level) misfiled.push(number);
  }

  console.log(
    `${size}x${size} level ${level}: ${records.length} puzzles, ${((Date.now() - started) / 1000).toFixed(1)}s` +
      (misfiled.length > 0 ? `, ${misfiled.length} filed under the wrong level` : ''),
  );
  if (misfiled.length > 0) {
    problems.push(`${size}x${size} level ${level}: ${misfiled.length} puzzles measure at a different level`);
  }
 }
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  for (const problem of problems.slice(0, 40)) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`\n${checked} puzzles verified: one answer each, all reachable by technique.`);
