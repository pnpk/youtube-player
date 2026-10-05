import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findOrphans, pickEvictions } from '../media-store.js';

const file = (id, size, lastOpenedAt) => ({ id, size, lastOpenedAt });

test('pickEvictions: 上限以内なら何も消さない', () => {
  assert.deepEqual(pickEvictions([file('a', 40, 1), file('b', 60, 2)], 100, 'b'), []);
});

test('pickEvictions: 上限を超えたら、最後に開いた日時が古いものから上限以内になるまで消す', () => {
  const files = [file('new', 50, 30), file('old', 50, 10), file('mid', 50, 20)];
  assert.deepEqual(pickEvictions(files, 100, 'new'), ['old']);
  assert.deepEqual(pickEvictions(files, 60, 'new'), ['old', 'mid']);
});

test('pickEvictions: 今開いたファイルは古くても消さない', () => {
  const files = [file('keep', 80, 1), file('other', 80, 2)];
  assert.deepEqual(pickEvictions(files, 100, 'keep'), ['other']);
});

test('findOrphans: 履歴にない保存データだけを返す', () => {
  assert.deepEqual(findOrphans(['f:1', 'f:2', 'f:3'], ['f:2', 'abcdefghijk']), ['f:1', 'f:3']);
  assert.deepEqual(findOrphans([], ['f:1']), []);
});
