import { clear, el } from './dom.ts';

/**
 * Panels and toasts. Everything that covers the board goes through here, so
 * there is one place that knows what is on top — which is what the back
 * gesture spends, and what Escape closes.
 */

const stack: HTMLElement[] = [];
const openHandlers: (() => void)[] = [];
const closeHandlers: (() => void)[] = [];

export const overlaysOpen = (): number => stack.length;

export function onOverlayOpen(fn: () => void): void {
  openHandlers.push(fn);
}

export function onOverlayClose(fn: () => void): void {
  closeHandlers.push(fn);
}

export interface PanelOptions {
  title: string;
  /** Shown under the title, in the quieter voice. */
  note?: string;
  /** Buttons along the bottom. The last one is the emphasised one. */
  actions?: { label: string; onClick?: () => void; keep?: boolean; primary?: boolean }[];
  /** A panel that only reports something can be dismissed by tapping outside. */
  dismissable?: boolean;
}

export function openOverlay(body: HTMLElement, options: PanelOptions): HTMLElement {
  const panel = el('div', { class: 'panel', role: 'dialog', 'aria-modal': 'true' });
  const shade = el('div', { class: 'shade' }, panel);

  panel.append(
    el(
      'header',
      { class: 'panel-head' },
      el('h2', { text: options.title }),
      options.note ? el('p', { text: options.note }) : null,
    ),
    el('div', { class: 'panel-body' }, body),
  );

  const close = (): void => {
    const at = stack.indexOf(shade);
    if (at >= 0) stack.splice(at, 1);
    shade.remove();
    for (const fn of closeHandlers) fn();
  };

  const actions = options.actions ?? [{ label: 'Close' }];
  panel.append(
    el(
      'div',
      { class: 'panel-foot' },
      ...actions.map((action) => {
        const button = el('button', {
          class: action.primary ? 'primary' : '',
          type: 'button',
          text: action.label,
        });
        button.addEventListener('click', () => {
          action.onClick?.();
          if (!action.keep) close();
        });
        return button;
      }),
    ),
  );

  if (options.dismissable !== false) {
    shade.addEventListener('click', (e) => {
      if (e.target === shade) close();
    });
  }

  document.body.append(shade);
  stack.push(shade);
  for (const fn of openHandlers) fn();
  panel.querySelector<HTMLElement>('button, [tabindex]')?.focus();
  return shade;
}

/** Close whatever is on top. Returns false when nothing was open. */
export function closeTopOverlay(): boolean {
  const top = stack.pop();
  if (!top) return false;
  top.remove();
  for (const fn of closeHandlers) fn();
  return true;
}

let toastNode: HTMLElement | null = null;
let toastTimer: number | null = null;

/** A line of text that says what just happened, and then goes away. */
export function toast(message: string, ms = 3200): void {
  if (!toastNode) {
    toastNode = el('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastNode);
  }
  clear(toastNode);
  toastNode.append(el('span', { text: message }));
  toastNode.classList.add('showing');
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastNode?.classList.remove('showing'), ms);
}

/** A yes/no that reads as a sentence rather than a dialog. */
export function confirmPanel(
  title: string,
  note: string,
  confirmLabel: string,
  onConfirm: () => void,
): void {
  openOverlay(el('div'), {
    title,
    note,
    actions: [
      { label: 'Cancel' },
      { label: confirmLabel, onClick: onConfirm, primary: true },
    ],
  });
}
