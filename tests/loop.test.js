import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_RANGE,
  parseVideoId,
  setA,
  setB,
  nudgeA,
  nudgeB,
  shouldJump,
  stepRate,
  isValidRate,
  rewind,
  seekBy,
} from '../loop.js';

const ID = 'dQw4w9WgXcQ';

test('parseVideoId: 共有 URL などから動画 ID を取り出す', () => {
  const inputs = [
    ID,
    `  ${ID}  `,
    `https://www.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/watch?v=${ID}&t=42s&list=PL123`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}&si=abc`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=xyz&t=10`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube.com/live/${ID}?feature=share`,
    `youtube.com/watch?v=${ID}`,
  ];
  for (const input of inputs) assert.equal(parseVideoId(input), ID, input);
});

test('parseVideoId: 動画 ID を含まない入力は null', () => {
  const inputs = [
    '',
    '   ',
    'hello',
    `https://example.com/watch?v=${ID}`,
    'https://www.youtube.com/',
    'https://www.youtube.com/watch?v=short',
    null,
    undefined,
  ];
  for (const input of inputs) assert.equal(parseVideoId(input), null, String(input));
});

test('setA: 空の区間に A を記録する(0.01 秒単位に丸める)', () => {
  assert.deepEqual(setA(EMPTY_RANGE, 12.344), { a: 12.34, b: null });
});

test('setA: 負の時刻は 0 にする', () => {
  assert.deepEqual(setA(EMPTY_RANGE, -1), { a: 0, b: null });
});

test('setA: B との間隔が 0.1 秒以上なら B を残す', () => {
  assert.deepEqual(setA({ a: 1, b: 10 }, 5), { a: 5, b: 10 });
  assert.deepEqual(setA({ a: 1, b: 10 }, 9.9), { a: 9.9, b: 10 });
});

test('setA: B が A 以前になる、または間隔が 0.1 秒未満なら B を消す', () => {
  assert.deepEqual(setA({ a: 1, b: 10 }, 12), { a: 12, b: null });
  assert.deepEqual(setA({ a: 1, b: 10 }, 9.95), { a: 9.95, b: null });
});

test('setB: A が未設定なら null', () => {
  assert.equal(setB(EMPTY_RANGE, 8), null);
});

test('setB: A との間隔が 0.1 秒未満なら null', () => {
  assert.equal(setB({ a: 5, b: null }, 4), null);
  assert.equal(setB({ a: 5, b: null }, 5.05), null);
});

test('setB: A より 0.1 秒以上後ろなら B を記録する', () => {
  assert.deepEqual(setB({ a: 5, b: null }, 8.123), { a: 5, b: 8.12 });
  assert.deepEqual(setB({ a: 5, b: null }, 5.1), { a: 5, b: 5.1 });
  assert.deepEqual(setB({ a: 5, b: 9 }, 7), { a: 5, b: 7 });
});

test('nudgeA: 0.1 秒ずつ動かす', () => {
  assert.deepEqual(nudgeA({ a: 5, b: 8 }, 0.1), { a: 5.1, b: 8 });
  assert.deepEqual(nudgeA({ a: 5, b: 8 }, -0.1), { a: 4.9, b: 8 });
});

test('nudgeA: 0 より前には行かない', () => {
  assert.deepEqual(nudgeA({ a: 0.05, b: 8 }, -0.1), { a: 0, b: 8 });
});

test('nudgeA: B との間隔が 0.1 秒未満になる調整は無視して同じ区間を返す', () => {
  const range = { a: 7.9, b: 8 };
  assert.equal(nudgeA(range, 0.1), range);
});

test('nudgeA: A が未設定なら同じ区間を返す', () => {
  assert.equal(nudgeA(EMPTY_RANGE, 0.1), EMPTY_RANGE);
});

test('nudgeA: 何度押しても誤差が溜まらない', () => {
  let range = { a: 0, b: 100 };
  for (let i = 0; i < 30; i++) range = nudgeA(range, 0.1);
  assert.equal(range.a, 3);
  for (let i = 0; i < 30; i++) range = nudgeA(range, -0.1);
  assert.equal(range.a, 0);
});

test('nudgeB: 動画の長さより後ろには行かない', () => {
  assert.deepEqual(nudgeB({ a: 1, b: 9.95 }, 0.1, 10), { a: 1, b: 10 });
});

test('nudgeB: 動画の長さが不明(0)なら上限なしで動かす', () => {
  assert.deepEqual(nudgeB({ a: 1, b: 2 }, 0.1, 0), { a: 1, b: 2.1 });
});

test('nudgeB: A との間隔が 0.1 秒未満になる調整は無視して同じ区間を返す', () => {
  const range = { a: 5, b: 5.1 };
  assert.equal(nudgeB(range, -0.1, 60), range);
});

test('nudgeB: B が未設定なら同じ区間を返す', () => {
  const range = { a: 5, b: null };
  assert.equal(nudgeB(range, 0.1, 60), range);
});

test('shouldJump: A と B が揃っていて B 以上のときだけ true', () => {
  assert.equal(shouldJump(10, EMPTY_RANGE), false);
  assert.equal(shouldJump(10, { a: 5, b: null }), false);
  assert.equal(shouldJump(7.99, { a: 5, b: 8 }), false);
  assert.equal(shouldJump(8, { a: 5, b: 8 }), true);
  assert.equal(shouldJump(9, { a: 5, b: 8 }), true);
});

test('stepRate: 5% ずつ変え、50〜100% の外には出ない', () => {
  assert.equal(stepRate(1, -1), 0.95);
  assert.equal(stepRate(0.85, 1), 0.9);
  assert.equal(stepRate(1, 1), 1);
  assert.equal(stepRate(0.5, -1), 0.5);
});

test('stepRate: 端から端まで押しても誤差が溜まらない', () => {
  const down = [];
  let rate = 1;
  for (let i = 0; i < 12; i++) down.push((rate = stepRate(rate, -1)));
  assert.deepEqual(down, [0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 0.5, 0.5]);
  for (let i = 0; i < 12; i++) rate = stepRate(rate, 1);
  assert.equal(rate, 1);
});

test('isValidRate: 50〜100% の 5% 刻みだけを許す', () => {
  for (const ok of [0.5, 0.55, 0.85, 1]) assert.equal(isValidRate(ok), true, String(ok));
  for (const ng of [0.45, 1.05, 0.83, Number.NaN, '0.85', null]) assert.equal(isValidRate(ng), false, String(ng));
});

test('rewind: 3 秒戻す。0 より前には行かない', () => {
  assert.equal(rewind(10), 7);
  assert.equal(rewind(2), 0);
  assert.equal(rewind(10, 5), 5);
});

test('seekBy: 前後に動かす。0 より前・動画の長さより後ろには行かない', () => {
  assert.equal(seekBy(10, 3, 60), 13);
  assert.equal(seekBy(10, -3, 60), 7);
  assert.equal(seekBy(1, -3, 60), 0);
  assert.equal(seekBy(58, 10, 60), 60);
  assert.equal(seekBy(58, 10, 0), 68, '長さが不明なら上限なし');
});
