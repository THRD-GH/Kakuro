import assert from 'node:assert/strict';
import { test } from 'node:test';
import { combosFor } from '../src/core/combos.ts';
import { decodePuzzle } from '../src/core/encode.ts';
import { BANDS, classify } from '../src/core/generator.ts';
import { Solver, TECHNIQUE_WEIGHT, countSolutions } from '../src/core/solver.ts';

/** 8+9 / 9+7 crossings: every run is a unique combination, and the swap does not work. */
const UNIQUE = '4|0000089009700000';
/** The classic rectangle swap: two answers with every clue still satisfied. */
const SWAP = '4|0000012002100000';

test('17 in two cells is only 8 and 9', () => {
  const combos = combosFor(2, 17);
  assert.equal(combos.length, 1);
  assert.equal(combos[0], (1 << 7) | (1 << 8));
});

test('a unique-combination grid has one answer and the ladder finishes it', () => {
  const puzzle = decodePuzzle(UNIQUE, 1, 1);
  assert.equal(countSolutions(puzzle, 2), 1);
  const ground = new Solver(puzzle).grind();
  assert.equal(ground.solved, true);
  assert.equal(ground.hardest, 'unique-combination');
  assert.deepEqual(ground.values, puzzle.solution);
});

test('a swap rectangle has two answers and the ladder cannot finish it', () => {
  const puzzle = decodePuzzle(SWAP, 1, 1);
  assert.equal(countSolutions(puzzle, 2), 2);
  assert.equal(new Solver(puzzle).grind().solved, false);
});

test('classify uses the published band edges', () => {
  assert.equal(classify(0), 1);
  assert.equal(classify(BANDS[1] - 0.01), 1);
  assert.equal(classify(BANDS[1]), 2);
  assert.equal(classify(BANDS[2]), 3);
  assert.equal(classify(BANDS[3]), 4);
  assert.equal(classify(BANDS[4]), 5);
  assert.equal(classify(BANDS[5]), 6);
  assert.equal(classify(100), 6);
});

test('technique weights keep matching dearer than a filter', () => {
  assert.ok(TECHNIQUE_WEIGHT['combination-matching'] > TECHNIQUE_WEIGHT['combination-filter']);
  assert.ok(TECHNIQUE_WEIGHT['sum-difference'] > TECHNIQUE_WEIGHT['combination-matching']);
});
