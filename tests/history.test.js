import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HISTORY_LIMIT, openVideo, removeEntry, sanitizeHistory, updateEntry } from '../history.js';

const ID1 = 'aaaaaaaaaaa';
const ID2 = 'bbbbbbbbbbb';
const ID3 = 'ccccccccccc';
const idOf = (i) => `vid${String(i).padStart(8, '0')}`;
const entry = (videoId, extra = {}) => ({
  videoId,
  title: '',
  a: null,
  b: null,
  rate: 1,
  preroll: 1,
  openedAt: 0,
  ...extra,
});

test('openVideo: 初めての動画は初期設定で先頭に追加する', () => {
  const { history, entry: opened } = openVideo([entry(ID1)], ID2, 1000);
  assert.deepEqual(opened, entry(ID2, { openedAt: 1000 }));
  assert.deepEqual(history.map((e) => e.videoId), [ID2, ID1]);
});

test('openVideo: 履歴にある動画は設定を残したまま先頭へ移し、開いた日時を更新する', () => {
  const saved = entry(ID2, { title: '曲B', a: 5, b: 9, rate: 0.85, preroll: 2, openedAt: 10 });
  const { history, entry: opened } = openVideo([entry(ID1), saved, entry(ID3)], ID2, 2000);
  assert.deepEqual(opened, { ...saved, openedAt: 2000 });
  assert.deepEqual(history.map((e) => e.videoId), [ID2, ID1, ID3]);
});

test('openVideo: 上限を超えたら古いものから消す', () => {
  let history = [];
  for (let i = 0; i <= HISTORY_LIMIT; i++) history = openVideo(history, idOf(i), i).history;
  assert.equal(history.length, HISTORY_LIMIT);
  assert.equal(history[0].videoId, idOf(HISTORY_LIMIT));
  assert.equal(history.some((e) => e.videoId === idOf(0)), false);
});

test('updateEntry: 指定した動画の項目だけを書き換え、順番は変えない', () => {
  const history = [entry(ID1), entry(ID2)];
  const next = updateEntry(history, ID2, { a: 3, b: 4, title: '曲B' });
  assert.deepEqual(next, [entry(ID1), entry(ID2, { a: 3, b: 4, title: '曲B' })]);
  assert.deepEqual(history[1], entry(ID2), '元の配列は変更しない');
});

test('updateEntry: 履歴にない動画なら同じ配列を返す', () => {
  const history = [entry(ID1)];
  assert.equal(updateEntry(history, ID2, { a: 1 }), history);
});

test('removeEntry: 指定した動画を消す', () => {
  assert.deepEqual(removeEntry([entry(ID1), entry(ID2)], ID1), [entry(ID2)]);
});

test('sanitizeHistory: 配列でなければ空にする', () => {
  for (const raw of [null, undefined, {}, 'text', 3]) assert.deepEqual(sanitizeHistory(raw), [], String(raw));
});

test('sanitizeHistory: 動画 ID が不正な項目は捨て、それ以外の不正な値は初期値にする', () => {
  const raw = [
    { videoId: 'short' },
    null,
    { videoId: ID1, title: 42, a: 5, b: 4, rate: 3, preroll: 9, openedAt: 'x' },
  ];
  assert.deepEqual(sanitizeHistory(raw), [entry(ID1, { a: 5 })]);
});

test('sanitizeHistory: 長すぎるタイトルは 200 文字で切る', () => {
  const [e] = sanitizeHistory([entry(ID1, { title: 'あ'.repeat(500) })]);
  assert.equal(e.title.length, 200);
});

test('sanitizeHistory: 同じ動画が重複していたら先にあるほうだけ残し、上限で切る', () => {
  const raw = [entry(ID1, { title: '新' }), entry(ID1, { title: '旧' })];
  for (let i = 0; i < HISTORY_LIMIT + 5; i++) raw.push(entry(idOf(i)));
  const history = sanitizeHistory(raw);
  assert.equal(history.length, HISTORY_LIMIT);
  assert.equal(history[0].title, '新');
  assert.equal(history.filter((e) => e.videoId === ID1).length, 1);
});
