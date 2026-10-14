import assert from 'node:assert/strict';
import test from 'node:test';

import { assetNames, updateFrom } from '../src/game/pwa.ts';

/**
 * A stand-in for the browser's registration: `update()` is what reaches the
 * network, and whether a new worker was found shows up either as the event or
 * as a worker sitting in `installing` or `waiting` afterwards.
 */
function registrationThat(options: {
  update?: () => Promise<void>;
  raises?: boolean;
  installing?: boolean;
  waiting?: boolean;
}): ServiceWorkerRegistration {
  const listeners = new Set<() => void>();
  const fake = {
    installing: options.installing === true ? {} : null,
    waiting: options.waiting === true ? {} : null,
    addEventListener: (_type: string, run: () => void) => listeners.add(run),
    removeEventListener: (_type: string, run: () => void) => listeners.delete(run),
    update: async () => {
      if (options.raises === true) throw new TypeError('offline');
      // The event arrives while update() is still in flight, as it does in a
      // browser — before anything is in `installing`.
      if (options.update) await options.update();
      for (const run of listeners) run();
    },
  };
  return fake as unknown as ServiceWorkerRegistration;
}

test('no worker registered is nothing to update', async () => {
  assert.equal(await updateFrom(undefined), 'none');
});

test('a worker that raises nothing and installs nothing is the current one', async () => {
  const quiet = registrationThat({ update: async () => {} });
  // Nothing listening is told, and nothing is left installing.
  const registration = { ...quiet, addEventListener: () => {}, removeEventListener: () => {} };
  assert.equal(
    await updateFrom(registration as unknown as ServiceWorkerRegistration),
    'current',
  );
});

test('the updatefound event is enough to call it an update', async () => {
  assert.equal(await updateFrom(registrationThat({})), 'updating');
});

test('a worker already installing is enough on its own', async () => {
  const silent = {
    installing: {},
    waiting: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    update: async () => {},
  };
  assert.equal(await updateFrom(silent as unknown as ServiceWorkerRegistration), 'updating');
});

test('a worker waiting to take over counts too', async () => {
  const silent = {
    installing: null,
    waiting: {},
    addEventListener: () => {},
    removeEventListener: () => {},
    update: async () => {},
  };
  assert.equal(await updateFrom(silent as unknown as ServiceWorkerRegistration), 'updating');
});

test('a check that cannot reach the server says so rather than claiming to be current', async () => {
  assert.equal(await updateFrom(registrationThat({ raises: true })), 'offline');
});

// ------------------------------------------------- which build a page is

test('a page is named by the hashed files it is built from', () => {
  const head =
    '<link rel="stylesheet" href="./assets/index-ABC123.css">' +
    '<script type="module" src="./assets/index-XYZ789.js"></script>';
  assert.equal(assetNames(head), 'index-ABC123.css index-XYZ789.js');
});

test('the order the tags come in does not make it a different build', () => {
  const one = '<script src="/assets/a-1.js"></script><link href="/assets/b-2.css">';
  const other = '<link href="/assets/b-2.css"><script src="/assets/a-1.js"></script>';
  assert.equal(assetNames(one), assetNames(other));
});

test('absolute and relative references name the same build', () => {
  const served = '<script src="./assets/index-XYZ789.js"></script>';
  const running = '<script src="http://localhost:4175/assets/index-XYZ789.js"></script>';
  assert.equal(assetNames(served), assetNames(running));
});

test('a change to the stylesheet alone is still a different build', () => {
  const before = '<link href="/assets/index-AAA.css"><script src="/assets/index-ZZZ.js"></script>';
  const after = '<link href="/assets/index-BBB.css"><script src="/assets/index-ZZZ.js"></script>';
  assert.notEqual(assetNames(before), assetNames(after));
});

test('a page with no hashed assets names nothing rather than throwing', () => {
  assert.equal(assetNames('<script type="module" src="/src/main.ts"></script>'), '');
});
