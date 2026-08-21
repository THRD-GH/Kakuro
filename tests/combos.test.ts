// What the combination strip offers, which is the part of it that has to be
// right: the display is only a picture of `runState`.
import assert from 'node:assert/strict';
import test from 'node:test';

import { bit, digitsOf } from '../src/core/bits.ts';
import { dealableCombos } from '../src/core/combos.ts';
import { generatePuzzle } from '../src/core/generator.ts';
import { Game } from '../src/game/state.ts';
import { runState } from '../src/ui/combos.ts';

const id = { size: 9, level: 1, number: 1 } as const;
const puzzle = generatePuzzle(id);

const newGame = () => new Game(id, puzzle);
const maskOf = (...digits: number[]) => digits.reduce((mask, d) => mask | bit(d), 0);
const offered = (game: Game, run: (typeof puzzle.runs)[number]) => {
  const { left, masks } = runState(game, run);
  return dealableCombos(left, masks, 0).map((mask) => digitsOf(mask).join(''));
};

/** A run of exactly `length` empty cells, or nothing. */
const runOfLength = (length: number) => puzzle.runs.find((run) => run.cells.length === length);

test('pencil marks narrow what is offered', () => {
  const game = newGame();
  const run = runOfLength(3);
  if (!run) return; // no run of three on this grid

  const before = offered(game, run);
  // The player says the first cell is a 1 or a 2. Every set that cannot put
  // one of those there goes.
  game.pencilInto([run.cells[0]], maskOf(1, 2));
  const after = offered(game, run);

  assert.ok(after.length < before.length, 'marks should cut the list down');
  for (const combo of after) {
    assert.ok(combo.includes('1') || combo.includes('2'), `${combo} has nothing for the marked cell`);
  }
});

test('marks that leave a cell nothing leave the run nothing', () => {
  const game = newGame();
  const run = runOfLength(2) ?? puzzle.runs[0];

  const { masks } = runState(game, run);
  const open = runState(game, run).open;
  // Mark the first empty cell with the one digit it cannot take.
  const impossible = digitsOf(~masks[0] & 0b111111111).find((d) => d >= 1 && d <= 9);
  if (impossible === undefined) return;

  game.pencilInto([open[0]], bit(impossible));
  assert.equal(offered(game, run).length, 0);
});

test('a run counts its gaps, not its empty cells', () => {
  const game = newGame();
  const run = puzzle.runs.find((r) => r.cells.length >= 4);
  if (!run) return;

  assert.equal(runState(game, run).gaps, 1, 'an untouched run is one gap');

  // Break it in the middle: `_ _ d _` and up is two gaps either side.
  game.write(run.cells[1], puzzle.solution[run.cells[1]], false);
  assert.equal(runState(game, run).gaps, 2);

  game.write(run.cells[0], puzzle.solution[run.cells[0]], false);
  assert.equal(runState(game, run).gaps, 1, 'filling the first cell closes the gap before it');
});

test('a written digit is out of the alphabet and out of the total', () => {
  const game = newGame();
  const run = puzzle.runs.find((r) => r.cells.length >= 3)!;
  const digit = puzzle.solution[run.cells[0]];

  game.write(run.cells[0], digit, false);
  const state = runState(game, run);

  assert.equal(state.left, run.sum - digit);
  assert.equal(state.open.length, run.cells.length - 1);
  for (const mask of state.masks) assert.equal(mask & bit(digit), 0);
});
