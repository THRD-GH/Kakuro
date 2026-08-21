import { GENERATOR_VERSION } from '../core/generator.ts';
import type { Puzzle, PuzzleId, Size } from '../core/types.ts';
import { formatPuzzleId, isSize, parsePuzzleId } from '../core/types.ts';

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
  /** The board last chosen on the menu, so it is still there next time. */
  size: Size;
  /** Tint the across and down runs through the selected cell. */
  highlightRuns: boolean;
  /** Tint other cells holding the same digit. */
  highlightSameDigit: boolean;
  /** Writing a digit strikes it from the pencil marks in both its runs. */
  autoRemoveMarks: boolean;
  /** Flag a repeat or overshoot the moment it is made, without consulting the answer. */
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
  size: 12,
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
  /** Cells Check has marked, restored on resume. */
  flagged?: number[];
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
  const stored = { ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(KEY.settings, {}) };
  // A board that is no longer offered would leave the menu with nothing
  // selected and the level rows counting a pool that does not exist.
  if (!isSize(stored.size)) stored.size = DEFAULT_SETTINGS.size;
  return stored;
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
      hints: best ? hints : (entry.hints ?? hints),
      checks: best ? checks : (entry.checks ?? checks),
    },
  };
  saveHistory(next);
  return next;
}

/** Puzzle numbers of this size and level that have never been finished. */
export function unplayedNumbers(
  history: History,
  id: Omit<PuzzleId, 'number'>,
  pool: number,
): number[] {
  const out: number[] = [];
  for (let number = 1; number <= pool; number++) {
    if (!history[historyKey({ ...id, number })]?.finished) out.push(number);
  }
  return out;
}

/** How many of a size and level's puzzles have been finished. */
export function finishedCount(history: History, id: Omit<PuzzleId, 'number'>, pool: number): number {
  let done = 0;
  for (let number = 1; number <= pool; number++) {
    if (history[historyKey({ ...id, number })]?.finished) done++;
  }
  return done;
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

/**
 * A save only resumes if it is the same grid, the same size, and the same
 * length of marks and values. Anything else is a leftover from a rebuilt pack
 * or a truncated write, and starting clean is better than painting holes.
 */
export function saveFitsPuzzle(save: SavedGame | null, puzzle: Puzzle): SavedGame | null {
  if (!save) return null;
  const cells = puzzle.size * puzzle.size;
  if (save.puzzle.size !== puzzle.size) return null;
  if (save.puzzle.solution.length !== cells) return null;
  if (save.values.length !== cells || save.marks.length !== cells) return null;
  if (save.puzzle.solution.some((digit, i) => digit !== puzzle.solution[i])) return null;
  if (save.values.some((digit) => !Number.isInteger(digit) || digit < 0 || digit > 9)) return null;
  if (save.marks.some((mask) => !Number.isInteger(mask) || mask < 0 || mask > 0x1ff)) return null;
  return save;
}

export function unfinishedSaves(): SavedGame[] {
  return Object.values(loadSaves())
    .filter((save) => !saveComplete(save))
    .sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
}

function saveComplete(save: SavedGame): boolean {
  return save.puzzle.solution.every((digit, i) => digit === 0 || save.values[i] === digit);
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
  if (id.source !== 'new') return null;
  return read<CacheTable>(KEY.cache, {})[historyKey(id)] ?? null;
}

export function cachePuzzle(id: PuzzleId, puzzle: Puzzle): void {
  if (id.source !== 'new') return;
  const table = read<CacheTable>(KEY.cache, {});
  const key = historyKey(id);
  delete table[key];
  table[key] = puzzle;
  const keys = Object.keys(table);
  if (keys.length > MAX_CACHE) for (const extra of keys.slice(0, keys.length - MAX_CACHE)) delete table[extra];
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
 * A link that opens one particular puzzle. Classic numbers name a pack entry.
 * New numbers name a seed *and* the generator that produced it — the same
 * number from an older generator is a different grid.
 */
export function puzzleLink(id: PuzzleId, href = window.location.href): string {
  const url = new URL(href);
  url.hash = '';
  url.searchParams.set('p', formatPuzzleId(id));
  if (id.source === 'new') url.searchParams.set('g', String(GENERATOR_VERSION));
  else url.searchParams.delete('g');
  return url.toString();
}

export type PuzzleLink =
  | { ok: true; id: PuzzleId }
  | { ok: false; reason: 'stale-generator' };

/** Parse `p` / `g` off a URL. Missing `g` on a New link means generator 1. */
export function parsePuzzleLink(href: string, generation = GENERATOR_VERSION): PuzzleLink | null {
  const url = new URL(href, 'https://dandoku.com/kakuro/');
  const raw = url.searchParams.get('p');
  if (!raw) return null;
  const id = parsePuzzleId(raw);
  if (!id) return null;
  if (id.source === 'new') {
    const rawGeneration = url.searchParams.get('g');
    const madeBy = rawGeneration === null ? 1 : Number(rawGeneration);
    if (!Number.isInteger(madeBy) || madeBy !== generation) return { ok: false, reason: 'stale-generator' };
  }
  return { ok: true, id };
}

export function linkedPuzzle(): PuzzleLink | null {
  return parsePuzzleLink(window.location.href);
}

/** Take the puzzle out of the address bar, so a reload does not reopen it. */
export function clearPuzzleLink(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('p') && !url.searchParams.has('g')) return;
  url.searchParams.delete('p');
  url.searchParams.delete('g');
  window.history.replaceState(null, '', url.toString());
}
