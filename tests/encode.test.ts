import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodePuzzle, encodePuzzle } from '../src/core/encode.ts';

const RECORD = '4|0000089009700000';

test('decode rebuilds clues from the answer, so they cannot disagree', () => {
  const puzzle = decodePuzzle(RECORD, 1, 1);
  assert.equal(puzzle.size, 4);
  assert.equal(puzzle.runs.length, 4);
  assert.ok(puzzle.runs.every((run) => run.cells.length >= 2 && run.cells.length <= 9));
  const across = puzzle.runs.find((run) => run.dir === 'across' && run.cells[0] === 5);
  assert.equal(across?.sum, 17);
  assert.equal(encodePuzzle(puzzle), RECORD);
});

test('a malformed pack record is refused', () => {
  assert.throws(() => decodePuzzle('4|00', 1, 1), /malformed/);
  assert.throws(() => decodePuzzle('x|0000000000000000', 1, 1), /malformed/);
});
