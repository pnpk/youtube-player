// 再生履歴。動画ごとにタイトルと A/B・速度・区切りを覚え、新しい順に並べる。
// 履歴は { videoId, title, a, b, rate, markers, openedAt } の配列(先頭が最新)。
import { DEFAULT_RATE, isValidRate, parseVideoId, setB } from './loop.js';
import { addMarker } from './sections.js';

export const HISTORY_LIMIT = 30;
const TITLE_MAX = 200;

const isTime = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

// 動画 ID が不正なら null。それ以外の不正な値は初期値か null に置き換える
export function sanitizeSettings(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.videoId !== 'string' || parseVideoId(raw.videoId) !== raw.videoId) return null;
  const a = isTime(raw.a) ? raw.a : null;
  const b = a != null && isTime(raw.b) ? (setB({ a, b: null }, raw.b)?.b ?? null) : null;
  // 区切りは 1 つずつ足し直して、A-B の内側・間隔・個数の条件を満たすものだけ残す
  const markers = Array.isArray(raw.markers)
    ? raw.markers.filter(Number.isFinite).reduce((kept, t) => addMarker({ a, b }, kept, t) ?? kept, [])
    : [];
  return {
    videoId: raw.videoId,
    a,
    b,
    rate: isValidRate(raw.rate) ? raw.rate : DEFAULT_RATE,
    markers,
  };
}

function sanitizeEntry(raw) {
  const settings = sanitizeSettings(raw);
  if (!settings) return null;
  return {
    ...settings,
    title: typeof raw.title === 'string' ? raw.title.slice(0, TITLE_MAX) : '',
    openedAt: Number.isFinite(raw.openedAt) ? raw.openedAt : 0,
  };
}

export function sanitizeHistory(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const history = [];
  for (const item of raw) {
    const entry = sanitizeEntry(item);
    if (!entry || seen.has(entry.videoId)) continue;
    seen.add(entry.videoId);
    history.push(entry);
    if (history.length === HISTORY_LIMIT) break;
  }
  return history;
}

export function openVideo(history, videoId, now) {
  const existing = history.find((e) => e.videoId === videoId);
  const entry = existing
    ? { ...existing, openedAt: now }
    : { videoId, title: '', a: null, b: null, rate: DEFAULT_RATE, markers: [], openedAt: now };
  const rest = history.filter((e) => e.videoId !== videoId);
  return { history: [entry, ...rest].slice(0, HISTORY_LIMIT), entry };
}

export function updateEntry(history, videoId, patch) {
  if (!history.some((e) => e.videoId === videoId)) return history;
  return history.map((e) => (e.videoId === videoId ? { ...e, ...patch } : e));
}

export function removeEntry(history, videoId) {
  return history.filter((e) => e.videoId !== videoId);
}
