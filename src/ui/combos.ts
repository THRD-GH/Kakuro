import { ALL, bit, digitsOf } from '../core/bits.ts';
import { combosFor, dealableCombos } from '../core/combos.ts';
import type { Run } from '../core/types.ts';
import type { Game } from '../game/state.ts';
import { clear, el } from './dom.ts';

/**
 * The combination bar: what can still go in the cell you are on.
 *
 * This is a reference you read *against* the grid, dozens of times a puzzle,
 * so it lives over the foot of the board and follows the cursor. It replaced a
 * panel that opened over the whole screen — 59% of a phone, with the board
 * entirely hidden behind it — which got the relationship backwards: you cannot
 * consult a table about a cell you can no longer see, and you had to close it
 * again before you could even move.
 *
 * Both runs at once, because a kakuro cell is the crossing of two clues and
 * the interesting combinations are the ones that satisfy both. No fields to
 * fill in: the total and the cell count come from the board, and are always
 * the *remaining* ones — digits already written are taken out of the total and
 * out of the alphabet, so what is listed is what could still be written.
 */
export class CombosBar {
  readonly node: HTMLElement;

  private game: Game;
  private onPencil: (run: Run, mask: number) => void;
  private cell = -1;
  /** Combinations ruled out by hand, per run, by digit mask. */
  private struck = new Map<number, Set<number>>();

  constructor(game: Game, onPencil: (run: Run, mask: number) => void) {
    this.game = game;
    this.onPencil = onPencil;
    this.node = el('div', { class: 'combos', 'aria-live': 'polite', 'aria-label': 'Combinations' });
  }

  show(cell: number): void {
    this.cell = cell;
    this.paint();
  }

  refresh(): void {
    this.paint();
  }

  private paint(): void {
    clear(this.node);
    const cell = this.cell;
    if (cell < 0 || this.game.isClue(cell)) {
      this.node.append(el('p', { class: 'combos-idle', text: 'Pick a cell.' }));
      return;
    }

    for (const run of [this.game.acrossRun(cell), this.game.downRun(cell)]) {
      if (run) this.node.append(this.rowFor(run));
    }
  }

  private rowFor(run: Run): HTMLElement {
    const game = this.game;
    const { used, left, open, masks, gaps } = runState(game, run);
    const split = gaps > 1;

    const head = el(
      'b',
      { class: 'combos-clue' },
      el('span', { class: 'combos-sum', text: String(run.sum) }),
      el('span', { class: 'combos-dir', text: run.dir }),
    );

    const row = el('div', { class: `combos-row ${run.dir}` }, head);

    if (open.length === 0) {
      row.append(
        el('span', {
          class: left === 0 ? 'combos-note done' : 'combos-note wrong',
          text: left === 0 ? 'complete' : `over by ${Math.abs(left)}`,
        }),
      );
      return row;
    }

    // A digit nowhere in the run can take is worth dimming where it appears.
    let blocked = 0;
    for (let digit = 1; digit <= 9; digit++) {
      if (!masks.some((mask) => mask & bit(digit))) blocked |= bit(digit);
    }

    /*
     * Only the combinations that can actually be dealt out across these cells.
     * Listing every set that merely adds up buries the two or three that are
     * really available under a dozen the board has already ruled out — and a
     * dozen chips is also what ran the strip off the side of the screen.
     */
    const options = dealableCombos(left, masks, 0);
    if (options.length === 0) {
      row.append(el('span', { class: 'combos-note wrong', text: 'nothing fits' }));
      return row;
    }

    const struck = this.struck.get(run.clue * 4 + (run.dir === 'across' ? 0 : 1)) ?? new Set<number>();
    const list = el('div', { class: 'combos-options' });
    for (const mask of options) {
      const chip = el('button', {
        class: `combo${struck.has(mask) ? ' struck' : ''}${mask & blocked ? ' unlikely' : ''}`,
        type: 'button',
        title: 'Tap to pencil in · hold to rule out',
      });
      /*
       * The run as it sits on the board: the digits already written, in their
       * places, and the ones still to come shown against the cells they go in.
       * A 39 across reading `8 4 _ _ 5 9` shows as `8 4 (67) 5 9`.
       *
       * Collected at the front — `(67) 8 4 5 9` — it was a list of facts about
       * the run. In place it is a picture of the run, and the brackets can be
       * read straight onto the empty cells without counting along the row to
       * work out which ones they were.
       *
       * That only works while the empty cells are one stretch. Once the run is
       * broken into several gaps there is no single place the set belongs, and
       * putting it in the first says something untrue: a 44 across sitting
       * `_ _ _ 3 _ 2 _ _` came out `(456789) 3 · 2 ·`, which reads as six
       * digits going into the first three cells. Repeating the set at every
       * gap is worse — `_ 9 _ _` came out `(378) 9 (378)`, twice as many cells
       * as there are.
       *
       * So a broken run dots every empty cell, which is the one thing that is
       * certainly true of it, and states the set once at the end. The dots
       * also carry how wide each gap is, which the first-gap bracket threw
       * away.
       */
      const toWrite = digitsOf(mask);
      const spell = (): HTMLElement[] =>
        toWrite.map((each) => el('em', { class: blocked & bit(each) ? 'blocked' : '', text: String(each) }));

      let listed = false;
      for (let i = 0; i < run.cells.length; i++) {
        const digit = game.values[run.cells[i]];
        if (digit) {
          chip.append(el('em', { class: 'placed', title: 'already in this run', text: String(digit) }));
          continue;
        }
        if (split) {
          chip.append(el('em', { class: 'gap', title: 'to fill', text: '·' }));
          continue;
        }
        // One bracket for the whole gap, however many cells it spans.
        if (listed) continue;
        listed = true;
        // An untouched run is all gap, so there is nothing for brackets to
        // separate it from and they would only add noise.
        const bracket = used !== 0;
        chip.append(
          el('span', { class: 'combo-open' }, bracket ? '(' : '', ...spell(), bracket ? ')' : ''),
        );
      }
      if (split) {
        chip.append(
          el('span', { class: 'combo-open split' }, el('i', { class: 'combo-eq', text: '=' }), ...spell()),
        );
      }

      /*
       * Tap pencils the combination in, hold rules it out.
       *
       * The hold marks the chip where it stands rather than repainting the
       * strip, and that is the whole point of it. Repainting threw away every
       * chip in the row while the finger was still down, so the release
       * landed on a *freshly built* chip — a different object, with its own
       * `held` still false — and pencilled that combination into the run.
       * Holding a moment too long wrote the digits in and took the rest of
       * the list with them, since the board had changed under it.
       *
       * `this.struck` is what a later repaint reads, so the mark survives one
       * even though nothing is rebuilt here.
       */
      let held = false;
      let pressed = false;
      let timer: number | undefined;
      chip.addEventListener('pointerdown', () => {
        pressed = true;
        held = false;
        timer = window.setTimeout(() => {
          held = true;
          const key = run.clue * 4 + (run.dir === 'across' ? 0 : 1);
          const set = this.struck.get(key) ?? new Set<number>();
          if (set.has(mask)) set.delete(mask);
          else set.add(mask);
          this.struck.set(key, set);
          chip.classList.toggle('struck', set.has(mask));
        }, 400);
      });
      const stop = (): void => {
        window.clearTimeout(timer);
        pressed = false;
      };
      chip.addEventListener('pointerleave', stop);
      chip.addEventListener('pointercancel', stop);
      /*
       * Only the chip that was pressed acts on the release.
       *
       * A finger that lands on one chip and slides onto another before lifting
       * sends the `pointerup` to the second — which had no `pointerdown` of
       * its own, so it read the lift as a tap and pencilled in a combination
       * nobody chose. The chips sit a quarter of an inch apart on a phone.
       *
       * This is what `bindTap` gets right for the rest of the app, where a
       * release on a target that did not see the press is dropped unless the
       * caller asked for drift to be forgiven — right for the grid, where a
       * hurried tap that slides a pixel is still plainly a tap, and wrong
       * here, where the two chips mean different things.
       */
      chip.addEventListener('pointerup', () => {
        const mine = pressed;
        stop();
        if (!held && mine) this.onPencil(run, mask);
      });
      list.append(chip);
    }

    row.append(
      el('span', { class: 'combos-left', text: `${left} in ${open.length}` }),
      list,
    );
    return row;
  }
}

export interface RunState {
  /** Digits already written into the run. */
  used: number;
  /** What the cells still empty have to add up to. */
  left: number;
  /** Those cells, in run order. */
  open: number[];
  /** What each of them could still take, in the same order. */
  masks: number[];
  /** How many separate stretches they form. */
  gaps: number;
}

/**
 * Read a run off the board: what is in it, what is left, and what each empty
 * cell could still take.
 *
 * Kept out of the rendering and exported so it can be tested, because it is
 * the part that decides which combinations are offered — the display is only
 * a picture of what this returns.
 */
export function runState(game: Game, run: Run, respectMarks = true): RunState {
  let used = 0;
  let left = run.sum;
  const open: number[] = [];
  let gaps = 0;

  for (let i = 0; i < run.cells.length; i++) {
    const at = run.cells[i];
    const digit = game.values[at];
    if (digit) {
      used |= bit(digit);
      left -= digit;
      continue;
    }
    open.push(at);
    if (i === 0 || game.values[run.cells[i - 1]] !== 0) gaps++;
  }

  const masks = open.map((at) => {
    // Not a digit already in this run, and not one already in the run crossing
    // this cell.
    let mask = ALL & ~used;
    const crossing = run.dir === 'across' ? game.downRun(at) : game.acrossRun(at);
    if (crossing) {
      for (const other of crossing.cells) {
        if (game.values[other]) mask &= ~bit(game.values[other]);
      }
    }
    /*
     * And not a digit the player has already ruled out here by hand. Pencil
     * marks are the player's own statement about the cell — `8 9` means they
     * have worked out it is one of those two — so a combination that needs a 3
     * there is not on offer, however well it adds up.
     *
     * Ignoring them left the strip showing the same dozen sets it showed from
     * the opening position, long after the player had narrowed the cells down
     * themselves: the one moment the table has least to say is the one moment
     * it was saying most. It also cuts the other way — marks that are wrong
     * can leave a run with nothing that fits, which is worth being told.
     */
    if (respectMarks && game.marks[at]) mask &= game.marks[at];
    return mask;
  });

  return { used, left, open, masks, gaps };
}

/**
 * What is possible in each cell — which is what Marks pencils in.
 *
 * Possible, and no more than that. A digit is offered in a cell when nothing
 * in the rules has ruled it out: it is not already written in either run
 * through the cell, and it appears in at least one set that adds up to what
 * that run has left. Working out which of those survive is the puzzle, and
 * doing it for the player is not saving them writing, it is playing for them.
 *
 * So this deliberately does *less* than the table beside the board. The table
 * lists only combinations that can actually be dealt out across a run's cells
 * — a real deduction, run through a matching — and it does that for one run
 * you asked about. Marks writes into two hundred cells at once and is not
 * asked for, so it stops at the arithmetic.
 *
 * It has been too clever twice. First it filled from the technique solver run
 * to a standstill, which places digits, and placed digits feed the next
 * sweep: on an easy grid one tap returned a single correct candidate for
 * every empty cell — the whole answer, in pencil. Cutting it back to one pass
 * of dealable combinations still left it doing the player's narrowing for
 * them. Sums and repeats are where the line goes.
 */
export function fillCandidates(game: Game): number[] {
  const out = new Array<number>(game.values.length).fill(0);
  const seen = new Array<boolean>(game.values.length).fill(false);

  for (const run of game.puzzle.runs) {
    // Not `respectMarks`: this is what replaces the marks, so reading them
    // first would only ever let a stale one preserve itself.
    const { left, open, masks } = runState(game, run, false);

    // Every digit that appears in any set of the right size and total. No
    // matching, so nothing here depends on which cell could take which digit.
    let union = 0;
    for (const combo of combosFor(open.length, left)) union |= combo;

    for (let i = 0; i < open.length; i++) {
      const cell = open[i];
      // A cell is in two runs and has to satisfy both, so the second run it
      // is reached from narrows what the first allowed. That is the rule of
      // the game, not a deduction on top of it.
      const allowed = masks[i] & union;
      out[cell] = seen[cell] ? out[cell] & allowed : allowed;
      seen[cell] = true;
    }
  }

  return out;
}
