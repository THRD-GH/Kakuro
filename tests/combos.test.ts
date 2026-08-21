// What the combination strip offers, which is the part of it that has to be
// right: the display is only a picture of `runState`.
import assert from 'node:assert/strict';
import test from 'node:test';

import { bit, digitsOf, popcount } from '../src/core/bits.ts';
import { dealableCombos } from '../src/core/combos.ts';
import { generatePuzzle } from '../src/core/generator.ts';
import { Game } from '../src/game/state.ts';
import { combosFor } from '../src/core/combos.ts';
import { fillCandidates, runState } from '../src/ui/combos.ts';

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

/*
 * Marks pencils in what the table would say about every cell at once. Two
 * things have to hold: it must never rub out the right digit, and it must not
 * be a solve button. It was one — filling from the technique solver run to a
 * standstill returned a single, correct candidate for every empty cell of an
 * easy grid, so one tap wrote the whole answer in pencil.
 */
test('filled marks never rule out the true answer', () => {
  for (const level of [1, 3, 6]) {
    const id = { size: 9, level, number: 4 } as const;
    const grid = generatePuzzle(id);
    const game = new Game(id, grid);
    const filled = fillCandidates(game);

    for (let cell = 0; cell < grid.solution.length; cell++) {
      const answer = grid.solution[cell];
      if (answer === 0) continue;
      assert.ok(filled[cell] & bit(answer), `level ${level}, cell ${cell} lost its ${answer}`);
    }
  }
});

test('filling the marks does not hand over the grid', () => {
  for (const level of [1, 2, 3]) {
    const id = { size: 9, level, number: 4 } as const;
    const grid = generatePuzzle(id);
    const game = new Game(id, grid);
    const filled = fillCandidates(game);

    const empty = grid.solution.map((d, i) => (d > 0 ? i : -1)).filter((i) => i >= 0);
    const settled = empty.filter((cell) => popcount(filled[cell]) === 1).length;

    // A few naked singles are the point of pencil marks. A gridful is a back
    // door — the old version returned every cell, every time.
    assert.ok(
      settled < empty.length / 2,
      `level ${level}: ${settled} of ${empty.length} cells came back already decided`,
    );
  }
});

test('marks already on the board never narrow the fill', () => {
  const id = { size: 9, level: 2, number: 4 } as const;
  const grid = generatePuzzle(id);
  const game = new Game(id, grid);
  const before = fillCandidates(game);

  // A wrong mark left in a cell must not survive into what Marks writes.
  const cell = grid.solution.findIndex((d) => d > 0);
  game.pencilInto([cell], bit(grid.solution[cell] === 9 ? 8 : 9));
  assert.deepEqual(fillCandidates(game), before);
});

test('Marks offers what the rules allow and stops there', () => {
  const id = { size: 12, level: 3, number: 6 } as const;
  const grid = generatePuzzle(id);
  const game = new Game(id, grid);

  // Part-solved, which is when the cheap definition and a clever one diverge:
  // on an untouched grid every cell takes every digit, so any set that adds up
  // can also be dealt out and the two agree.
  const white = grid.solution.map((d, i) => (d > 0 ? i : -1)).filter((i) => i >= 0);
  for (let i = 0; i < white.length; i += 3) game.write(white[i], grid.solution[white[i]], false);

  /*
   * The definition, worked out again from the rules rather than from the
   * implementation: a digit is possible in a cell when it is not already in
   * either run through it and it appears in some set of the right size that
   * makes what that run has left.
   */
  const expected = new Array<number>(grid.solution.length).fill(0);
  const touched = new Set<number>();
  for (const run of grid.runs) {
    let left = run.sum;
    let used = 0;
    const open: number[] = [];
    for (const cell of run.cells) {
      const digit = game.values[cell];
      if (digit) {
        left -= digit;
        used |= bit(digit);
      } else open.push(cell);
    }
    let union = 0;
    for (const combo of combosFor(open.length, left)) union |= combo;
    for (const cell of open) {
      const allowed = union & ~used;
      expected[cell] = touched.has(cell) ? expected[cell] & allowed : allowed;
      touched.add(cell);
    }
  }

  const actual = fillCandidates(game);
  for (const cell of white) {
    if (game.values[cell]) continue;
    assert.equal(
      actual[cell],
      expected[cell],
      `cell ${cell}: offered ${digitsOf(actual[cell]).join('')}, rules allow ${digitsOf(expected[cell]).join('')}`,
    );
  }
});
