import type { Level, PuzzleId, Source } from '../core/types.ts';
import type { History, Settings } from '../game/storage.ts';

/** What the screens are allowed to ask of the app shell. */
export interface AppContext {
  settings: Settings;
  history: History;
  /** Puzzles per level in the shipped packs, or null when none are installed. */
  packCounts: Record<number, number> | null;
  newPoolSize: number;
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
