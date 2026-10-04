// 区間ループ・速度・URL 解析の計算。YouTube にもブラウザにも依存しない。
// 時刻は秒。区間は { a, b }(未設定は null)。

export const MIN_GAP = 0.1;
export const NUDGE = 0.1;
export const RATE_MIN = 0.5;
export const RATE_MAX = 1;
export const RATE_STEP = 0.05;
export const DEFAULT_RATE = 1;
export const REWIND_SECONDS = 3;
export const EMPTY_RANGE = Object.freeze({ a: null, b: null });

const VIDEO_ID = /^[\w-]{11}$/;
const EPSILON = 1e-9;

// ±0.1 や ±5% を繰り返しても誤差が溜まらないよう、0.01 単位に丸める
export const round2 = (x) => Math.round(x * 100) / 100;
// a から b までが最低間隔(0.1 秒)以上あいているか
export const gapOk = (a, b) => round2(b - a) >= MIN_GAP - EPSILON;

export function parseVideoId(text) {
  const s = String(text ?? '').trim();
  if (VIDEO_ID.test(s)) return s;
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  let id = null;
  if (host === 'youtu.be') {
    id = url.pathname.split('/')[1];
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = url.searchParams.get('v') ?? url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1];
  }
  return id && VIDEO_ID.test(id) ? id : null;
}

export function setA(range, time) {
  const a = round2(Math.max(0, time));
  const b = range.b != null && gapOk(a, range.b) ? range.b : null;
  return { a, b };
}

export function setB(range, time) {
  if (range.a == null) return null;
  const b = round2(time);
  return gapOk(range.a, b) ? { a: range.a, b } : null;
}

export function nudgeA(range, delta) {
  if (range.a == null) return range;
  const a = round2(Math.max(0, range.a + delta));
  if (range.b != null && !gapOk(a, range.b)) return range;
  return { a, b: range.b };
}

export function nudgeB(range, delta, duration) {
  if (range.b == null) return range;
  const moved = range.b + delta;
  const b = round2(duration > 0 ? Math.min(duration, moved) : moved);
  if (!gapOk(range.a, b)) return range;
  return { a: range.a, b };
}

// ループバーで A / B のつまみをドラッグしたときの位置(0.1 秒単位)
const round1 = (x) => Math.round(x * 10) / 10;

export function moveA(range, time) {
  const a = Math.max(0, round1(time));
  return { a: round2(Math.min(a, range.b - MIN_GAP)), b: range.b };
}

export function moveB(range, time, duration) {
  let b = round1(time);
  if (duration > 0) b = Math.min(b, duration);
  return { a: range.a, b: round2(Math.max(b, range.a + MIN_GAP)) };
}

// ループバーに表示する範囲。A-B の前後に、区間の長さの 25%(最低 1 秒)の余白を付ける
export function loopWindow(range, duration) {
  if (range.a == null || range.b == null) return null;
  const pad = Math.max(1, (range.b - range.a) * 0.25);
  const end = range.b + pad;
  return { start: Math.max(0, range.a - pad), end: duration > 0 ? Math.min(duration, end) : end };
}

// ループバーの目盛り。長い目盛りが maxMajor 本を超えない間隔を選び、その半分の間隔で短い目盛りを入れる
const TICK_STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120];

export function loopTicks(view, maxMajor) {
  const span = view.end - view.start;
  const step = TICK_STEPS.find((s) => span / s <= maxMajor) ?? TICK_STEPS[TICK_STEPS.length - 1];
  const half = step / 2;
  const major = [];
  const minor = [];
  for (let i = Math.ceil(view.start / half - EPSILON); i * half <= view.end + EPSILON; i++) {
    (i % 2 === 0 ? major : minor).push(round2(i * half) + 0); // + 0 で -0 を 0 にそろえる
  }
  return { step, major, minor };
}

// ドラッグ中に出す、元の位置からの差(例: +0.3秒)
export function formatDelta(seconds) {
  const r = Math.round(seconds * 10) / 10;
  const sign = r > 0 ? '+' : r < 0 ? '−' : '±';
  return `${sign}${Math.abs(r).toFixed(1)}秒`;
}

export function shouldJump(time, range) {
  return range.a != null && range.b != null && time >= range.b;
}

export function stepRate(rate, direction) {
  const next = round2(rate + direction * RATE_STEP);
  if (next < RATE_MIN - EPSILON || next > RATE_MAX + EPSILON) return rate;
  return next;
}

export function isValidRate(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  if (value < RATE_MIN - EPSILON || value > RATE_MAX + EPSILON) return false;
  const steps = value / RATE_STEP;
  return Math.abs(steps - Math.round(steps)) < 1e-6;
}

// 前後に動かす。動画の長さが不明(0)なら上限なし
export function seekBy(time, delta, duration) {
  const moved = Math.max(0, time + delta);
  return duration > 0 ? Math.min(duration, moved) : moved;
}

export function rewind(time, seconds = REWIND_SECONDS) {
  return Math.max(0, time - seconds);
}
