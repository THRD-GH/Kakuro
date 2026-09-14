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
 * How many puzzles each board and level offers. Generation is unlimited; this
 * only bounds the numbering so "puzzles you have not played" stays a
 * meaningful set rather than an infinity.
 */
export const POOL_SIZE = 500;

/**
 * The pool sizes on offer, as killer-sudoku offers them. Every grid is
 * generated from its number, so a bigger pool is more puzzles, not different
 * ones: the bound only says how far "left" counts and how high a random pick
 * reaches.
 */
export const POOL_SIZES = [500, 1000, 2500, 5000] as const;

export type Theme = 'night' | 'day' | 'contrast';

/** Which side of the controls the digits sit on, as killer-sudoku names it. */
export type KeypadSide = 'left' | 'right';

export interface Settings {
  theme: Theme;
  /** Which side the digits sit on, with the tools across from them. */
  keypadSide: KeypadSide;
  /** The board last chosen on the menu, so it is still there next time. */
  size: Size;
  /** How many numbered grids each board and belt offers: one of POOL_SIZES. */
  poolSize: number;
  /** Tint the across and down runs through the selected cell. */
  highlightRuns: boolean;
  /** Tint other cells holding the same digit. */
  highlightSameDigit: boolean;
  /** Writing a digit strikes it from the pencil marks in both its runs. */
  /** On, a lone digit tapped in stays a pencil mark instead of answering the cell. */
  allowSingleMark: boolean;
  autoRemoveMarks: boolean;
  /** Flag a repeat or overshoot the moment it is made, without consulting the answer. */
  instantCheck: boolean;
  /** Leave the combination table up, floating over the board, as you move about. */
  showCombos: boolean;
  /** Hold a wake lock while a puzzle is open, so the screen stops dimming. */
  keepAwake: boolean;
  showTimer: boolean;
  /** A few seconds of fireworks, above a dojo, when a puzzle is solved. */
  fireworks: boolean;
  /**
   * Tools that want a hold rather than a tap. Check and Hint are counted
   * against the puzzle; Marks and Clear are guarded against a stray thumb.
   */
  checkNeedsHold: boolean;
  hintNeedsHold: boolean;
  marksNeedsHold: boolean;
  clearNeedsHold: boolean;
  /** Undo and Redo, together: a stray tap should not unpick a move you meant. */
  undoNeedsHold: boolean;
  /** What sits behind the screens: 'none', a pattern's id, or 'custom' for a photo. */
  background: string;
  /** How far the page colour is laid over that image, 0 (none) to 1 (hidden). */
  backgroundDim: number;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'day',
  keypadSide: 'left',
  size: 12,
  poolSize: POOL_SIZE,
  highlightRuns: true,
  highlightSameDigit: true,
  allowSingleMark: false,
  autoRemoveMarks: true,
  instantCheck: false,
  showCombos: false,
  keepAwake: true,
  showTimer: true,
  fireworks: true,
  checkNeedsHold: true,
  hintNeedsHold: false,
  marksNeedsHold: true,
  clearNeedsHold: true,
  undoNeedsHold: false,
  background: 'none',
  backgroundDim: 0.55,
};

export interface PuzzleRecord {
  finished: boolean;
  /**
   * Put back in the pool from Stats: solved, with its best time kept, but
   * counted as unplayed again, so the menu deals it and counts it as left.
   */
  released?: boolean;
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
  // A dim outside 0..1 is a hand-edited or corrupted store: clamp it, rather
  // than paint the page a colour nobody asked for.
  const dim = Number(stored.backgroundDim);
  stored.backgroundDim = Number.isFinite(dim) ? Math.min(1, Math.max(0, dim)) : DEFAULT_SETTINGS.backgroundDim;
  if (typeof stored.background !== 'string') stored.background = DEFAULT_SETTINGS.background;
  // Only the sizes on offer: an edited store could otherwise make the menu
  // count to a million, or to nothing.
  if (!(POOL_SIZES as readonly number[]).includes(stored.poolSize)) stored.poolSize = DEFAULT_SETTINGS.poolSize;
  if (stored.keypadSide !== 'left' && stored.keypadSide !== 'right') stored.keypadSide = DEFAULT_SETTINGS.keypadSide;
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
      // Solved again, so out of the pool again.
      released: false,
      bestMs: best ? ms : entry.bestMs,
      bestAt: best ? Date.now() : entry.bestAt,
      hints: best ? hints : (entry.hints ?? hints),
      checks: best ? checks : (entry.checks ?? checks),
    },
  };
  saveHistory(next);
  return next;
}

/** Put a puzzle back in the unplayed pool, as the bin in the picker does. */
export function forgetPuzzle(history: History, id: PuzzleId): History {
  const next = { ...history };
  delete next[historyKey(id)];
  return next;
}

/** Puzzle numbers of this size and level never finished, or put back in the pool since. */
export function unplayedNumbers(
  history: History,
  id: Omit<PuzzleId, 'number'>,
  pool: number,
): number[] {
  const out: number[] = [];
  for (let number = 1; number <= pool; number++) {
    const record = history[historyKey({ ...id, number })];
    if (!record?.finished || record.released) out.push(number);
  }
  return out;
}

/** How many of a size and level's puzzles are finished and still out of the pool. */
export function finishedCount(history: History, id: Omit<PuzzleId, 'number'>, pool: number): number {
  let done = 0;
  for (let number = 1; number <= pool; number++) {
    const record = history[historyKey({ ...id, number })];
    if (record?.finished && !record.released) done++;
  }
  return done;
}

/** Put a solved puzzle back in the pool, keeping its best time: what holding its row in Stats does. */
export function releasePuzzle(history: History, id: PuzzleId): History {
  const key = historyKey(id);
  const entry = history[key];
  if (!entry?.finished) return history;
  return { ...history, [key]: { ...entry, released: true } };
}

/**
 * Forget every puzzle of one board and belt, whatever its number, so the whole
 * pool is unplayed again — including numbers above the pool size now chosen.
 */
export function resetPool(history: History, pool: Omit<PuzzleId, 'number'>): History {
  const next: History = {};
  for (const [key, record] of Object.entries(history)) {
    const id = parsePuzzleId(key);
    if (id && id.size === pool.size && id.level === pool.level) continue;
    next[key] = record;
  }
  return next;
}

// --------------------------------------------------------------------- stats

export interface PoolStats {
  /** Puzzles of this board and belt opened or solved. */
  played: number;
  finished: number;
  /** The mean of their best times, or null before the first solve. */
  averageMs: number | null;
}

/** One board and belt, as Stats sums it, counting every record whatever the pool size now. */
export function poolStats(history: History, pool: Omit<PuzzleId, 'number'>): PoolStats {
  let played = 0;
  let finished = 0;
  let total = 0;
  for (const [key, record] of Object.entries(history)) {
    const id = parsePuzzleId(key);
    if (!id || id.size !== pool.size || id.level !== pool.level) continue;
    played++;
    if (record.finished && record.bestMs !== undefined) {
      finished++;
      total += record.bestMs;
    }
  }
  return { played, finished, averageMs: finished > 0 ? Math.round(total / finished) : null };
}

export interface TotalStats {
  played: number;
  finished: number;
  averageMs: number | null;
  best: { id: PuzzleId; ms: number } | null;
  hints: number;
  checks: number;
  /** Days in a row, up to today, with at least one puzzle solved. */
  streak: number;
  /** Puzzles solved per belt, indexed 1 to 6. */
  byLevel: number[];
}

/** The day a timestamp falls on, in the reader's own time zone. */
const dayNumber = (ms: number): number => {
  const d = new Date(ms);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
};

/** Everything played, across every board and belt, as killer-sudoku totals its own. */
export function totalStats(history: History, now = Date.now()): TotalStats {
  const out: TotalStats = {
    played: 0,
    finished: 0,
    averageMs: null,
    best: null,
    hints: 0,
    checks: 0,
    streak: 0,
    byLevel: new Array<number>(7).fill(0),
  };
  let total = 0;
  const days = new Set<number>();

  for (const [key, record] of Object.entries(history)) {
    const id = parsePuzzleId(key);
    if (!id) continue;
    out.played++;
    out.hints += record.hints ?? 0;
    out.checks += record.checks ?? 0;
    if (!record.finished || record.bestMs === undefined) continue;
    out.finished++;
    total += record.bestMs;
    out.byLevel[id.level] = (out.byLevel[id.level] ?? 0) + 1;
    if (out.best === null || record.bestMs < out.best.ms) out.best = { id, ms: record.bestMs };
    if (record.bestAt !== undefined) days.add(dayNumber(record.bestAt));
  }
  out.averageMs = out.finished > 0 ? Math.round(total / out.finished) : null;

  // Counted back from today, or from yesterday when today has not been played
  // yet: an evening habit should not read as broken all morning.
  const today = dayNumber(now);
  let day = days.has(today) ? today : today - 1;
  while (days.has(day)) {
    out.streak++;
    day--;
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

/**
 * The saved games, with anything left from an older id format brought into
 * the current one.
 *
 * A save is filed under `formatPuzzleId` of its id, and that format has
 * changed twice: the board size went into it, and the Classic/New letter came
 * out. A save written under an older one sits under a key the current code
 * cannot compute — `6-N49` against the `20-6-49` it now works out — so
 * `dropSave` deleted nothing, the toast said the game had gone, and the row
 * was back the moment the list redrew. It could not be picked up either:
 * with no `size` on its id there was no board to build, which is what
 * `undefined×undefined` in the picker was saying out loud.
 *
 * They are repaired rather than thrown away. The size is recoverable because
 * the save carries the whole puzzle and that has it, so a half-finished game
 * from an older build survives its own filing system.
 */
function loadSaves(): SaveTable {
  const raw = read<SaveTable>(KEY.save, {});
  const table: SaveTable = {};
  let changed = false;

  for (const [key, save] of Object.entries(raw)) {
    const id = filedAs(save);
    if (!id) {
      // No size on the id and none on the puzzle either: there is no board
      // this could open, so there is nothing to keep.
      changed = true;
      continue;
    }

    const proper = formatPuzzleId(id);
    const stale = save.id?.size === undefined;
    if (stale || proper !== key) changed = true;

    /*
     * Two old keys can land on one new one — the Classic and the New of a
     * number, back when those were different puzzles. Whichever was put down
     * last is the one still being played.
     */
    const sitting = table[proper];
    if (sitting) {
      changed = true;
      if ((sitting.savedAt ?? 0) >= (save.savedAt ?? 0)) continue;
    }
    table[proper] = stale ? { ...save, id } : save;
  }

  if (changed) write(KEY.save, table);
  return table;
}

/** The id a save should be filed under, or null if it cannot be worked out. */
function filedAs(save: SavedGame | null | undefined): PuzzleId | null {
  // Anything read back out of storage is only a shape until it is checked.
  const id = save?.id as Partial<PuzzleId> | undefined;
  const level = id?.level;
  const number = id?.number;
  const size = id?.size ?? save?.puzzle?.size;
  if (typeof size !== 'number' || !isSize(size)) return null;
  if (typeof level !== 'number' || !Number.isInteger(level) || level < 1 || level > 6) return null;
  if (typeof number !== 'number' || !Number.isInteger(number) || number < 1) return null;
  return { size, level: level as PuzzleId['level'], number };
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

/** Throw away every unfinished game of one board and belt, as a reset from Stats does. */
export function dropSavesFor(pool: Omit<PuzzleId, 'number'>): number {
  const table = loadSaves();
  let dropped = 0;
  for (const [key, save] of Object.entries(table)) {
    if (save.id.size !== pool.size || save.id.level !== pool.level) continue;
    delete table[key];
    dropped++;
  }
  if (dropped > 0) write(KEY.save, table);
  return dropped;
}

// -------------------------------------------------------------------- backup

/*
 * Your data as a file you keep, in the same shape as the other DanDoku games'
 * backups. Everything lives in localStorage, which a browser can clear without
 * warning, so a file is the only real protection for a long history.
 *
 * Kakuro's differs in one field. Its grids are generated from their numbers,
 * and a new generator turns every number into a different grid — which is why
 * retireGeneratedPuzzles clears history and saves when the generator changes.
 * A backup records the generator it was made under, and one from another
 * generator brings back its settings only: its history and saves name grids
 * that no longer exist.
 *
 * The background photo is not in it — it stays on the device it was chosen on
 * — and neither is the puzzle cache, which is rebuilt as puzzles are played.
 */

export interface Backup {
  app: 'kakuro';
  version: 1;
  exportedAt: string;
  /** The generator the history and saves were made under. */
  generator: number;
  settings: Settings;
  history: History;
  saves: SavedGame[];
}

/** Everything worth keeping, in one object. */
export function exportBackup(): Backup {
  return {
    app: 'kakuro',
    version: 1,
    exportedAt: new Date().toISOString(),
    generator: GENERATOR_VERSION,
    settings: loadSettings(),
    history: loadHistory(),
    saves: Object.values(loadSaves()),
  };
}

export interface Restored {
  history: number;
  saves: number;
  /** True when the backup came from another generator and only its settings were taken. */
  settingsOnly: boolean;
}

/**
 * Restore a backup, replacing what is here. Checked in full before anything is
 * written, so a wrong or damaged file cannot leave storage half-overwritten.
 */
export function importBackup(raw: unknown): Restored {
  const data = raw as Partial<Backup> | null;
  if (!data || typeof data !== 'object' || data.app !== 'kakuro' || data.version !== 1) {
    throw new Error('That is not a Kakuro backup.');
  }
  if (typeof data.history !== 'object' || data.history === null || Array.isArray(data.history)) {
    throw new Error('That backup is damaged.');
  }
  const saves = Array.isArray(data.saves) ? data.saves : [];
  for (const save of saves) {
    const cells = save?.puzzle?.size * save?.puzzle?.size;
    const whole =
      filedAs(save) !== null &&
      Array.isArray(save.puzzle?.solution) &&
      save.puzzle.solution.length === cells &&
      Array.isArray(save.values) &&
      save.values.length === cells &&
      Array.isArray(save.marks) &&
      save.marks.length === cells;
    if (!whole) throw new Error('That backup has a damaged saved game.');
  }

  const settings = { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) };
  write(KEY.settings, settings);
  if (data.generator !== GENERATOR_VERSION) {
    return { history: 0, saves: 0, settingsOnly: true };
  }

  const table: SaveTable = {};
  const newest = [...saves].sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0)).slice(0, MAX_SAVES);
  for (const save of newest) {
    const id = filedAs(save);
    if (id) table[formatPuzzleId(id)] = { ...save, id };
  }
  write(KEY.history, data.history);
  write(KEY.save, table);
  return { history: Object.keys(data.history).length, saves: Object.keys(table).length, settingsOnly: false };
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
  const key = historyKey(id);
  delete table[key];
  table[key] = puzzle;
  const keys = Object.keys(table);
  if (keys.length > MAX_CACHE) for (const extra of keys.slice(0, keys.length - MAX_CACHE)) delete table[extra];
  write(KEY.cache, table);
}

/**
 * Puzzles made by an older generator no longer exist: the same number now
 * produces a different grid. Rather than leave saves and history pointing at
 * grids nobody can open again, they are cleared out on the first run after a
 * generator change.
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
    if (history[key].finished || history[key].startedAt) forgotten++;
    delete history[key];
  }
  saveHistory(history);
  write(KEY.save, {});
  write(KEY.cache, {});

  return forgotten;
}

// ------------------------------------------------------------- shared links

/**
 * A link that opens one particular puzzle. The number names a seed, and the
 * link carries the generator that produced it — the same number from an older
 * generator is a different grid.
 */
export function puzzleLink(id: PuzzleId, href = window.location.href): string {
  const url = new URL(href);
  url.hash = '';
  url.searchParams.set('p', formatPuzzleId(id));
  url.searchParams.set('g', String(GENERATOR_VERSION));
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
  const rawGeneration = url.searchParams.get('g');
  const madeBy = rawGeneration === null ? 1 : Number(rawGeneration);
  if (!Number.isInteger(madeBy) || madeBy !== generation) return { ok: false, reason: 'stale-generator' };
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
