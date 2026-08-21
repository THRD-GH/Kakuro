// The generator's promises, checked rather than assumed.
//
// Determinism is the one that quietly matters most: a saved game, a history
// entry and a shared link all name a puzzle by number alone, so if a number
// ever produced a different grid, every one of those would silently point at
// something else.
import assert from 'node:assert/strict';
import test from 'node:test';

import { encodePuzzle, decodePuzzle, runsFrom } from '../src/core/encode.ts';
import { BANDS_BY_SIZE, classify, generatePuzzle } from '../src/core/generator.ts';
import { findSegments } from '../src/core/layout.ts';
import { Solver, countSolutions, measure } from '../src/core/solver.ts';
import { seedFor } from '../src/core/rng.ts';
import { LEVELS, SIZES } from '../src/core/types.ts';
import type { Level, Puzzle, Size } from '../src/core/types.ts';

/**
 * A few cells of the size-by-level matrix. Not every pair is reachable — a big
 * board interlocks more, so its easy levels are scarce — so this sticks to the
 * boards that reach everything, plus one large one to prove size is honoured.
 */
const generated: { size: Size; level: Level; number: number; puzzle: Puzzle }[] = [];
for (const level of LEVELS) {
  generated.push({ size: 9, level, number: 1, puzzle: generatePuzzle({ size: 9, level, number: 1 }) });
}
for (const size of [12, 16] as Size[]) {
  generated.push({ size, level: 5, number: 3, puzzle: generatePuzzle({ size, level: 5, number: 3 }) });
}

test('a puzzle number always produces the same grid', () => {
  for (const { size, level, number, puzzle } of generated) {
    const again = generatePuzzle({ size, level, number });
    assert.equal(
      encodePuzzle(again),
      encodePuzzle(puzzle),
      `level ${level} puzzle ${number} came out differently the second time`,
    );
  }
});

test('neighbouring puzzle numbers are not neighbouring grids', () => {
  // The seed mixes the level and the number; without that, puzzle 1 and puzzle
  // 2 of a level would start from adjacent PRNG states and could come out
  // suspiciously alike.
  const seeds = new Set();
  for (const size of SIZES) {
    for (const level of LEVELS) {
      for (let number = 1; number <= 40; number++) seeds.add(seedFor(size, level, number));
    }
  }
  assert.equal(seeds.size, SIZES.length * LEVELS.length * 40, 'two puzzles share a seed');
});

test('generated puzzles are unique and finishable by technique', () => {
  for (const { level, number, puzzle } of generated) {
    const ground = new Solver(puzzle).grind();
    assert.ok(ground.solved, `level ${level} puzzle ${number} needs a guess`);
    assert.deepEqual(ground.values, puzzle.solution, 'the ladder reaches a different answer');
    assert.equal(countSolutions(puzzle, 2), 1, `level ${level} puzzle ${number} has more than one answer`);
  }
});

test('generated puzzles land in the level they were asked for', () => {
  /*
   * The search hits its band the great majority of the time and returns the
   * nearest real puzzle when it does not — labelled with the level it actually
   * plays at, never with the one that was asked for. So this asserts the rate
   * rather than every case, and separately that a near miss never lies.
   */
  let onBand = 0;
  for (const { size, level, puzzle } of generated) {
    const measured = classify(measure(puzzle).rating, size);
    if (measured === level) onBand++;
    assert.equal(puzzle.difficulty, measured, 'the stars must match the grid, not the request');
  }
  assert.ok(
    onBand >= generated.length - 2,
    `only ${onBand} of ${generated.length} landed on the level asked for`,
  );
});

test('every board has six ordered, distinct bands', () => {
  for (const [size, bands] of Object.entries(BANDS_BY_SIZE)) {
    assert.equal(bands.length, 6, `${size} needs six bands`);
    for (let i = 1; i < bands.length; i++) {
      // Strictly increasing, not merely non-decreasing: two equal edges are a
      // level nothing can land in, which is how the ladder used to lose its
      // easiest rungs on the larger boards.
      assert.ok(bands[i] > bands[i - 1], `${size} band ${i} does not rise`);
    }
    assert.equal(classify(bands[0], Number(size)), 1);
    assert.equal(classify(bands[5], Number(size)), 6);
    assert.equal(classify(bands[3] - 0.001, Number(size)), 3, 'a band edge belongs to the level above');
  }
});

test('every board is legal: runs of 2 to 9, all white cells connected', () => {
  for (const { size, level, puzzle } of generated) {
    assert.equal(puzzle.size, size, 'the board is not the size that was asked for');

    const block = puzzle.solution.map((d) => d === 0);
    // Row 0 and column 0 are the clue margin, always.
    for (let i = 0; i < puzzle.size; i++) {
      assert.ok(block[i] && block[i * puzzle.size], 'the top row and left column must be clue cells');
    }

    const segments = findSegments(block, puzzle.size);
    assert.equal(segments.length, puzzle.runs.length, 'runs and segments disagree');
    for (const segment of segments) {
      assert.ok(segment.cells.length >= 2, 'a run of one cell is a clue with the answer in it');
      assert.ok(segment.cells.length <= 9, 'a run longer than nine cannot hold distinct digits');
      assert.ok(block[segment.clue], 'a run hangs off a cell that is not a clue cell');
    }

    // One connected field of white: two islands are two puzzles on one sheet.
    const white = [];
    for (let i = 0; i < block.length; i++) if (!block[i]) white.push(i);
    const seen = new Set([white[0]]);
    const queue = [white[0]];
    while (queue.length > 0) {
      const cell = queue.pop();
      for (const next of [cell - 1, cell + 1, cell - puzzle.size, cell + puzzle.size]) {
        if (next < 0 || next >= block.length || block[next] || seen.has(next)) continue;
        if (Math.abs((next % puzzle.size) - (cell % puzzle.size)) > 1) continue; // no wrapping
        seen.add(next);
        queue.push(next);
      }
    }
    assert.equal(seen.size, white.length, 'the white cells are in more than one piece');
  }
});

test('a puzzle survives the trip through a pack record', () => {
  for (const { level, number, puzzle } of generated) {
    const record = encodePuzzle(puzzle);
    const back = decodePuzzle(record, level, number);
    assert.deepEqual(back.solution, puzzle.solution);
    assert.equal(back.size, puzzle.size);
    assert.equal(back.runs.length, puzzle.runs.length);
    for (let i = 0; i < puzzle.runs.length; i++) {
      assert.equal(back.runs[i].sum, puzzle.runs[i].sum, 'a clue changed in the round trip');
      assert.deepEqual(back.runs[i].cells, puzzle.runs[i].cells);
      assert.equal(back.runs[i].dir, puzzle.runs[i].dir);
    }
  }
});

test('clues are derived, so a record cannot disagree with itself', () => {
  // The record holds only the answer; the clues are read back off it. This is
  // the property that makes that safe.
  const { puzzle } = generated[0];
  const runs = runsFrom(puzzle.solution, puzzle.size);
  for (const run of runs) {
    assert.equal(
      run.cells.reduce((total, cell) => total + puzzle.solution[cell], 0),
      run.sum,
    );
  }
});

test('a malformed record is rejected rather than half-read', () => {
  assert.throws(() => decodePuzzle('9|123', 1, 1), /malformed/);
  assert.throws(() => decodePuzzle('nonsense', 1, 1), /malformed/);
  assert.throws(() => decodePuzzle(`9|${'x'.repeat(81)}`, 1, 1), /malformed/);
});
