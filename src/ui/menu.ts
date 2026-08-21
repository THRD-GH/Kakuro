import { SIZES, SIZE_LABELS, SOURCES, displayPuzzleId, sourceLabel } from '../core/types.ts';
import type { Level, Size, Source } from '../core/types.ts';
import { LEVELS } from '../core/types.ts';
import { finishedCount, unfinishedSaves } from '../game/storage.ts';
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
export const BELTS: { rank: string; colour: string; note: string }[] = [
  { rank: '5th Kyū', colour: 'White belt', note: 'Foundations' },
  { rank: '4th Kyū', colour: 'Yellow belt', note: 'Developing' },
  { rank: '3rd Kyū', colour: 'Green belt', note: 'Confident' },
  { rank: '2nd Kyū', colour: 'Blue belt', note: 'Advanced' },
  { rank: '1st Kyū', colour: 'Brown belt', note: 'Expert' },
  { rank: '1st Dan', colour: 'Black belt', note: 'Dan challenge' },
];

export function buildMenu(app: AppContext, source: Source, onSource: (next: Source) => void): HTMLElement {
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
    const list = el('div', { class: 'resume-list' });
    for (const save of parked.slice(0, 4)) {
      const filled = save.values.filter((digit) => digit > 0).length;
      const total = save.puzzle.solution.filter((digit) => digit > 0).length;
      const button = el(
        'button',
        { class: 'resume', type: 'button' },
        el('b', { text: displayPuzzleId(save.id) }),
        el('i', { class: 'resume-size', text: `${save.id.size}×${save.id.size}` }),
        el('span', { text: `${filled} of ${total} · ${timeAgo(save.savedAt ?? Date.now())}` }),
      );
      button.addEventListener('click', () => app.playPuzzle(save.id));
      list.append(button);
    }
    node.append(el('section', { class: 'resume-wrap' }, el('h2', { text: 'Carry on' }), list));
  }

  node.append(buildSizePicker(app));

  const tabs = el('div', { class: 'source-tabs', role: 'tablist' });
  for (const option of SOURCES) {
    const tab = el('button', {
      class: `source-tab${option === source ? ' on' : ''}`,
      type: 'button',
      role: 'tab',
      'aria-selected': String(option === source),
      text: sourceLabel(option),
    });
    tab.addEventListener('click', () => onSource(option));
    tabs.append(tab);
  }

  const installed = app.packCounts !== null;
  node.append(
    el(
      'section',
      { class: 'levels' },
      el('div', { class: 'levels-head' }, el('h2', { text: 'Choose a level' }), tabs),
      el('p', {
        class: 'levels-note',
        text:
          source === 'classic'
            ? installed
              ? 'The shipped collection. Every puzzle is numbered, so a level is somewhere you can come back to.'
              : 'No puzzle packs are installed in this build — New generates them instead.'
            : 'Generated on this device, and endless. Every number is the same grid on every device.',
      }),
      ...LEVELS.map((level) => levelRow(app, level, source)),
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
  return el(
    'section',
    { class: 'sizes' },
    el('h2', { text: 'Choose a board' }),
    row,
  );
}

function levelRow(app: AppContext, level: Level, source: Source): HTMLElement {
  const belt = BELTS[level - 1];
  const size: Size = app.size;
  const pool = source === 'classic' ? (app.packCounts?.[size]?.[level] ?? 0) : app.newPoolSize;
  const done = finishedCount(app.history, { size, level, source }, pool);

  const row = el('button', {
    class: `level-row${pool === 0 ? ' empty' : ''}`,
    type: 'button',
    disabled: pool === 0,
  });
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
      el('span', { text: pool === 0 ? 'none yet' : `${done} of ${pool}` }),
    ),
  );
  row.addEventListener('click', () => app.playRandom(level, source));
  return row;
}
