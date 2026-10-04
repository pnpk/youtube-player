// A-B ループの中の区切り。区切り(markers)は A と B の間の秒数を時刻順に並べた配列。
// 区切りで分けた小さな区間を 1 つ選んでループできる(選んでいないときは A-B 全体)。
import { gapOk, round2 } from './loop.js';

export const MAX_MARKERS = 9;
export const SECTION_COLORS = 10;

// 区間の色(style.css の --sec-1 〜 --sec-10)。番号は 0 始まり
export function sectionColor(index) {
  return `var(--sec-${(index % SECTION_COLORS) + 1})`;
}

const complete = (range) => range.a != null && range.b != null;
// A・B・ほかの区切りのどれからも最低間隔以上離れているか
const fits = (range, markers, t) => gapOk(range.a, t) && gapOk(t, range.b) && markers.every((m) => gapOk(Math.min(m, t), Math.max(m, t)));

export function addMarker(range, markers, time) {
  if (!complete(range) || markers.length >= MAX_MARKERS) return null;
  const t = round2(time);
  if (!fits(range, markers, t)) return null;
  return [...markers, t].sort((x, y) => x - y);
}

// A/B が揃っていなくても区切りを足せるようにする。A が未設定なら A を動画の先頭に、
// B が未設定なら B を動画の最後にしてから足す(区切りを入れていく → あとで A/B を決める、の順でも使えるように)
export function placeMarker(range, markers, time, duration) {
  let target = range;
  if (range.a == null || range.b == null) {
    if (!(duration > 0)) return null;
    target = { a: range.a ?? 0, b: range.b ?? round2(duration) };
  }
  const next = addMarker(target, markers, time);
  return next ? { range: target, markers: next } : null;
}

export function removeNearestMarker(markers, time) {
  if (markers.length === 0) return markers;
  let nearest = 0;
  for (let i = 1; i < markers.length; i++) {
    if (Math.abs(markers[i] - time) < Math.abs(markers[nearest] - time)) nearest = i;
  }
  return markers.filter((_, i) => i !== nearest);
}

// A/B を動かしたあとに、内側に収まらなくなった区切りを消す
export function pruneMarkers(range, markers) {
  if (!complete(range)) return [];
  return markers.filter((m) => gapOk(range.a, m) && gapOk(m, range.b));
}

export function sectionsOf(range, markers) {
  if (!complete(range)) return [];
  const points = [range.a, ...markers, range.b];
  return points.slice(0, -1).map((a, i) => ({ a, b: points[i + 1] }));
}

export function loopRange(range, markers, selected) {
  if (selected == null) return range;
  return sectionsOf(range, markers)[selected] ?? range;
}

// 「頭に戻る」の戻り先。今ループしている範囲の頭。A も未設定なら動画の先頭
export function restartPoint(range, markers, selected) {
  return loopRange(range, markers, selected).a ?? 0;
}

// 区切りを足したり消したりしたあとも、同じ位置から始まる区間を選び続けるために使う
export function findSection(range, markers, start) {
  const index = sectionsOf(range, markers).findIndex((s) => s.a === start);
  return index === -1 ? null : index;
}
