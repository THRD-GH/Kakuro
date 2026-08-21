import { displayPuzzleId } from '../core/types.ts';
import { dropSave, forgetPuzzle, saveHistory, unfinishedSaves } from '../game/storage.ts';
import type { AppContext } from './app-context.ts';
import { clear, el, formatDate, formatTime, timeAgo } from './dom.ts';
import { closeTopOverlay, confirmPanel, openOverlay, toast } from './overlay.ts';

/**
 * Pick up or throw away any parked game.
 *
 * A panel rather than a list on the menu: parked games are a place you go
 * occasionally, and four of them laid out on the home screen took a third of
 * it before the player had chosen anything. Behind one button they cost a
 * line, and there is room to say what each one is and to offer a bin.
 */
export function openResumePicker(app: AppContext, onChanged: () => void): void {
  const summary = el('p', { class: 'picker-summary' });
  const rows = el('div', { class: 'picker-rows' });

  /*
   * The menu behind is refreshed when the panel closes, not on every change.
   *
   * It used to be told after each deletion — and the telling is `goMenu()`,
   * which begins by closing every overlay. So throwing one game away tore
   * down the panel the player was working in and dropped them back on the
   * menu. With a single parked game that looks like it worked; with several
   * it means reopening the picker for every one you want rid of.
   *
   * Nobody is looking at the menu while a modal covers it, so it can wait.
   */
  let changed = false;
  let leaving = false;
  const finish = (): void => {
    if (changed && !leaving) onChanged();
  };

  const draw = (): void => {
    const saves = unfinishedSaves();
    summary.textContent =
      saves.length === 0
        ? 'Nothing parked any more.'
        : `${saves.length} unfinished ${saves.length === 1 ? 'game' : 'games'}. ` +
          'Tap one to pick it up, or the bin to throw it away.';
    clear(rows);

    for (const saved of saves) {
      const id = saved.id;
      const filled = saved.values.filter((digit) => digit > 0).length;
      const total = saved.puzzle.solution.filter((digit) => digit > 0).length;

      const resume = el(
        'button',
        { class: 'picker-open', type: 'button', 'aria-label': `Resume ${displayPuzzleId(id)}` },
        el('b', { text: displayPuzzleId(id) }),
        el('span', { class: 'picker-what', text: `${id.size}×${id.size} · level ${id.level}` }),
        /*
         * Two clocks, and both are worth knowing: how long ago you put it down,
         * and how long you had spent on it when you did. The second is
         * bracketed so it does not read as another date beside the first.
         */
        el('span', {
          class: 'picker-when',
          title: saved.savedAt === undefined ? undefined : formatDate(saved.savedAt),
          text: saved.savedAt === undefined ? '' : timeAgo(saved.savedAt),
        }),
        el('span', {
          class: 'picker-when',
          text: `${Math.round((filled / total) * 100)}% · (${formatTime(saved.elapsedMs)})`,
        }),
      );
      resume.addEventListener('click', () => {
        // Off to the board, so the menu underneath is about to be replaced
        // wholesale and does not want rebuilding first.
        leaving = true;
        closeTopOverlay();
        app.playPuzzle(id);
      });

      const bin = el(
        'button',
        {
          class: 'picker-bin',
          type: 'button',
          'aria-label': `Throw away ${displayPuzzleId(id)}`,
          title: 'Throw this one away',
        },
        binIcon(),
      );
      bin.addEventListener('click', () => {
        confirmPanel(
          `Throw away ${displayPuzzleId(id)}?`,
          'Everything written into it goes, and the puzzle returns to the unplayed pool.',
          'Throw away',
          () => {
            dropSave(id);
            app.history = forgetPuzzle(app.history, id);
            saveHistory(app.history);
            changed = true;
            draw();
            toast(`${displayPuzzleId(id)} thrown away`);
          },
        );
      });

      rows.append(el('div', { class: 'picker-row' }, resume, bin));
    }
  };

  draw();
  openOverlay(el('div', { class: 'picker' }, summary, rows), {
    title: 'Unfinished games',
    // Both ways out, because the button closes with `action` and tapping the
    // shade or pressing Escape closes with `dismiss`.
    actions: [{ label: 'Close', primary: true, onClick: finish }],
    onDismiss: finish,
  });
}

/** A bin, drawn rather than fetched: the game ships no icon font. */
function binIcon(): SVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '15');
  svg.setAttribute('height', '15');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute(
    'd',
    'M6 2h4l.5 1H14v1.5H2V3h3.5L6 2zM3.5 6h9l-.7 8.2a1 1 0 0 1-1 .8H5.2a1 1 0 0 1-1-.8L3.5 6zm2.6 1.8.3 5.4M8 7.8v5.4m1.6-5.4-.3 5.4',
  );
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.3');
  path.setAttribute('stroke-linecap', 'round');
  svg.append(path);
  return svg;
}
