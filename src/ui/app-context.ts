import type { Level, PuzzleId, Size } from '../core/types.ts';
import type { History, Settings } from '../game/storage.ts';

/** What the screens are allowed to ask of the app shell. */
export interface AppContext {
  settings: Settings;
  history: History;
  /** How many puzzles each board and level is numbered up to: the setting, read live. */
  readonly poolSize: number;
  /** The board currently chosen on the menu. */
  size: Size;
  setSize(size: Size): void;
  applyTheme(): void;
  /** Put the digits on the chosen side, after the setting changes. */
  applyKeypadSide(): void;
  /** Put the chosen background behind every screen, after the setting changes. */
  applyBackground(): void;
  /** Take or drop the screen wake lock, after the setting changes. */
  applyWakeLock(): void;
  /** Repaint the board in place, after a highlighting setting changes. */
  refreshBoard(): void;
  goMenu(): void;
  /** Redraw the menu behind an open panel, after a setting it shows has changed. */
  refreshMenu(): void;
  /** Read settings and history back from storage after a backup is restored, and start again from the menu. */
  reload(): void;
  openHelp(): void;
  openSettings(): void;
  playPuzzle(id: PuzzleId): void;
  playRandom(level: Level): void;
}
