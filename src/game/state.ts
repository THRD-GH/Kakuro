import { bit, onlyDigit, popcount } from '../core/bits.ts';
import { indexRuns } from '../core/types.ts';
import type { Puzzle, PuzzleId, Run, RunIndex } from '../core/types.ts';
import { saveFitsPuzzle, type SavedGame } from './storage.ts';

interface Snapshot {
  values: number[];
  marks: number[];
}

/**
 * One puzzle being played: what has been written in, what has been pencilled,
 * how long it has taken, and how to take any of it back.
 *
 * The board is two arrays the same shape as the grid. `values` holds the digit
 * written in a cell, or 0; `marks` holds the pencilled candidates as a nine-bit
 * mask. A cell can hold both — pencil marks stay put underneath an answer, so
 * that taking the answer out again does not throw away the thinking that led
 * to it. Clear is what empties both.
 */
export class Game {
  readonly id: PuzzleId;
  readonly puzzle: Puzzle;
  readonly index: RunIndex;

  values: number[];
  marks: number[];
  elapsedMs: number;
  hints: number;
  checks: number;

  /** Cells Check has flagged as wrong, until they are edited. */
  flagged = new Set<number>();

  private past: Snapshot[] = [];
  private future: Snapshot[] = [];
  private runningSince: number | null = null;

  constructor(id: PuzzleId, puzzle: Puzzle, save?: SavedGame | null) {
    this.id = id;
    this.puzzle = puzzle;
    this.index = indexRuns(puzzle);
    const cells = puzzle.size * puzzle.size;
    const usable = saveFitsPuzzle(save ?? null, puzzle);
    this.values = usable ? usable.values.slice() : new Array<number>(cells).fill(0);
    this.marks = usable ? usable.marks.slice() : new Array<number>(cells).fill(0);
    this.elapsedMs = usable ? usable.elapsedMs : 0;
    this.hints = usable ? usable.hints : 0;
    this.checks = usable ? usable.checks : 0;
    if (usable?.flagged) {
      for (const cell of usable.flagged) {
        if (this.values[cell] && this.values[cell] !== puzzle.solution[cell]) this.flagged.add(cell);
      }
    }
  }

  // ----------------------------------------------------------------- the grid

  isClue(cell: number): boolean {
    return this.puzzle.solution[cell] === 0;
  }

  acrossRun(cell: number): Run | null {
    const at = this.index.across[cell];
    return at < 0 ? null : this.puzzle.runs[at];
  }

  downRun(cell: number): Run | null {
    const at = this.index.down[cell];
    return at < 0 ? null : this.puzzle.runs[at];
  }

  /** The clue a clue cell carries in each direction, if any. */
  cluesAt(cell: number): { across: Run | null; down: Run | null } {
    const across = this.puzzle.runs.find((run) => run.dir === 'across' && run.clue === cell) ?? null;
    const down = this.puzzle.runs.find((run) => run.dir === 'down' && run.clue === cell) ?? null;
    return { across, down };
  }

  /** What a run still has to make up, and whether it has gone over. */
  progress(run: Run): { written: number; left: number; full: boolean; repeated: boolean } {
    let written = 0;
    let seen = 0;
    let repeated = false;
    let filled = 0;
    for (const cell of run.cells) {
      const digit = this.values[cell];
      if (!digit) continue;
      filled++;
      written += digit;
      if (seen & bit(digit)) repeated = true;
      seen |= bit(digit);
    }
    return {
      written,
      left: run.sum - written,
      full: filled === run.cells.length,
      repeated,
    };
  }

  // ------------------------------------------------------------------- edits

  private remember(): void {
    this.past.push({ values: this.values.slice(), marks: this.marks.slice() });
    if (this.past.length > 500) this.past.shift();
    this.future.length = 0;
  }

  /** Write a digit in. Passing 0 rubs the answer out and leaves the marks. */
  write(cell: number, digit: number, autoRemoveMarks: boolean): void {
    if (this.isClue(cell) || this.values[cell] === digit) return;
    this.remember();
    this.values[cell] = digit;
    this.flagged.delete(cell);
    if (digit) this.marks[cell] &= ~bit(digit);

    if (digit && autoRemoveMarks) {
      for (const run of [this.acrossRun(cell), this.downRun(cell)]) {
        if (!run) continue;
        for (const other of run.cells) {
          if (other !== cell) this.marks[other] &= ~bit(digit);
        }
      }
    }
  }

  /**
   * A keypad tap, in the scheme the sudoku games use: the cell holds a *set*
   * of digits, one showing as an answer and two or more as pencil marks.
   *
   * That one idea does away with the Notes mode. Tapping a second digit turns
   * an answer into two marks, tapping a mark takes it out again, and crossing
   * marks off until one is left answers the cell. Nothing has to be switched
   * on first, which matters because the mode was invisible at the moment it
   * counted — you find out which one you were in from what appears in the
   * cell, and by then it is a move to undo.
   */
  tapDigit(cell: number, digit: number, allowSingleMark: boolean): void {
    if (this.isClue(cell)) return;
    this.remember();
    const b = bit(digit);

    if (this.values[cell] !== 0) {
      // Tapping the digit that is already there is how it comes out again.
      if (this.values[cell] === digit && !allowSingleMark) {
        this.values[cell] = 0;
        this.flagged.delete(cell);
        return;
      }
      // Otherwise the answer demotes into the mark set and the new digit
      // joins it — one digit meant an answer, two mean candidates.
      this.marks[cell] = bit(this.values[cell]);
      this.values[cell] = 0;
      this.flagged.delete(cell);
    }

    // Whether this tap took a digit out of the cell rather than putting one in.
    const removing = (this.marks[cell] & b) !== 0;
    this.marks[cell] ^= b;

    /*
     * Crossing candidates off until one survives has answered the cell, so it
     * resolves however the cell was being used. Putting a lone digit in is a
     * different act, and that is the one the setting governs.
     *
     * No tidying of the runs here, deliberately: a tap is easy to make by
     * accident, and it should never strike marks off elsewhere on the board.
     * Forcing an answer is the deliberate version, and that one does.
     */
    if (popcount(this.marks[cell]) === 1 && (removing || !allowSingleMark)) {
      this.values[cell] = onlyDigit(this.marks[cell]);
      this.marks[cell] = 0;
    }
  }

  /** Long-click or double-click: this digit is the answer, the marks go. */
  forceDigit(cell: number, digit: number, autoRemoveMarks: boolean): void {
    if (this.isClue(cell)) return;
    this.remember();
    this.values[cell] = digit;
    this.marks[cell] = 0;
    this.flagged.delete(cell);
    if (!autoRemoveMarks) return;
    for (const run of [this.acrossRun(cell), this.downRun(cell)]) {
      if (!run) continue;
      for (const other of run.cells) {
        if (other !== cell) this.marks[other] &= ~bit(digit);
      }
    }
  }

  toggleMark(cell: number, digit: number): void {
    if (this.isClue(cell) || this.values[cell]) return;
    this.remember();
    this.marks[cell] ^= bit(digit);
  }

  /** Pencil one combination into a run's empty cells, as the table's Pencil in does. */
  pencilInto(cells: number[], mask: number): void {
    const targets = cells.filter((cell) => !this.isClue(cell) && !this.values[cell]);
    if (targets.length === 0) return;
    this.remember();
    for (const cell of targets) this.marks[cell] = mask;
  }

  /** Rub several pencil marks out at once — what a hint's Apply does. */
  rubOut(removals: [number, number][]): void {
    if (!removals.some(([cell, mask]) => this.marks[cell] & mask)) return;
    this.remember();
    for (const [cell, mask] of removals) this.marks[cell] &= ~mask;
  }

  erase(cell: number): void {
    if (this.isClue(cell)) return;
    if (!this.values[cell] && !this.marks[cell]) return;
    this.remember();
    this.values[cell] = 0;
    this.marks[cell] = 0;
    this.flagged.delete(cell);
  }

  /** Pencil in every candidate the rules have not already ruled out. */
  fillMarks(candidates: (cell: number) => number): boolean {
    let changed = false;
    for (let cell = 0; cell < this.values.length; cell++) {
      if (this.isClue(cell) || this.values[cell]) continue;
      const next = candidates(cell);
      if (this.marks[cell] === next) continue;
      if (!changed) this.remember();
      changed = true;
      this.marks[cell] = next;
    }
    return changed;
  }

  restart(): void {
    this.remember();
    this.values.fill(0);
    this.marks.fill(0);
    this.flagged.clear();
  }

  undo(): boolean {
    const previous = this.past.pop();
    if (!previous) return false;
    this.future.push({ values: this.values.slice(), marks: this.marks.slice() });
    this.values = previous.values;
    this.marks = previous.marks;
    this.flagged.clear();
    return true;
  }

  redo(): boolean {
    const next = this.future.pop();
    if (!next) return false;
    this.past.push({ values: this.values.slice(), marks: this.marks.slice() });
    this.values = next.values;
    this.marks = next.marks;
    this.flagged.clear();
    return true;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  // ------------------------------------------------------------------ status

  /** Digits that disagree with the unique answer — what Check marks. */
  wrongCells(): number[] {
    const out: number[] = [];
    for (let cell = 0; cell < this.values.length; cell++) {
      const digit = this.values[cell];
      if (digit && digit !== this.puzzle.solution[cell]) out.push(cell);
    }
    return out;
  }

  /**
   * Digits that already break a run's rules: a repeat, an overshoot, or a full
   * run that does not add up. Instant check uses this rather than the answer.
   */
  conflictCells(): number[] {
    const out = new Set<number>();
    for (const run of this.puzzle.runs) {
      const { full, left, repeated } = this.progress(run);
      if (!repeated && left >= 0 && !(full && left !== 0)) continue;
      for (const cell of run.cells) if (this.values[cell]) out.add(cell);
    }
    return [...out];
  }

  emptyCells(): number[] {
    const out: number[] = [];
    for (let cell = 0; cell < this.values.length; cell++) {
      if (!this.isClue(cell) && !this.values[cell]) out.push(cell);
    }
    return out;
  }

  get complete(): boolean {
    for (let cell = 0; cell < this.values.length; cell++) {
      if (this.isClue(cell)) continue;
      if (this.values[cell] !== this.puzzle.solution[cell]) return false;
    }
    return true;
  }

  // ------------------------------------------------------------------- clock

  start(): void {
    if (this.runningSince === null) this.runningSince = Date.now();
  }

  pause(): void {
    if (this.runningSince === null) return;
    this.elapsedMs += Date.now() - this.runningSince;
    this.runningSince = null;
  }

  get running(): boolean {
    return this.runningSince !== null;
  }

  /** Time on the puzzle, including the stretch currently being timed. */
  get time(): number {
    return this.elapsedMs + (this.runningSince === null ? 0 : Date.now() - this.runningSince);
  }

  toSave(): SavedGame {
    return {
      id: this.id,
      puzzle: this.puzzle,
      values: this.values.slice(),
      marks: this.marks.slice(),
      elapsedMs: this.time,
      hints: this.hints,
      checks: this.checks,
      flagged: [...this.flagged],
    };
  }
}
