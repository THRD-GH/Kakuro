/** Difficulty is a 1..6 star level, the same ladder the other DanDoku games use. */
export type Level = 1 | 2 | 3 | 4 | 5 | 6;

export const LEVELS: Level[] = [1, 2, 3, 4, 5, 6];

export type Direction = 'across' | 'down';

/**
 * A maximal straight line of white cells — the thing a clue is a clue for.
 * `cells` reads left to right or top to bottom, so cells[0] is the one next to
 * the clue and the order is the order they are written in.
 */
export interface Run {
  dir: Direction;
  /** The clue cell this run hangs off: to the left of it, or above it. */
  clue: number;
  cells: number[];
  sum: number;
}

/**
 * A grid is `size × size` cells. Row 0 and column 0 are always clue cells, and
 * `solution[i] === 0` marks every other clue cell, so the black pattern and the
 * answer are one and the same array — they cannot drift apart.
 */
export interface Puzzle {
  size: number;
  /** size*size digits; 0 where the cell is a clue cell rather than an answer. */
  solution: number[];
  runs: Run[];
  difficulty: Level;
  seed: number;
  /** What the technique solver had to spend to crack it. */
  rating: number;
}

/** Handy per-cell lookups, derived from the runs rather than stored. */
export interface RunIndex {
  /** Run index of the across run through each cell, or -1. */
  across: Int16Array;
  down: Int16Array;
}

export function indexRuns(puzzle: Puzzle): RunIndex {
  const n = puzzle.size * puzzle.size;
  const across = new Int16Array(n).fill(-1);
  const down = new Int16Array(n).fill(-1);
  puzzle.runs.forEach((run, r) => {
    for (const cell of run.cells) (run.dir === 'across' ? across : down)[cell] = r;
  });
  return { across, down };
}

export const isClue = (puzzle: Puzzle, cell: number): boolean => puzzle.solution[cell] === 0;

/**
 * Where a puzzle comes from. 'classic' plays the shipped collection, 'new'
 * generates one on the spot. Both are numbered per level and both are
 * reproducible from that number, so the two pools are tracked separately.
 */
export type Source = 'classic' | 'new';

export const SOURCES: Source[] = ['classic', 'new'];

export const SOURCE_LABELS: Record<Source, string> = { classic: 'Classic', new: 'New' };

export const sourceLabel = (source: Source): string => SOURCE_LABELS[source];

/** Stable puzzle identifier, displayed as "3-10" classic or "3-N10" new. */
export interface PuzzleId {
  level: Level;
  number: number;
  source: Source;
}

export const formatPuzzleId = (id: PuzzleId): string =>
  `${id.level}-${id.source === 'new' ? 'N' : ''}${id.number}`;

export const samePuzzle = (a: PuzzleId, b: PuzzleId): boolean =>
  a.level === b.level && a.number === b.number && a.source === b.source;

/**
 * The same id as dandoku.com prints it, KA for Kakuro — KA5-27 rather than
 * 5-27. Display only: the plain form is what keys a save, a history entry and
 * a shared link, and those are not worth breaking for two letters.
 */
export const displayPuzzleId = (id: PuzzleId): string => `KA${formatPuzzleId(id)}`;
