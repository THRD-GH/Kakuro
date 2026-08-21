import type { Level, PuzzleId, Size, Source } from '../core/types.ts';
import type { History, Settings } from '../game/storage.ts';

/** Puzzles held per board size, then per level. */
export type PackCounts = Record<number, Record<number, number>>;

/** What the screens are allowed to ask of the app shell. */
export interface AppContext {
  settings: Settings;
  history: History;
  /** What the shipped packs hold, or null when none are installed. */
  packCounts: PackCounts | null;
  newPoolSize: number;
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
  playRandom(level: Level, source: Source): void;
}
