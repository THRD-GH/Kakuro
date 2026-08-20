import { findSegments } from './layout.ts';
import type { Level, Puzzle, Run } from './types.ts';

/**
 * A puzzle on one line: `size|digits`, where digits reads the grid row by row
 * and a 0 marks a clue cell.
 *
 * That is the whole record. The black pattern is where the zeros are, and
 * every clue is the total of the run it heads — so a pack cannot hold a grid
 * whose clues disagree with its answer, because the clues are not stored at
 * all. It also keeps the packs small: an 11x11 grid is 125 bytes.
 */
export function encodePuzzle(puzzle: Puzzle): string {
  return `${puzzle.size}|${puzzle.solution.join('')}`;
}

export function decodePuzzle(record: string, level: Level, number: number): Puzzle {
  const [head, digits] = record.split('|');
  const size = Number(head);
  if (!Number.isInteger(size) || size < 4 || digits?.length !== size * size) {
    throw new Error(`malformed pack record ${level}-${number}`);
  }

  const solution = [...digits].map(Number);
  if (solution.some((d) => Number.isNaN(d))) {
    throw new Error(`malformed pack record ${level}-${number}`);
  }

  return {
    size,
    solution,
    runs: runsFrom(solution, size),
    difficulty: level,
    seed: number,
    // Packs carry the level, not the score behind it. Nothing on screen shows
    // a rating, and the level is what the ladder is drawn from.
    rating: level,
  };
}

/** Rebuild the clues from an answer grid: a run is a line of non-zero cells. */
export function runsFrom(solution: number[], size: number): Run[] {
  const block = solution.map((digit) => digit === 0);
  return findSegments(block, size).map((segment) => ({
    dir: segment.dir,
    clue: segment.clue,
    cells: segment.cells,
    sum: segment.cells.reduce((total, cell) => total + solution[cell], 0),
  }));
}
