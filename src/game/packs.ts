import { decodePuzzle } from '../core/encode.ts';
import type { Level, Puzzle } from '../core/types.ts';

/**
 * The shipped Classic collection, built by tools/make-packs.ts. Absent packs
 * are not an error — Classic simply switches itself off and New still plays.
 */
const packBase = (): string => {
  const env = (import.meta as { env?: { BASE_URL?: string } }).env;
  return `${env?.BASE_URL ?? '/'}packs/`;
};

let counts: Record<number, number> | null | undefined;
const loaded = new Map<Level, string[]>();

/** Puzzles available per level, or null when no packs are installed. */
export async function packCounts(): Promise<Record<number, number> | null> {
  if (counts !== undefined) return counts ?? null;
  try {
    const res = await fetch(`${packBase()}index.json`);
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { counts: Record<string, number> };
    counts = Object.fromEntries(Object.entries(data.counts).map(([k, v]) => [Number(k), v]));
  } catch {
    counts = null;
  }
  return counts;
}

async function levelPack(level: Level): Promise<string[]> {
  const cached = loaded.get(level);
  if (cached) return cached;

  // The service worker precaches every pack, so this only fails on a first
  // visit that went offline mid-load, or in a build with no packs at all.
  let res: Response;
  try {
    res = await fetch(`${packBase()}level-${level}.json`);
  } catch {
    throw new Error(`Level ${level}'s Classic puzzles aren't here yet — try again online`);
  }
  if (!res.ok) throw new Error(`Level ${level}'s Classic puzzles are unavailable`);

  const puzzles = (await res.json()) as string[];
  loaded.set(level, puzzles);
  return puzzles;
}

export async function classicPuzzle(level: Level, number: number): Promise<Puzzle> {
  const pack = await levelPack(level);
  const record = pack[number - 1];
  if (!record) throw new Error(`puzzle ${level}-${number} is not in the pack`);
  return decodePuzzle(record, level, number);
}
