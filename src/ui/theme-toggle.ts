import { nextTheme } from '../game/storage.ts';
import type { Settings, Theme } from '../game/storage.ts';
import type { AppContext } from './app-context.ts';
import { clear, el } from './dom.ts';
import { moonIcon, sunIcon } from './icons.ts';

/**
 * A moon on the bar: one tap between day and dark, on whichever screen you
 * are on.
 *
 * The theme is the setting most likely to be wanted in the middle of a game,
 * since the room goes dark around a puzzle that is already open, and it was
 * three taps down a panel that covers the board while you choose. Both bars
 * carry the same button, built here once: the menu's title bar beside Stats,
 * Help and Settings, and the play bar beside the clock.
 *
 * Three themes still share one button. It swaps day against whichever *dark*
 * theme is in use, so a player who chose High contrast is given day and then
 * High contrast back, rather than being moved to Night by a tap that said
 * nothing about it. That rule is `nextTheme`, in storage beside the setting it
 * reads.
 *
 * The icon is the theme you will get, not the one you are in: a moon in
 * daylight, a sun in the dark. Drawn, as every other icon here is, because as
 * characters the two arrive as coloured emoji on some phones and as a box on
 * others.
 */

const LABEL: Record<Theme, string> = {
  day: 'Switch to day',
  night: 'Switch to night',
  contrast: 'Switch to high contrast',
};

function paint(button: HTMLElement, settings: Settings): void {
  const next = nextTheme(settings);
  clear(button);
  button.append(next === 'day' ? sunIcon() : moonIcon());
  button.setAttribute('aria-label', LABEL[next]);
  button.setAttribute('title', LABEL[next]);
}

export function themeToggle(app: AppContext): HTMLElement {
  const button = el('button', { class: 'icon-button theme-toggle', type: 'button' });
  paint(button, app.settings);
  button.addEventListener('click', () => app.setTheme(nextTheme(app.settings)));
  return button;
}

/**
 * Repaint every toggle in the document, after the theme has changed anywhere.
 * The Theme row in Settings sits over a bar that still has one of these on it,
 * and a moon over a dark page would be a button lying about what it does.
 */
export function paintThemeToggles(settings: Settings): void {
  for (const button of document.querySelectorAll<HTMLElement>('.theme-toggle')) paint(button, settings);
}
