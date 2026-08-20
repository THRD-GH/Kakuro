import { popcount } from './bits.ts';

/**
 * Every set of distinct digits 1..9, indexed by [size][sum] as 9-bit masks —
 * the combination table every kakuro player ends up half-memorising. Computed
 * on first import rather than shipped: 502 entries is a few hundred
 * microseconds of work and no bytes over the wire.
 */
const TABLE: number[][][] = (() => {
  const t: number[][][] = Array.from({ length: 10 }, () =>
    Array.from({ length: 46 }, () => [] as number[]),
  );
  for (let mask = 1; mask < 512; mask++) {
    let sum = 0;
    for (let d = 1; d <= 9; d++) if (mask & (1 << (d - 1))) sum += d;
    t[popcount(mask)][sum].push(mask);
  }

  /*
   * Ordered the way anyone writes these out by hand: 1+6, then 2+5, then 3+4.
   * Bit order will not do it — a mask's value is dominated by its *highest*
   * digit, so sorting on that puts 2 3 7 ahead of 1 5 6. Reading the digits as
   * a number does compare left to right, and every combination in a bucket has
   * the same number of them, so it is well defined.
   */
  const asDigits = (mask: number): number => {
    let n = 0;
    for (let d = 1; d <= 9; d++) if (mask & (1 << (d - 1))) n = n * 10 + d;
    return n;
  };
  for (const bySum of t) for (const bucket of bySum) bucket.sort((a, b) => asDigits(a) - asDigits(b));

  return t;
})();

const EMPTY: number[] = [];

/** Digit-set masks of `size` distinct digits summing to `sum`. Never null. */
export function combosFor(size: number, sum: number): number[] {
  if (size < 1 || size > 9 || sum < 1 || sum > 45) return EMPTY;
  return TABLE[size][sum];
}

/** Smallest sum reachable with `size` distinct digits: 1+2+...+size. */
export const minSum = (size: number): number => (size * (size + 1)) / 2;

/** Largest sum reachable with `size` distinct digits: 9+8+...  */
export const maxSum = (size: number): number => (size * (19 - size)) / 2;

/** Whether a clue is writable at all — the generator never emits others. */
export const sumIsPossible = (size: number, sum: number): boolean =>
  size >= 1 && size <= 9 && sum >= minSum(size) && sum <= maxSum(size);

/**
 * Combinations for the on-board table, narrowed by digits the player has
 * pinned in or ruled out. Keeps the table's order, so the ones starting with a
 * 1 come first.
 */
export function findCombos(size: number, sum: number, include: number, exclude: number): number[] {
  return combosFor(size, sum).filter((m) => (m & include) === include && (m & exclude) === 0);
}

/**
 * The clues that admit exactly one combination — 3 in two cells is 1+2 and
 * nothing else. Worth naming because they are where every kakuro starts.
 */
export const isUniqueClue = (size: number, sum: number): boolean =>
  combosFor(size, sum).length === 1;
