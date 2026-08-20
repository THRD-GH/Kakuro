/**
 * Builds the Classic collection into public/packs/.
 *
 *   node tools/make-packs.ts [per-level]
 *
 * Each round asks for whichever level is furthest behind, at the shape that
 * level is generated at — but files the result by the level it *measured* at,
 * which is not always the one that was asked for. Nothing is filed anywhere
 * until it has been measured, so a pack cannot end up holding a near miss that
 * the generator settled for when its budget ran out.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodePuzzle } from '../src/core/encode.ts';
import { classify, planFor, sampleCandidate } from '../src/core/generator.ts';
import { mulberry32 } from '../src/core/rng.ts';
import { LEVELS } from '../src/core/types.ts';
import type { Level } from '../src/core/types.ts';

const perLevel = Number(process.argv[2] ?? 150);
const minutes = Number(process.argv[3] ?? 25);

const rnd = mulberry32(0x4b414b55); // "KAKU"
const packs = new Map<Level, string[]>(LEVELS.map((level) => [level, []]));
const seen = new Set<string>();

const shortest = (): Level | null => {
  let pick: Level | null = null;
  for (const level of LEVELS) {
    const held = packs.get(level)!.length;
    if (held >= perLevel) continue;
    if (pick === null || held < packs.get(pick)!.length) pick = level;
  }
  return pick;
};

const started = Date.now();
let generated = 0;
let filed = 0;
let reported = 0;

for (;;) {
  const asked = shortest();
  if (asked === null) break;
  if (Date.now() - started > minutes * 60_000) {
    console.warn(`\ntime budget of ${minutes} minutes spent; writing what there is`);
    break;
  }

  const plan = planFor(asked);
  // A little jitter in the shape, so a level's puzzles are not all the same
  // board with different numbers on it.
  const block = Math.max(0.18, Math.min(0.46, plan.block + (rnd() - 0.5) * 0.08));
  const candidate = sampleCandidate(plan.size, block, asked, rnd);
  if (!candidate) continue;
  generated++;

  const level = classify(candidate.rating);
  const bucket = packs.get(level)!;
  if (bucket.length >= perLevel) continue;

  const record = encodePuzzle(candidate.puzzle);
  if (seen.has(record)) continue;
  seen.add(record);
  bucket.push(record);
  filed++;

  if (filed - reported >= 25) {
    reported = filed;
    console.log(
      `${filed} filed from ${generated} generated in ${((Date.now() - started) / 1000).toFixed(0)}s — ` +
        LEVELS.map((l) => `L${l} ${packs.get(l)!.length}`).join(' '),
    );
  }
}

const out = join(process.cwd(), 'public', 'packs');
mkdirSync(out, { recursive: true });

const counts: Record<number, number> = {};
for (const level of LEVELS) {
  const records = packs.get(level)!;
  counts[level] = records.length;
  writeFileSync(join(out, `level-${level}.json`), JSON.stringify(records));
}
writeFileSync(join(out, 'index.json'), JSON.stringify({ counts }));

const total = Object.values(counts).reduce((a, b) => a + b, 0);
console.log(
  `\nwrote public/packs/ — ${total} puzzles from ${generated} generated in ` +
    `${((Date.now() - started) / 1000).toFixed(0)}s\n  ` +
    LEVELS.map((l) => `L${l} ${counts[l]}`).join('  '),
);
