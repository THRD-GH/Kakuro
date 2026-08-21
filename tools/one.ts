import { generatePuzzle } from '../src/core/generator.ts';
const size = Number(process.argv[2] ?? 20);
const level = Number(process.argv[3] ?? 3);
const number = Number(process.argv[4] ?? 158);
const at = Date.now();
const p = generatePuzzle({ size, level, number } as never);
console.log(`${size}-${level}-${number}: ${Date.now() - at}ms  rating ${p.rating.toFixed(2)} level ${p.difficulty}`);
