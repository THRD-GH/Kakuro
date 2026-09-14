import { el } from './dom.ts';
import { fireworks } from './fireworks.ts';
import { openOverlay } from './overlay.ts';

/**
 * The solve's fireworks on demand, without solving a puzzle — from Settings,
 * and from F on a keyboard.
 *
 * They go off over a panel of their own rather than over nothing, because the
 * show is laid out on the panel it stands on: this one stands in for the
 * Solved panel, so what plays is what a solve would get. It plays whether or
 * not the switch is on, since seeing it is how to decide. Again runs it once
 * more, and closing the panel stops it.
 */
export function previewFireworks(): void {
  // The show plays nothing on a device that asks for less motion, and a panel
  // with nothing happening over it would look broken, so it says why instead.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    openOverlay(
      el('p', {
        text: 'This device asks for reduced motion, so fireworks are not shown — not here, and not when a puzzle is solved.',
      }),
      { title: 'Fireworks' },
    );
    return;
  }

  let stop: () => void = () => {};
  const shade = openOverlay(el('p', { text: 'What solving a puzzle sets off.' }), {
    title: 'Fireworks',
    actions: [
      { label: 'Again', keep: true, onClick: () => play() },
      { label: 'Close', primary: true, onClick: () => stop() },
    ],
    onDismiss: () => stop(),
  });
  const panel = shade.querySelector('.panel');
  const play = (): void => {
    stop();
    stop = fireworks({ above: panel });
  };
  play();
}
