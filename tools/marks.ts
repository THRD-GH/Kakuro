// How much of the answer does Marks hand over? Old (solver) against new (one pass).
import { popcount } from '../src/core/bits.ts';
import { generatePuzzle } from '../src/core/generator.ts';
import { Solver } from '../src/core/solver.ts';
import { Game } from '../src/game/state.ts';
import { fillCandidates } from '../src/ui/combos.ts';

const ALL = 0x1ff;
console.log('             solver-filled     one pass');
console.log('size lvl |  singles  correct   singles  correct   empty');
for (const size of [9, 12, 16, 20]) {
  for (const level of [1, 3, 6]) {
    const id = { size, level, number: 7 } as const;
    const puzzle = generatePuzzle(id);
    const game = new Game(id, puzzle);
    const empty = puzzle.solution.map((d, i) => (d > 0 ? i : -1)).filter((i) => i >= 0);

    const solver = new Solver(puzzle, game.values);
    solver.propagate(false);
    const old = empty.map((c) => (solver.masks[c] === 0 ? ALL : solver.masks[c]));
    const fresh = fillCandidates(game);
    const now = empty.map((c) => fresh[c]);

    const singles = (m: number[]) => m.filter((x) => popcount(x) === 1).length;
    const right = (m: number[]) =>
      m.filter((x, i) => popcount(x) === 1 && x === 1 << (puzzle.solution[empty[i]] - 1)).length;
    const pc = (n: number) => `${String(Math.round((100 * n) / empty.length)).padStart(4)}%`;

    console.log(
      `${String(size).padStart(4)} ${level}   | ${pc(singles(old))}   ${pc(right(old))}    ` +
        `${pc(singles(now))}   ${pc(right(now))}    ${String(empty.length).padStart(4)}`,
    );
  }
}
