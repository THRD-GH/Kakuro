/**
 * Service worker registration. Only in a built site: in dev there is no sw.js,
 * and a stale worker caching dev assets is a good way to lose an afternoon.
 */
/**
 * Set once the player has asked for the update and a restart is coming, so
 * the quiet notice does not talk over the loud one. The two arrive within a
 * frame of each other: the new worker takes over, which is both the thing
 * `onUpdateReady` announces and the thing the restart is waiting for.
 */
let restartPending = false;

export function registerServiceWorker(onUpdateReady?: () => void): void {
  if (!('serviceWorker' in navigator)) return;
  if (import.meta.env.DEV) return;

  window.addEventListener('load', () => {
    const base = import.meta.env.BASE_URL;
    const wasControlled = navigator.serviceWorker.controller !== null;
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing || !wasControlled || restartPending) return;
      refreshing = true;
      onUpdateReady?.();
    });

    void navigator.serviceWorker
      .register(`${base}sw.js`, { scope: base })
      .then((registration) => {
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden) void registration.update();
        });
      })
      .catch(() => {
        // An unregistrable worker costs offline play, nothing else.
      });
  });
}

/** Colour the browser and OS chrome to match the current theme. */
export function setThemeColour(colour: string): void {
  let tag = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!tag) {
    tag = document.createElement('meta');
    tag.name = 'theme-color';
    document.head.append(tag);
  }
  tag.content = colour;
}

// ----------------------------------------------------------------- updating

/** What asking for a new version came to. */
export type UpdateCheck = 'updating' | 'current' | 'offline' | 'none';

/**
 * Ask whether there is a newer app, now rather than whenever.
 *
 * The worker already looks each time the app comes back to the foreground,
 * but that is silent, and the page goes on running the code it started with
 * until something reloads it. On a phone, added to the home screen, there is
 * no address bar to reload from and nothing on screen that says what you are
 * running — so the player gets to ask, and to be told the answer.
 *
 * `none` is a page with no worker registered: a dev server, or a tab that has
 * never been installed. There is nothing to check there and nothing stale,
 * since a plain reload already fetches the latest.
 */
export async function checkForUpdate(): Promise<UpdateCheck> {
  if (!('serviceWorker' in navigator)) return 'none';
  return updateFrom(await navigator.serviceWorker.getRegistration());
}

/** The decision on its own, away from the browser, so it can be tested. */
export async function updateFrom(
  registration: ServiceWorkerRegistration | undefined,
): Promise<UpdateCheck> {
  if (!registration) return 'none';

  /*
   * Two ways of noticing, because either can be the one that sees it: the
   * event fires while update() is still running, and a worker that installs
   * quickly can have moved on to `installing` or `waiting` by the time the
   * promise settles. A worker byte-identical to the one in place raises
   * neither, which is what being current looks like.
   */
  let found = false;
  const noteFound = (): void => {
    found = true;
  };
  registration.addEventListener('updatefound', noteFound);
  try {
    await registration.update();
  } catch {
    // update() rejects when the worker script cannot be fetched, and being
    // offline is much the commonest reason. Nothing is wrong with the app.
    return 'offline';
  } finally {
    registration.removeEventListener('updatefound', noteFound);
  }
  return found || registration.installing !== null || registration.waiting !== null
    ? 'updating'
    : 'current';
}

/**
 * Run `then` once the new worker is driving the page, or when waiting has
 * gone on long enough.
 *
 * The caller reloads, and reloading too early is the one thing that wastes
 * the update: the old worker would serve the old cache and the new version
 * would wait for another launch. Taking over is the signal that the new cache
 * is in place. If it never comes — an install that fails, a worker that never
 * claims — reloading anyway costs a second and loses nothing.
 */
export function whenUpdateLands(then: () => void, waitMs = 12000): void {
  restartPending = true;
  if (!('serviceWorker' in navigator)) {
    then();
    return;
  }
  let done = false;
  const go = (): void => {
    if (done) return;
    done = true;
    then();
  };
  navigator.serviceWorker.addEventListener('controllerchange', go, { once: true });
  window.setTimeout(go, waitMs);
}
