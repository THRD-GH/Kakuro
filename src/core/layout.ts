import type { Direction } from './types.ts';
import { shuffle } from './rng.ts';

/** A maximal straight line of white cells, before it has a sum. */
export interface Segment {
  dir: Direction;
  /** The clue cell it hangs off: immediately left of, or above, cells[0]. */
  clue: number;
  cells: number[];
}

export interface Layout {
  size: number;
  /** true where the cell is a clue cell rather than an answer cell. */
  block: boolean[];
  segments: Segment[];
}

/** No run may be shorter than this: a one-cell run is a clue with the answer written in it. */
const MIN_RUN = 2;
/** Nine distinct digits is the whole alphabet, so nothing can be longer. */
const MAX_RUN = 9;

/**
 * Every maximal white line in the grid, across then down. Row 0 and column 0
 * are always clue cells, so every run has a cell to hang its clue on.
 */
export function findSegments(block: boolean[], size: number): Segment[] {
  const out: Segment[] = [];

  const sweep = (dir: Direction): void => {
    for (let a = 1; a < size; a++) {
      let run: number[] = [];
      for (let b = 1; b <= size; b++) {
        const cell = b < size ? (dir === 'across' ? a * size + b : b * size + a) : -1;
        if (cell >= 0 && !block[cell]) {
          run.push(cell);
          continue;
        }
        if (run.length > 0) {
          out.push({ dir, clue: run[0] - (dir === 'across' ? 1 : size), cells: run });
          run = [];
        }
      }
    }
  };

  sweep('across');
  sweep('down');
  return out;
}

/**
 * No run of one. This is the test a placement is judged against, and it is
 * deliberately not the whole legality test: a grid straight off the press has
 * runs the full width of the board, so refusing every block that leaves one
 * standing would refuse every block there is. Over-long runs are a defect the
 * generator then goes and fixes; short ones can never be fixed, only avoided.
 */
function noShortRuns(block: boolean[], size: number): boolean {
  return findSegments(block, size).every((segment) => segment.cells.length >= MIN_RUN);
}

/** The longest run on the board, which is what the repair pass works down. */
function longestRun(block: boolean[], size: number): number {
  return findSegments(block, size).reduce((most, s) => Math.max(most, s.cells.length), 0);
}

/** One connected field of white cells. */
function connected(block: boolean[], size: number): boolean {
  const white: number[] = [];
  for (let i = 0; i < block.length; i++) if (!block[i]) white.push(i);
  if (white.length === 0) return false;

  const seen = new Set<number>([white[0]]);
  const queue = [white[0]];
  const steps: number[][] = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  while (queue.length > 0) {
    const cell = queue.pop()!;
    const r = Math.floor(cell / size);
    const c = cell % size;
    for (const [dr, dc] of steps) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 1 || nc < 1 || nr >= size || nc >= size) continue;
      const next = nr * size + nc;
      if (block[next] || seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen.size === white.length;
}

/** Runs of a legal length, and one connected field of white cells. */
export function layoutIsLegal(block: boolean[], size: number): boolean {
  const segments = findSegments(block, size);
  if (segments.length === 0) return false;
  for (const segment of segments) {
    if (segment.cells.length < MIN_RUN || segment.cells.length > MAX_RUN) return false;
  }
  return connected(block, size);
}

/**
 * A black pattern for a size by size grid, with 180-degree symmetry through
 * the middle of the answer area.
 *
 * Blocks go in as symmetric pairs, which is what makes a kakuro grid look
 * printed rather than sprayed. Symmetry is a preference and not a rule though:
 * an over-long run has to be broken wherever it can be broken, so the repair
 * pass afterwards places single blocks, and the grid comes out very slightly
 * asymmetric when it has to. Better that than refusing to generate.
 *
 * Returns null when the dice do not fall well; the caller reseeds and retries.
 */
export function makeLayout(size: number, blockRatio: number, rnd: () => number): Layout | null {
  const block = new Array<boolean>(size * size).fill(false);
  for (let i = 0; i < size; i++) {
    block[i] = true; // top clue row
    block[i * size] = true; // left clue column
  }

  const interior: number[] = [];
  for (let r = 1; r < size; r++) for (let c = 1; c < size; c++) interior.push(r * size + c);

  /** The cell this one is mirrored onto, through the centre of the answer area. */
  const partner = (cell: number): number => {
    const r = Math.floor(cell / size);
    const c = cell % size;
    return (size - r) * size + (size - c);
  };

  const wanted = Math.round(interior.length * blockRatio);
  let placed = 0;

  const tryPlace = (cells: number[]): boolean => {
    if (cells.some((cell) => block[cell])) return false;
    for (const cell of cells) block[cell] = true;
    if (noShortRuns(block, size) && connected(block, size)) return true;
    for (const cell of cells) block[cell] = false;
    return false;
  };

  for (const cell of shuffle([...interior], rnd)) {
    if (placed >= wanted) break;
    const pair = partner(cell);
    const cells = pair === cell ? [cell] : [cell, pair];
    if (tryPlace(cells)) placed += cells.length;
  }

  /*
   * Ten digits will not fit in nine cells. A run longer than nine survives the
   * pass above — nothing there is looking for it — so break the leftovers one
   * block at a time, wherever the split leaves both halves playable. Symmetry
   * gives way here: a grid that generates is worth more than a grid that would
   * have been prettier.
   */
  for (let guard = 0; guard < size * size; guard++) {
    if (longestRun(block, size) <= MAX_RUN) break;

    const long = findSegments(block, size).find((s) => s.cells.length > MAX_RUN)!;
    const splits = long.cells.filter((_, i) => i >= MIN_RUN && i <= long.cells.length - MIN_RUN - 1);
    const chosen = shuffle(splits, rnd).find((cell) => tryPlace([cell]));
    if (chosen === undefined) return null;
  }

  if (!layoutIsLegal(block, size)) return null;
  return { size, block, segments: findSegments(block, size) };
}

/**
 * Fill the white cells so that no run repeats a digit, and no four cells form
 * a swap. The sums come from this: in kakuro the answer is written first and
 * the clues are read off it, which is why every clue is guaranteed writable.
 *
 * The swap is the thing to understand here. Take four white cells at the
 * corners of a rectangle, where both rows share an across run across the two
 * columns and both columns share a down run down the two rows:
 *
 *     a b        b a
 *     b a   ->   a b
 *
 * Exchanging them leaves every row multiset and every column multiset exactly
 * as it was, so all four clues still add up and no run repeats a digit — a
 * second answer to the same puzzle, hiding in plain sight. Sampled fills are
 * riddled with these: a grid of any size has hundreds of candidate rectangles
 * and each one lands in the swapped arrangement often enough that a clean fill
 * essentially never occurs by chance. Every puzzle generated before this
 * constraint went in was ambiguous, all of them.
 *
 * So it is enforced while filling rather than tested afterwards. Cells are
 * filled in reading order, which means the cell being placed is always the
 * bottom-right corner of any rectangle it completes, and the other three are
 * already down and can just be read.
 *
 * A swap-free fill is nowhere near a guarantee of uniqueness — longer cycles
 * exist, and on a grid this size they are the rule — but it removes the
 * cheapest ambiguity for free, which leaves the search in the generator with
 * less to do.
 *
 * `keep` is what makes that search possible: pass a partly-filled grid and
 * only the empty cells are filled in, so the generator can re-roll the corner
 * of a grid that came out ambiguous without disturbing the rest of it.
 */
export type Filler = (rnd: () => number, keep?: number[] | null) => number[] | null;

export function makeFiller(layout: Layout): Filler {
  const { size, block, segments } = layout;

  const acrossOf = new Int16Array(size * size).fill(-1);
  const downOf = new Int16Array(size * size).fill(-1);
  segments.forEach((segment, i) => {
    for (const cell of segment.cells) (segment.dir === 'across' ? acrossOf : downOf)[cell] = i;
  });

  const cells: number[] = [];
  for (let i = 0; i < block.length; i++) if (!block[i]) cells.push(i);

  // For each cell: the cells before it in its own across run, and before it in
  // its own down run. Every rectangle it can close has one corner in each.
  const before = new Map(
    cells.map((cell) => [
      cell,
      {
        left: segments[acrossOf[cell]].cells.filter((other) => other < cell),
        above: segments[downOf[cell]].cells.filter((other) => other < cell),
      },
    ]),
  );

  return (rnd, keep) => {
    const values = keep ? keep.slice() : new Array<number>(size * size).fill(0);

    const used = new Int16Array(segments.length);
    for (const cell of cells) {
      if (!values[cell]) continue;
      const b = 1 << (values[cell] - 1);
      used[acrossOf[cell]] |= b;
      used[downOf[cell]] |= b;
    }

    const todo = cells.filter((cell) => !values[cell]);
    const orders = todo.map(() => shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rnd));

    const makesSwap = (cell: number, digit: number): boolean => {
      const { left, above } = before.get(cell)!;
      for (const sideways of left) {
        if (!values[sideways]) continue;
        for (const upwards of above) {
          if (!values[upwards]) continue;
          // The fourth corner, and the two runs it would have to share.
          const corner = upwards - (cell - sideways);
          if (block[corner] || !values[corner]) continue;
          if (acrossOf[corner] !== acrossOf[upwards]) continue;
          if (downOf[corner] !== downOf[sideways]) continue;
          if (values[corner] === digit && values[sideways] === values[upwards]) return true;
        }
      }
      return false;
    };

    let budget = 300_000;
    const place = (at: number): boolean => {
      if (at === todo.length) return true;
      if (budget-- <= 0) return false;

      const cell = todo[at];
      const taken = used[acrossOf[cell]] | used[downOf[cell]];
      for (const digit of orders[at]) {
        const b = 1 << (digit - 1);
        if (taken & b) continue;
        if (makesSwap(cell, digit)) continue;
        values[cell] = digit;
        used[acrossOf[cell]] |= b;
        used[downOf[cell]] |= b;
        if (place(at + 1)) return true;
        used[acrossOf[cell]] &= ~b;
        used[downOf[cell]] &= ~b;
        values[cell] = 0;
      }
      return false;
    };

    return place(0) ? values : null;
  };
}

/** One complete fill from scratch. */
export function fillLayout(layout: Layout, rnd: () => number): number[] | null {
  return makeFiller(layout)(rnd, null);
}
