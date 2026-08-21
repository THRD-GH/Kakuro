import type { Level, PuzzleId, Size } from '../core/types.ts';
import type { History, Settings } from '../game/storage.ts';

/** What the screens are allowed to ask of the app shell. */
export interface AppContext {
  settings: Settings;
  history: History;
  /** How many puzzles each board and level is numbered up to. */
  poolSize: number;
  /** The board currently chosen on the menu. */
  size: Size;
  setSize(size: Size): void;
  applyTheme(): void;
  /** Take or drop the screen wake lock, after the setting changes. */
  applyWakeLock(): void;
  /** Repaint the board in place, after a highlighting setting changes. */
  refreshBoard(): void;
  goMenu(): void;
  openHelp(): void;
  openSettings(): void;
  playPuzzle(id: PuzzleId): void;
  playRandom(level: Level): void;
}
