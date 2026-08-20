import { generatePuzzle, classify } from '../src/core/generator.ts';
import { Solver, countSolutions } from '../src/core/solver.ts';
const levels = process.argv[2] ? [Number(process.argv[2])] : [1,2,3,4,5,6];
const n = Number(process.argv[3] ?? 5);
for (const level of levels) {
  const t0 = Date.now();
  const got = [];
  for (let i = 1; i <= n; i++) {
    const p = generatePuzzle(level, i);
    const unique = countSolutions(p, 2) === 1;
    const r = new Solver(p).grind();
    got.push({ rating: p.rating.toFixed(1), lvl: classify(p.rating), unique, solved: r.solved, hardest: r.hardest, effort: r.effort });
  }
  const ms = ((Date.now() - t0) / n).toFixed(0);
  const hit = got.filter(g => g.lvl === level).length;
  console.log(`L${level}: ${hit}/${n} on band, ${got.filter(g=>g.unique).length}/${n} unique, ${got.filter(g=>g.solved).length}/${n} logic-solvable, ${ms}ms each`);
  console.log('   ' + got.map(g => `${g.rating}(L${g.lvl},${g.hardest ?? '-'},${g.effort})`).join(' '));
}
