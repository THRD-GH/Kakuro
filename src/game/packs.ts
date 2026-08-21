import { decodePuzzle } from '../core/encode.ts';
import type { Level, Puzzle, Size } from '../core/types.ts';
import type { PackCounts } from '../ui/app-context.ts';

/**
 * The shipped Classic collection, built by tools/make-packs.ts. Absent packs
 * are not an error — Classic simply switches itself off and New still plays.
 */
const packBase = (): string => {
  const env = (import.meta as { env?: { BASE_URL?: string } }).env;
  return `${env?.BASE_URL ?? '/'}packs/`;
};

let counts: PackCounts | null | undefined;
const loaded = new Map<string, string[]>();

/** Puzzles available per size and level, or null when no packs are installed. */
export async function packCounts(): Promise<PackCounts | null> {
  if (counts !== undefined) return counts ?? null;
  try {
    const res = await fetch(`${packBase()}index.json`);
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { counts: Record<string, Record<string, number>> };
    counts = Object.fromEntries(
      Object.entries(data.counts).map(([size, levels]) => [
        Number(size),
        Object.fromEntries(Object.entries(levels).map(([level, n]) => [Number(level), n])),
      ]),
    );
  } catch {
    counts = null;
  }
  return counts;
}

async function levelPack(size: Size, level: Level): Promise<string[]> {
  const key = `${size}-${level}`;
  const cached = loaded.get(key);
  if (cached) return cached;

  // The service worker precaches every pack, so this only fails on a first
  // visit that went offline mid-load, or in a build with no packs at all.
  let res: Response;
  try {
    res = await fetch(`${packBase()}${size}-${level}.json`);
  } catch {
    throw new Error(`Those Classic puzzles aren't here yet — try again online`);
  }
  if (!res.ok) throw new Error(`Level ${level} on a ${size}×${size} has no Classic puzzles`);

  const puzzles = (await res.json()) as string[];
  loaded.set(key, puzzles);
  return puzzles;
}

export async function classicPuzzle(size: Size, level: Level, number: number): Promise<Puzzle> {
  const pack = await levelPack(size, level);
  const record = pack[number - 1];
  if (!record) throw new Error(`puzzle ${size}-${level}-${number} is not in the pack`);
  return decodePuzzle(record, level, number);
}
