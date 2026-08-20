import { bit, digitsOf } from '../core/bits.ts';
import { findCombos } from '../core/combos.ts';
import type { Run } from '../core/types.ts';
import type { Game } from '../game/state.ts';
import { clear, el } from './dom.ts';

/**
 * The combination table, for whichever cell is selected.
 *
 * This is the one aid a kakuro really wants. Working out that 23 in three
 * cells is 6+8+9 and nothing else is the game; working it out for the fourth
 * time in one puzzle is arithmetic homework. So the table shows what is left
 * *now* — the digits already written into the run are taken out of the clue
 * and out of the alphabet, so the combinations listed are the ones that could
 * still go in the cells that are still empty.
 */
export class CombosPanel {
  readonly node: HTMLElement;
  private game: Game;

  constructor(game: Game) {
    this.game = game;
    this.node = el('div', { class: 'combos', 'aria-live': 'polite' });
  }

  show(cell: number): void {
    clear(this.node);
    if (cell < 0 || this.game.isClue(cell)) {
      this.node.append(el('p', { class: 'combos-idle', text: 'Pick a cell to see its combinations.' }));
      return;
    }

    const across = this.game.acrossRun(cell);
    const down = this.game.downRun(cell);
    for (const run of [across, down]) {
      if (run) this.node.append(this.forRun(run, cell));
    }
  }

  private forRun(run: Run, cell: number): HTMLElement {
    const game = this.game;
    let used = 0;
    let open = 0;
    let left = run.sum;
    for (const at of run.cells) {
      const digit = game.values[at];
      if (digit) {
        used |= bit(digit);
        left -= digit;
      } else open++;
    }

    const heading = el(
      'div',
      { class: 'combos-head' },
      el('b', { text: `${run.sum} ${run.dir}` }),
      el('span', {
        text:
          open === 0
            ? left === 0
              ? 'complete'
              : `over by ${Math.abs(left)}`
            : `${left} left in ${open} cell${open === 1 ? '' : 's'}`,
      }),
    );

    const list = el('div', { class: 'combos-list' });
    const options = open === 0 ? [] : findCombos(open, left, 0, used);

    if (options.length === 0) {
      list.append(
        el('p', {
          class: 'combos-none',
          text: open === 0 ? 'Nothing left to place here.' : 'No combination fits — something above is wrong.',
        }),
      );
    } else {
      // The cell in hand tells you which of these are still yours: a
      // combination without one of your candidates in it is somebody else's.
      const mine = game.values[cell] ? bit(game.values[cell]) : 0;
      for (const combo of options.slice(0, 24)) {
        const digits = digitsOf(combo);
        list.append(
          el(
            'span',
            { class: `combo${mine && (combo & mine) === 0 ? ' out' : ''}` },
            ...digits.map((digit) => el('em', { text: String(digit) })),
          ),
        );
      }
      if (options.length > 24) list.append(el('span', { class: 'combo more', text: '…' }));
    }

    return el('section', { class: `combos-run ${run.dir}` }, heading, list);
  }
}
