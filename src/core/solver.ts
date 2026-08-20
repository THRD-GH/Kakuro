import { ALL, bit, digitsOf, listDigits, onlyDigit, popcount } from './bits.ts';
import { combosFor } from './combos.ts';
import type { Puzzle, Run } from './types.ts';

/**
 * The techniques the solver knows, easiest first. Every deduction the game
 * ever shows a player is one of these, and the difficulty of a puzzle is
 * decided by which of them it forces you to reach for.
 */
export type Technique =
  | 'unique-combination'
  | 'naked-single'
  | 'combination-union'
  | 'hidden-single'
  | 'combination-filter'
  | 'combination-matching'
  | 'sum-difference';

export const TECHNIQUE_NAMES: Record<Technique, string> = {
  'unique-combination': 'Unique combination',
  'naked-single': 'Last digit standing',
  'combination-union': 'Combination union',
  'hidden-single': 'Digit with one home',
  'combination-filter': 'Combination filter',
  'combination-matching': 'Combination matching',
  'sum-difference': 'Sum difference',
};

/** One line each, for the hint panel and the level guide. */
export const TECHNIQUE_BLURBS: Record<Technique, string> = {
  'unique-combination': 'A clue that can be written only one way — 17 in two cells is 8 and 9.',
  'naked-single': 'One digit left in a cell once everything else has been ruled out.',
  'combination-union': 'Several combinations remain, but they agree on which digits are impossible.',
  'hidden-single': 'A digit every remaining combination needs, with one cell left that can hold it.',
  'combination-filter':
    'A combination that adds up but cannot be written in, because its digits have nowhere to go.',
  'combination-matching':
    'Dealing each combination out across the run, and dropping digits no deal can place.',
  'sum-difference':
    'Totalling the clues across a band of the grid, against the runs sitting inside it.',
};

/**
 * What each technique costs, on a scale where the three you use without
 * thinking are 1. The gaps matter more than the numbers: a puzzle that needs
 * matching is a different animal from one that does not, and the ladder in
 * `rate()` is built on that.
 */
export const TECHNIQUE_WEIGHT: Record<Technique, number> = {
  'unique-combination': 1,
  'naked-single': 1,
  'combination-union': 2,
  'hidden-single': 3,
  'combination-filter': 4,
  'combination-matching': 6,
  'sum-difference': 9,
};

export interface Step {
  technique: Technique;
  /** The cell a digit goes into, or -1 when the step only narrows candidates. */
  cell: number;
  digit: number;
  /** The cells the reasoning rests on. A hint tints these. */
  cells: number[];
  /** Candidates struck out, as [cell, mask] pairs. */
  removals: [number, number][];
  text: string;
}

export interface GrindResult {
  /** Every answer cell filled, using nothing but the techniques above. */
  solved: boolean;
  /** The dearest technique the puzzle actually forced. */
  hardest: Technique | null;
  /** The rung weights summed over the sweeps it took — how much work it was. */
  effort: number;
  /** Candidates as they stood when the ladder ran out of ideas. */
  masks: Int16Array;
  values: number[];
}

interface RunInfo {
  dir: Run['dir'];
  clue: number;
  cells: number[];
  sum: number;
  /** Every combination of the right size and sum, before candidates narrow it. */
  combos: number[];
}

/** "the 23 across" — how a clue gets referred to out loud. */
const clueName = (run: RunInfo): string => `the ${run.sum} ${run.dir}`;

/**
 * A perfect matching between a run's cells and a combination's digits. This is
 * the difference between "these digits add up" and "these digits can actually
 * be written in": 8+9 makes 17, but not if both cells have ruled out the 9.
 *
 * Kuhn's algorithm. Runs are at most nine cells, so the simple version is
 * comfortably fast enough.
 */
function hasMatching(cellMasks: number[], combo: number): boolean {
  const digits = digitsOf(combo);
  const n = digits.length;
  if (n !== cellMasks.length) return false;

  const owner = new Int8Array(n).fill(-1);
  const seen = new Uint8Array(n);

  const augment = (cell: number): boolean => {
    for (let d = 0; d < n; d++) {
      if (seen[d]) continue;
      if (!(cellMasks[cell] & bit(digits[d]))) continue;
      seen[d] = 1;
      if (owner[d] === -1 || augment(owner[d])) {
        owner[d] = cell;
        return true;
      }
    }
    return false;
  };

  for (let cell = 0; cell < n; cell++) {
    seen.fill(0);
    if (!augment(cell)) return false;
  }
  return true;
}

/**
 * The kakuro solver — and the same object behind hints, difficulty rating and
 * the uniqueness check the generator runs.
 *
 * It applies one technique at a time, cheapest first, restarting from the top
 * after every deduction, so the step it reports is always the easiest one
 * available. That is the only kind of hint worth giving.
 */
export class Solver {
  readonly size: number;
  readonly masks: Int16Array;
  readonly runs: RunInfo[];
  readonly acrossOf: Int16Array;
  readonly downOf: Int16Array;
  readonly white: number[];

  private solved: Uint8Array;
  /** Set when a deduction empties a cell — the position is impossible. */
  broken = false;

  constructor(puzzle: Puzzle, values?: number[]) {
    this.size = puzzle.size;
    const n = puzzle.size * puzzle.size;
    this.masks = new Int16Array(n);
    this.solved = new Uint8Array(n);
    this.acrossOf = new Int16Array(n).fill(-1);
    this.downOf = new Int16Array(n).fill(-1);
    this.white = [];

    this.runs = puzzle.runs.map((run) => ({
      dir: run.dir,
      clue: run.clue,
      cells: run.cells,
      sum: run.sum,
      combos: combosFor(run.cells.length, run.sum),
    }));

    this.runs.forEach((run, i) => {
      for (const cell of run.cells) (run.dir === 'across' ? this.acrossOf : this.downOf)[cell] = i;
    });

    for (let i = 0; i < n; i++) {
      if (this.acrossOf[i] < 0 && this.downOf[i] < 0) continue;
      this.masks[i] = ALL;
      this.white.push(i);
    }

    if (values) {
      for (const cell of this.white) {
        const digit = values[cell];
        if (digit >= 1 && digit <= 9) this.place(cell, digit);
      }
    }
  }

  // --------------------------------------------------------------- mechanics

  /** Write a digit in and strike it from the rest of both its runs. */
  place(cell: number, digit: number): void {
    this.masks[cell] = bit(digit);
    this.solved[cell] = 1;
    for (const runIndex of [this.acrossOf[cell], this.downOf[cell]]) {
      if (runIndex < 0) continue;
      for (const other of this.runs[runIndex].cells) {
        if (other === cell) continue;
        this.masks[other] &= ~bit(digit);
        if (this.masks[other] === 0) this.broken = true;
      }
    }
  }

  private cut(cell: number, remove: number): void {
    this.masks[cell] &= ~remove;
    if (this.masks[cell] === 0) this.broken = true;
  }

  private digitAt(cell: number): number {
    return this.solved[cell] ? onlyDigit(this.masks[cell]) : 0;
  }

  /** Digits already written into a run, which cells are open, and what is left to make. */
  private state(run: RunInfo): { fixed: number; open: number[]; left: number } {
    let fixed = 0;
    let left = run.sum;
    const open: number[] = [];
    for (const cell of run.cells) {
      const digit = this.digitAt(cell);
      if (digit) {
        fixed |= bit(digit);
        left -= digit;
      } else open.push(cell);
    }
    return { fixed, open, left };
  }

  /**
   * A run with every cell written in is only right if it adds up.
   *
   * Nothing else checks this. Every combination rule narrows *open* cells, so
   * a run with none left is invisible to all of them — and a grid that filled
   * such a run wrongly used to sail through as a second solution. That made
   * the uniqueness test report multiple answers for every puzzle ever
   * generated, which looked exactly like kakuro being hard to generate rather
   * than like a bug.
   */
  private completed(open: number[], left: number): boolean {
    if (open.length > 0) return false;
    if (left !== 0) this.broken = true;
    return true;
  }

  /**
   * The combinations still standing for a run: right sum, containing every
   * digit already written in, and with every remaining digit having somewhere
   * to go. `deep` adds the matching test, which is where this stops being
   * arithmetic and starts being solving.
   */
  private live(run: RunInfo, deep: boolean): number[] {
    const { fixed, open } = this.state(run);
    const masks = open.map((cell) => this.masks[cell]);

    return run.combos.filter((combo) => {
      if ((combo & fixed) !== fixed) return false;
      const rest = combo & ~fixed;
      if (popcount(rest) !== open.length) return false;
      // Cheap first: every open cell must be able to take something from the
      // combination, and every remaining digit must have a cell that will have it.
      let covered = 0;
      for (const mask of masks) {
        if ((mask & rest) === 0) return false;
        covered |= mask & rest;
      }
      if (covered !== rest) return false;
      return deep ? hasMatching(masks, rest) : true;
    });
  }

  isSolved(): boolean {
    return this.white.every((cell) => this.solved[cell] === 1);
  }

  values(): number[] {
    const out = new Array<number>(this.masks.length).fill(0);
    for (const cell of this.white) out[cell] = this.digitAt(cell);
    return out;
  }

  /** A solver at the same position — how the uniqueness search guesses. */
  fork(): Solver {
    const copy: Solver = Object.create(Solver.prototype);
    Object.assign(copy, this);
    (copy as { masks: Int16Array }).masks = Int16Array.from(this.masks);
    copy.solved = Uint8Array.from(this.solved);
    copy.broken = this.broken;
    return copy;
  }

  // -------------------------------------------------------------- the ladder

  /** Narrow every cell in a run to the digits its surviving combinations use. */
  private ruleCombinations(deep: boolean): Step | null {
    for (const run of this.runs) {
      const { fixed, open, left } = this.state(run);
      if (this.completed(open, left)) {
        if (this.broken) return null;
        continue;
      }

      const live = this.live(run, deep);
      if (live.length === 0) {
        this.broken = true;
        return null;
      }

      let union = 0;
      for (const combo of live) union |= combo;
      union &= ~fixed;

      const removals: [number, number][] = [];
      for (const cell of open) {
        const gone = this.masks[cell] & ~union;
        if (gone) removals.push([cell, gone]);
      }
      if (removals.length === 0) continue;

      for (const [cell, gone] of removals) this.cut(cell, gone);
      const struck = removals.reduce((m, [, gone]) => m | gone, 0);

      /*
       * `deep` is only ever reached when the shallow pass just ran and found
       * nothing, so the matching test inside live() is what struck these
       * digits out — a different thing to notice, and a dearer one.
       */
      const technique: Technique = deep
        ? 'combination-filter'
        : live.length === 1
          ? 'unique-combination'
          : 'combination-union';

      return {
        technique,
        cell: -1,
        digit: 0,
        cells: run.cells,
        removals,
        text:
          live.length === 1
            ? `${clueName(run)} can only be ${listDigits(live[0])}.`
            : deep
              ? `Some combinations for ${clueName(run)} add up but cannot be written in, and ` +
                `once those go, ${listDigits(struck)} has nowhere left in the run.`
              : `Every combination left for ${clueName(run)} is made of ${listDigits(union)}, ` +
                `so ${listDigits(struck)} cannot go in it.`,
      };
    }
    return null;
  }

  private ruleNakedSingle(): Step | null {
    for (const cell of this.white) {
      if (this.solved[cell]) continue;
      const mask = this.masks[cell];
      if (popcount(mask) !== 1) continue;
      const digit = onlyDigit(mask);
      this.place(cell, digit);
      return {
        technique: 'naked-single',
        cell,
        digit,
        cells: [cell],
        removals: [],
        text: `Nothing but ${digit} is left for this cell.`,
      };
    }
    return null;
  }

  /**
   * A digit that every surviving combination for a run needs, with only one
   * cell in the run still able to hold it.
   */
  private ruleHiddenSingle(deep: boolean): Step | null {
    for (const run of this.runs) {
      const { fixed, open, left } = this.state(run);
      if (this.completed(open, left)) {
        if (this.broken) return null;
        continue;
      }

      const live = this.live(run, deep);
      if (live.length === 0) {
        this.broken = true;
        return null;
      }

      let required = ALL;
      for (const combo of live) required &= combo;
      required &= ~fixed;

      for (const digit of digitsOf(required)) {
        const homes = open.filter((cell) => this.masks[cell] & bit(digit));
        if (homes.length !== 1) continue;
        const cell = homes[0];
        if (popcount(this.masks[cell]) === 1) continue; // a naked single says it cheaper
        this.place(cell, digit);
        return {
          technique: 'hidden-single',
          cell,
          digit,
          cells: run.cells,
          removals: [],
          text: `${clueName(run)} needs a ${digit}, and this is the only cell in it that can take one.`,
        };
      }
    }
    return null;
  }

  /**
   * The step up from adding digits to placing them. A digit survives in a cell
   * only if some standing combination can be dealt out across the whole run
   * with that digit in that cell — which is where naked pairs, hidden pairs and
   * every other subset argument inside a run come from, without having to name
   * them one at a time.
   */
  private ruleMatching(): Step | null {
    for (const run of this.runs) {
      const { fixed, open, left } = this.state(run);
      if (this.completed(open, left)) {
        if (this.broken) return null;
        continue;
      }
      if (open.length < 2) continue;

      const live = this.live(run, true);
      if (live.length === 0) {
        this.broken = true;
        return null;
      }

      const masks = open.map((cell) => this.masks[cell]);
      const removals: [number, number][] = [];
      for (let i = 0; i < open.length; i++) {
        let supported = 0;
        for (const combo of live) {
          const rest = combo & ~fixed;
          for (const digit of digitsOf(masks[i] & rest & ~supported)) {
            const trial = masks.slice();
            trial[i] = bit(digit);
            if (hasMatching(trial, rest)) supported |= bit(digit);
          }
        }
        const gone = masks[i] & ~supported;
        if (gone) removals.push([open[i], gone]);
      }
      if (removals.length === 0) continue;

      for (const [cell, gone] of removals) this.cut(cell, gone);
      const struck = removals.reduce((m, [, gone]) => m | gone, 0);
      return {
        technique: 'combination-matching',
        cell: -1,
        digit: 0,
        cells: run.cells,
        removals,
        text:
          `No combination for ${clueName(run)} can be dealt out with ${listDigits(struck)} ` +
          `${removals.length === 1 ? 'in that cell' : 'in those cells'} — the rest of the run ` +
          `would have nowhere to go.`,
      };
    }
    return null;
  }

  /**
   * The one that feels like magic. Take a band of rows: the across clues in it
   * total everything written in that band, and the down runs falling entirely
   * inside the band total most of it. What is left over is a cell or two, and
   * their value is the difference — no candidates involved.
   */
  private ruleSumDifference(): Step | null {
    const size = this.size;
    const across = this.runs.filter((run) => run.dir === 'across');
    const down = this.runs.filter((run) => run.dir === 'down');

    const band = (outer: RunInfo[], inner: RunInfo[], label: string): Step | null => {
      const cover = new Set<number>();
      let outerSum = 0;
      for (const run of outer) {
        outerSum += run.sum;
        for (const cell of run.cells) cover.add(cell);
      }

      let innerSum = 0;
      let used = 0;
      const inside = new Set<number>();
      for (const run of inner) {
        if (!run.cells.every((cell) => cover.has(cell))) continue;
        used++;
        innerSum += run.sum;
        for (const cell of run.cells) inside.add(cell);
      }
      if (used === 0) return null;

      const spare = [...cover].filter((cell) => !inside.has(cell));
      if (spare.length === 0 || spare.length > 3) return null;

      let total = outerSum - innerSum;
      const open: number[] = [];
      for (const cell of spare) {
        const digit = this.digitAt(cell);
        if (digit) total -= digit;
        else open.push(cell);
      }
      if (open.length === 0 || open.length > 2) return null;

      const runs = `the ${used} run${used === 1 ? '' : 's'} lying inside them`;
      const sums = `${label} total ${outerSum}, and ${runs} total ${innerSum}.`;

      if (open.length === 1) {
        const cell = open[0];
        if (total < 1 || total > 9 || !(this.masks[cell] & bit(total))) {
          this.broken = true;
          return null;
        }
        this.place(cell, total);
        return {
          technique: 'sum-difference',
          cell,
          digit: total,
          cells: [...cover],
          removals: [],
          text: `${sums} One cell is left over, so it holds the difference: ${total}.`,
        };
      }

      // Two cells over is not a placement, but knowing their total is often
      // enough to cut both of them down.
      const [a, b] = open;
      const sameRun = this.acrossOf[a] === this.acrossOf[b] || this.downOf[a] === this.downOf[b];
      const removals: [number, number][] = [];
      for (const [cell, other] of [
        [a, b],
        [b, a],
      ]) {
        let keep = 0;
        for (const digit of digitsOf(this.masks[cell])) {
          const partner = total - digit;
          if (partner < 1 || partner > 9) continue;
          if (sameRun && partner === digit) continue;
          if (this.masks[other] & bit(partner)) keep |= bit(digit);
        }
        const gone = this.masks[cell] & ~keep;
        if (gone) removals.push([cell, gone]);
      }
      if (removals.length === 0) return null;

      for (const [cell, gone] of removals) this.cut(cell, gone);
      return {
        technique: 'sum-difference',
        cell: -1,
        digit: 0,
        cells: [...cover],
        removals,
        text: `${sums} The two cells left over must make ${total} between them.`,
      };
    };

    /*
     * A single row can hold no down run, and a single column no across run, so
     * bands start at two. Four is as wide as this looks: past that the
     * arithmetic is no longer something anyone does in their head, so it would
     * be rating puzzles by a technique nobody would use.
     */
    for (let span = 2; span <= 4; span++) {
      for (let start = 1; start + span - 1 < size; start++) {
        const rows = across.filter((run) => {
          const row = Math.floor(run.cells[0] / size);
          return row >= start && row < start + span;
        });
        if (rows.length > 0) {
          const step = band(rows, down, `The across clues in these ${span} rows`);
          if (step || this.broken) return step;
        }

        const cols = down.filter((run) => {
          const col = run.cells[0] % size;
          return col >= start && col < start + span;
        });
        if (cols.length > 0) {
          const step = band(cols, across, `The down clues in these ${span} columns`);
          if (step || this.broken) return step;
        }
      }
    }
    return null;
  }

  /** The next deduction available, cheapest technique first. */
  step(): Step | null {
    if (this.broken) return null;

    // The same rungs, in the same order, as grind() sweeps them. A hint that
    // named a technique the level ladder does not use would be a hint about a
    // different game.
    const rules: (() => Step | null)[] = [
      () => this.ruleNakedSingle(),
      () => this.ruleCombinations(false),
      () => this.ruleHiddenSingle(false),
      () => this.ruleCombinations(true),
      () => this.ruleMatching(),
      () => this.ruleSumDifference(),
    ];

    for (const rule of rules) {
      const step = rule();
      if (this.broken) return null;
      if (step) return step;
    }
    return null;
  }

  /**
   * The cheap end of the ladder, run to a standstill and without the
   * bookkeeping. This is what the uniqueness search propagates with, and it is
   * the same three rules `step()` starts with — swept run by run in one pass
   * rather than restarting from the top after every removal, which is right
   * for a hint and far too slow for a search that does this at every guess.
   */
  propagate(deep: boolean): boolean {
    for (let guard = 0; guard < 400; guard++) {
      let changed = false;

      for (const run of this.runs) {
        const { fixed, open, left } = this.state(run);
        if (this.completed(open, left)) {
          if (this.broken) return false;
          continue;
        }

        const live = this.live(run, deep);
        if (live.length === 0) {
          this.broken = true;
          return false;
        }

        let union = 0;
        let required = ALL;
        for (const combo of live) {
          union |= combo;
          required &= combo;
        }
        union &= ~fixed;
        required &= ~fixed;

        for (const cell of open) {
          if (this.masks[cell] & ~union) {
            this.cut(cell, this.masks[cell] & ~union);
            changed = true;
          }
        }
        if (this.broken) return false;

        for (const digit of digitsOf(required)) {
          const homes = open.filter((cell) => this.masks[cell] & bit(digit));
          if (homes.length === 1 && !this.solved[homes[0]]) {
            this.place(homes[0], digit);
            changed = true;
          }
        }
        if (this.broken) return false;
      }

      for (const cell of this.white) {
        if (this.solved[cell] || popcount(this.masks[cell]) !== 1) continue;
        this.place(cell, onlyDigit(this.masks[cell]));
        changed = true;
      }
      if (this.broken) return false;
      if (!changed) break;
    }
    return true;
  }

  // ------------------------------------------------------------- bulk sweeps

  /*
   * The same ladder as step(), applied one rule at a time across the whole
   * grid rather than one deduction at a time.
   *
   * Both end up in the same position. These rules only ever remove candidates
   * that cannot be right, and a set of such rules reaches the same fixed point
   * whatever order they run in. What differs is the cost: a hint wants the
   * single easiest next deduction, so step() goes back to the top of the
   * ladder after every one, while the generator rates thousands of grids and
   * only cares where the ladder gets to. On a 9x9 that is 67ms against a few,
   * which is the difference between a generator that finishes and one that
   * does not.
   */

  /** Narrow every run to the digits its surviving combinations use. */
  private sweepCombinations(deep: boolean): number {
    let weight = 0;
    for (const run of this.runs) {
      const { fixed, open, left } = this.state(run);
      if (this.completed(open, left)) {
        if (this.broken) return -1;
        continue;
      }

      const live = this.live(run, deep);
      if (live.length === 0) {
        this.broken = true;
        return -1;
      }

      let union = 0;
      for (const combo of live) union |= combo;
      union &= ~fixed;

      let changed = false;
      for (const cell of open) {
        const gone = this.masks[cell] & ~union;
        if (!gone) continue;
        this.cut(cell, gone);
        changed = true;
      }
      if (this.broken) return -1;
      /*
       * A run down to one combination is the clue that writes itself, and it
       * is a rung below reading several combinations together — so what this
       * sweep is credited with depends on what it found, not on where it sits.
       */
      if (changed) weight = Math.max(weight, deep ? 4 : live.length === 1 ? 1 : 2);
    }
    return weight;
  }

  private sweepNakedSingles(): number {
    let weight = 0;
    for (const cell of this.white) {
      if (this.solved[cell] || popcount(this.masks[cell]) !== 1) continue;
      this.place(cell, onlyDigit(this.masks[cell]));
      if (this.broken) return -1;
      weight = 1;
    }
    return weight;
  }

  private sweepHiddenSingles(deep: boolean): number {
    let weight = 0;
    for (const run of this.runs) {
      const { fixed, open, left } = this.state(run);
      if (this.completed(open, left)) {
        if (this.broken) return -1;
        continue;
      }

      const live = this.live(run, deep);
      if (live.length === 0) {
        this.broken = true;
        return -1;
      }

      let required = ALL;
      for (const combo of live) required &= combo;
      required &= ~fixed;

      for (const digit of digitsOf(required)) {
        const homes = open.filter((cell) => this.masks[cell] & bit(digit));
        if (homes.length !== 1 || this.solved[homes[0]]) continue;
        this.place(homes[0], digit);
        if (this.broken) return -1;
        weight = 3;
      }
    }
    return weight;
  }

  private sweepMatching(): number {
    let weight = 0;
    for (const run of this.runs) {
      const { fixed, open, left } = this.state(run);
      if (this.completed(open, left)) {
        if (this.broken) return -1;
        continue;
      }
      if (open.length < 2) continue;

      const live = this.live(run, true);
      if (live.length === 0) {
        this.broken = true;
        return -1;
      }

      const masks = open.map((cell) => this.masks[cell]);
      for (let i = 0; i < open.length; i++) {
        let supported = 0;
        for (const combo of live) {
          const rest = combo & ~fixed;
          for (const digit of digitsOf(masks[i] & rest & ~supported)) {
            const trial = masks.slice();
            trial[i] = bit(digit);
            if (hasMatching(trial, rest)) supported |= bit(digit);
          }
        }
        const gone = masks[i] & ~supported;
        if (!gone) continue;
        this.cut(open[i], gone);
        if (this.broken) return -1;
        weight = 6;
      }
    }
    return weight;
  }

  private sweepSumDifference(): number {
    let weight = 0;
    for (let guard = 0; guard < 200; guard++) {
      const step = this.ruleSumDifference();
      if (this.broken) return -1;
      if (!step) break;
      weight = 9;
    }
    return weight;
  }

  /** Carried between grind() calls so the ladder can be climbed in stages. */
  private hardestSoFar: Technique | null = null;
  private effortSoFar = 0;

  /**
   * Where the ladder gets to, and what it cost to get there. This is the
   * rating, and it is also how the game answers "what did that puzzle actually
   * ask of me" once it has been finished.
   *
   * `ceiling` stops it climbing past a given rung. The generator uses that to
   * ask the cheap question first — how far do the easy techniques get on their
   * own? — because most of the grids it looks at are nowhere near being
   * puzzles, and running combination matching over one of those is expensive
   * work to reach a conclusion that was already obvious. Calling it again with
   * a higher ceiling picks up where the last call stopped.
   */
  grind(ceiling = 9): GrindResult {
    let hardest: Technique | null = this.hardestSoFar;
    let effort = this.effortSoFar;

    const rungs: [Technique, () => number][] = [
      ['naked-single', () => this.sweepNakedSingles()],
      ['combination-union', () => this.sweepCombinations(false)],
      ['hidden-single', () => this.sweepHiddenSingles(false)],
      ['combination-filter', () => this.sweepCombinations(true)],
      ['combination-matching', () => this.sweepMatching()],
      ['sum-difference', () => this.sweepSumDifference()],
    ];

    outer: for (let guard = 0; guard < 4_000; guard++) {
      for (const [rung, sweep] of rungs) {
        if (TECHNIQUE_WEIGHT[rung] > ceiling) break;
        const weight = sweep();
        if (this.broken) break outer;
        if (weight <= 0) continue;

        const credited: Technique =
          rung === 'combination-union' && weight === 1 ? 'unique-combination' : rung;
        if (!hardest || TECHNIQUE_WEIGHT[credited] > TECHNIQUE_WEIGHT[hardest]) hardest = credited;
        effort += weight;
        continue outer;
      }
      break;
    }

    this.hardestSoFar = hardest;
    this.effortSoFar = effort;

    return {
      solved: !this.broken && this.isSolved(),
      hardest,
      effort,
      masks: this.masks,
      values: this.values(),
    };
  }
}

/**
 * How hard the puzzle turned out to be.
 *
 * The dearest technique it forced sets the score, six points a rung, and how
 * much work it took on top of that adds up to six more — so a rung spans one
 * gap and never quite reaches the next.
 *
 * The effort term earns its keep. There are only five techniques in the ladder
 * that a generated grid ever really tops out on, and two of those turn up in
 * about one grid in fifty, which is no way to fill six levels. Within one
 * technique, though, the spread is real: a 9x9 that gives up its digits in
 * thirty deductions and an 11x11 that takes seventy are not the same sitting
 * even though the same reasoning cracks both. So each rung splits in two, and
 * board size counts a little towards the harder half.
 *
 * A puzzle the ladder cannot finish scores 100, off the top of `classify()`:
 * the generator throws those away rather than ship a grid that has to be
 * guessed at.
 */
export function rate(result: GrindResult, whiteCells: number, size: number): number {
  if (!result.solved) return 100;
  const hardest = result.hardest ? TECHNIQUE_WEIGHT[result.hardest] : 1;
  const effort = result.effort;
  /*
   * Board size counts here, a little. Two puzzles that both come down to the
   * combination union are not the same sitting when one is 8x8 and the other
   * 11x11, and with the technique tiers six points apart there is room to say
   * so without letting a long easy grid pass for a hard one.
   */
  const work = (effort / Math.max(1, whiteCells)) * 4 + Math.max(0, size - 8) * 0.6;
  return hardest * 6 + Math.max(0, Math.min(5.9, work));
}

/**
 * Answers to a puzzle, up to `limit` of them. Propagation first, then a guess
 * at the tightest cell.
 *
 * The generator asks for more than one because it hill-climbs on the count:
 * knowing a grid has eleven answers rather than two is what tells it whether a
 * change to the clues helped. Which cells those answers disagree about is the
 * other half — that is where the next change gets aimed.
 */
export function solutions(puzzle: Puzzle, limit = 2): number[][] {
  const found: number[][] = [];
  search(new Solver(puzzle), found, limit, 0);
  return found;
}

export function countSolutions(puzzle: Puzzle, limit = 2): number {
  return solutions(puzzle, limit).length;
}

function search(solver: Solver, found: number[][], limit: number, depth: number): void {
  if (found.length >= limit) return;
  if (!solver.propagate(depth < 2)) return;

  let target = -1;
  let best = 10;
  for (const cell of solver.white) {
    const count = popcount(solver.masks[cell]);
    if (count <= 1) continue;
    if (count < best) {
      best = count;
      target = cell;
    }
  }
  if (target === -1) {
    if (solver.isSolved()) found.push(solver.values());
    return;
  }

  for (const digit of digitsOf(solver.masks[target])) {
    const branch = solver.fork();
    branch.place(target, digit);
    search(branch, found, limit, depth + 1);
    if (found.length >= limit) return;
  }
}
