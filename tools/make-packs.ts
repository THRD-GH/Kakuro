/**
 * Builds the Classic collection into public/packs/, one file per board size
 * and level.
 *
 *   node tools/make-packs.ts [minutes]
 *
 * Every cell of the size-by-level matrix is asked for in turn and given a slice
 * of time; whatever it yields is filed by the level it *measured* at, not the
 * one that was asked for. Nothing is filed anywhere until it has been measured,
 * so a pack cannot end up holding a near miss the generator settled for.
 *
 * Not every cell fills. A big board interlocks more, so the easy techniques run
 * out sooner and its easy levels are genuinely scarce — `node tools/matrix.ts`
 * prints which pairs are reachable. An empty cell is not a failure to paper
 * over: the menu greys out a level with no puzzles on the chosen board, which
 * is the honest thing for it to show.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodePuzzle } from '../src/core/encode.ts';
import { blockFor, classify, sampleCandidate } from '../src/core/generator.ts';
import { mulberry32 } from '../src/core/rng.ts';
import { LEVELS, SIZES } from '../src/core/types.ts';
import type { Level, Size } from '../src/core/types.ts';

const budgetMinutes = Number(process.argv[2] ?? 20);

/** How many to aim for per cell. Big boards are slower, so they ask for less. */
const QUOTA: Record<Size, number> = { 9: 60, 12: 60, 16: 40, 20: 25 };

const rnd = mulberry32(0x4b414b55); // "KAKU"
const packs = new Map<string, string[]>();
const seen = new Set<string>();
const key = (size: Size, level: Level): string => `${size}-${level}`;
for (const size of SIZES) for (const level of LEVELS) packs.set(key(size, level), []);

const started = Date.now();
const deadline = started + budgetMinutes * 60_000;
/** Time each cell gets per pass, so a scarce one cannot eat the whole budget. */
const sliceMs = 20_000;

let generated = 0;
let filed = 0;

for (let pass = 0; pass < 4 && Date.now() < deadline; pass++) {
  let progressed = false;

  for (const size of SIZES) {
    for (const level of LEVELS) {
      const bucket = packs.get(key(size, level))!;
      if (bucket.length >= QUOTA[size]) continue;
      if (Date.now() >= deadline) break;

      const until = Math.min(Date.now() + sliceMs, deadline);
      while (bucket.length < QUOTA[size] && Date.now() < until) {
        const jitter = (rnd() - 0.5) * 0.05;
        const candidate = sampleCandidate(size, blockFor(size, level) + jitter, level, rnd, 400);
        if (!candidate) continue;
        generated++;

        // Filed by what it measured at, which is not always what was asked for.
        const measured = classify(candidate.rating);
        const home = packs.get(key(size, measured))!;
        if (home.length >= QUOTA[size]) continue;

        const record = encodePuzzle(candidate.puzzle);
        if (seen.has(record)) continue;
        seen.add(record);
        home.push(record);
        filed++;
        progressed = true;
      }

      console.log(
        `${size}x${size} L${level}: ${bucket.length}/${QUOTA[size]}` +
          `  (${filed} filed from ${generated}, ${((Date.now() - started) / 1000).toFixed(0)}s)`,
      );
    }
  }

  if (!progressed) break;
}

const out = join(process.cwd(), 'public', 'packs');
mkdirSync(out, { recursive: true });

const counts: Record<number, Record<number, number>> = {};
for (const size of SIZES) {
  counts[size] = {};
  for (const level of LEVELS) {
    const records = packs.get(key(size, level))!;
    counts[size][level] = records.length;
    if (records.length > 0) writeFileSync(join(out, `${size}-${level}.json`), JSON.stringify(records));
  }
}
writeFileSync(join(out, 'index.json'), JSON.stringify({ counts }));

console.log(`\nwrote public/packs/ — ${filed} puzzles in ${((Date.now() - started) / 60_000).toFixed(1)} minutes`);
for (const size of SIZES) {
  console.log(`  ${String(size).padStart(2)}x${size}  ` + LEVELS.map((l) => `L${l} ${String(counts[size][l]).padStart(2)}`).join('  '));
}
