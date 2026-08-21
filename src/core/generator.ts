import { runsFrom } from './encode.ts';
import { makeFiller, makeLayout } from './layout.ts';
import type { Filler, Layout } from './layout.ts';
import { mulberry32, seedFor, shuffle } from './rng.ts';
import { Solver, TECHNIQUE_WEIGHT, measure } from './solver.ts';
import type { Level, Puzzle, Size } from './types.ts';
import { popcount } from './bits.ts';

/**
 * Bumped whenever a change here would make an old New puzzle number produce a
 * different grid. Saves and history from an older generator are retired rather
 * than left pointing at a puzzle that no longer exists.
 */
export const GENERATOR_VERSION = 1;

/**
 * How much of a board to black out, given the size asked for and the level
 * wanted. This is the only shape knob: size now comes from the player.
 *
 * Two forces, and the second one is not obvious. Fewer blocks means longer
 * runs, more combinations per clue and less that falls out of the arithmetic,
 * so an easy puzzle wants a denser pattern — that much is expected. But a
 * *bigger* board also wants a denser one to stay easy, because its runs
 * interlock more and the easy techniques run out sooner: sampled at one
 * density, a 20x20 produced nothing below level 5 at all, while the same board
 * at four points denser gave up level 1s and generated three times faster
 * besides. `node tools/density.ts` is where those numbers come from.
 */
export function blockFor(size: number, level: Level): number {
  const forLevel = (6 - level) * 0.03;
  const forSize = Math.max(0, size - 9) * 0.008;
  /*
   * The ceiling is high enough that the hardest corner of the matrix can reach
   * it: level 1 on a 20x20 asks for the whole of a two-hundred-cell grid to
   * fall to the combination union, which needs runs short enough to be nearly
   * self-evident everywhere. The layout saturates on its own well before this
   * — it will not place a block that leaves a run of one — so a generous cap
   * costs nothing on the boards that do not need it.
   */
  return Math.max(0.2, Math.min(0.6, 0.3 + forLevel + forSize));
}

/**
 * Where each level starts, per board.
 *
 * The ladder is calibrated to each board rather than to one absolute scale,
 * and it has to be. A 20x20 that falls to the combination union *everywhere*
 * does not exist — somewhere in two hundred cells something always wants more
 * — so a ladder defined by technique alone left the easiest levels unreachable
 * on the largest boards however long the search ran, and no amount of tuning
 * the metric changed that, because it was a fact about kakuro rather than
 * about the metric.
 *
 * Ranking a puzzle against its own board makes every level exist everywhere by
 * construction, and says something truer besides: a white belt 20x20 is the
 * easiest kind of 20x20, not a 9x9 stretched out. The numbers are the sextiles
 * of what the generator actually produces on each board —
 * `node tools/bands.ts` refits them.
 */
export const BANDS_BY_SIZE: Record<number, number[]> = {
  9: [0, 14.3, 14.7, 15.1, 20.9, 22.3],
  12: [0, 14, 20.5, 23, 38.4, 39.7],
  16: [0, 21.2, 23.5, 27.4, 38.9, 39.8],
  20: [0, 22.5, 39.1, 40, 40.6, 41.3],
};

function bandsFor(size: number): number[] {
  const boards = Object.keys(BANDS_BY_SIZE).map(Number);
  const nearest = boards.reduce((best, at) => (Math.abs(at - size) < Math.abs(best - size) ? at : best));
  return BANDS_BY_SIZE[nearest];
}

export function classify(rating: number, size: number): Level {
  const bands = bandsFor(size);
  let level: Level = 1;
  for (let i = bands.length - 1; i >= 0; i--) {
    if (rating >= bands[i]) {
      level = (i + 1) as Level;
      break;
    }
  }
  return level;
}

/** The middle of a level's band — what the search steers towards. */
function target(level: Level, size: number): number {
  const bands = bandsFor(size);
  const low = bands[level - 1];
  const high = level === 6 ? bands[5] + 2 : bands[level];
  return (low + high) / 2;
}

/**
 * The dearest technique a puzzle at this level may lean on: the rung the top
 * of its band sits in. Anything above that is what makes a grid too hard for
 * the level, and is where the search aims its next re-roll.
 */
function ceilingFor(level: Level, size: number): number {
  const bands = bandsFor(size);
  const top = level === 6 ? 54 : bands[level];
  return Math.max(1, Math.min(9, Math.floor(top / 6)));
}

const build = (size: number, values: number[]): Puzzle => ({
  size,
  solution: values,
  runs: runsFrom(values, size),
  difficulty: 1,
  seed: 0,
  rating: 0,
});

/**
 * How far a grid is from being the puzzle we asked for, and which cells to
 * blame. Lower is better, and the three tiers never overlap: any unique grid
 * beats every ambiguous one, and any grid the ladder can finish beats every
 * grid it cannot.
 */
interface Verdict {
  cost: number;
  rating: number;
  level: Level;
  /** Cells worth re-rolling to improve it. */
  blame: number[];
  /**
   * How much of the blame to re-roll. A grid with the wrong answer count needs
   * shaking hard; a grid that is already a proper puzzle and only sits at the
   * wrong difficulty needs a nudge, because anything more throws away the
   * uniqueness it took the whole search to find and lands back at square one.
   */
  shake: number;
}

/** The cells the ladder could not pin down — the ones whose clues say too little. */
function unresolved(masks: Int16Array, values: number[]): number[] {
  const out: number[] = [];
  for (let cell = 0; cell < values.length; cell++) {
    if (values[cell] && popcount(masks[cell]) > 1) out.push(cell);
  }
  return out;
}

function judge(size: number, values: number[], wanted: number, targetLevel: Level): Verdict {
  const puzzle = build(size, values);
  const solver = new Solver(puzzle);

  /*
   * Nothing here ever counts solutions, and it does not need to. Every rung of
   * the ladder only removes candidates that cannot be right, so a grid the
   * ladder finishes has exactly one answer — the complete solve *is* the
   * uniqueness proof. A grid it cannot finish is not a puzzle yet whether the
   * reason is two answers or one that has to be guessed at, and the cure is
   * the same either way: the cells it could not pin down need clues that say
   * more. Counting them would cost a tree search per round to tell the two
   * failures apart, and then treat them identically.
   */
  const easy = solver.grind(TECHNIQUE_WEIGHT['hidden-single']);
  if (!easy.solved) {
    const stuck = unresolved(easy.masks, values);
    /*
     * Most grids the search looks at are nowhere near being puzzles, and
     * running combination matching over one of those is expensive work to
     * reach a conclusion that was already clear. Only grids the easy
     * techniques nearly finished are worth the rest of the ladder.
     */
    const white = values.reduce((n, digit) => n + (digit ? 1 : 0), 0);
    if (stuck.length > white * 0.3) {
      return { cost: 400 + stuck.length, rating: 100, level: 6, blame: stuck, shake: 0.5 };
    }
  }

  const result = solver.grind();
  if (!result.solved) {
    const stuck = unresolved(result.masks, values);
    return { cost: 200 + stuck.length, rating: 100, level: 6, blame: stuck, shake: 0.5 };
  }

  const scored = measure(puzzle);
  const level = classify(scored.rating, size);
  const cost = Math.abs(scored.rating - wanted);

  /*
   * Which cells to re-roll depends on which way it is wrong, and only one of
   * the two directions can be aimed.
   *
   * Too hard: the cells at fault are exactly the ones the ladder cannot reach
   * without the technique we are trying to avoid. Solve again with the ladder
   * capped at the level asked for, and blame whatever is left standing —
   * everywhere else is already easy enough and re-rolling it would only
   * disturb what works. This is what makes an easy level reachable on a large
   * board, where the pockets needing more are a handful of cells in two
   * hundred and shaking the grid at random never found them.
   *
   * Too easy: there is no such handle. Nothing is at fault, the grid is simply
   * mild, so the whole thing is fair game and a bigger shake churns it faster.
   */
  const blame: number[] = [];
  let shake = 0.12;
  if (level > targetLevel) {
    const capped = new Solver(puzzle).grind(ceilingFor(targetLevel, size));
    for (const cell of unresolved(capped.masks, values)) blame.push(cell);
    shake = 0.5;
  }
  if (blame.length === 0) {
    for (let cell = 0; cell < values.length; cell++) if (values[cell]) blame.push(cell);
    /*
     * The closer the grid already is, the smaller the disturbance. On the
     * larger boards most puzzles land in one tight cluster, so several bands
     * are barely a point wide, and a shake sized for crossing the scale steps
     * straight over them every time. Near the target it creeps instead.
     */
    shake = cost > 4 ? 0.3 : cost > 1.5 ? 0.12 : 0.05;
  }
  return { cost, rating: scored.rating, level, blame, shake };
}

/**
 * Turn a filled grid into the puzzle that was asked for, by re-rolling the
 * parts of it that are wrong.
 *
 * A grid straight from the filler is almost never a kakuro: the clues it
 * implies typically admit dozens of answers, because a run of two summing to
 * 11 says very little and a grid full of them says nothing at all. Rather than
 * throw such a grid away — which is what a generator that samples and rejects
 * does, at odds of thousands to one — this keeps it and works on it. Clear the
 * cells that are at fault, fill them again, and see whether the grid came out
 * closer: first to being a puzzle at all, then to the difficulty asked for.
 *
 * It is a hill climb over the space of clue sets, and the reason it converges
 * is that the blame is always local. The cells the solver could not pin down
 * are exactly the ones whose clues are not saying enough, so those are the
 * cells whose clues get changed — and a clue only changes by rewriting the
 * answer underneath it, which is why this clears and refills rather than
 * editing the totals.
 */
function refine(
  layout: Layout,
  fill: Filler,
  start: number[],
  /** null asks only for a proper puzzle, at whatever difficulty it comes out. */
  level: Level | null,
  rnd: () => number,
  budget: number,
): { values: number[]; rating: number } | null {
  const wanted = level === null ? 0 : target(level, layout.size);
  let values = start;
  const targetLevel = level ?? 6;
  let verdict = judge(layout.size, values, wanted, targetLevel);

  for (let round = 0; round < budget; round++) {
    if (verdict.rating < 100 && (level === null || verdict.level === level)) {
      return { values, rating: verdict.rating };
    }

    const pool = verdict.blame.length > 0 ? verdict.blame : [];
    if (pool.length === 0) return null;

    /*
     * Part of the blame, never fewer than two cells. Clearing all of it throws
     * away the structure that got the grid this far; clearing one cell rarely
     * changes the clues enough to move anything.
     */
    const keep = values.slice();
    const wipe = shuffle([...pool], rnd).slice(0, Math.max(2, Math.ceil(pool.length * verdict.shake)));
    for (const cell of wipe) keep[cell] = 0;

    const next = fill(rnd, keep);
    if (!next) continue;

    const nextVerdict = judge(layout.size, next, wanted, targetLevel);
    // Ties are taken, not just improvements: on a plateau the search has to be
    // free to wander sideways or it sits on one grid until the budget runs out.
    if (nextVerdict.cost <= verdict.cost) {
      values = next;
      verdict = nextVerdict;
    }
  }

  return verdict.rating < 100 ? { values, rating: verdict.rating } : null;
}

/**
 * Puzzle `number` of `level` — the same grid on every device, forever.
 *
 * Every puzzle returned is unique and can be finished by the technique ladder
 * without a single guess. Kakuro that has to be guessed at is not harder, it
 * is worse, so those are thrown away rather than filed at level 6.
 */
export function generatePuzzle(id: { size: Size; level: Level; number: number }): Puzzle {
  const { size, level, number } = id;
  const base = blockFor(size, level);
  const rnd = mulberry32(seedFor(size, level, number));

  let fallback: { values: number[]; rating: number } | null = null;

  for (let restart = 0; restart < 16; restart++) {
    const ratio = Math.max(0.18, Math.min(0.54, base + (rnd() - 0.5) * 0.06));
    const layout = makeLayout(size, ratio, rnd);
    if (!layout) continue;

    const fill = makeFiller(layout);
    const start = fill(rnd, null);
    if (!start) continue;

    const found = refine(layout, fill, start, level, rnd, 420);
    if (!found) continue;

    if (classify(found.rating, size) === level) {
      return { ...build(size, found.values), difficulty: level, seed: number, rating: found.rating };
    }
    // A real puzzle at the wrong level still beats no puzzle at all — but the
    // stars must match the grid, not the number that was asked for.
    const wanted = target(level, size);
    if (!fallback || Math.abs(found.rating - wanted) < Math.abs(fallback.rating - wanted)) {
      fallback = found;
    }
  }

  if (!fallback) throw new Error(`could not generate a level ${level} puzzle at ${size}x${size}`);
  return {
    ...build(size, fallback.values),
    difficulty: classify(fallback.rating, size),
    seed: number,
    rating: fallback.rating,
  };
}

/** One grid of the given shape, for the calibration and pack tools. */
export function sampleCandidate(
  size: number,
  blockRatio: number,
  level: Level | null,
  rnd: () => number,
  budget = 260,
): { puzzle: Puzzle; rating: number; level: Level } | null {
  const layout = makeLayout(size, blockRatio, rnd);
  if (!layout) return null;
  const fill = makeFiller(layout);
  const start = fill(rnd, null);
  if (!start) return null;

  const found = refine(layout, fill, start, level, rnd, budget);
  if (!found) return null;
  return {
    puzzle: {
      ...build(size, found.values),
      difficulty: level ?? classify(found.rating, size),
      seed: 0,
      rating: found.rating,
    },
    rating: found.rating,
    level: classify(found.rating, size),
  };
}
