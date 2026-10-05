import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HISTORY_LIMIT,
  fileId,
  openMedia,
  removeEntry,
  sanitizeHistory,
  titleFromFileName,
  updateEntry,
} from '../history.js';

const ID1 = 'aaaaaaaaaaa';
const ID2 = 'bbbbbbbbbbb';
const ID3 = 'ccccccccccc';
const FILE1 = 'f:1000:5:song.mp3';
const idOf = (i) => `vid${String(i).padStart(8, '0')}`;
const entry = (id, extra = {}) => ({
  kind: id.startsWith('f:') ? 'file' : 'youtube',
  id,
  title: '',
  a: null,
  b: null,
  rate: 1,
  markers: [],
  openedAt: 0,
  ...extra,
});

test('fileId: 同じファイル情報なら同じ識別子、違えば違う識別子', () => {
  const file = { name: 'あの曲.mp3', size: 1234, lastModified: 99 };
  assert.equal(fileId(file), 'f:1234:99:あの曲.mp3');
  assert.equal(fileId({ ...file }), fileId(file));
  assert.notEqual(fileId({ ...file, size: 1235 }), fileId(file));
  assert.notEqual(fileId({ ...file, lastModified: 100 }), fileId(file));
});

test('fileId: 長すぎるファイル名でも 300 文字に収める', () => {
  assert.equal(fileId({ name: 'あ'.repeat(400), size: 1, lastModified: 1 }).length, 300);
});

test('titleFromFileName: 拡張子を除く', () => {
  assert.equal(titleFromFileName('あの曲.mp3'), 'あの曲');
  assert.equal(titleFromFileName('live.take2.wav'), 'live.take2');
  assert.equal(titleFromFileName('noext'), 'noext');
  assert.equal(titleFromFileName('.hidden'), '.hidden');
});

test('openMedia: 初めてのものは初期設定で先頭に追加する', () => {
  const { history, entry: opened, dropped } = openMedia([entry(ID1)], { kind: 'file', id: FILE1, title: 'song' }, 1000);
  assert.deepEqual(opened, entry(FILE1, { title: 'song', openedAt: 1000 }));
  assert.deepEqual(history.map((e) => e.id), [FILE1, ID1]);
  assert.deepEqual(dropped, []);
});

test('openMedia: 履歴にあるものは設定を残したまま先頭へ移す(同じファイルを選び直したときも設定が戻る)', () => {
  const saved = entry(FILE1, { title: 'song', a: 5, b: 9, rate: 0.85, markers: [7], openedAt: 10 });
  const { history, entry: opened } = openMedia([entry(ID1), saved], { kind: 'file', id: FILE1, title: 'song' }, 2000);
  assert.deepEqual(opened, { ...saved, openedAt: 2000 });
  assert.deepEqual(history.map((e) => e.id), [FILE1, ID1]);
});

test('openMedia: タイトルが渡されなければ、以前のタイトルを残す', () => {
  const saved = entry(ID2, { title: '曲B' });
  assert.equal(openMedia([saved], { kind: 'youtube', id: ID2 }, 1).entry.title, '曲B');
});

test('openMedia: 上限を超えたら古いものを押し出し、押し出したものを返す', () => {
  let history = [];
  let dropped = [];
  for (let i = 0; i <= HISTORY_LIMIT; i++) ({ history, dropped } = openMedia(history, { kind: 'youtube', id: idOf(i) }, i));
  assert.equal(history.length, HISTORY_LIMIT);
  assert.deepEqual(dropped.map((e) => e.id), [idOf(0)]);
});

test('updateEntry / removeEntry: id で指定する', () => {
  const history = [entry(ID1), entry(FILE1)];
  assert.deepEqual(updateEntry(history, FILE1, { a: 1 })[1], entry(FILE1, { a: 1 }));
  assert.equal(updateEntry(history, ID3, { a: 1 }), history);
  assert.deepEqual(removeEntry(history, ID1), [entry(FILE1)]);
});

test('sanitizeHistory: 以前の形式(videoId)を youtube の記録として引き継ぐ', () => {
  const old = { videoId: ID1, title: '曲', a: 1, b: 2, rate: 0.9, markers: [], openedAt: 5 };
  assert.deepEqual(sanitizeHistory([old]), [entry(ID1, { title: '曲', a: 1, b: 2, rate: 0.9, openedAt: 5 })]);
});

test('sanitizeHistory: YouTube と音声ファイルを一緒に並べられる', () => {
  const raw = [entry(FILE1, { title: 'song' }), entry(ID1)];
  assert.deepEqual(sanitizeHistory(raw), raw);
});

test('sanitizeHistory: 不正な識別子の記録は捨てる', () => {
  const raw = [
    { kind: 'file', id: 'song.mp3' },
    { kind: 'file', id: `f:${'x'.repeat(400)}` },
    { kind: 'youtube', id: 'short' },
    { kind: 'other', id: ID1 },
    null,
    entry(ID2),
  ];
  assert.deepEqual(sanitizeHistory(raw), [entry(ID2)]);
});

test('sanitizeHistory: 配列でなければ空にする', () => {
  for (const raw of [null, undefined, {}, 'text', 3]) assert.deepEqual(sanitizeHistory(raw), [], String(raw));
});

test('sanitizeHistory: 不正な値は初期値にし、区切りは A-B の内側の有効なものだけ残す', () => {
  const raw = [{ kind: 'youtube', id: ID1, title: 42, a: 0, b: 10, rate: 3, markers: [7, 'x', 3, 12, 3.05, null], openedAt: 'x' }];
  assert.deepEqual(sanitizeHistory(raw), [entry(ID1, { a: 0, b: 10, markers: [3, 7] })]);
});

test('sanitizeHistory: 以前保存した助走の値は捨てる', () => {
  assert.deepEqual(sanitizeHistory([{ ...entry(ID1), preroll: 2 }]), [entry(ID1)]);
});

test('sanitizeHistory: 長すぎるタイトルは 200 文字で切る', () => {
  const [e] = sanitizeHistory([entry(ID1, { title: 'あ'.repeat(500) })]);
  assert.equal(e.title.length, 200);
});

test('sanitizeHistory: 同じものが重複していたら先にあるほうだけ残し、上限で切る', () => {
  const raw = [entry(ID1, { title: '新' }), entry(ID1, { title: '旧' })];
  for (let i = 0; i < HISTORY_LIMIT + 5; i++) raw.push(entry(idOf(i)));
  const history = sanitizeHistory(raw);
  assert.equal(history.length, HISTORY_LIMIT);
  assert.equal(history[0].title, '新');
  assert.equal(history.filter((e) => e.id === ID1).length, 1);
});
