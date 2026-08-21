/**
 * Tap, long-press and double-tap, done properly.
 *
 * The naive version — `click` for a tap, `dblclick` for a force, a timer for a
 * hold — misbehaves on a phone in three ways that all look like the game
 * ignoring you:
 *
 * 1. A tap that drifts a pixel can be reinterpreted as a scroll. The pointer is
 *    cancelled, no `pointerup` ever arrives, and the tap simply never happens.
 *    On the grid that means the next digit lands in the previously selected
 *    cell, which reads as the game putting a number in the wrong place.
 * 2. `dblclick` fires on the second, fourth, sixth click of a run, so one stray
 *    tap elsewhere puts the count out of phase and the next deliberate
 *    double-tap arrives as two singles.
 * 3. Waiting to see whether a second tap follows makes every entry feel laggy.
 *
 * So: the grid fires on *pointerdown* — it only moves the cursor, nothing is
 * committed, and there is nothing to want back — while buttons fire on release,
 * where sliding off is how you take an action back. A tap is delivered
 * immediately either way, and a double-tap arrives *after* one, so a caller
 * that acts on both is expected to undo the tap first.
 */

export interface TapOptions {
  onTap?: () => void;
  /** Long-press, and double-tap, which are the same intent by different means. */
  onHold?: () => void;
  /** Fire the tap as the finger lands rather than when it lifts. */
  tapOnDown?: boolean;
  /**
   * Deliver the tap even if the finger slid a little between down and up.
   * Right for a grid, wrong for a button.
   */
  forgiveDrift?: boolean;
  holdMs?: number;
}

const HOLD_MS = 450;
/** Two taps closer together than this are one double-tap. */
const DOUBLE_MS = 400;
/** How far a finger may slide and still count as a tap, in CSS pixels. */
const DRIFT_PX = 10;

export function bindTap(node: HTMLElement, options: TapOptions): void {
  const holdMs = options.holdMs ?? HOLD_MS;
  let timer: number | undefined;
  let held = false;
  let start: { x: number; y: number } | null = null;
  let lastTapAt = 0;

  const stopTimer = (): void => {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = undefined;
    node.classList.remove('holding');
  };

  const fireHold = (): void => {
    held = true;
    stopTimer();
    options.onHold?.();
  };

  const fireTap = (): void => {
    const now = performance.now();
    // A second tap inside the window is the same gesture as a long press. The
    // caller has already had the first tap and is expected to undo it.
    if (options.onHold && now - lastTapAt < DOUBLE_MS) {
      lastTapAt = 0;
      options.onHold();
      return;
    }
    lastTapAt = now;
    options.onTap?.();
  };

  node.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    held = false;
    start = { x: e.clientX, y: e.clientY };
    if (options.onHold) {
      node.classList.add('holding');
      timer = window.setTimeout(fireHold, holdMs);
    }
    if (options.tapOnDown) {
      stopTimer();
      // The hold timer still has to run, so re-arm it after the tap lands.
      if (options.onHold) {
        node.classList.add('holding');
        timer = window.setTimeout(fireHold, holdMs);
      }
      fireTap();
    }
  });

  node.addEventListener('pointermove', (e) => {
    if (!start) return;
    const drifted = Math.abs(e.clientX - start.x) > DRIFT_PX || Math.abs(e.clientY - start.y) > DRIFT_PX;
    if (drifted) {
      stopTimer();
      if (!options.forgiveDrift) start = null;
    }
  });

  node.addEventListener('pointerup', () => {
    stopTimer();
    const pressed = start !== null;
    start = null;
    if (held || options.tapOnDown || !pressed) return;
    fireTap();
  });

  const abandon = (): void => {
    stopTimer();
    start = null;
  };
  node.addEventListener('pointercancel', abandon);
  node.addEventListener('pointerleave', abandon);

  // The browser's own double-click would arrive on top of ours.
  node.addEventListener('dblclick', (e) => e.preventDefault());
  node.addEventListener('contextmenu', (e) => e.preventDefault());
}
