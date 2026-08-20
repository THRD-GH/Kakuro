/**
 * Digit sets are 9-bit masks throughout: bit 0 is a 1, bit 8 is a 9. Every
 * candidate list, every combination and every run's alphabet is one of these,
 * which is what makes the solver's inner loop a handful of AND and OR.
 */
export const ALL = 0x1ff;

export const bit = (digit: number): number => 1 << (digit - 1);

export const has = (mask: number, digit: number): boolean => (mask & bit(digit)) !== 0;

export function popcount(mask: number): number {
  let m = mask - ((mask >> 1) & 0x55555555);
  m = (m & 0x33333333) + ((m >> 2) & 0x33333333);
  m = (m + (m >> 4)) & 0x0f0f0f0f;
  return (m * 0x01010101) >> 24;
}

/** The digits in a mask, ascending. */
export function digitsOf(mask: number): number[] {
  const out: number[] = [];
  for (let d = 1; d <= 9; d++) if (mask & bit(d)) out.push(d);
  return out;
}

/** The single digit in a one-bit mask, or 0. */
export function onlyDigit(mask: number): number {
  return popcount(mask) === 1 ? 32 - Math.clz32(mask) : 0;
}

export function sumOfMask(mask: number): number {
  let total = 0;
  for (let d = 1; d <= 9; d++) if (mask & bit(d)) total += d;
  return total;
}

/** "1, 4 and 7" — masks are shown to the player often enough to be worth it. */
export function listDigits(mask: number): string {
  const digits = digitsOf(mask);
  if (digits.length === 0) return 'nothing';
  if (digits.length === 1) return String(digits[0]);
  return `${digits.slice(0, -1).join(', ')} and ${digits[digits.length - 1]}`;
}
