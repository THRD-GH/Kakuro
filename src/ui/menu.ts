import { LEVELS, SIZES, SIZE_LABELS, displayPuzzleId } from '../core/types.ts';
import type { Level, Size } from '../core/types.ts';
import { finishedCount, unfinishedSaves } from '../game/storage.ts';
import { openResumePicker } from './resume-picker.ts';
import type { AppContext } from './app-context.ts';
import { buildStamp, el, timeAgo } from './dom.ts';

/**
 * What each level asks of you. Levels 5 and 6 come down to the same technique,
 * so saying so twice would be no help — what separates them is how much of the
 * grid holds out, and that is what the sixth line says.
 */
const LEVEL_NOTES: Record<Level, string> = {
  1: 'Clues that can be written only one way — 17 in two cells is 8 and 9.',
  2: 'The same, over more of the grid before it gives.',
  3: 'A digit every combination needs, with one cell left that can hold it.',
  4: 'Combinations that add up but cannot be written in.',
  5: 'Dealing combinations out across a run, cell by cell.',
  6: 'The same again, on a grid that holds out most of the way.',
};

/**
 * The belts, as dandoku.com wears them. Six levels across the collection and
 * the same six names, so a brown belt at killer means something at kakuro too.
 */
export const BELTS: { rank: string; colour: string }[] = [
  { rank: '5th Kyū', colour: 'White belt' },
  { rank: '4th Kyū', colour: 'Yellow belt' },
  { rank: '3rd Kyū', colour: 'Green belt' },
  { rank: '2nd Kyū', colour: 'Blue belt' },
  { rank: '1st Kyū', colour: 'Brown belt' },
  { rank: '1st Dan', colour: 'Black belt' },
];

export function buildMenu(app: AppContext): HTMLElement {
  const node = el('div', { class: 'menu' });

  const settings = el('button', { class: 'icon-button', type: 'button', 'aria-label': 'Settings' }, '⚙');
  settings.addEventListener('click', () => app.openSettings());
  const help = el('button', { class: 'icon-button', type: 'button', 'aria-label': 'How to play' }, '?');
  help.addEventListener('click', () => app.openHelp());

  node.append(
    el(
      'header',
      { class: 'menu-bar' },
      el(
        'h1',
        { class: 'wordmark' },
        el('span', { class: 'word-a', text: 'Ka' }),
        el('span', { class: 'word-b', text: 'kuro' }),
      ),
      el('div', { class: 'menu-bar-actions' }, help, settings),
    ),
  );

  const parked = unfinishedSaves();
  if (parked.length > 0) {
    const open = el(
      'button',
      { class: 'resume-open', type: 'button' },
      el('b', { text: `Carry on — ${parked.length} unfinished` }),
      el('span', { text: `Last: ${displayPuzzleId(parked[0].id)} · ${timeAgo(parked[0].savedAt ?? Date.now())}` }),
    );
    open.addEventListener('click', () => openResumePicker(app, () => app.goMenu()));
    node.append(el('section', { class: 'resume-wrap' }, open));
  }

  node.append(buildSizePicker(app));

  node.append(
    el(
      'section',
      { class: 'levels' },
      el('h2', { text: 'Choose a level' }),
      ...LEVELS.map((level) => levelRow(app, level)),
    ),
  );

  node.append(el('footer', { class: 'menu-foot' }, el('span', { text: buildStamp() })));
  return node;
}

/**
 * The board picker. Size sits above the levels rather than inside them,
 * because it is a different question: how long do you want to be here, not how
 * hard do you want it to be.
 */
function buildSizePicker(app: AppContext): HTMLElement {
  const row = el('div', { class: 'size-row', role: 'radiogroup', 'aria-label': 'Board size' });
  for (const size of SIZES) {
    const chosen = size === app.size;
    const button = el(
      'button',
      {
        class: `size-choice${chosen ? ' on' : ''}`,
        type: 'button',
        role: 'radio',
        'aria-checked': String(chosen),
      },
      el('i', { class: `size-glyph size-${size}`, 'aria-hidden': 'true' }),
      el('b', { text: SIZE_LABELS[size] }),
      el('span', { text: `${size}×${size}` }),
    );
    button.addEventListener('click', () => app.setSize(size));
    row.append(button);
  }
  return el('section', { class: 'sizes' }, el('h2', { text: 'Choose a board' }), row);
}

function levelRow(app: AppContext, level: Level): HTMLElement {
  const belt = BELTS[level - 1];
  const size: Size = app.size;
  const done = finishedCount(app.history, { size, level }, app.poolSize);

  const row = el('button', { class: 'level-row', type: 'button' });
  row.append(
    el('i', { class: `belt belt-${level - 1}`, 'aria-hidden': 'true' }),
    el(
      'span',
      { class: 'level-copy' },
      el('b', { text: `${belt.colour} · ${belt.rank}` }),
      el('span', { class: 'level-technique', text: LEVEL_NOTES[level] }),
    ),
    el(
      'span',
      { class: 'level-meta' },
      el('b', { text: `${'★'.repeat(level)}${'☆'.repeat(6 - level)}` }),
      el('span', { text: done > 0 ? `${done} done` : 'unplayed' }),
    ),
  );
  row.addEventListener('click', () => app.playRandom(level));
  return row;
}
