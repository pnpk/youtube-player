import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePeaks } from '../waveform.js';

test('computePeaks: 区間ごとの振幅の最大値(絶対値)を、全体の最大値で割って 0〜1 にする', () => {
  assert.deepEqual(computePeaks([[0, 0.5, -1, 0.25]], 2), [0.5, 1]);
});

test('computePeaks: 複数チャンネルはその区間の全チャンネルの最大値を使う', () => {
  assert.deepEqual(computePeaks([[0.25, 0.5], [-1, 0.125]], 2), [1, 0.5]);
});

test('computePeaks: 無音なら 0 のまま', () => {
  assert.deepEqual(computePeaks([[0, 0, 0, 0]], 2), [0, 0]);
});

test('computePeaks: 音声が分割数より短くても、分割数ぶんの値を返す', () => {
  assert.deepEqual(computePeaks([[0.5, -1]], 4), [0.5, 0.5, 1, 1]);
});

test('computePeaks: 音声がなければ 0 の並び', () => {
  assert.deepEqual(computePeaks([], 3), [0, 0, 0]);
  assert.deepEqual(computePeaks([[]], 3), [0, 0, 0]);
});
