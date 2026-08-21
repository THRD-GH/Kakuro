import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodePuzzle } from '../src/core/encode.ts';
import { GENERATOR_VERSION } from '../src/core/generator.ts';
import { Game } from '../src/game/state.ts';
import { parsePuzzleLink, puzzleLink, recordFinish, saveFitsPuzzle } from '../src/game/storage.ts';
import { formatPuzzleId } from '../src/core/types.ts';
import type { Puzzle, PuzzleId } from '../src/core/types.ts';

const puzzle: Puzzle = decodePuzzle('4|0000089009700000', 1, 1);
const classic: PuzzleId = { size: 9, level: 1, number: 1, source: 'classic' };
const generated: PuzzleId = { size: 12, level: 3, number: 10, source: 'new' };

test('classic links are the puzzle id and nothing else', () => {
  const href = puzzleLink(classic, 'https://dandoku.com/kakuro/');
  assert.equal(href.includes('g='), false);
  assert.deepEqual(parsePuzzleLink(href), { ok: true, id: classic });
});

test('new links carry the generator that made them', () => {
  const href = puzzleLink(generated, 'https://dandoku.com/kakuro/play');
  assert.ok(href.includes(`g=${GENERATOR_VERSION}`));
  assert.deepEqual(parsePuzzleLink(href), { ok: true, id: generated });
});

test('a new link from another generator is stale', () => {
  const href = 'https://dandoku.com/kakuro/?p=12-3-N10&g=0';
  assert.deepEqual(parsePuzzleLink(href, 1), { ok: false, reason: 'stale-generator' });
  const legacy = parsePuzzleLink('https://dandoku.com/kakuro/?p=12-3-N10', 1);
  assert.deepEqual(legacy, { ok: true, id: generated });
});

test('a save for a different grid is dropped', () => {
  const game = new Game(classic, puzzle);
  game.write(5, 8, false);
  const save = game.toSave();
  assert.ok(saveFitsPuzzle(save, puzzle));

  const other = decodePuzzle('4|0000012002100000', 1, 2);
  assert.equal(saveFitsPuzzle(save, other), null);
  assert.equal(saveFitsPuzzle({ ...save, values: save.values.slice(0, 3) }, puzzle), null);
});

test('instant check flags a repeat, not a digit that merely is not the answer', () => {
  const game = new Game(classic, puzzle);
  game.write(5, 9, false);
  game.write(6, 9, false);
  const conflicts = game.conflictCells();
  assert.ok(conflicts.includes(5) && conflicts.includes(6));
  assert.deepEqual(game.wrongCells(), [5]);
});

test('rubbing an answer out leaves the pencil marks that were under it', () => {
  const game = new Game(classic, puzzle);
  game.toggleMark(5, 8);
  game.toggleMark(5, 9);
  game.write(5, 8, false);
  assert.equal(game.values[5], 8);
  assert.equal(game.marks[5] & (1 << 7), 0);
  assert.notEqual(game.marks[5] & (1 << 8), 0);
  game.write(5, 0, false);
  assert.equal(game.values[5], 0);
  assert.notEqual(game.marks[5] & (1 << 8), 0);
});

test('fillMarks is a no-op when the board already has those marks', () => {
  const game = new Game(classic, puzzle);
  const once = game.fillMarks(() => 0x1ff);
  const twice = game.fillMarks(() => 0x1ff);
  assert.equal(once, true);
  assert.equal(twice, false);
  assert.equal(game.canUndo, true);
});

test('check flags travel with the save', () => {
  const game = new Game(classic, puzzle);
  game.write(5, 9, false);
  game.flagged.add(5);
  const save = game.toSave();
  assert.deepEqual(save.flagged, [5]);
  const resumed = new Game(classic, puzzle, save);
  assert.ok(resumed.flagged.has(5));
});

test('replay stats keep the hints from the best time, not a running total', () => {
  // Keyed through formatPuzzleId rather than a literal: the key gained a size
  // when boards became a choice, and a hard-coded one would only say so here.
  const key = formatPuzzleId(classic);
  const first = recordFinish({}, classic, 12_000, 2, 1);
  const slower = recordFinish(first, classic, 20_000, 9, 9);
  assert.equal(slower[key].hints, 2);
  assert.equal(slower[key].checks, 1);
  assert.equal(slower[key].bestMs, 12_000);
  const faster = recordFinish(first, classic, 8_000, 0, 0);
  assert.equal(faster[key].hints, 0);
  assert.equal(faster[key].bestMs, 8_000);
});
