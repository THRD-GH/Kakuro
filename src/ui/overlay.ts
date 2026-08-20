import { clear, el } from './dom.ts';

/**
 * Panels and toasts. Everything that covers the board goes through here, so
 * there is one place that knows what is on top — which is what the back
 * gesture spends, and what Escape closes.
 */

interface Overlay {
  shade: HTMLElement;
  close: (reason: 'action' | 'dismiss') => void;
  dismissable: boolean;
}

const stack: Overlay[] = [];
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
  /** Fired when the panel is dismissed, not when an action button closes it. */
  onDismiss?: () => void;
}

let dialogSerial = 0;

function focusableIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
    (node) => !node.hasAttribute('disabled') && node.tabIndex !== -1,
  );
}

export function openOverlay(body: HTMLElement, options: PanelOptions): HTMLElement {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const titleId = `kk-dialog-title-${++dialogSerial}`;
  const noteId = options.note ? `kk-dialog-note-${dialogSerial}` : undefined;

  const panel = el('div', {
    class: 'panel',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': titleId,
    ...(noteId ? { 'aria-describedby': noteId } : {}),
  });
  const shade = el('div', { class: 'shade' }, panel);

  panel.append(
    el(
      'header',
      { class: 'panel-head' },
      el('h2', { id: titleId, text: options.title }),
      options.note ? el('p', { id: noteId, text: options.note }) : null,
    ),
    el('div', { class: 'panel-body' }, body),
  );

  const overlay: Overlay = {
    shade,
    dismissable: options.dismissable !== false,
    close: () => undefined,
  };
  const close = (reason: 'action' | 'dismiss' = 'action'): void => {
    const at = stack.indexOf(overlay);
    if (at < 0) return;
    stack.splice(at, 1);
    shade.remove();
    for (const fn of closeHandlers) fn();
    if (reason === 'dismiss') options.onDismiss?.();
    if (previous && document.body.contains(previous)) previous.focus({ preventScroll: true });
  };
  overlay.close = close;

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
          if (!action.keep) close('action');
        });
        return button;
      }),
    ),
  );

  if (options.dismissable !== false) {
    shade.addEventListener('click', (e) => {
      if (e.target === shade) close('dismiss');
    });
  }

  shade.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const focusable = focusableIn(panel);
    if (focusable.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      last.focus();
      e.preventDefault();
    } else if (!e.shiftKey && document.activeElement === last) {
      first.focus();
      e.preventDefault();
    }
  });

  document.body.append(shade);
  stack.push(overlay);
  for (const fn of openHandlers) fn();
  const first = focusableIn(panel)[0];
  if (first) first.focus();
  else {
    panel.tabIndex = -1;
    panel.focus();
  }
  return shade;
}

/** Close whatever is on top. Returns false when nothing was open or it cannot be dismissed. */
export function closeTopOverlay(): boolean {
  const top = stack[stack.length - 1];
  if (!top || !top.dismissable) return false;
  top.close('dismiss');
  return true;
}

/** Close every panel. Used when leaving the screen under them. */
export function closeAllOverlays(): void {
  while (stack.length > 0) stack[stack.length - 1].close('action');
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
