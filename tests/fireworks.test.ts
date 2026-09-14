/*
 * The fireworks' layout, without a browser: where the rockets go.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { MIN_CLIMB, plan, stage } from '../src/ui/fireworks.ts';

const PALETTE = ['#ff7a5c', '#ffc857', '#6ec6ff'];

/** Just enough of an element for the show to measure the panel it stands on. */
const panel = (left: number, top: number, width: number, height: number): Element =>
  ({
    getBoundingClientRect: () => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top }),
  }) as unknown as Element;

const SCREENS = [
  { name: 'a phone, panel as a bottom sheet', width: 375, height: 667, above: panel(16, 447, 343, 204) },
  { name: 'a desktop, panel centred', width: 1280, height: 800, above: panel(384, 308, 512, 184) },
  { name: 'a desktop, no panel', width: 1280, height: 800, above: null },
];

test('every rocket climbs at least 30 degrees from the horizontal, and bursts on screen', () => {
  for (const screen of SCREENS) {
    const scene = stage(screen.width, screen.height, { above: screen.above });
    for (let show = 0; show < 300; show++) {
      for (const rocket of plan(scene, PALETTE)) {
        const up = rocket.fromY - rocket.toY;
        const across = Math.abs(rocket.toX - rocket.fromX);
        assert.ok(up > 0, `${screen.name}: a rocket went down`);
        const angle = Math.atan2(up, across);
        assert.ok(
          angle >= MIN_CLIMB - 1e-9,
          `${screen.name}: a rocket climbed at ${((angle * 180) / Math.PI).toFixed(1)} degrees`,
        );
        assert.ok(rocket.toX >= 0 && rocket.toX <= screen.width, `${screen.name}: a burst left the screen`);
      }
    }
  }
});

test('the rockets lean a different way each show, both left and right', () => {
  const scene = stage(375, 667, { above: SCREENS[0]?.above ?? null });
  let left = 0;
  let right = 0;
  const firstLeans = new Set<number>();
  for (let show = 0; show < 50; show++) {
    const rockets = plan(scene, PALETTE);
    for (const rocket of rockets) {
      if (rocket.toX < rocket.fromX - 1) left++;
      if (rocket.toX > rocket.fromX + 1) right++;
    }
    const first = rockets[0];
    if (first) firstLeans.add(Math.round((first.toX - first.fromX) / 10));
  }
  assert.ok(left > 0 && right > 0, `leaned left ${left} times and right ${right}`);
  assert.ok(firstLeans.size > 5, `the first rocket took only ${firstLeans.size} directions in 50 shows`);
});
