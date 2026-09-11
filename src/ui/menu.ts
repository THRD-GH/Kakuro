import { LEVELS, SIZES, SIZE_LABELS, displayPuzzleId } from '../core/types.ts';
import type { Level, Size } from '../core/types.ts';
import { finishedCount, unfinishedSaves } from '../game/storage.ts';
import { openResumePicker } from './resume-picker.ts';
import type { AppContext } from './app-context.ts';
import { BELTS, belt } from './belt.ts';
import { buildStamp, el } from './dom.ts';
import { openLevelInfo } from './level-info.ts';

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

  // One block at the foot, so that with a picture behind the menu the two
  // lines of small print share one tile rather than sitting on the image.
  node.append(
    el(
      'div',
      { class: 'menu-tail' },
      // In the belts' own language, and true: every puzzle here has exactly
      // one answer and can be finished by reasoning alone.
      el('p', { class: 'hint-line', text: 'Every grid reasons out without a guess. The dojo never closes.' }),
      el('footer', { class: 'menu-foot' }, el('span', { text: buildStamp() })),
    ),
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
 * One belt: killer's three lines down the left — the belt and its name, the
 * rank and what it stands for, what the puzzles will ask — with what is left
 * against the right-hand edge, and its question mark at the end.
 *
 * Two buttons in one tile. The belt starts a puzzle, as the whole row always
 * has; the ? explains the belt first. Killer puts its ? inside the belt's own
 * lines, because there the lines are the explain button and the pools beside
 * them are what play — here the lines are what play, and a button cannot sit
 * inside a button, so the ? has a cell of its own.
 */
function levelRow(app: AppContext, level: Level): HTMLElement {
  const info = BELTS[level];
  const size: Size = app.size;
  const done = finishedCount(app.history, { size, level }, app.poolSize);
  const left = app.poolSize - done;

  const line = el('span', { class: 'belt-line' });
  line.append(belt(level, 40), el('span', { class: 'name', text: info.name }));

  const play = el('button', {
    class: 'level-play',
    type: 'button',
    'aria-label': `Play ${info.name}, ${info.rank} — ${info.asks}. ${left} left.`,
  });
  play.append(
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
  play.addEventListener('click', () => app.playRandom(level));

  const explain = el(
    'button',
    {
      class: 'level-info',
      type: 'button',
      'aria-label': `What the ${info.name} asks`,
      title: `What the ${info.name} asks`,
    },
    el('span', { class: 'level-info-badge', 'aria-hidden': 'true', text: '?' }),
  );
  explain.addEventListener('click', () => openLevelInfo(level));

  return el('div', { class: 'level-row' }, play, explain);
}
