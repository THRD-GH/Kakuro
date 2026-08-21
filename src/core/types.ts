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

/**
 * The boards on offer, as the full grid dimension — a 12 is eleven cells of
 * answers with a margin of clues along the top and left.
 *
 * Size is the player's own choice and sits *beside* the level rather than
 * inside it: a 20 is a longer afternoon than a 9, not a harder one. Four steps
 * rather than a slider, because each has to carry a whole shipped collection
 * and be worth telling apart on a phone.
 */
export const SIZES = [9, 12, 16, 20] as const;

export type Size = (typeof SIZES)[number];

export const isSize = (n: number): n is Size => (SIZES as readonly number[]).includes(n);

/** What each board is called, where there is room for a word but not a grid. */
export const SIZE_LABELS: Record<Size, string> = {
  9: 'Small',
  12: 'Medium',
  16: 'Large',
  20: 'Huge',
};

/** Stable puzzle identifier: size, level, and a number within that pair. */
export interface PuzzleId {
  size: Size;
  level: Level;
  number: number;
  source: Source;
}

/**
 * The key form, used for save slots, history and the `p=` in a shared link.
 *
 * Size leads, because it has to be in here: puzzle 10 of level 3 is a
 * different grid on a 12 than on a 16, and without the size in the key the two
 * would share a save slot and a history entry and quietly overwrite each other.
 */
export const formatPuzzleId = (id: PuzzleId): string =>
  `${id.size}-${id.level}-${id.source === 'new' ? 'N' : ''}${id.number}`;

const ID_PATTERN = /^(\d{1,2})-([1-6])-(N?)(\d+)$/;

export function parsePuzzleId(raw: string): PuzzleId | null {
  const match = ID_PATTERN.exec(raw.trim());
  if (!match) return null;
  const size = Number(match[1]);
  if (!isSize(size)) return null;
  return {
    size,
    level: Number(match[2]) as Level,
    source: match[3] ? 'new' : 'classic',
    number: Number(match[4]),
  };
}

export const samePuzzle = (a: PuzzleId, b: PuzzleId): boolean =>
  formatPuzzleId(a) === formatPuzzleId(b);

/**
 * The id as dandoku.com prints it, KA for Kakuro. The size is left out: it is
 * on screen beside this in every place the id appears, as `12×12`, and a
 * reader who wants to know how big the board is can see the board.
 */
export const displayPuzzleId = (id: PuzzleId): string =>
  `KA${id.level}-${id.source === 'new' ? 'N' : ''}${id.number}`;
