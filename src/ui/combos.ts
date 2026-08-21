import { bit, digitsOf } from '../core/bits.ts';
import { findCombos, maxSum, minSum } from '../core/combos.ts';
import type { Run } from '../core/types.ts';
import type { Game } from '../game/state.ts';
import { el } from './dom.ts';
import { openOverlay } from './overlay.ts';

type DigitState = 'neutral' | 'include' | 'exclude';

/**
 * The combination finder, built on the same idea as the sum calculator in
 * Killer Sudoku: the clue is prefilled, digits cycle through required and
 * ruled-out, the list narrows as you go, and when one combination is left it
 * can be pencilled straight into the run.
 *
 * Kakuro has two clues through every cell rather than one cage, so the panel
 * opens on whichever run has more left to give and the other is a tap away.
 * The sum and cell count are the *remaining* ones — digits already written in
 * come out of both, because the question being asked is always "what can still
 * go in the cells that are still empty".
 */
export function openCombinations(
  game: Game,
  cell: number,
  onPencil: (run: Run, mask: number) => void,
): void {
  const runs = [game.acrossRun(cell), game.downRun(cell)].filter((run): run is Run => run !== null);
  if (runs.length === 0) return;

  const openCount = (run: Run): number => run.cells.filter((at) => !game.values[at]).length;
  let current = runs.length > 1 && openCount(runs[1]) > openCount(runs[0]) ? runs[1] : runs[0];

  openOverlay(build(), {
    title: 'Combinations',
    panelClass: 'calc',
    actions: [{ label: 'Done', primary: true }],
  });

  function build(): HTMLElement {
    const body = el('div', { class: 'calc-body' });
    render(body);
    return body;
  }

  function render(body: HTMLElement): void {
    const run = current;
    const written = run.cells.filter((at) => game.values[at]);
    const open = run.cells.filter((at) => !game.values[at]);
    const placed = written.reduce((mask, at) => mask | bit(game.values[at]), 0);
    const left = run.sum - written.reduce((total, at) => total + game.values[at], 0);

    /*
     * Digits no empty cell of this run could take, because each is already
     * written into the run crossing that cell. Judged across the whole run: a
     * digit merely blocked at one cell is not blocked for the run.
     */
    let blocked = 0;
    for (let digit = 1; digit <= 9; digit++) {
      const anywhere = open.some((at) => {
        const crossing = run.dir === 'across' ? game.downRun(at) : game.acrossRun(at);
        if (!crossing) return true;
        return !crossing.cells.some((other) => game.values[other] === digit);
      });
      if (!anywhere) blocked |= bit(digit);
    }
    blocked &= ~placed;

    const state: DigitState[] = Array.from({ length: 10 }, () => 'neutral');
    const struck = new Set<number>();
    let remaining: number[] = [];

    const results = el('div', { class: 'calc-results' });
    const pencil = el('button', { class: 'calc-btn', type: 'button', text: 'Pencil in' });
    pencil.disabled = true;

    const sumField = el('input', {
      type: 'number',
      min: '1',
      max: '45',
      value: String(left),
      inputmode: 'numeric',
      enterkeyhint: 'done',
      'aria-label': 'Total',
    });
    const sizeField = el('input', {
      type: 'number',
      min: '1',
      max: '9',
      value: String(open.length),
      inputmode: 'numeric',
      enterkeyhint: 'done',
      'aria-label': 'Cells',
    });

    /*
     * Wrapped in a form that does nothing but dismiss the keyboard: a phone
     * only offers to close its keypad when the field has somewhere to submit
     * to, and loose in a div the Done key does nothing at all.
     */
    const fields = el(
      'form',
      { class: 'calc-fields' },
      el('label', {}, 'Total', sumField),
      el('label', {}, 'Cells', sizeField),
    );
    fields.addEventListener('submit', (e) => {
      e.preventDefault();
      sumField.blur();
      sizeField.blur();
    });

    const keyFor = (digit: number): string => {
      const marks = [
        state[digit] === 'include' ? 'inc' : state[digit] === 'exclude' ? 'exc' : '',
        placed & bit(digit) ? 'placed' : '',
        blocked & bit(digit) ? 'blocked' : '',
      ].filter(Boolean);
      return `calc-key ${marks.join(' ')}`.trim();
    };

    const keys = el('div', { class: 'calc-keys' });
    const keyNodes: HTMLElement[] = [];
    for (let digit = 1; digit <= 9; digit++) {
      const key = el('button', {
        class: keyFor(digit),
        type: 'button',
        text: String(digit),
        title:
          placed & bit(digit)
            ? 'already written into this run'
            : blocked & bit(digit)
              ? 'cannot go in any empty cell of this run'
              : undefined,
      });
      key.addEventListener('click', () => {
        // Ruling a digit out is the commoner move, so it comes first.
        state[digit] =
          state[digit] === 'neutral' ? 'exclude' : state[digit] === 'exclude' ? 'include' : 'neutral';
        key.className = keyFor(digit);
        run2();
      });
      keyNodes.push(key);
      keys.append(key);
    }

    function run2(): void {
      const size = Math.max(1, Math.min(9, Number(sizeField.value) || 0));
      const sum = Math.max(1, Math.min(45, Number(sumField.value) || 0));
      let include = 0;
      let exclude = 0;
      for (let digit = 1; digit <= 9; digit++) {
        if (state[digit] === 'include') include |= bit(digit);
        if (state[digit] === 'exclude') exclude |= bit(digit);
      }

      results.replaceChildren();
      let matches: number[] = [];
      if (sum < minSum(size) || sum > maxSum(size)) {
        results.append(
          el('p', {
            class: 'calc-none',
            text:
              `${size} cell${size === 1 ? '' : 's'} cannot total ${sum} ` +
              `— the range is ${minSum(size)} to ${maxSum(size)}.`,
          }),
        );
      } else {
        matches = findCombos(size, sum, include, exclude);
        if (matches.length === 0) {
          results.append(el('p', { class: 'calc-none', text: 'Nothing fits those constraints.' }));
        }
        for (const mask of matches) {
          const row = el('button', {
            class: `calc-combo${struck.has(mask) ? ' struck' : ''}`,
            type: 'button',
            title: 'Tap to rule this one out',
          });
          for (const digit of digitsOf(mask)) {
            row.append(
              el('span', {
                class: blocked & bit(digit) ? 'blocked' : placed & bit(digit) ? 'placed' : '',
                text: String(digit),
              }),
            );
          }
          row.addEventListener('click', () => {
            if (struck.has(mask)) struck.delete(mask);
            else struck.add(mask);
            run2();
          });
          results.append(row);
        }
      }

      remaining = matches.filter((mask) => !struck.has(mask));
      pencil.disabled = remaining.length !== 1 || open.length === 0;
      hold();
    }

    /*
     * The list is the only thing here that changes size, and filtering it down
     * used to shrink the panel — moving the buttons underneath while you were
     * still aiming at them. Held at the tallest it has needed, so ruling
     * digits out empties space rather than collapsing it.
     */
    let floor = 0;
    function hold(): void {
      if (!results.isConnected) return;
      results.style.height = 'auto';
      floor = Math.max(floor, results.scrollHeight + 2);
      results.style.height = `${floor}px`;
    }

    sumField.addEventListener('input', run2);
    sizeField.addEventListener('input', run2);

    const reset = el('button', { class: 'calc-btn', type: 'button', text: 'Reset' });
    reset.addEventListener('click', () => {
      for (let digit = 1; digit <= 9; digit++) {
        state[digit] = 'neutral';
        keyNodes[digit - 1].className = keyFor(digit);
      }
      struck.clear();
      sumField.value = String(left);
      sizeField.value = String(open.length);
      run2();
    });

    pencil.addEventListener('click', () => {
      if (remaining.length !== 1) return;
      onPencil(run, remaining[0]);
      pencil.disabled = true;
    });

    const tabs = el('div', { class: 'calc-tabs', role: 'tablist' });
    for (const option of runs) {
      const chosen = option === run;
      const tab = el('button', {
        class: `calc-tab${chosen ? ' on' : ''}`,
        type: 'button',
        role: 'tab',
        'aria-selected': String(chosen),
        text: `${option.sum} ${option.dir}`,
      });
      tab.addEventListener('click', () => {
        current = option;
        render(body);
      });
      tabs.append(tab);
    }

    body.replaceChildren(
      tabs,
      el('p', {
        class: 'calc-lede',
        text:
          open.length === 0
            ? 'This run is full.'
            : `${left} left in ${open.length} cell${open.length === 1 ? '' : 's'}` +
              (placed ? `, with ${digitsOf(placed).join(', ')} already in` : ''),
      }),
      el('div', { class: 'calc-controls' }, keys, fields),
      results,
      el('div', { class: 'calc-foot' }, reset, pencil),
    );
    run2();
    queueMicrotask(hold);
  }
}
