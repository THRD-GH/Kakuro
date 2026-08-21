import { ALL, bit, digitsOf } from '../core/bits.ts';
import { dealableCombos } from '../core/combos.ts';
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
    let used = 0;
    let left = run.sum;
    const open: number[] = [];
    for (const at of run.cells) {
      const digit = game.values[at];
      if (digit) {
        used |= bit(digit);
        left -= digit;
      } else open.push(at);
    }

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

    /*
     * What each empty cell of this run could still take: anything not already
     * in the run, and not already in the run crossing that cell.
     */
    const masks = open.map((at) => {
      const crossing = run.dir === 'across' ? game.downRun(at) : game.acrossRun(at);
      let mask = ALL & ~used;
      if (crossing) {
        for (const other of crossing.cells) {
          if (game.values[other]) mask &= ~bit(game.values[other]);
        }
      }
      return mask;
    });

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
       * places, and the ones still to come bracketed in the gap they go in.
       * A 39 across reading `8 4 _ _ 5 9` shows as `8 4 (67) 5 9`.
       *
       * Collected at the front — `(67) 8 4 5 9` — it was a list of facts about
       * the run. In place it is a picture of the run, and the brackets can be
       * read straight onto the empty cells without counting along the row to
       * work out which ones they were.
       *
       * A run broken into more than one gap lists the set once, at the first
       * of them, and marks the rest with a dot. Repeating the set at every gap
       * was tried and reads as twice as many digits as there are: `_ 9 _ _`
       * came out `(378) 9 (378)`, which looks like six cells to fill.
       */
      const toWrite = digitsOf(mask);
      let listed = false;
      for (let i = 0; i < run.cells.length; i++) {
        const digit = game.values[run.cells[i]];
        if (digit) {
          chip.append(el('em', { class: 'placed', title: 'already in this run', text: String(digit) }));
          continue;
        }

        // One bracket for the whole gap, however many cells it spans, and only
        // for the first gap: after that a dot marks the cell without claiming
        // the same digits go in it too.
        const gapStart = i === 0 || game.values[run.cells[i - 1]] !== 0;
        if (!gapStart) continue;
        if (listed) {
          chip.append(el('em', { class: 'gap', title: 'also to fill', text: '·' }));
          continue;
        }
        listed = true;
        // An untouched run is all gap, so there is nothing for brackets to
        // separate it from and they would only add noise.
        const bracket = used !== 0;
        chip.append(
          el(
            'span',
            { class: 'combo-open' },
            bracket ? '(' : '',
            ...toWrite.map((each) =>
              el('em', { class: blocked & bit(each) ? 'blocked' : '', text: String(each) }),
            ),
            bracket ? ')' : '',
          ),
        );
      }

      let held = false;
      let timer: number | undefined;
      chip.addEventListener('pointerdown', () => {
        held = false;
        timer = window.setTimeout(() => {
          held = true;
          const key = run.clue * 4 + (run.dir === 'across' ? 0 : 1);
          const set = this.struck.get(key) ?? new Set<number>();
          if (set.has(mask)) set.delete(mask);
          else set.add(mask);
          this.struck.set(key, set);
          this.paint();
        }, 400);
      });
      const stop = (): void => window.clearTimeout(timer);
      chip.addEventListener('pointerleave', stop);
      chip.addEventListener('pointercancel', stop);
      chip.addEventListener('pointerup', () => {
        stop();
        if (!held) this.onPencil(run, mask);
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
