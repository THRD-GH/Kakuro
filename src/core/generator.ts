import { runsFrom } from './encode.ts';
import { makeFiller, makeLayout } from './layout.ts';
import type { Filler, Layout } from './layout.ts';
import { mulberry32, seedFor, shuffle } from './rng.ts';
import { Solver, TECHNIQUE_WEIGHT, rate } from './solver.ts';
import type { Level, Puzzle } from './types.ts';
import { popcount } from './bits.ts';

/**
 * Bumped whenever a change here would make an old New puzzle number produce a
 * different grid. Saves and history from an older generator are retired rather
 * than left pointing at a puzzle that no longer exists.
 */
export const GENERATOR_VERSION = 1;

/**
 * The shape of a grid at each level. Size grows gently — a bigger kakuro is a
 * longer sitting rather than a harder one — and the black ratio does the rest:
 * fewer blocks means longer runs, more combinations per clue, and less that
 * falls out of the arithmetic on its own.
 */
const PLAN: Record<Level, { size: number; block: number }> = {
  1: { size: 8, block: 0.42 },
  2: { size: 9, block: 0.38 },
  3: { size: 9, block: 0.34 },
  4: { size: 10, block: 0.32 },
  5: { size: 11, block: 0.34 },
  6: { size: 11, block: 0.26 },
};

export const sizeForLevel = (level: Level): number => PLAN[level].size;

/** The shape a level is generated at, for the pack builder. */
export const planFor = (level: Level): { size: number; block: number } => PLAN[level];

/**
 * Where each level starts on the rating scale in `rate()`.
 *
 * Three of these are the rungs of the technique ladder, which is what
 * difficulty in kakuro really is: 18 is where a puzzle stops giving its digits
 * up to combination sums alone, and 36 is where it stops giving them up
 * without dealing combinations out cell by cell. The other three sit *inside*
 * a rung, and split it by how much of the grid put up a fight.
 *
 * They are set from the spread the generator actually produces —
 * `node tools/shapes.ts` reprints it — rather than from round numbers, because
 * a boundary outside the achievable range is a level nothing can reach.
 */
export const BANDS: number[] = [0, 15, 18, 21.8, 36, 40.6];

export function classify(rating: number): Level {
  let level: Level = 1;
  for (let i = BANDS.length - 1; i >= 0; i--) {
    if (rating >= BANDS[i]) {
      level = (i + 1) as Level;
      break;
    }
  }
  return level;
}

/** The middle of a level's band — what the search steers towards. */
function target(level: Level): number {
  const low = BANDS[level - 1];
  const high = level === 6 ? BANDS[5] + 6 : BANDS[level];
  return (low + high) / 2;
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

function judge(size: number, values: number[], wanted: number): Verdict {
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

  const white = values.reduce((n, digit) => n + (digit ? 1 : 0), 0);
  const rating = rate(result, white, size);
  const blame: number[] = [];
  for (let cell = 0; cell < values.length; cell++) if (values[cell]) blame.push(cell);
  return { cost: Math.abs(rating - wanted), rating, level: classify(rating), blame, shake: 0.12 };
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
 * cells that are at fault, fill them again, and see whether the grid got
 * closer. Ambiguity first, then answers the technique ladder cannot reach
 * without guessing, then the difficulty band.
 *
 * It is a hill climb over the space of clue sets, and the reason it converges
 * is that the blame is always local: the cells two answers disagree about are
 * exactly the ones whose clues are not saying enough.
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
  const wanted = level === null ? 0 : target(level);
  let values = start;
  let verdict = judge(layout.size, values, wanted);

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

    const nextVerdict = judge(layout.size, next, wanted);
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
export function generatePuzzle(level: Level, number: number): Puzzle {
  const plan = PLAN[level];
  const rnd = mulberry32(seedFor(level, number));

  let fallback: { values: number[]; rating: number } | null = null;

  for (let restart = 0; restart < 12; restart++) {
    const ratio = Math.max(0.16, Math.min(0.46, plan.block + (rnd() - 0.5) * 0.06));
    const layout = makeLayout(plan.size, ratio, rnd);
    if (!layout) continue;

    const fill = makeFiller(layout);
    const start = fill(rnd, null);
    if (!start) continue;

    const found = refine(layout, fill, start, level, rnd, 260);
    if (!found) continue;

    if (classify(found.rating) === level) {
      return {
        ...build(plan.size, found.values),
        difficulty: level,
        seed: number,
        rating: found.rating,
      };
    }
    // A real puzzle at the wrong level still beats no puzzle at all.
    const wanted = target(level);
    if (!fallback || Math.abs(found.rating - wanted) < Math.abs(fallback.rating - wanted)) {
      fallback = found;
    }
  }

  if (!fallback) throw new Error(`could not generate a level ${level} puzzle`);
  return {
    ...build(plan.size, fallback.values),
    difficulty: level,
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
      difficulty: level ?? classify(found.rating),
      seed: 0,
      rating: found.rating,
    },
    rating: found.rating,
    level: classify(found.rating),
  };
}
