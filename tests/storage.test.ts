// Saves written by an older build, and whether they can still be thrown away.
import assert from 'node:assert/strict';
import test from 'node:test';

import { generatePuzzle } from '../src/core/generator.ts';
import { dropSave, putSave, unfinishedSaves } from '../src/game/storage.ts';

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
