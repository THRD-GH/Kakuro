// The solver is the hint engine, the difficulty rating and the uniqueness
// proof all at once, so a mistake in it is not one bug — it is a hint that
// lies, a level that is wrong, and a puzzle that ships with two answers.
//
// What is tested here is soundness: every deduction it makes must agree with
// the answer the puzzle was built from. It may fail to find a step; it may
// never claim a wrong one.
import assert from 'node:assert/strict';
import test from 'node:test';

import { bit, digitsOf, popcount } from '../src/core/bits.ts';
import { combosFor } from '../src/core/combos.ts';
import { generatePuzzle } from '../src/core/generator.ts';
import { Solver, countSolutions } from '../src/core/solver.ts';
import { LEVELS } from '../src/core/types.ts';
import { mulberry32 } from '../src/core/rng.ts';
import type { Size } from '../src/core/types.ts';

/**
 * A spread across the matrix: several boards, several levels. Generated rather
 * than read from a pack, because there are no packs — every puzzle in the game
 * is made on the device, so these are the very same grids a player would meet.
 */
function samplePuzzles() {
  const out = [];
  for (const size of [9, 12] as Size[]) {
    for (const level of LEVELS) {
      for (let number = 1; number <= 2; number++) {
        out.push(generatePuzzle({ size, level, number }));
      }
    }
  }
  out.push(generatePuzzle({ size: 16, level: 5, number: 1 }));
  return out;
}

const puzzles = samplePuzzles();

test('every step the solver takes agrees with the answer', () => {
  for (const puzzle of puzzles) {
    const solver = new Solver(puzzle);
    for (let guard = 0; guard < 20_000; guard++) {
      const step = solver.step();
      if (!step) break;

      if (step.cell >= 0) {
        assert.equal(
          step.digit,
          puzzle.solution[step.cell],
          `${step.technique} wrote ${step.digit} into cell ${step.cell}, but the answer is ${puzzle.solution[step.cell]}`,
        );
      }
      for (const [cell, mask] of step.removals) {
        assert.ok(
          (mask & bit(puzzle.solution[cell])) === 0,
          `${step.technique} ruled out ${puzzle.solution[cell]} in cell ${cell}, which is the answer there`,
        );
      }
    }
  }
});

test('a hint from a part-finished board is sound too', () => {
  // Hints are asked for mid-puzzle, from a position the solver did not reach
  // itself. Seed correct-but-partial boards and check the same property.
  const rnd = mulberry32(0x51ee7);
  for (const puzzle of puzzles.slice(0, 18)) {
    const white = puzzle.solution.map((d, cell) => (d ? cell : -1)).filter((c) => c >= 0);
    for (const share of [0.25, 0.55, 0.8]) {
      const values = new Array(puzzle.solution.length).fill(0);
      for (const cell of white) if (rnd() < share) values[cell] = puzzle.solution[cell];

      const step = new Solver(puzzle, values).step();
      if (!step) continue;
      if (step.cell >= 0) assert.equal(step.digit, puzzle.solution[step.cell]);
      for (const [cell, mask] of step.removals) {
        assert.ok((mask & bit(puzzle.solution[cell])) === 0);
      }
    }
  }
});

test('the ladder always has something to say until the grid is full', () => {
  // A puzzle that stalls with cells empty is one a player can be stranded on:
  // Hint would shrug, and the level it is filed under would be a fiction.
  for (const puzzle of puzzles) {
    const ground = new Solver(puzzle).grind();
    assert.ok(ground.solved, `level ${puzzle.difficulty} puzzle ${puzzle.seed} cannot be finished by technique`);
    assert.deepEqual(ground.values, puzzle.solution);
  }
});

test('every generated puzzle has exactly one answer', () => {
  // By exhaustive search, which is a different argument from the one the
  // generator makes: it trusts that a complete technique solve is a proof.
  for (const puzzle of puzzles) {
    assert.equal(countSolutions(puzzle, 2), 1, `level ${puzzle.difficulty} puzzle ${puzzle.seed} is not unique`);
  }
});

test('a wrong digit is never silently accepted', () => {
  // Put one wrong digit on the board and the position must become impossible,
  // or at least never resolve to the real answer. This is what stops Check
  // from being the only thing that notices.
  const rnd = mulberry32(99);
  for (const puzzle of puzzles.slice(0, 12)) {
    const white = puzzle.solution.map((d, cell) => (d ? cell : -1)).filter((c) => c >= 0);
    const cell = white[Math.floor(rnd() * white.length)];
    const wrong = ((puzzle.solution[cell] + 3) % 9) + 1;
    if (wrong === puzzle.solution[cell]) continue;

    const values = new Array(puzzle.solution.length).fill(0);
    values[cell] = wrong;
    const ground = new Solver(puzzle, values).grind();
    assert.ok(
      !ground.solved || ground.values[cell] !== puzzle.solution[cell],
      'a board with a wrong digit in it must not solve to the right answer',
    );
  }
});

test('clues are always writable, and runs are always legal', () => {
  for (const puzzle of puzzles) {
    for (const run of puzzle.runs) {
      const size = run.cells.length;
      assert.ok(size >= 2 && size <= 9, `a run of ${size} cells is not playable`);
      assert.ok(
        combosFor(size, run.sum).length > 0,
        `${run.sum} cannot be made from ${size} distinct digits`,
      );
      // The run's own digits must be distinct and add up.
      const digits = run.cells.map((c) => puzzle.solution[c]);
      assert.equal(new Set(digits).size, digits.length, 'a run repeats a digit');
      assert.equal(
        digits.reduce((a, b) => a + b, 0),
        run.sum,
        'a clue does not match the digits under it',
      );
    }
  }
});

test('candidate masks never lose the answer during propagation', () => {
  for (const puzzle of puzzles.slice(0, 20)) {
    const solver = new Solver(puzzle);
    solver.propagate(true);
    for (const cell of solver.white) {
      assert.ok(
        solver.masks[cell] & bit(puzzle.solution[cell]),
        `propagation ruled out the answer in cell ${cell}`,
      );
      assert.ok(popcount(solver.masks[cell]) > 0, 'a cell was left with no candidates');
    }
  }
});

test('the combination table is the real one', () => {
  // Spot-checks against the combinations any kakuro player knows by heart.
  assert.deepEqual(combosFor(2, 3).map(digitsOf), [[1, 2]]);
  assert.deepEqual(combosFor(2, 17).map(digitsOf), [[8, 9]]);
  assert.deepEqual(combosFor(3, 6).map(digitsOf), [[1, 2, 3]]);
  assert.deepEqual(combosFor(3, 24).map(digitsOf), [[7, 8, 9]]);
  assert.equal(combosFor(9, 45).length, 1, 'nine cells summing to 45 is the whole alphabet');
  assert.equal(combosFor(2, 5).length, 2, '5 in two cells is 1+4 or 2+3');
  assert.equal(combosFor(2, 19).length, 0, 'two digits cannot make 19');
  // Ordered as anyone writes them out: 1+6 before 2+5 before 3+4.
  assert.deepEqual(combosFor(2, 7).map(digitsOf), [
    [1, 6],
    [2, 5],
    [3, 4],
  ]);
});
