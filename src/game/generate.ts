import { generatePuzzle } from '../core/generator.ts';
import type { Puzzle, PuzzleId } from '../core/types.ts';
import { classicPuzzle } from './packs.ts';
import { cachePuzzle, cachedPuzzle } from './storage.ts';

/**
 * Generating a New puzzle is a search, so it happens on a worker and the board
 * shows a spinner rather than the page locking up. Results are cached, which
 * makes going back to a puzzle number instant. Prefetch and a tap on the same
 * number share one in-flight search rather than running two.
 */
let worker: Worker | null = null;
let nextToken = 1;
const pending = new Map<number, { resolve: (p: Puzzle) => void; reject: (e: Error) => void }>();
const inflight = new Map<string, Promise<Puzzle>>();

const puzzleKey = (id: PuzzleId): string => `${id.source}:${id.level}:${id.number}`;

function ensureWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === 'undefined') return null;
  try {
    worker = new Worker(new URL('../worker/generate.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (e: MessageEvent) => {
      const { token, puzzle, error } = e.data as {
        token: number;
        puzzle?: Puzzle;
        error?: string;
      };
      const entry = pending.get(token);
      if (!entry) return;
      pending.delete(token);
      if (puzzle) entry.resolve(puzzle);
      else entry.reject(new Error(error ?? 'generation failed'));
    };
    worker.onerror = () => {
      // Fall back to the main thread for the rest of the session.
      for (const [, entry] of pending) entry.reject(new Error('worker failed'));
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  } catch {
    worker = null;
  }
  return worker;
}

function requestGenerated(id: PuzzleId): Promise<Puzzle> {
  const w = ensureWorker();
  if (!w) return Promise.resolve(generatePuzzle(id));
  const token = nextToken++;
  return new Promise<Puzzle>((resolve, reject) => {
    pending.set(token, { resolve, reject });
    w.postMessage({ token, id });
  }).catch(() => generatePuzzle(id));
}

export async function getPuzzle(id: PuzzleId): Promise<Puzzle> {
  const cached = cachedPuzzle(id);
  if (cached) return cached;

  // Classic puzzles are a lookup, not a search — no worker needed.
  if (id.source === 'classic') {
    return classicPuzzle(id.size, id.level, id.number);
  }

  const key = puzzleKey(id);
  const existing = inflight.get(key);
  if (existing) return existing;

  const search = requestGenerated(id).then((puzzle) => {
    cachePuzzle(id, puzzle);
    return puzzle;
  });
  inflight.set(key, search);
  try {
    return await search;
  } finally {
    inflight.delete(key);
  }
}

/** Warm the cache for a puzzle the player is likely to open next. */
export function prefetch(id: PuzzleId): void {
  if (id.source === 'classic' || cachedPuzzle(id)) return;
  void getPuzzle(id).catch(() => undefined);
}
