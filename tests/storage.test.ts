// Saves written by an older build, and whether they can still be thrown away.
import assert from 'node:assert/strict';
import test from 'node:test';

import { GENERATOR_VERSION, generatePuzzle } from '../src/core/generator.ts';
import {
  DEFAULT_SETTINGS,
  dropSave,
  exportBackup,
  importBackup,
  loadHistory,
  loadSettings,
  putSave,
  saveHistory,
  saveSettings,
  unfinishedSaves,
} from '../src/game/storage.ts';

// A minimal localStorage, since node has none.
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
};

const KEY = 'kk:v1:save';
const puzzle = generatePuzzle({ size: 9, level: 1, number: 1 });

const saveBody = (extra: Record<string, unknown>) => ({
  puzzle,
  values: new Array(81).fill(0),
  marks: new Array(81).fill(0),
  elapsedMs: 1000,
  hints: 0,
  checks: 0,
  savedAt: 1,
  ...extra,
});

test('a save from the first id format can still be thrown away', () => {
  /*
   * What the picker was showing as `undefined×undefined`: filed under the
   * original `level-Nnumber` key, with an id that has no size on it. The
   * current code works out `undefined-1-49` for that save and deletes
   * nothing, so the game came back the moment the list redrew.
   */
  store.clear();
  store.set(
    KEY,
    JSON.stringify({
      '1-N49': saveBody({ id: { level: 1, number: 49, source: 'new' } }),
    }),
  );

  const [listed] = unfinishedSaves();
  assert.ok(listed, 'the old save should still be listed');
  assert.equal(listed.id.size, 9, 'the size is recovered from the puzzle');

  dropSave(listed.id);
  assert.equal(unfinishedSaves().length, 0, 'and it actually goes');
});

test('a save from the second id format is re-filed too', () => {
  store.clear();
  store.set(
    KEY,
    JSON.stringify({
      '9-1-N7': saveBody({ id: { size: 9, level: 1, number: 7, source: 'new' } }),
    }),
  );

  const [listed] = unfinishedSaves();
  dropSave(listed.id);
  assert.equal(unfinishedSaves().length, 0);
});

test('when two old keys land on one, the one played last survives', () => {
  store.clear();
  store.set(
    KEY,
    JSON.stringify({
      '1-49': saveBody({ id: { level: 1, number: 49, source: 'classic' }, savedAt: 10, elapsedMs: 111 }),
      '1-N49': saveBody({ id: { level: 1, number: 49, source: 'new' }, savedAt: 20, elapsedMs: 222 }),
    }),
  );

  const saves = unfinishedSaves();
  assert.equal(saves.length, 1);
  assert.equal(saves[0].elapsedMs, 222);
});

test('a save with no size anywhere is dropped rather than listed forever', () => {
  store.clear();
  store.set(
    KEY,
    JSON.stringify({ '1-N3': { id: { level: 1, number: 3 }, values: [], marks: [] } }),
  );
  assert.equal(unfinishedSaves().length, 0);
});

test('current saves are untouched, and deleting one leaves the rest', () => {
  store.clear();
  for (const number of [1, 2, 3]) {
    putSave({
      id: { size: 9, level: 1, number },
      puzzle,
      values: new Array(81).fill(0),
      marks: new Array(81).fill(0),
      elapsedMs: 0,
      hints: 0,
      checks: 0,
    });
  }
  assert.equal(unfinishedSaves().length, 3);
  dropSave({ size: 9, level: 1, number: 2 });
  const left = unfinishedSaves().map((s) => s.id.number).sort();
  assert.deepEqual(left, [1, 3]);
});

// ------------------------------------------------------------------ backups

const seed = (): void => {
  store.clear();
  saveSettings({ ...DEFAULT_SETTINGS, theme: 'night', poolSize: 2500 });
  saveHistory({ '9-1-1': { finished: true, bestMs: 61000 }, '9-1-2': { finished: false, startedAt: 5 } });
  putSave({ id: { size: 9, level: 1, number: 3 }, ...saveBody({}) } as Parameters<typeof putSave>[0]);
};

test('a backup restores history, settings and unfinished games', () => {
  seed();
  const backup = JSON.parse(JSON.stringify(exportBackup()));
  assert.equal(backup.app, 'kakuro');
  assert.equal(backup.generator, GENERATOR_VERSION);

  store.clear();
  const restored = importBackup(backup);
  assert.deepEqual(restored, { history: 2, saves: 1, settingsOnly: false });
  assert.equal(loadSettings().theme, 'night');
  assert.equal(loadSettings().poolSize, 2500);
  assert.equal(loadHistory()['9-1-1']?.bestMs, 61000);
  assert.deepEqual(
    unfinishedSaves().map((save) => save.id.number),
    [3],
  );
});

test('a file that is not a backup is refused and nothing is written', () => {
  seed();
  const before = new Map(store);
  assert.throws(() => importBackup({ app: 'killer-sudoku', version: 1, history: {} }), /not a Kakuro backup/);
  assert.throws(() => importBackup('hello'), /not a Kakuro backup/);
  const damaged = JSON.parse(JSON.stringify(exportBackup()));
  damaged.saves[0].values = [1, 2, 3];
  assert.throws(() => importBackup(damaged), /damaged saved game/);
  assert.deepEqual(new Map(store), before);
});

test('a backup from another generator brings back settings only', () => {
  seed();
  const old = { ...JSON.parse(JSON.stringify(exportBackup())), generator: GENERATOR_VERSION - 1 };
  store.clear();
  const restored = importBackup(old);
  assert.equal(restored.settingsOnly, true);
  assert.equal(loadSettings().theme, 'night');
  assert.deepEqual(loadHistory(), {});
  assert.deepEqual(unfinishedSaves(), []);
});

test('a pool size that is not on offer falls back to the default', () => {
  store.clear();
  saveSettings({ ...DEFAULT_SETTINGS, poolSize: 1000000 });
  assert.equal(loadSettings().poolSize, 500);
  saveSettings({ ...DEFAULT_SETTINGS, poolSize: 5000 });
  assert.equal(loadSettings().poolSize, 5000);
});
