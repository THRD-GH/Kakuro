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
 * Ask whether the player is running the latest app, now rather than whenever.
 *
 * The question has to be about the page, not about the worker. Asking the
 * worker — "is there anything newer than what you have installed?" — says no
 * the moment it has installed the new version itself, which it does quietly
 * every time the app comes to the foreground. The page meanwhile is still
 * running the code it started with, and will be until something reloads it.
 * So the check reported "the latest version" to a player sitting on a build
 * two behind, which is the one answer it must never give.
 *
 * What it compares instead is what the page was built from against what the
 * site is handing out now. The worker is still asked to update first, so that
 * the restart has the new files in the cache rather than fetching them all
 * over the network on the way back up.
 *
 * `none` is a page with no worker registered: a dev server, or a tab that has
 * never been installed. There is nothing to check there and nothing stale,
 * since a plain reload already fetches the latest.
 */
export async function checkForUpdate(): Promise<UpdateCheck> {
  if (!('serviceWorker' in navigator)) return 'none';
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return 'none';

  const worker = await updateFrom(registration);
  if (worker === 'offline') return 'offline';

  const served = await servedBuild();
  // No answer from the site, but the worker found something: it is still news.
  if (served === null) return worker === 'updating' ? 'updating' : 'offline';
  return served === runningBuild() ? 'current' : 'updating';
}

/**
 * Which hashed files a copy of the app is built from, as one comparable
 * string. Vite names every asset after a hash of its contents, so two pages
 * naming the same files are the same build and two naming different ones are
 * not — no version number to keep in step, and nothing to get wrong when a
 * change touches only the stylesheet.
 */
export function assetNames(html: string): string {
  return [...html.matchAll(/assets\/([A-Za-z0-9._-]+)/g)]
    .map((match) => match[1])
    .sort()
    .join(' ');
}

/** What the page in front of the player was built from. */
function runningBuild(): string {
  return assetNames(document.head.innerHTML);
}

/** What the site is handing out now, or null if it cannot be reached. */
async function servedBuild(): Promise<string | null> {
  /*
   * Past both caches, deliberately. `no-store` sees off the browser's, and
   * the query sees off the worker's: its fetch handler matches on the whole
   * URL, so a page asked for under a name it has never cached falls through
   * to the network, which is the only place this answer can come from.
   */
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}index.html?fresh=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!response.ok) return null;
    return assetNames(await response.text());
  } catch {
    return null;
  }
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
export async function whenUpdateLands(then: () => void, waitMs = 12000): Promise<void> {
  restartPending = true;
  if (!('serviceWorker' in navigator)) {
    then();
    return;
  }
  /*
   * Nothing on its way means there is nothing to wait for: the worker had
   * already installed the new version and taken the page over, and only the
   * page itself is behind. Waiting for a takeover that has been and gone
   * would hold the restart for the whole timeout.
   */
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration || (registration.installing === null && registration.waiting === null)) {
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
