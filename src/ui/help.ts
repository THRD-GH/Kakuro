import { TECHNIQUE_BLURBS, TECHNIQUE_NAMES } from '../core/solver.ts';
import type { Technique } from '../core/solver.ts';
import { el } from './dom.ts';
import { openOverlay } from './overlay.ts';

const LADDER: Technique[] = [
  'unique-combination',
  'combination-union',
  'hidden-single',
  'combination-filter',
  'combination-matching',
  'sum-difference',
];

export function openHelp(): void {
  const body = el('div', { class: 'help' });

  body.append(
    section(
      'The rules',
      [
        'Fill every white cell with a digit from 1 to 9.',
        'A clue is the total of the run it points at: the number in the top right of a black cell is the run going across from it, and the number in the bottom left is the run going down.',
        'No digit repeats inside a single run. It can repeat elsewhere — that is the difference between this and sudoku.',
        'Every puzzle has exactly one answer, and every one of them can be reasoned out. Nothing here ever needs to be guessed at.',
      ],
    ),
    section('Playing', [
      'Tap a cell to select it, then tap a digit to write it in. Tapping the same digit again rubs it out.',
      'Notes turns the keypad into pencil marks. Holding a digit does the other thing — a pencil mark while you are writing answers, an answer while you are pencilling.',
      'Keyboard: arrows move, 1–9 write, Shift and a digit pencils, Backspace clears, N toggles notes, Z undoes, H hints, C checks.',
    ]),
    section('The table', [
      'The strip under the board lists every combination that still fits the two clues through the cell you are on — with the digits already written in taken out of both the total and the alphabet.',
      'So a 23 across with a 6 already in it shows the ways to make 17 in the cells that are left. Table hides it if you would rather do it in your head.',
    ]),
    section('Check and hint', [
      'Check marks the digits that are wrong. It is counted against the puzzle, so it is held rather than tapped by default.',
      'Hint names the technique that cracks the position, says why it works and tints the cells it is talking about. It only writes the digit in if you ask it to.',
      'A clue goes quiet when its run is full and adds up, and turns red when it is full and does not. That is arithmetic you can do yourself, so it gives nothing away.',
    ]),
  );

  const ladder = el('div', { class: 'help-ladder' });
  for (const technique of LADDER) {
    ladder.append(
      el(
        'p',
        {},
        el('b', { text: TECHNIQUE_NAMES[technique] }),
        el('span', { text: TECHNIQUE_BLURBS[technique] }),
      ),
    );
  }
  body.append(
    el(
      'section',
      { class: 'help-section' },
      el('h3', { text: 'The techniques' }),
      el('p', {
        class: 'help-lede',
        text:
          'Levels are named by what the puzzle forces you to reach for. Every hint the game gives is one of these, and finishing a puzzle tells you which of them it really asked for.',
      }),
      ladder,
    ),
  );

  openOverlay(body, {
    title: 'How to play',
    note: 'Kakuro — cross sums.',
    actions: [{ label: 'Close', primary: true }],
  });
}

function section(title: string, lines: string[]): HTMLElement {
  return el(
    'section',
    { class: 'help-section' },
    el('h3', { text: title }),
    ...lines.map((line) => el('p', { text: line })),
  );
}
