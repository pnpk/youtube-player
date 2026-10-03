import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HISTORY_KEY, STORAGE_KEY, loadHistory, loadState, saveHistory } from '../storage.js';

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

// --- 旧形式(最後の状態 1 件)の読み込み。履歴への引き継ぎに使う ---

test('旧形式の状態をそのまま読み込める', () => {
  const state = { videoId: ID, a: 12.3, b: 18.7, rate: 0.85 };
  assert.deepEqual(loadState(withRaw(state)), state);
});

test('何も保存されていなければ null', () => {
  assert.equal(loadState(memoryStorage()), null);
});

test('storage が使えない(null / 例外)ときは null', () => {
  assert.equal(loadState(null), null);
  assert.equal(loadState(throwingStorage), null);
});

test('壊れた JSON は null', () => {
  assert.equal(loadState(withRaw('{not json')), null);
  assert.equal(loadState(withRaw('null')), null);
  assert.equal(loadState(withRaw('"text"')), null);
});

test('動画 ID が不正なら null', () => {
  assert.equal(loadState(withRaw({ videoId: 'short', a: 1, b: 2, rate: 1 })), null);
  assert.equal(loadState(withRaw({ videoId: 123, a: 1, b: 2, rate: 1 })), null);
});

test('範囲外の速度は初期値に戻し、以前の助走の値は捨てる', () => {
  assert.deepEqual(loadState(withRaw({ videoId: ID, a: null, b: null, rate: 3, preroll: 7 })), {
    videoId: ID,
    a: null,
    b: null,
    rate: 1,
  });
});

test('不正な A は A と B の両方を消す', () => {
  for (const a of [-1, '5', Number.NaN, null]) {
    const loaded = loadState(withRaw({ videoId: ID, a, b: 8, rate: 1 }));
    assert.equal(loaded.a, null, String(a));
    assert.equal(loaded.b, null, String(a));
  }
});

test('A との間隔が 0.1 秒未満の B や、数値でない B は消す', () => {
  for (const b of [4, 5.05, '8', null]) {
    const loaded = loadState(withRaw({ videoId: ID, a: 5, b, rate: 1 }));
    assert.equal(loaded.a, 5, String(b));
    assert.equal(loaded.b, null, String(b));
  }
});

// --- 履歴 ---

const historyEntry = { videoId: ID, title: '曲', a: 1, b: 2, rate: 0.9, openedAt: 1000 };

test('履歴を保存して、そのまま読み込める', () => {
  const storage = memoryStorage();
  saveHistory(storage, [historyEntry]);
  assert.deepEqual(loadHistory(storage, 5000), [historyEntry]);
});

test('履歴がなければ空の配列', () => {
  assert.deepEqual(loadHistory(memoryStorage(), 5000), []);
});

test('storage が使えないときは空の配列を返し、保存しても例外を出さない', () => {
  assert.deepEqual(loadHistory(null, 5000), []);
  assert.deepEqual(loadHistory(throwingStorage, 5000), []);
  assert.doesNotThrow(() => saveHistory(null, [historyEntry]));
  assert.doesNotThrow(() => saveHistory(throwingStorage, [historyEntry]));
});

test('壊れた履歴は空の配列', () => {
  assert.deepEqual(loadHistory(memoryStorage({ [HISTORY_KEY]: '{not json' }), 5000), []);
});

test('履歴がなく旧形式の状態があれば、それを履歴の 1 件目として引き継ぐ', () => {
  const storage = withRaw({ videoId: ID, a: 3, b: 4, rate: 0.75 });
  assert.deepEqual(loadHistory(storage, 5000), [
    { videoId: ID, a: 3, b: 4, rate: 0.75, title: '', openedAt: 5000 },
  ]);
});

test('履歴があれば旧形式の状態は使わない', () => {
  const storage = memoryStorage({
    [HISTORY_KEY]: JSON.stringify([]),
    [STORAGE_KEY]: JSON.stringify({ videoId: ID, a: 3, b: 4, rate: 0.75 }),
  });
  assert.deepEqual(loadHistory(storage, 5000), []);
});
