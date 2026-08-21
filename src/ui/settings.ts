import type { Settings, Theme } from '../game/storage.ts';
import { saveSettings } from '../game/storage.ts';
import type { AppContext } from './app-context.ts';
import { el } from './dom.ts';
import { openOverlay } from './overlay.ts';

const THEMES: { value: Theme; label: string; note: string }[] = [
  { value: 'day', label: 'Day', note: 'Cream stock, black ink' },
  { value: 'night', label: 'Night', note: 'The same board by lamplight' },
  { value: 'contrast', label: 'Contrast', note: 'Pure black, colour-blind safe' },
];

interface Toggle {
  key: keyof Settings;
  label: string;
  note: string;
}

const TOGGLES: { heading: string; items: Toggle[] }[] = [
  {
    heading: 'The board',
    items: [
      { key: 'highlightRuns', label: 'Highlight the runs', note: 'Tint the across and down runs through the cell you are on' },
      { key: 'highlightSameDigit', label: 'Highlight matching digits', note: 'Tint other cells holding the same digit' },
      { key: 'showCombos', label: 'Leave the table up', note: 'The combination table floats over the board until dismissed — Table opens it either way' },
      { key: 'showTimer', label: 'Show the clock', note: 'Tap the clock to hide it mid-puzzle; it keeps running' },
    ],
  },
  {
    heading: 'Writing',
    items: [
      { key: 'allowSingleMark', label: 'Allow single pencil marks', note: 'On, a lone digit you tap in stays a mark. Crossing marks off until one is left still answers the cell either way' },
      { key: 'autoRemoveMarks', label: 'Tidy pencil marks', note: 'Forcing an answer — long-click or double-click — strikes that digit from the marks in both its runs. A plain tap never does' },
      { key: 'instantCheck', label: 'Flag broken runs at once', note: 'A repeat or an overshoot, not the hidden answer — Check still marks digits that are actually wrong' },
      { key: 'keepAwake', label: 'Keep the screen on', note: 'While a puzzle is open' },
    ],
  },
  {
    heading: 'Guarded buttons',
    items: [
      { key: 'checkNeedsHold', label: 'Hold to check', note: 'Check is counted against the puzzle. Keyboard: Shift+C' },
      { key: 'hintNeedsHold', label: 'Hold for a hint', note: 'So is a hint. Keyboard: Shift+H' },
      { key: 'clearNeedsHold', label: 'Hold to clear a cell', note: 'Guards against a mis-tap wiping a cell. Keyboard: Shift+Backspace' },
    ],
  },
];

export function openSettings(app: AppContext): void {
  const body = el('div', { class: 'settings' });

  const themeRow = el('div', { class: 'theme-row', role: 'radiogroup', 'aria-label': 'Theme' });
  const paintThemes = (): void => {
    for (const button of themeRow.children) {
      const value = button.getAttribute('data-theme');
      button.classList.toggle('on', value === app.settings.theme);
      button.setAttribute('aria-checked', String(value === app.settings.theme));
    }
  };
  for (const theme of THEMES) {
    const button = el(
      'button',
      { class: 'theme-choice', type: 'button', role: 'radio', 'data-theme': theme.value },
      el('b', { text: theme.label }),
      el('span', { text: theme.note }),
    );
    button.addEventListener('click', () => {
      app.settings.theme = theme.value;
      saveSettings(app.settings);
      app.applyTheme();
      paintThemes();
    });
    themeRow.append(button);
  }
  paintThemes();
  body.append(el('section', { class: 'settings-group' }, el('h3', { text: 'Theme' }), themeRow));

  for (const group of TOGGLES) {
    const list = el('div', { class: 'toggle-list' });
    for (const item of group.items) {
      const button = el('button', { class: 'toggle', type: 'button', role: 'switch' });
      const paint = (): void => {
        const on = Boolean(app.settings[item.key]);
        button.classList.toggle('on', on);
        button.setAttribute('aria-checked', String(on));
      };
      button.append(
        el('span', { class: 'toggle-copy' }, el('b', { text: item.label }), el('span', { text: item.note })),
        el('i', { class: 'switch', 'aria-hidden': 'true' }),
      );
      button.addEventListener('click', () => {
        (app.settings[item.key] as boolean) = !app.settings[item.key];
        saveSettings(app.settings);
        paint();
        if (item.key === 'keepAwake') app.applyWakeLock();
        else app.refreshBoard();
      });
      paint();
      list.append(button);
    }
    body.append(el('section', { class: 'settings-group' }, el('h3', { text: group.heading }), list));
  }

  openOverlay(body, { title: 'Settings', actions: [{ label: 'Done', primary: true }] });
}
