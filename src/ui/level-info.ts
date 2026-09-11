import { TECHNIQUE_BLURBS, TECHNIQUE_NAMES } from '../core/solver.ts';
import type { Level } from '../core/types.ts';
import { BELTS, belt } from './belt.ts';
import { el } from './dom.ts';
import { openOverlay } from './overlay.ts';

type TechniqueKey = keyof typeof TECHNIQUE_NAMES;

/**
 * What each belt asks of you, off Kakuro's own ladder rather than killer's.
 * The techniques are the solver's, named and explained in the solver's own
 * words, so this panel, a hint and the win screen all call the same step by
 * the same name.
 *
 * White and Yellow are one toolkit at two lengths, and so are Brown and
 * Black: a level is where a grid ranks against the others on its board, and
 * the pairs split on how much of the grid the hardest step is needed for.
 * Saying so is better than promising a technique that never arrives.
 */
const LEVEL_GUIDE: Record<Level, { lead: string; techniques: TechniqueKey[] }> = {
  1: {
    lead: 'The clues that write themselves, and what they leave behind.',
    techniques: ['unique-combination', 'naked-single', 'combination-union'],
  },
  2: {
    lead: 'The White belt toolkit, needed over more of the grid before it gives.',
    techniques: ['unique-combination', 'naked-single', 'combination-union'],
  },
  3: {
    lead: 'A digit that has only one place left to go.',
    techniques: ['hidden-single'],
  },
  4: {
    lead: 'Sums that add up on paper but cannot be written in.',
    techniques: ['combination-filter'],
  },
  5: {
    lead: 'Dealing combinations out across a run, cell by cell.',
    techniques: ['combination-matching'],
  },
  6: {
    lead: 'Dealing again, on a grid that holds out most of the way — and on the hardest, a band of the grid read as one.',
    techniques: ['combination-matching', 'sum-difference'],
  },
};

/** The ? beside a belt: what it involves, before you commit to one. */
export function openLevelInfo(level: Level): void {
  const info = BELTS[level];
  const guide = LEVEL_GUIDE[level];

  const list = el('ul', { class: 'level-techniques' });
  for (const technique of guide.techniques) {
    list.append(
      el('li', {}, el('b', { text: TECHNIQUE_NAMES[technique] }), el('span', { text: TECHNIQUE_BLURBS[technique] })),
    );
  }

  const glyph = el('div', { class: 'level-info-belt' });
  glyph.append(belt(level, 96));

  const body = el(
    'div',
    { class: 'level-info' },
    glyph,
    el('p', { class: 'level-info-descriptor', text: info.descriptor }),
    el('p', { class: 'level-info-lead', text: guide.lead }),
    list,
    level > 1
      ? el('p', {
          class: 'level-info-foot',
          text: 'Each belt can also ask for anything introduced below it. The level is set by the hardest step a grid really needs, ranked against the other grids on the same board.',
        })
      : null,
  );

  openOverlay(body, {
    title: `${info.name} · ${info.rank}`,
    actions: [{ label: 'Got it', primary: true }],
    panelClass: 'level-info-panel',
  });
}
