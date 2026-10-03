// 再生履歴を保存し、起動時に読み込む。
// 保存先が使えない・中身が壊れているときは、何も言わずに空の履歴にする。
import { sanitizeHistory, sanitizeSettings } from './history.js';

// 旧形式: 最後の状態 1 件だけ。履歴がまだないときに 1 件目として引き継ぐ
export const STORAGE_KEY = 'yt-practice-player:v1';
export const HISTORY_KEY = 'yt-practice-player:history:v1';

function readJson(storage, key) {
  try {
    const raw = storage?.getItem(key);
    return raw == null ? undefined : JSON.parse(raw);
  } catch {
    return null;
  }
}

export function loadState(storage) {
  return sanitizeSettings(readJson(storage, STORAGE_KEY));
}

export function loadHistory(storage, now) {
  const raw = readJson(storage, HISTORY_KEY);
  if (raw !== undefined) return sanitizeHistory(raw);
  const legacy = loadState(storage);
  return legacy ? [{ ...legacy, title: '', openedAt: now }] : [];
}

export function saveHistory(storage, history) {
  try {
    storage?.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // 保存できなくても練習の邪魔はしない
  }
}
