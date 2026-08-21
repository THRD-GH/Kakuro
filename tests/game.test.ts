// The board as the player edits it: writing, rubbing out, pencil marks, undo,
// and the save that has to survive the app being killed mid-puzzle.
import assert from 'node:assert/strict';
import test from 'node:test';

import { bit, digitsOf } from '../src/core/bits.ts';
import { generatePuzzle } from '../src/core/generator.ts';
import { Game } from '../src/game/state.ts';

const id = { size: 9, level: 1, number: 1 } as const;
const puzzle = generatePuzzle(id);

const newGame = () => new Game(id, puzzle);
const firstAnswerCell = () => puzzle.solution.findIndex((d) => d > 0);

test('writing a digit, and taking it out again', () => {
  const game = newGame();
  const cell = firstAnswerCell();

  game.write(cell, 5, false);
  assert.equal(game.values[cell], 5);
  game.write(cell, 0, false);
  assert.equal(game.values[cell], 0);
});

test('clue cells are not writable', () => {
  const game = newGame();
  const clue = puzzle.solution.findIndex((d) => d === 0);
  game.write(clue, 4, false);
  game.toggleMark(clue, 4);
  assert.equal(game.values[clue], 0);
  assert.equal(game.marks[clue], 0);
});

test('writing a digit tidies the pencil marks in both its runs', () => {
  const game = newGame();
  const cell = firstAnswerCell();
  const across = game.acrossRun(cell);
  const down = game.downRun(cell);
  const peers = [...new Set([...(across?.cells ?? []), ...(down?.cells ?? [])])].filter((c) => c !== cell);

  for (const peer of peers) game.toggleMark(peer, 7);
  game.write(cell, 7, true);

  for (const peer of peers) {
    assert.equal(game.marks[peer] & bit(7), 0, 'a 7 was left pencilled in the same run as a written 7');
  }
});

test('tidying can be switched off', () => {
  const game = newGame();
  const cell = firstAnswerCell();
  const peer = game.acrossRun(cell).cells.find((c) => c !== cell);
  game.toggleMark(peer, 7);
  game.write(cell, 7, false);
  assert.ok(game.marks[peer] & bit(7), 'marks should be left alone when tidying is off');
});

test('pencil marks toggle, and an answer hides but does not burn them', () => {
  const game = newGame();
  const cell = firstAnswerCell();

  game.toggleMark(cell, 3);
  game.toggleMark(cell, 8);
  assert.deepEqual(digitsOf(game.marks[cell]), [3, 8]);
  game.toggleMark(cell, 3);
  assert.deepEqual(digitsOf(game.marks[cell]), [8]);

  // The board shows the answer instead of the marks, but the thinking that led
  // there survives rubbing the answer out again. Only Clear empties both.
  game.write(cell, 4, false);
  assert.deepEqual(digitsOf(game.marks[cell]), [8]);
  game.write(cell, 0, false);
  assert.deepEqual(digitsOf(game.marks[cell]), [8]);
  game.erase(cell);
  assert.equal(game.marks[cell], 0, 'Clear empties both');
});

test('undo winds back to the empty grid, and redo puts it back', () => {
  const game = newGame();
  const cells = puzzle.solution.map((d, c) => (d ? c : -1)).filter((c) => c >= 0).slice(0, 6);

  for (const cell of cells) game.write(cell, puzzle.solution[cell], true);
  assert.ok(game.canUndo);
  assert.ok(!game.canRedo);

  while (game.undo());
  assert.ok(game.values.every((v) => v === 0), 'undo should reach the empty grid');
  assert.ok(!game.canUndo);

  while (game.redo());
  for (const cell of cells) assert.equal(game.values[cell], puzzle.solution[cell]);
});

test('a new move abandons the redo stack', () => {
  const game = newGame();
  const [a, b] = puzzle.solution.map((d, c) => (d ? c : -1)).filter((c) => c >= 0);
  game.write(a, 1, false);
  game.undo();
  assert.ok(game.canRedo);
  game.write(b, 2, false);
  assert.ok(!game.canRedo, 'redo should not survive a fresh move');
});

test('completion is the whole grid being right, not merely full', () => {
  const game = newGame();
  const cells = puzzle.solution.map((d, c) => (d ? c : -1)).filter((c) => c >= 0);

  for (const cell of cells) game.write(cell, puzzle.solution[cell], true);
  assert.ok(game.complete);
  assert.deepEqual(game.wrongCells(), []);
  assert.deepEqual(game.emptyCells(), []);

  const wrong = ((puzzle.solution[cells[0]] + 1) % 9) + 1;
  game.write(cells[0], wrong, false);
  assert.ok(!game.complete, 'a full grid with a wrong digit is not complete');
  assert.deepEqual(game.wrongCells(), [cells[0]]);
});

test('run progress reports what is left, and flags a repeat', () => {
  const game = newGame();
  const run = puzzle.runs[0];

  const before = game.progress(run);
  assert.equal(before.left, run.sum);
  assert.ok(!before.full);

  for (const cell of run.cells) game.write(cell, puzzle.solution[cell], false);
  const after = game.progress(run);
  assert.ok(after.full);
  assert.equal(after.left, 0);
  assert.ok(!after.repeated);

  if (run.cells.length >= 2) {
    game.write(run.cells[1], puzzle.solution[run.cells[0]], false);
    assert.ok(game.progress(run).repeated, 'a repeated digit in a run should be flagged');
  }
});

test('a game survives being saved and reopened', () => {
  const game = newGame();
  const cells = puzzle.solution.map((d, c) => (d ? c : -1)).filter((c) => c >= 0);
  game.write(cells[0], puzzle.solution[cells[0]], true);
  game.toggleMark(cells[1], 4);
  game.toggleMark(cells[1], 9);
  game.hints = 2;
  game.checks = 1;
  game.start();

  const save = JSON.parse(JSON.stringify(game.toSave()));
  const reopened = new Game(id, puzzle, save);

  assert.deepEqual(reopened.values, game.values);
  assert.deepEqual(reopened.marks, game.marks);
  assert.equal(reopened.hints, 2);
  assert.equal(reopened.checks, 1);
  assert.ok(reopened.elapsedMs >= 0);
  assert.deepEqual(digitsOf(reopened.marks[cells[1]]), [4, 9]);
});

test('the clock runs, pauses and does not go backwards', () => {
  const game = newGame();
  assert.equal(game.time, 0);
  assert.ok(!game.running);

  game.start();
  assert.ok(game.running);
  const first = game.time;
  game.pause();
  const paused = game.time;
  assert.ok(paused >= first);
  assert.ok(!game.running);
  assert.equal(game.time, paused, 'a paused clock must not keep counting');
});

test('restart empties the grid but can itself be undone', () => {
  const game = newGame();
  const cell = firstAnswerCell();
  game.write(cell, puzzle.solution[cell], true);
  game.restart();
  assert.ok(game.values.every((v) => v === 0));
  game.undo();
  assert.equal(game.values[cell], puzzle.solution[cell], 'restart should be undoable like any other move');
});

/*
 * The modeless keypad: the cell holds a set of digits, one showing as an
 * answer and two or more as pencil marks. These are the rules that replaced
 * the Notes mode, so they are worth pinning down.
 */
test('a second digit turns an answer into two pencil marks', () => {
  const game = newGame();
  const cell = firstAnswerCell();

  game.tapDigit(cell, 4, false);
  assert.equal(game.values[cell], 4, 'one digit is an answer');
  assert.equal(game.marks[cell], 0);

  game.tapDigit(cell, 7, false);
  assert.equal(game.values[cell], 0, 'two digits are candidates, not an answer');
  assert.equal(game.marks[cell], bit(4) | bit(7));
});

test('crossing marks off until one is left answers the cell', () => {
  const game = newGame();
  const cell = firstAnswerCell();

  for (const digit of [2, 5, 8]) game.tapDigit(cell, digit, false);
  assert.equal(game.marks[cell], bit(2) | bit(5) | bit(8));

  game.tapDigit(cell, 2, false);
  game.tapDigit(cell, 8, false);
  assert.equal(game.values[cell], 5, 'the survivor becomes the answer');
  assert.equal(game.marks[cell], 0);
});

test('a lone mark stays a mark when the player asks for it', () => {
  const game = newGame();
  const cell = firstAnswerCell();

  game.tapDigit(cell, 3, true);
  assert.equal(game.values[cell], 0);
  assert.equal(game.marks[cell], bit(3));

  // Crossing off still resolves, whatever the setting says.
  game.tapDigit(cell, 6, true);
  game.tapDigit(cell, 3, true);
  assert.equal(game.values[cell], 6);
});

test('tapping the digit already in the cell takes it out', () => {
  const game = newGame();
  const cell = firstAnswerCell();

  game.tapDigit(cell, 9, false);
  game.tapDigit(cell, 9, false);
  assert.equal(game.values[cell], 0);
  assert.equal(game.marks[cell], 0);
});

test('a plain tap never touches marks elsewhere, but forcing does', () => {
  const game = newGame();
  const cell = firstAnswerCell();
  const run = game.acrossRun(cell) ?? game.downRun(cell)!;
  const peers = run.cells.filter((c) => c !== cell);

  for (const peer of peers) game.toggleMark(peer, 6);

  game.tapDigit(cell, 6, false);
  for (const peer of peers) {
    assert.equal(game.marks[peer] & bit(6), bit(6), 'a tap is too easy to make by accident');
  }

  game.forceDigit(cell, 6, true);
  assert.equal(game.values[cell], 6);
  for (const peer of peers) assert.equal(game.marks[peer] & bit(6), 0);
});

test('every keypad tap is one undo', () => {
  const game = newGame();
  const cell = firstAnswerCell();

  game.tapDigit(cell, 1, false);
  game.tapDigit(cell, 2, false);
  assert.equal(game.marks[cell], bit(1) | bit(2));

  game.undo();
  assert.equal(game.values[cell], 1);
  game.undo();
  assert.equal(game.values[cell], 0);
  assert.equal(game.marks[cell], 0);
});
