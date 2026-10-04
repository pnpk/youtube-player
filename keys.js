// キーボード操作の割り当て。押されたキーを、アプリの操作(コマンド)に変換するだけで、実行は app.js が行う。
export const SEEK_SECONDS = 3;
export const SEEK_SECONDS_LONG = 10;

const LETTERS = { a: 'setA', b: 'setB', r: 'restart', m: 'addMarker' };

export function commandForKey({ key, shiftKey, metaKey, ctrlKey, altKey }) {
  // Command / Ctrl / Option 付きはブラウザの操作(再読み込み・コピーなど)に任せる
  if (metaKey || ctrlKey || altKey) return null;
  const step = shiftKey ? SEEK_SECONDS_LONG : SEEK_SECONDS;
  switch (key) {
    case ' ':
      return { type: 'toggle' };
    case 'ArrowLeft':
      return { type: 'seekBy', seconds: -step };
    case 'ArrowRight':
      return { type: 'seekBy', seconds: step };
    case 'ArrowUp':
      return { type: 'rate', direction: 1 };
    case 'ArrowDown':
      return { type: 'rate', direction: -1 };
    case 'Escape':
      return { type: 'close' };
  }
  if (/^[0-9]$/.test(key)) return { type: 'section', index: key === '0' ? null : Number(key) - 1 };
  const letter = LETTERS[key.toLowerCase()];
  return letter ? { type: letter } : null;
}
