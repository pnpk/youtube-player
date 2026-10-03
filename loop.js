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

export function rewind(time, seconds = REWIND_SECONDS) {
  return Math.max(0, time - seconds);
}
