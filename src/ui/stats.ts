import type { Level, PuzzleId, Size } from '../core/types.ts';
import { LEVELS, SIZES, SIZE_LABELS, displayPuzzleId, parsePuzzleId } from '../core/types.ts';
import type { PuzzleRecord } from '../game/storage.ts';
import {
  dropSavesFor,
  finishedCount,
  poolStats,
  releasePuzzle,
  resetPool,
  saveHistory,
  totalStats,
  unfinishedSaves,
} from '../game/storage.ts';
import type { AppContext } from './app-context.ts';
import { BELTS } from './belt.ts';
import { clear, el, formatDate, formatTime } from './dom.ts';
import { backIcon } from './icons.ts';
import { confirmPanel, toast } from './overlay.ts';
import { bindTap } from './pointer.ts';
import { unfinishedRow } from './resume-picker.ts';

/** A belt's colour word, which is what it is called where there is no room for "belt". */
const beltWord = (level: Level): string => BELTS[level].name.replace(' belt', '');

/**
 * Stats: how the solving has gone, laid out as killer-sudoku lays its own out —
 * the running totals, the unfinished games, and every puzzle played in one
 * pool.
 *
 * A pool here is a board and a belt, where killer's is a level and a source, so
 * the last section has a row of belts and a row of boards. The unfinished games
 * are the saved ones the menu's picker lists, drawn by the same row, so the two
 * lists cannot drift into saying different things.
 */
export function buildStats(app: AppContext, initial: Level): HTMLElement {
  let level: Level = initial;
  let size: Size = app.size;

  /*
   * Where the way out leads. Opened from a puzzle, both routes hand that puzzle
   * back and say so: a screen reached mid-solve should return you to what you
   * were solving, and a button called "Back to the menu" would be describing
   * the wrong journey.
   */
  const returnTo = app.statsReturn;
  const backLabel = returnTo === null ? 'Back to the menu' : `Back to ${displayPuzzleId(returnTo)}`;

  const back = el('button', { class: 'icon-button', type: 'button', 'aria-label': backLabel, title: backLabel });
  back.append(backIcon());
  back.addEventListener('click', () => app.leaveStats());

  const totals = el('div', { class: 'stats-totals' });
  const unfinishedSummary = el('p', { class: 'picker-summary' });
  const unfinishedRows = el('div', { class: 'picker-rows' });
  const beltTabs = el('div', { class: 'tabs stats-tabs', role: 'group', 'aria-label': 'Belt' });
  const boardTabs = el('div', { class: 'tabs stats-tabs', role: 'group', 'aria-label': 'Board' });
  const summary = el('p', { class: 'picker-summary' });
  const rows = el('div', { class: 'stats-rows' });

  /** The answer to "how am I doing", which is what anyone opens a stats screen for. */
  const drawTotals = (): void => {
    clear(totals);
    const t = totalStats(app.history);
    if (t.played === 0) {
      totals.append(el('p', { class: 'picker-summary', text: 'Nothing played yet. Every puzzle you open is counted here.' }));
      return;
    }
    const tile = (value: string, label: string): HTMLElement =>
      el('div', { class: 'stats-tile' }, el('b', { text: value }), el('small', { text: label }));
    totals.append(
      tile(String(t.finished), `solved of ${t.played}`),
      tile(t.averageMs === null ? '—' : formatTime(t.averageMs), 'average'),
      tile(t.best === null ? '—' : formatTime(t.best.ms), t.best === null ? 'best' : `best · ${displayPuzzleId(t.best.id)}`),
      tile(String(t.streak), t.streak === 1 ? 'day streak' : 'days streak'),
      tile(String(t.hints), t.hints === 1 ? 'hint' : 'hints'),
      tile(String(t.checks), t.checks === 1 ? 'check' : 'checks'),
      // Where the solving has actually happened, belt by belt.
      el('p', { class: 'stats-spread', text: LEVELS.map((l) => `${beltWord(l)} ${t.byLevel[l] ?? 0}`).join(' · ') }),
    );
  };

  const drawUnfinished = (): void => {
    const saves = unfinishedSaves();
    unfinishedSummary.textContent =
      saves.length === 0
        ? 'No unfinished games.'
        : `${saves.length} unfinished ${saves.length === 1 ? 'game' : 'games'}. Tap one to pick it up, or the bin to throw it away.`;
    clear(unfinishedRows);
    for (const saved of saves) unfinishedRows.append(unfinishedRow(app, saved, { thrownAway: () => draw() }));
  };

  const drawPool = (): void => {
    clear(beltTabs);
    for (const l of LEVELS) {
      const on = l === level;
      const button = el('button', {
        class: on ? 'on' : '',
        type: 'button',
        'aria-pressed': String(on),
        title: BELTS[l].name,
        text: beltWord(l),
      });
      button.addEventListener('click', () => {
        level = l;
        draw();
      });
      beltTabs.append(button);
    }

    clear(boardTabs);
    for (const s of SIZES) {
      const on = s === size;
      const button = el('button', { class: on ? 'on' : '', type: 'button', 'aria-pressed': String(on), text: SIZE_LABELS[s] });
      button.addEventListener('click', () => {
        size = s;
        draw();
      });
      boardTabs.append(button);
    }

    const stat = poolStats(app.history, { size, level });
    const left = app.poolSize - finishedCount(app.history, { size, level }, app.poolSize);
    summary.textContent =
      `${BELTS[level].name} on ${SIZE_LABELS[size]}: ${stat.played} played, ${stat.finished} solved` +
      (stat.averageMs === null ? '' : `, average ${formatTime(stat.averageMs)}`) +
      `. ${left} of ${app.poolSize} left.`;

    const played = Object.entries(app.history)
      .map(([key, record]) => ({ id: parsePuzzleId(key), record }))
      .filter(
        (entry): entry is { id: PuzzleId; record: PuzzleRecord } =>
          entry.id !== null && entry.id.size === size && entry.id.level === level,
      )
      .sort((a, b) => a.id.number - b.id.number);

    clear(rows);
    for (const { id, record } of played) {
      const state = !record.finished ? 'open' : record.released ? 'released' : 'solved';
      const row = el(
        'div',
        { class: `stats-row ${state}` },
        el('b', { text: displayPuzzleId(id) }),
        el('span', {
          class: 'stats-when',
          text: state === 'open' ? 'unfinished' : state === 'released' ? 'back in the pool' : formatDate(record.bestAt ?? 0),
        }),
        el('span', { class: 'stats-time', text: record.bestMs === undefined ? '—' : formatTime(record.bestMs) }),
        el('span', { class: 'stats-when', text: `${record.hints ?? 0}h ${record.checks ?? 0}c` }),
      );
      /*
       * A solved puzzle is out of the pool. Holding its row puts it back, best
       * time and all — held rather than tapped, as killer-sudoku has it, so a
       * finger scrolling a long list does not release everything it brushes.
       */
      if (state === 'solved') {
        row.title = 'Hold to put it back in the pool';
        bindTap(row, {
          onTap: () => toast('Hold a solved puzzle to put it back in the pool.'),
          onHold: () => {
            app.history = releasePuzzle(app.history, id);
            saveHistory(app.history);
            draw();
            toast(`${displayPuzzleId(id)} is back in the pool.`);
          },
          doubleTap: false,
        });
      }
      rows.append(row);
    }
    if (played.length === 0) rows.append(el('p', { class: 'picker-summary', text: 'Nothing played on this board and belt yet.' }));
  };

  const draw = (): void => {
    drawTotals();
    drawUnfinished();
    drawPool();
  };

  const reset = el('button', { type: 'button', text: 'Reset this board and belt' });
  reset.addEventListener('click', () =>
    confirmPanel(
      `Reset ${BELTS[level].name} on ${SIZE_LABELS[size]}?`,
      'Its history goes, best times with it, along with any unfinished games, and every puzzle is unplayed again.',
      'Reset',
      () => {
        app.history = resetPool(app.history, { size, level });
        saveHistory(app.history);
        const dropped = dropSavesFor({ size, level });
        draw();
        toast(dropped > 0 ? `Reset, and ${dropped} unfinished ${dropped === 1 ? 'game' : 'games'} thrown away.` : 'Reset.');
      },
    ),
  );

  const done = el('button', { type: 'button', class: 'stats-done', text: backLabel });
  done.addEventListener('click', () => app.leaveStats());

  const heading = (text: string): HTMLElement => el('h2', { class: 'stats-heading', text });

  draw();
  return el(
    'div',
    { class: 'stats' },
    el('header', { class: 'titlebar' }, back, el('span', { class: 'id', text: 'Stats' })),
    heading('Everything played'),
    totals,
    heading('Unfinished games'),
    unfinishedSummary,
    unfinishedRows,
    heading('By belt and board'),
    beltTabs,
    boardTabs,
    summary,
    rows,
    el('div', { class: 'stats-actions' }, reset, done),
  );
}
