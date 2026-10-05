// 再生履歴。YouTube の動画と音声ファイルを、タイトルと A/B・速度・区切りごと覚え、新しい順に並べる。
// 履歴は { kind: 'youtube' | 'file', id, title, a, b, rate, markers, openedAt } の配列(先頭が最新)。
// id は YouTube なら動画 ID、音声ファイルなら fileId で作る識別子。
import { DEFAULT_RATE, isValidRate, parseVideoId, setB } from './loop.js';
import { addMarker } from './sections.js';

export const HISTORY_LIMIT = 30;
const TITLE_MAX = 200;
const FILE_ID_MAX = 300;

const isTime = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

// 音声ファイルの識別子。同じファイルを選び直せば同じになる(中身は読まない)
export function fileId({ name, size, lastModified }) {
  return `f:${size}:${lastModified}:${name}`.slice(0, FILE_ID_MAX);
}

export function titleFromFileName(name) {
  const dot = name.lastIndexOf('.');
  return (dot > 0 ? name.slice(0, dot) : name).slice(0, TITLE_MAX);
}

// 記録の種類と識別子。以前の形式({ videoId })は YouTube として扱う。不正なら null
function refOf(raw) {
  if (raw.kind === 'file') {
    const ok = typeof raw.id === 'string' && raw.id.startsWith('f:') && raw.id.length <= FILE_ID_MAX;
    return ok ? { kind: 'file', id: raw.id } : null;
  }
  if (raw.kind !== undefined && raw.kind !== 'youtube') return null;
  const id = raw.kind === 'youtube' ? raw.id : raw.videoId;
  return typeof id === 'string' && parseVideoId(id) === id ? { kind: 'youtube', id } : null;
}

// 識別子が不正なら null。それ以外の不正な値は初期値か null に置き換える
export function sanitizeSettings(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const ref = refOf(raw);
  if (!ref) return null;
  const a = isTime(raw.a) ? raw.a : null;
  const b = a != null && isTime(raw.b) ? (setB({ a, b: null }, raw.b)?.b ?? null) : null;
  // 区切りは 1 つずつ足し直して、A-B の内側・間隔・個数の条件を満たすものだけ残す
  const markers = Array.isArray(raw.markers)
    ? raw.markers.filter(Number.isFinite).reduce((kept, t) => addMarker({ a, b }, kept, t) ?? kept, [])
    : [];
  return { ...ref, a, b, rate: isValidRate(raw.rate) ? raw.rate : DEFAULT_RATE, markers };
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
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    history.push(entry);
    if (history.length === HISTORY_LIMIT) break;
  }
  return history;
}

// 開いたものを先頭に入れる。履歴にあれば設定を残したまま移す。上限で押し出したものは dropped で返す
export function openMedia(history, { kind, id, title = '' }, now) {
  const existing = history.find((e) => e.id === id);
  const entry = existing
    ? { ...existing, title: title || existing.title, openedAt: now }
    : { kind, id, title, a: null, b: null, rate: DEFAULT_RATE, markers: [], openedAt: now };
  const all = [entry, ...history.filter((e) => e.id !== id)];
  return { history: all.slice(0, HISTORY_LIMIT), entry, dropped: all.slice(HISTORY_LIMIT) };
}

export function updateEntry(history, id, patch) {
  if (!history.some((e) => e.id === id)) return history;
  return history.map((e) => (e.id === id ? { ...e, ...patch } : e));
}

export function removeEntry(history, id) {
  return history.filter((e) => e.id !== id);
}
