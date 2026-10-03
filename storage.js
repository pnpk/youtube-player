// 最後の状態(動画・A/B・速度・助走)を 1 件だけ保存し、起動時に戻す。
// 保存先が使えない・中身が壊れているときは、何も言わずに初期状態にする。
import { DEFAULT_PREROLL, DEFAULT_RATE, PREROLLS, isValidRate, parseVideoId, setB } from './loop.js';

export const STORAGE_KEY = 'yt-practice-player:v1';

const isTime = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

function sanitize(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.videoId !== 'string' || parseVideoId(raw.videoId) !== raw.videoId) return null;
  const a = isTime(raw.a) ? raw.a : null;
  const b = a != null && isTime(raw.b) ? (setB({ a, b: null }, raw.b)?.b ?? null) : null;
  return {
    videoId: raw.videoId,
    a,
    b,
    rate: isValidRate(raw.rate) ? raw.rate : DEFAULT_RATE,
    preroll: PREROLLS.includes(raw.preroll) ? raw.preroll : DEFAULT_PREROLL,
  };
}

export function saveState(storage, state) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 保存できなくても練習の邪魔はしない
  }
}

export function loadState(storage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return raw ? sanitize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
