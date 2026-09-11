import { LEVELS, SIZES, SIZE_LABELS, displayPuzzleId } from '../core/types.ts';
import type { Level, Size } from '../core/types.ts';
import { finishedCount, unfinishedSaves } from '../game/storage.ts';
import { openResumePicker } from './resume-picker.ts';
import type { AppContext } from './app-context.ts';
import { belt } from './belt.ts';
import { buildStamp, el } from './dom.ts';

/**
 * The belts, as dandoku.com wears them: the same six names and the same six
 * descriptors across the collection, so a brown belt at killer means
 * something at kakuro too. What each one *asks* is Kakuro's own, off its
 * technique ladder — short phrases in killer's manner rather than sentences,
 * because they sit on the third line of a row in small type.
 *
 * The first two come down to the same technique, and so do the last two:
 * what separates them is how much of the grid holds out, which is what their
 * phrases say, rather than promising a technique that never arrives.
 */
const BELTS: { name: string; rank: string; descriptor: string; asks: string }[] = [
  { name: 'White belt', rank: '5th Kyū', descriptor: 'Foundations', asks: 'clues written only one way' },
  { name: 'Yellow belt', rank: '4th Kyū', descriptor: 'Developing', asks: 'the same, over more of the grid' },
  { name: 'Green belt', rank: '3rd Kyū', descriptor: 'Confident', asks: 'a digit with one home left' },
  { name: 'Blue belt', rank: '2nd Kyū', descriptor: 'Advanced', asks: 'sums that will not write in' },
  { name: 'Brown belt', rank: '1st Kyū', descriptor: 'Expert', asks: 'combinations dealt cell by cell' },
  { name: 'Black belt', rank: '1st Dan', descriptor: 'Dan challenge', asks: 'dealing, sustained' },
];

export function buildMenu(app: AppContext): HTMLElement {
  const node = el('div', { class: 'menu' });

  // Help and Settings stay one tap away rather than going behind a ☰ as they
  // do in killer: with only the two of them, a menu would only add a tap.
  const help = el('button', { class: 'icon-button', type: 'button', 'aria-label': 'How to play', title: 'How to play' }, '?');
  help.addEventListener('click', () => app.openHelp());
  const settings = el('button', { class: 'icon-button', type: 'button', 'aria-label': 'Settings', title: 'Settings' }, '⚙');
  settings.addEventListener('click', () => app.openSettings());

  node.append(
    el(
      'header',
      { class: 'titlebar' },
      el('span', { class: 'id', text: 'Kakuro' }),
      el('div', { class: 'titlebar-actions' }, help, settings),
    ),
    /*
     * The kicker names the family, as the other DanDoku games do. Two choices
     * on this screen where killer has one, so the standfirst says what each
     * of them is for — the same split the README makes: a board for how long
     * you want to be here, a belt for how hard.
     */
    el(
      'div',
      { class: 'hero' },
      el('p', { class: 'kicker', text: 'DanDoku · Kakuro' }),
      el('h1', { text: 'Pick your puzzle.' }),
      el('p', { text: 'A board for how long, a belt for how hard.' }),
    ),
    buildSizePicker(app),
    el(
      'section',
      { class: 'levels' },
      el('h2', { text: 'Choose a belt' }),
      ...LEVELS.map((level) => levelRow(app, level)),
    ),
  );

  /*
   * Under the levels, not over them: see `.resume-open` in the stylesheet.
   * One game goes straight back to it, as killer does; several open the
   * picker, where each has its bin.
   */
  const parked = unfinishedSaves();
  if (parked.length > 0) {
    const resume = el('button', {
      class: 'resume-open',
      type: 'button',
      text: parked.length === 1 ? `Resume ${displayPuzzleId(parked[0].id)}` : `${parked.length} unfinished games`,
    });
    resume.addEventListener('click', () => {
      const saves = unfinishedSaves();
      if (saves.length === 1) app.playPuzzle(saves[0].id);
      else if (saves.length > 1) openResumePicker(app, () => app.goMenu());
    });
    node.append(resume);
  }

  node.append(
    // In the belts' own language, and true: every puzzle here has exactly one
    // answer and can be finished by reasoning alone.
    el('p', { class: 'hint-line', text: 'Every grid reasons out without a guess. The dojo never closes.' }),
    el('footer', { class: 'menu-foot' }, el('span', { text: buildStamp() })),
  );
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

/**
 * One belt, in killer's three lines down the left — the belt and its name,
 * the rank and what it stands for, what the puzzles will ask — and what is
 * left against the right-hand edge. The stars went: the belt already says
 * which level it is, and saying it twice took the width the counts needed.
 */
function levelRow(app: AppContext, level: Level): HTMLElement {
  const info = BELTS[level - 1];
  const size: Size = app.size;
  const done = finishedCount(app.history, { size, level }, app.poolSize);
  const left = app.poolSize - done;

  const line = el('span', { class: 'belt-line' });
  line.append(belt(level, 40), el('span', { class: 'name', text: info.name }));

  const row = el('button', {
    class: 'level-row',
    type: 'button',
    'aria-label': `${info.name}, ${info.rank} — ${info.asks}. ${left} left.`,
  });
  row.append(
    el(
      'span',
      { class: 'level-head' },
      line,
      el('span', { class: 'rank', text: `${info.rank} · ${info.descriptor}` }),
      el('span', { class: 'level-asks', text: info.asks }),
    ),
    el(
      'span',
      { class: 'level-meta' },
      /*
       * What is left rather than what is done. `unplayed` said nothing about
       * how much there was, and `1 done` said nothing about how much was not
       * — neither answers the question the row is actually asked, which is
       * whether there is more of this to play.
       */
      el('span', { class: 'level-left', text: `${left} left` }),
      el('span', { class: 'level-done', text: done > 0 ? `${done} done` : '' }),
    ),
  );
  row.addEventListener('click', () => app.playRandom(level));
  return row;
}
