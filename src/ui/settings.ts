import type { KeypadSide, Settings, Theme } from '../game/storage.ts';
import { POOL_SIZES, exportBackup, importBackup, saveSettings } from '../game/storage.ts';
import type { AppContext } from './app-context.ts';
import { BACKGROUNDS, customPhoto, forgetPhoto, keepPhoto } from './backgrounds.ts';
import { previewFireworks } from './celebration.ts';
import { clear, el } from './dom.ts';
import { confirmPanel, openOverlay, toast } from './overlay.ts';

/** Only the on/off settings are switches. */
type BooleanSetting = {
  [K in keyof Settings]: Settings[K] extends boolean ? K : never;
}[keyof Settings];

interface Toggle {
  key: BooleanSetting;
  title: string;
  detail: string;
}

const TOGGLES: Toggle[] = [
  {
    key: 'allowSingleMark',
    title: 'Allow single pencil marks',
    detail: 'On, a lone digit you tap in stays a mark. Crossing marks off until one is left still answers the cell either way.',
  },
  {
    key: 'autoRemoveMarks',
    title: 'Tidy pencil marks',
    detail: 'Forcing an answer — long-click or double-click — strikes that digit from the marks in both its runs. A plain tap never does.',
  },
  {
    key: 'instantCheck',
    title: 'Flag broken runs at once',
    detail: 'A repeat or an overshoot, not the hidden answer — Check still marks digits that are actually wrong.',
  },
  { key: 'checkNeedsHold', title: 'Check needs a hold', detail: 'Check is counted against the puzzle. Keyboard: Shift+C.' },
  { key: 'hintNeedsHold', title: 'Hint needs a hold', detail: 'So is a hint. Keyboard: Shift+H.' },
  {
    key: 'marksNeedsHold',
    title: 'Marks needs a hold',
    detail: 'Otherwise one stray tap pencils in the whole board. M on a keyboard always fills them.',
  },
  { key: 'clearNeedsHold', title: 'Clear needs a hold', detail: 'Guards the button against a mis-tap. Delete and Backspace always clear.' },
  {
    key: 'undoNeedsHold',
    title: 'Undo needs a hold',
    detail: 'Undo and Redo both, so a stray tap cannot unpick a move. Z and Y on a keyboard always work.',
  },
  { key: 'highlightRuns', title: 'Highlight the runs', detail: 'Tints the across and down runs through the cell you are on.' },
  { key: 'highlightSameDigit', title: 'Highlight matching digits', detail: 'Tints other cells holding the same digit.' },
  {
    key: 'showCombos',
    title: 'Leave the table up',
    detail: 'The combination table stays open as you move about — Table opens and folds it either way.',
  },
  { key: 'showTimer', title: 'Show the clock', detail: 'The clock keeps running either way. Tap it to hide it mid-puzzle.' },
  { key: 'keepAwake', title: 'Keep the screen on', detail: 'Stops the phone dimming and locking while a puzzle is open.' },
  {
    key: 'fireworks',
    title: 'Fireworks when solved',
    detail: 'About eight seconds of them above a dojo when the last digit goes in. Never shown when the device asks for reduced motion.',
  },
];

const KEYPAD_SIDES: { value: KeypadSide; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
];

const THEMES: { value: Theme; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'night', label: 'Night' },
  { value: 'contrast', label: 'High contrast' },
];

/**
 * A row of buttons where exactly one is on — for the settings that are a
 * choice rather than a switch, and for the Game | Display switch itself.
 */
function picker<T extends string>(
  options: { value: T; label: string }[],
  current: () => T,
  choose: (value: T) => void,
): HTMLElement {
  const tabs = el('div', { class: 'tabs' });
  const draw = (): void => {
    clear(tabs);
    for (const option of options) {
      const on = current() === option.value;
      const button = el('button', {
        class: on ? 'on' : '',
        type: 'button',
        'aria-pressed': String(on),
        text: option.label,
      });
      button.addEventListener('click', () => {
        choose(option.value);
        draw();
      });
      tabs.append(button);
    }
  };
  draw();
  return tabs;
}

/**
 * The background picker: a grid of thumbnails — none, the six drawn patterns
 * and the player's own photo — with a dim slider under it. Each thumbnail is
 * the image itself at small size, so the choice is made by looking rather than
 * by reading a name. Taken from killer-sudoku as written.
 */
function backgroundPicker(app: AppContext): HTMLElement {
  const grid = el('div', { class: 'bg-grid', role: 'group', 'aria-label': 'Background' });
  const file = el('input', { type: 'file', accept: 'image/*' });
  file.hidden = true;

  const choose = (id: string): void => {
    app.settings.background = id;
    saveSettings(app.settings);
    app.applyBackground();
    draw();
  };

  const thumb = (id: string, label: string, image: string | null): HTMLButtonElement => {
    const on = app.settings.background === id;
    const button = el(
      'button',
      { class: on ? 'bg-thumb on' : 'bg-thumb', type: 'button', 'aria-pressed': String(on) },
      el('span', { text: label }),
    );
    if (image !== null) button.style.backgroundImage = `url("${image}")`;
    return button;
  };

  const draw = (): void => {
    clear(grid);
    const none = thumb('none', 'None', null);
    none.addEventListener('click', () => choose('none'));
    grid.append(none);
    for (const choice of BACKGROUNDS) {
      const button = thumb(choice.id, choice.name, choice.image);
      button.addEventListener('click', () => choose(choice.id));
      grid.append(button);
    }
    const photo = customPhoto();
    const own = thumb('custom', photo === null ? 'Upload…' : 'Your photo', photo);
    own.addEventListener('click', () => (photo === null ? file.click() : choose('custom')));
    grid.append(own);
  };

  file.addEventListener('change', () => {
    const chosen = file.files?.[0];
    file.value = '';
    if (!chosen) return;
    keepPhoto(chosen)
      .then((kept) => {
        if (!kept) {
          toast('Could not keep that photo — storage is full or private.');
          return;
        }
        choose('custom');
        toast('Your photo is the background.');
      })
      .catch(() => toast('Could not read that image.'));
  });

  const upload = el('button', { type: 'button', text: 'Upload a photo' });
  upload.addEventListener('click', () => file.click());
  const remove = el('button', { type: 'button', text: 'Remove photo' });
  remove.addEventListener('click', () => {
    forgetPhoto();
    if (app.settings.background === 'custom') choose('none');
    else draw();
  });

  const percent = Math.round(app.settings.backgroundDim * 100);
  const dim = el('input', {
    type: 'range',
    min: '0',
    max: '100',
    value: String(percent),
    'aria-label': 'Background dim',
  });
  const readout = el('output', { text: `${percent}%` });
  dim.addEventListener('input', () => {
    app.settings.backgroundDim = Number(dim.value) / 100;
    readout.textContent = `${dim.value}%`;
    saveSettings(app.settings);
    app.applyBackground();
  });

  draw();
  return el(
    'div',
    {},
    grid,
    el('label', { class: 'bg-dim' }, 'Dim', dim, readout),
    el('div', { class: 'tabs bg-photo' }, upload, remove, file),
  );
}

/** A labelled row whose control sits underneath rather than beside it. */
const stacked = (title: string, detail: string | null, control: HTMLElement): HTMLElement =>
  el(
    'div',
    { class: 'setting stacked' },
    el('span', { class: 'label' }, title, detail === null ? null : el('small', { text: detail })),
    control,
  );

export function openSettings(app: AppContext): void {
  /*
   * Two sections, because one list had outgrown a phone — as killer-sudoku
   * found and split it: Game for how the puzzle behaves and how you write into
   * it, Display for how it looks and what the device does. The rows are built
   * once and re-homed on switch, so a toggle keeps its state across tabs.
   */
  const themeRow = stacked(
    'Theme',
    'Day is warm stock and navy ink; Night the same board in navy; High contrast is pure black, colour-blind safe.',
    picker(
      THEMES,
      () => app.settings.theme,
      (theme) => {
        app.settings.theme = theme;
        saveSettings(app.settings);
        app.applyTheme();
      },
    ),
  );

  const backgroundRow = stacked(
    'Background',
    'Behind every screen. The patterns are drawn by the game; a photo of your own is shrunk to fit and stays on this device.',
    backgroundPicker(app),
  );

  const keypadRow = stacked(
    'Keypad side',
    'Right puts the digits under a right thumb, with the tools across from them. In landscape and on a desktop they swap inside the panel beside the board.',
    picker(
      KEYPAD_SIDES,
      () => app.settings.keypadSide,
      (side) => {
        app.settings.keypadSide = side;
        saveSettings(app.settings);
        app.applyKeypadSide();
      },
    ),
  );

  /*
   * The show a solved puzzle gets, played now: for deciding whether to keep
   * the switch above it on, and for seeing it at all without solving one.
   */
  const preview = el('button', { type: 'button', text: 'Show me' });
  preview.addEventListener('click', () => previewFireworks());
  const fireworksRow = stacked(
    'See the fireworks',
    'The show a solved puzzle gets, without solving one. From the menu or a puzzle, F on a keyboard does the same.',
    el('div', { class: 'tabs' }, preview),
  );

  /*
   * The house switch: a square track framed in ink, a square knob that slides
   * across, the whole thing inked in when on. Still a real button with a
   * switch role, so a keyboard and a screen reader can work it — killer draws
   * its rows as plain clickable boxes, and this is the one place Kakuro keeps
   * its own way.
   */
  const toggleRow = (toggle: Toggle): HTMLElement => {
    const knob = el('span', { class: 'switch', 'aria-hidden': 'true' });
    const row = el(
      'button',
      { class: 'setting', type: 'button', role: 'switch' },
      el('span', { class: 'label' }, toggle.title, el('small', { text: toggle.detail })),
      knob,
    );
    const paint = (): void => {
      const on = Boolean(app.settings[toggle.key]);
      knob.classList.toggle('on', on);
      row.setAttribute('aria-checked', String(on));
    };
    row.addEventListener('click', () => {
      app.settings[toggle.key] = !app.settings[toggle.key];
      saveSettings(app.settings);
      paint();
      if (toggle.key === 'keepAwake') app.applyWakeLock();
      else app.refreshBoard();
    });
    paint();
    return row;
  };

  const rows = (keys: BooleanSetting[]): HTMLElement[] =>
    keys.map((key) => {
      const toggle = TOGGLES.find((t) => t.key === key);
      if (!toggle) throw new Error(`no such setting: ${key}`);
      return toggleRow(toggle);
    });

  /*
   * Puzzles per belt, first under Game as killer-sudoku has it. Every grid is
   * made from its number, so a bigger pool adds grids and changes none.
   */
  const poolRow = stacked(
    'Puzzles per belt',
    'How many numbered grids each board and belt offers. The same number always makes the same grid, so a bigger pool is more puzzles, not different ones.',
    picker(
      POOL_SIZES.map((n) => ({ value: String(n), label: n.toLocaleString('en-GB') })),
      () => String(app.settings.poolSize),
      (size) => {
        app.settings.poolSize = Number(size);
        saveSettings(app.settings);
        // The menu behind this panel is counting what is left.
        app.refreshMenu();
      },
    ),
  );

  /*
   * Your data, at the foot of the Game tab. killer-sudoku puts it under both
   * sections; here it stays off Display, which is about how the game looks.
   */
  const exportData = el('button', { type: 'button', text: 'Export data' });
  exportData.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(exportBackup(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    el('a', { href: url, download: 'kakuro-backup.json' }).click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Backup downloaded.');
  });

  const file = el('input', { type: 'file', accept: 'application/json,.json' });
  file.hidden = true;
  file.addEventListener('change', () => {
    const chosen = file.files?.[0];
    file.value = '';
    if (!chosen) return;
    void chosen
      .text()
      .then((text) => {
        const restored = importBackup(JSON.parse(text) as unknown);
        // Settings closes on the way back to the menu.
        app.reload();
        toast(
          restored.settingsOnly
            ? 'Settings restored. That backup is from an older set of puzzles, so its history and games were left out.'
            : `Restored ${restored.history} puzzles and ${restored.saves} games.`,
        );
      })
      .catch((err: unknown) => toast(err instanceof Error ? err.message : 'Could not read that file.'));
  });

  const importData = el('button', { type: 'button', text: 'Import data' });
  importData.addEventListener('click', () =>
    confirmPanel(
      'Replace your data with a backup?',
      'Your history, settings and unfinished games here are replaced by the ones in the file.',
      'Choose file',
      () => file.click(),
    ),
  );

  const dataRow = stacked(
    'Your data',
    'History, settings and unfinished games as a file you keep. The background photo stays on this device.',
    el('div', { class: 'tabs' }, exportData, importData, file),
  );

  const gameRows = [
    poolRow,
    ...rows(['allowSingleMark', 'autoRemoveMarks', 'instantCheck', 'checkNeedsHold', 'hintNeedsHold', 'marksNeedsHold', 'clearNeedsHold', 'undoNeedsHold']),
    dataRow,
  ];
  const displayRows = [
    themeRow,
    backgroundRow,
    keypadRow,
    ...rows(['highlightRuns', 'highlightSameDigit', 'showCombos', 'showTimer', 'keepAwake', 'fireworks']),
    fireworksRow,
  ];

  let section: 'game' | 'display' = 'game';
  const list = el('div', { class: 'settings-rows' });
  const drawList = (): void => {
    clear(list);
    list.append(...(section === 'game' ? gameRows : displayRows));
  };
  const sections = picker(
    [
      { value: 'game', label: 'Game' },
      { value: 'display', label: 'Display' },
    ],
    () => section,
    (value) => {
      section = value;
      drawList();
    },
  );
  drawList();

  openOverlay(el('div', { class: 'settings' }, el('div', { class: 'section-tabs' }, sections), list), {
    title: 'Settings',
    actions: [{ label: 'Done', primary: true }],
  });
}
