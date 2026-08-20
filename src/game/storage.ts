import { GENERATOR_VERSION } from '../core/generator.ts';
import type { Level, Puzzle, PuzzleId, Source } from '../core/types.ts';
import { formatPuzzleId } from '../core/types.ts';

/*
 * Everything this game keeps is under `kk:v1:`. The DanDoku games share one
 * origin — dandoku.com serves all of them — so each prefixes its own keys and
 * only ever prunes its own. A game that tidied up `localStorage` generally
 * would be deleting another game's saves.
 */
const KEY = {
  settings: 'kk:v1:settings',
  history: 'kk:v1:history',
  save: 'kk:v1:save',
  cache: 'kk:v1:cache',
  /** Which generator made the New puzzles this device is holding. */
  generator: 'kk:v1:generator',
} as const;

/**
 * How many New puzzles each level offers. Generation is unlimited; this only
 * bounds the picker so "puzzles you have not played" stays a meaningful set.
 * Classic levels offer however many the pack holds.
 */
export const NEW_POOL_SIZE = 400;

export type Theme = 'night' | 'day' | 'contrast';

export interface Settings {
  theme: Theme;
  /** Tint the across and down runs through the selected cell. */
  highlightRuns: boolean;
  /** Tint other cells holding the same digit. */
  highlightSameDigit: boolean;
  /** Writing a digit strikes it from the pencil marks in both its runs. */
  autoRemoveMarks: boolean;
  /** Flag a wrong entry the moment it is made, rather than waiting for Check. */
  instantCheck: boolean;
  /** Keep the combination table open beside the board as you move around it. */
  showCombos: boolean;
  /** Hold a wake lock while a puzzle is open, so the screen stops dimming. */
  keepAwake: boolean;
  showTimer: boolean;
  /** Check and Clear are counted against the puzzle, so they are guarded. */
  checkNeedsHold: boolean;
  hintNeedsHold: boolean;
  clearNeedsHold: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'day',
  highlightRuns: true,
  highlightSameDigit: true,
  autoRemoveMarks: true,
  instantCheck: false,
  showCombos: true,
  keepAwake: true,
  showTimer: true,
  checkNeedsHold: true,
  hintNeedsHold: false,
  clearNeedsHold: true,
};

export interface PuzzleRecord {
  finished: boolean;
  /** When it was first opened, so unfinished games can be listed newest first. */
  startedAt?: number;
  bestMs?: number;
  bestAt?: number;
  hints?: number;
  checks?: number;
}

export type History = Record<string, PuzzleRecord>;

export interface SavedGame {
  id: PuzzleId;
  puzzle: Puzzle;
  values: number[];
  marks: number[];
  elapsedMs: number;
  hints: number;
  checks: number;
  savedAt?: number;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private browsing, or a full quota. The game still plays; it just forgets.
  }
}

// ------------------------------------------------------------------ settings

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(KEY.settings, {}) };
}

export function saveSettings(settings: Settings): void {
  write(KEY.settings, settings);
}

// ------------------------------------------------------------------- history

export const historyKey = (id: PuzzleId): string => formatPuzzleId(id);

export function loadHistory(): History {
  return read<History>(KEY.history, {});
}

export function saveHistory(history: History): void {
  write(KEY.history, history);
}

export function recordStart(history: History, id: PuzzleId): History {
  const key = historyKey(id);
  const entry = history[key];
  if (entry?.startedAt) return history;
  const next = {
    ...history,
    [key]: { ...entry, finished: entry?.finished ?? false, startedAt: Date.now() },
  };
  saveHistory(next);
  return next;
}

export function recordFinish(
  history: History,
  id: PuzzleId,
  ms: number,
  hints: number,
  checks: number,
): History {
  const key = historyKey(id);
  const entry = history[key] ?? { finished: false };
  const best = entry.bestMs === undefined || ms < entry.bestMs;
  const next = {
    ...history,
    [key]: {
      ...entry,
      finished: true,
      bestMs: best ? ms : entry.bestMs,
      bestAt: best ? Date.now() : entry.bestAt,
      hints: (entry.hints ?? 0) + hints,
      checks: (entry.checks ?? 0) + checks,
    },
  };
  saveHistory(next);
  return next;
}

/** Puzzle numbers at this level that have never been finished. */
export function unplayedNumbers(history: History, level: Level, source: Source, pool: number): number[] {
  const out: number[] = [];
  for (let number = 1; number <= pool; number++) {
    const entry = history[historyKey({ level, number, source })];
    if (!entry?.finished) out.push(number);
  }
  return out;
}

// --------------------------------------------------------------------- saves

/**
 * Unfinished games, newest first. Several are kept — putting one puzzle down
 * to start another is normal, and losing the first one for it is not.
 */
const MAX_SAVES = 12;

type SaveTable = Record<string, SavedGame>;

function loadSaves(): SaveTable {
  return read<SaveTable>(KEY.save, {});
}

export function loadSaveFor(id: PuzzleId): SavedGame | null {
  return loadSaves()[historyKey(id)] ?? null;
}

export function unfinishedSaves(): SavedGame[] {
  return Object.values(loadSaves()).sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
}

export function putSave(save: SavedGame): void {
  const table = loadSaves();
  table[historyKey(save.id)] = { ...save, savedAt: Date.now() };

  const ordered = Object.entries(table).sort((a, b) => (b[1].savedAt ?? 0) - (a[1].savedAt ?? 0));
  write(KEY.save, Object.fromEntries(ordered.slice(0, MAX_SAVES)));
}

export function dropSave(id: PuzzleId): void {
  const table = loadSaves();
  delete table[historyKey(id)];
  write(KEY.save, table);
}

// --------------------------------------------------------------------- cache

/**
 * Generated puzzles, kept so that replaying a number is instant rather than
 * another few seconds of searching. Small enough to be cheap, big enough that
 * going back to the puzzle you just closed is free.
 */
const MAX_CACHE = 24;

type CacheTable = Record<string, Puzzle>;

export function cachedPuzzle(id: PuzzleId): Puzzle | null {
  return read<CacheTable>(KEY.cache, {})[historyKey(id)] ?? null;
}

export function cachePuzzle(id: PuzzleId, puzzle: Puzzle): void {
  const table = read<CacheTable>(KEY.cache, {});
  table[historyKey(id)] = puzzle;
  const keys = Object.keys(table);
  if (keys.length > MAX_CACHE) for (const key of keys.slice(0, keys.length - MAX_CACHE)) delete table[key];
  write(KEY.cache, table);
}

/**
 * New puzzles made by an older generator no longer exist: the same number now
 * produces a different grid. Rather than leave saves and history pointing at
 * puzzles nobody can open again, they are cleared out on the first run after a
 * generator change. Classic history is untouched — those come from the packs.
 *
 * Returns how many played puzzles were forgotten, so it can be said out loud
 * rather than happening silently.
 */
export function retireGeneratedPuzzles(): number {
  const stored = read<number>(KEY.generator, 0);
  if (stored === GENERATOR_VERSION) return 0;
  write(KEY.generator, GENERATOR_VERSION);
  if (stored === 0) return 0; // first run on this device; nothing to retire

  const history = loadHistory();
  let forgotten = 0;
  for (const key of Object.keys(history)) {
    if (!key.includes('N')) continue;
    if (history[key].finished || history[key].startedAt) forgotten++;
    delete history[key];
  }
  saveHistory(history);

  const saves = loadSaves();
  for (const key of Object.keys(saves)) if (key.includes('N')) delete saves[key];
  write(KEY.save, saves);
  write(KEY.cache, {});

  return forgotten;
}

// ------------------------------------------------------------- shared links

/**
 * A link that opens one particular puzzle. Classic numbers name a pack entry
 * and New numbers name a seed, so both travel as nothing more than their id.
 */
export function puzzleLink(id: PuzzleId): string {
  const url = new URL(window.location.href);
  url.hash = '';
  url.searchParams.set('p', formatPuzzleId(id));
  return url.toString();
}

export function linkedPuzzle(): PuzzleId | null {
  const raw = new URL(window.location.href).searchParams.get('p');
  if (!raw) return null;
  const match = /^([1-6])-(N?)(\d+)$/.exec(raw.trim());
  if (!match) return null;
  return {
    level: Number(match[1]) as Level,
    source: match[2] ? 'new' : 'classic',
    number: Number(match[3]),
  };
}

/** Take the puzzle out of the address bar, so a reload does not reopen it. */
export function clearPuzzleLink(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('p')) return;
  url.searchParams.delete('p');
  window.history.replaceState(null, '', url.toString());
}
