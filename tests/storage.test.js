import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEY, loadState, saveState } from '../storage.js';

const ID = 'dQw4w9WgXcQ';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value);
    },
  };
}

const throwingStorage = {
  getItem() {
    throw new Error('denied');
  },
  setItem() {
    throw new Error('denied');
  },
};

const withRaw = (value) => memoryStorage({ [STORAGE_KEY]: typeof value === 'string' ? value : JSON.stringify(value) });

test('保存した状態をそのまま復元できる', () => {
  const storage = memoryStorage();
  const state = { videoId: ID, a: 12.3, b: 18.7, rate: 0.85, preroll: 2 };
  saveState(storage, state);
  assert.deepEqual(loadState(storage), state);
});

test('何も保存されていなければ null', () => {
  assert.equal(loadState(memoryStorage()), null);
});

test('storage が使えない(null / 例外)ときは null を返し、保存しても例外を出さない', () => {
  assert.equal(loadState(null), null);
  assert.equal(loadState(throwingStorage), null);
  assert.doesNotThrow(() => saveState(null, { videoId: ID, a: null, b: null, rate: 1, preroll: 1 }));
  assert.doesNotThrow(() => saveState(throwingStorage, { videoId: ID, a: null, b: null, rate: 1, preroll: 1 }));
});

test('壊れた JSON は null', () => {
  assert.equal(loadState(withRaw('{not json')), null);
  assert.equal(loadState(withRaw('null')), null);
  assert.equal(loadState(withRaw('"text"')), null);
});

test('動画 ID が不正なら null', () => {
  assert.equal(loadState(withRaw({ videoId: 'short', a: 1, b: 2, rate: 1, preroll: 1 })), null);
  assert.equal(loadState(withRaw({ videoId: 123, a: 1, b: 2, rate: 1, preroll: 1 })), null);
});

test('範囲外の速度と助走は初期値に戻す', () => {
  assert.deepEqual(loadState(withRaw({ videoId: ID, a: null, b: null, rate: 3, preroll: 7 })), {
    videoId: ID,
    a: null,
    b: null,
    rate: 1,
    preroll: 1,
  });
});

test('不正な A は A と B の両方を消す', () => {
  for (const a of [-1, '5', Number.NaN, null]) {
    const loaded = loadState(withRaw({ videoId: ID, a, b: 8, rate: 1, preroll: 1 }));
    assert.equal(loaded.a, null, String(a));
    assert.equal(loaded.b, null, String(a));
  }
});

test('A との間隔が 0.1 秒未満の B や、数値でない B は消す', () => {
  for (const b of [4, 5.05, '8', null]) {
    const loaded = loadState(withRaw({ videoId: ID, a: 5, b, rate: 1, preroll: 1 }));
    assert.equal(loaded.a, 5, String(b));
    assert.equal(loaded.b, null, String(b));
  }
});
