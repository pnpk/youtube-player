import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_MARKERS,
  addMarker,
  findSection,
  loopRange,
  moveMarker,
  placeMarker,
  restartPoint,
  sectionColor,
  pruneMarkers,
  removeNearestMarker,
  sectionsOf,
} from '../sections.js';

const AB = { a: 0, b: 10 };

test('addMarker: A-B の内側なら区切りを足し、時刻順に並べる(0.01 秒単位に丸める)', () => {
  assert.deepEqual(addMarker(AB, [], 5.004), [5]);
  assert.deepEqual(addMarker(AB, [5], 3), [3, 5]);
  assert.deepEqual(addMarker(AB, [3, 5], 7.5), [3, 5, 7.5]);
});

test('addMarker: A/B が揃っていなければ null', () => {
  assert.equal(addMarker({ a: 1, b: null }, [], 5), null);
  assert.equal(addMarker({ a: null, b: null }, [], 5), null);
});

test('addMarker: A-B の外、または A / B / ほかの区切りから 0.1 秒未満なら null', () => {
  for (const t of [-1, 0, 0.05, 9.95, 10, 12]) assert.equal(addMarker(AB, [], t), null, String(t));
  assert.equal(addMarker(AB, [5], 5.05), null);
  assert.equal(addMarker(AB, [5], 4.95), null);
  assert.deepEqual(addMarker(AB, [5], 5.1), [5, 5.1]);
});

test(`addMarker: 区切りは ${MAX_MARKERS} 個まで`, () => {
  const full = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  assert.equal(full.length, MAX_MARKERS);
  assert.equal(addMarker(AB, full, 9.5), null);
});

test('removeNearestMarker: 指定した時刻にいちばん近い区切りを消す', () => {
  assert.deepEqual(removeNearestMarker([3, 5, 7], 5.4), [3, 7]);
  assert.deepEqual(removeNearestMarker([3, 5, 7], 0), [5, 7]);
  assert.deepEqual(removeNearestMarker([3, 5, 7], 99), [3, 5]);
});

test('removeNearestMarker: 区切りがなければ同じ配列を返す', () => {
  const none = [];
  assert.equal(removeNearestMarker(none, 3), none);
});

test('pruneMarkers: A-B の外や、A / B に 0.1 秒未満まで近づいた区切りを消す', () => {
  assert.deepEqual(pruneMarkers({ a: 2, b: 8 }, [1, 2.05, 3, 7.95, 9]), [3]);
});

test('pruneMarkers: A/B が揃っていなければ区切りはすべて消す', () => {
  assert.deepEqual(pruneMarkers({ a: 2, b: null }, [3, 5]), []);
});

test('sectionsOf: A-B を区切りで分けた区間の一覧', () => {
  assert.deepEqual(sectionsOf(AB, [3, 7]), [
    { a: 0, b: 3 },
    { a: 3, b: 7 },
    { a: 7, b: 10 },
  ]);
  assert.deepEqual(sectionsOf(AB, []), [{ a: 0, b: 10 }]);
  assert.deepEqual(sectionsOf({ a: 1, b: null }, [3]), []);
});

test('loopRange: 区間を選んでいればその区間、選んでいなければ A-B 全体', () => {
  assert.deepEqual(loopRange(AB, [3, 7], 1), { a: 3, b: 7 });
  assert.deepEqual(loopRange(AB, [3, 7], null), AB);
  assert.deepEqual(loopRange(AB, [3, 7], 5), AB, '範囲外の番号なら全体');
});

test('findSection: 指定した時刻から始まる区間の番号。なければ null', () => {
  assert.equal(findSection(AB, [3, 7], 3), 1);
  assert.equal(findSection(AB, [3, 7], 0), 0);
  assert.equal(findSection(AB, [3, 7], 5), null);
});

test('placeMarker: B が未設定なら、B を動画の最後にしてから区切りを足す', () => {
  assert.deepEqual(placeMarker({ a: 2, b: null }, [], 5, 60.004), { range: { a: 2, b: 60 }, markers: [5] });
});

test('placeMarker: B が設定済みなら A-B はそのままで区切りを足す', () => {
  assert.deepEqual(placeMarker({ a: 2, b: 10 }, [4], 6, 60), { range: { a: 2, b: 10 }, markers: [4, 6] });
});

test('placeMarker: A も未設定なら、A を動画の先頭・B を動画の最後にしてから区切りを足す', () => {
  assert.deepEqual(placeMarker({ a: null, b: null }, [], 5, 60), { range: { a: 0, b: 60 }, markers: [5] });
});

test('placeMarker: 動画の長さが不明、または区切りを置けない位置なら null', () => {
  assert.equal(placeMarker({ a: null, b: null }, [], 5, 0), null);
  assert.equal(placeMarker({ a: null, b: null }, [], 0.05, 60), null);
  assert.equal(placeMarker({ a: 2, b: null }, [], 5, 0), null);
  assert.equal(placeMarker({ a: 2, b: null }, [], 1, 60), null);
  assert.equal(placeMarker({ a: 2, b: 10 }, [], 12, 60), null);
});

test('restartPoint: 「頭に戻る」の戻り先。区間を選んでいればその頭、なければ A、A もなければ動画の先頭', () => {
  assert.equal(restartPoint(AB, [3, 7], 1), 3);
  assert.equal(restartPoint({ a: 2, b: 10 }, [], null), 2);
  assert.equal(restartPoint({ a: 2, b: null }, [], null), 2);
  assert.equal(restartPoint({ a: null, b: null }, [], null), 0);
});

test('sectionColor: 区間の番号(0 始まり)から色の CSS 変数を決める。10 色をくりかえす', () => {
  assert.equal(sectionColor(0), 'var(--sec-1)');
  assert.equal(sectionColor(9), 'var(--sec-10)');
  assert.equal(sectionColor(10), 'var(--sec-1)');
});

test('moveMarker: 指定した区切りを 0.1 秒単位で動かす', () => {
  assert.deepEqual(moveMarker(AB, [3, 7], 0, 4.04), [4, 7]);
  assert.deepEqual(moveMarker(AB, [3, 7], 1, 5.56), [3, 5.6]);
});

test('moveMarker: 隣の区切りや A / B から 0.1 秒以上離れた範囲に収める(追い越さない)', () => {
  assert.deepEqual(moveMarker(AB, [3, 7], 0, 9), [6.9, 7]);
  assert.deepEqual(moveMarker(AB, [3, 7], 0, -5), [0.1, 7]);
  assert.deepEqual(moveMarker(AB, [3, 7], 1, 20), [3, 9.9]);
  assert.deepEqual(moveMarker(AB, [3, 7], 1, 1), [3, 3.1]);
});

test('moveMarker: 範囲外の番号や、A/B が揃っていないときは同じ配列を返す', () => {
  const markers = [3, 7];
  assert.equal(moveMarker(AB, markers, 5, 4), markers);
  assert.equal(moveMarker({ a: 0, b: null }, markers, 0, 4), markers);
});
