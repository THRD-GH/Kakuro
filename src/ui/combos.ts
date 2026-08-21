import { bit, digitsOf } from '../core/bits.ts';
import { findCombos } from '../core/combos.ts';
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
     * A digit no empty cell of this run could take, because the run crossing
     * each of them already has it. Judged across the whole run: blocked at one
     * cell is not blocked for the run.
     */
    let blocked = 0;
    for (let digit = 1; digit <= 9; digit++) {
      const fits = open.some((at) => {
        const crossing = run.dir === 'across' ? game.downRun(at) : game.acrossRun(at);
        if (!crossing) return true;
        return !crossing.cells.some((other) => game.values[other] === digit);
      });
      if (!fits) blocked |= bit(digit);
    }

    const options = findCombos(open.length, left, 0, used);
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
      for (const digit of digitsOf(mask)) {
        chip.append(
          el('em', {
            class: blocked & bit(digit) ? 'blocked' : '',
            text: String(digit),
          }),
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
