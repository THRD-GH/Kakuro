import { bit, digitsOf, popcount } from './bits.ts';

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

/** Smallest total reachable with `size` distinct digits: 1+2+...+size. */
export const minSum = (size: number): number => (size * (size + 1)) / 2;

/** Largest total reachable with `size` distinct digits: 9+8+...  */
export const maxSum = (size: number): number => (size * (19 - size)) / 2;

/** Digit-set masks of `size` distinct digits summing to `sum`. Never null. */
export function combosFor(size: number, sum: number): number[] {
  if (size < 1 || size > 9 || sum < 1 || sum > 45) return EMPTY;
  return TABLE[size][sum];
}

/**
 * Combinations for the on-board table, narrowed by digits the player has
 * pinned in or ruled out. Keeps the table's order, so the ones starting with a
 * 1 come first.
 */
export function findCombos(size: number, sum: number, include: number, exclude: number): number[] {
  return combosFor(size, sum).filter((m) => (m & include) === include && (m & exclude) === 0);
}

/**
 * A perfect matching between a run's cells and a combination's digits. This is
 * the difference between "these digits add up" and "these digits can actually
 * be written in": 8+9 makes 17, but not if both cells have ruled out the 9.
 *
 * Kuhn's algorithm. Runs are at most nine cells, so the simple version is
 * comfortably fast enough.
 */
export function hasMatching(cellMasks: number[], combo: number): boolean {
  const digits = digitsOf(combo);
  const n = digits.length;
  if (n !== cellMasks.length) return false;

  const owner = new Int8Array(n).fill(-1);
  const seen = new Uint8Array(n);

  const augment = (cell: number): boolean => {
    for (let d = 0; d < n; d++) {
      if (seen[d]) continue;
      if (!(cellMasks[cell] & bit(digits[d]))) continue;
      seen[d] = 1;
      if (owner[d] === -1 || augment(owner[d])) {
        owner[d] = cell;
        return true;
      }
    }
    return false;
  };

  for (let cell = 0; cell < n; cell++) {
    seen.fill(0);
    if (!augment(cell)) return false;
  }
  return true;
}

/**
 * The combinations that can actually be written into a run, given what each of
 * its empty cells could still take.
 *
 * `findCombos` answers an arithmetic question — which sets of digits add up —
 * and the board has usually ruled out most of them already. A combination
 * needing a 7 is no use if every empty cell in the run crosses a run that
 * already has one, and listing it only buries the two or three that are real.
 * This is the same matching test the solver uses, so what the player is shown
 * is exactly what the game itself believes is still possible.
 */
export function dealableCombos(sum: number, cellMasks: number[], exclude: number): number[] {
  return combosFor(cellMasks.length, sum).filter(
    (combo) => (combo & exclude) === 0 && hasMatching(cellMasks, combo),
  );
}
