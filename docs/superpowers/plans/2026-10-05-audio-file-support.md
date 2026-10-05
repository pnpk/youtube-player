# 音声ファイル(MP3 / WAV)対応 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 手持ちの音声ファイル(MP3 / WAV など)を YouTube と同じ操作で練習に使えるようにし、曲全体の波形とループバーの拡大波形を表示する。

**Architecture:** ブラウザ標準の audio 要素で再生する `audio-player.js` を、YouTube 用の `player.js` と同じ操作の形で作り、`app.js` は「今使っているプレーヤー」を切り替えるだけにする。ファイルの中身と波形は IndexedDB(`media-store.js`)に保存し、波形は `waveform.js` で計算して canvas に描く。履歴は `kind`(youtube / file)と `id` を持つ形にする。

**Tech Stack:** HTML / CSS / JavaScript(ES Modules)、HTMLAudioElement、Web Audio(`decodeAudioData`)、IndexedDB、canvas、Node.js 標準テストランナー

**Spec:** `docs/superpowers/specs/2026-10-05-audio-file-support-design.md`(元の設計書 `docs/superpowers/specs/2026-10-04-youtube-practice-player-design.md` も有効)

## Global Constraints

- フレームワーク・ビルドツール・npm の依存パッケージは使わない。自動テストは `node --test` のみ
- JS / CSS を変えたら `npm run stamp`。新しいモジュールは `tools/stamp-version.mjs` の `MODULES` と `index.html` の import map に足す(足し忘れは `tests/version.test.js` が失敗する)
- 速度は 50〜100%、5% 刻み。音声ファイルでも速度を落としたとき音程を保つ(`preservesPitch`)
- ファイルの識別子は `f:<大きさ>:<更新日時>:<ファイル名>`(300 文字以内)。表示名は拡張子を除いたファイル名(200 文字以内)
- 保存の上限は合計 1GB(`1024 ** 3` バイト)。超えたら最後に開いた日時が古いファイルから中身と波形を消し、履歴の記録は残す。今開いたファイルは消さない
- 履歴は最大 30 件。押し出された記録・「削除」した記録が音声ファイルなら、保存した中身と波形も消す。起動時に履歴にない保存データを消す
- 表示する文言(設計書どおり):
  - 「このファイルは再生できません」
  - 「ブラウザに保存できなかったため、次回は選び直しが必要です」
  - 「波形を作成中…」「波形を表示できません」
  - 「ファイルが見つかりません。♪ からもう一度選んでください」
  - 「ここにドロップして開く」
- ファイル選択の `accept` は `audio/*,.mp3,.wav,.m4a,.aac`
- 波形の分割数の既定は 2000。各値は 0〜1
- 今ある A-B ループ・区切り・ループバー・キーボード操作・ヘルプの動きは変えない
- IndexedDB が使えない・壊れているときも、練習(再生と履歴)は続けられること
- コミットメッセージの末尾に、会話で指定された Co-Authored-By / Claude-Session の 2 行を付ける

## Review Focus

1. **同じファイルを選び直したとき**: 容量の上限やSafariのデータ削除で中身が消えたあと、同じファイルを選び直すと同じ識別子になり、A/B・区切り・速度が戻ること(Task 1 のテストで固定)
2. **YouTube の読み込みに失敗したとき**: オフラインなどで YouTube のプレーヤーが作れなくても、音声ファイルは開いて練習できること(Task 5 のブラウザ確認で固定)
3. **YouTube と音声ファイルの行き来**: 音声ファイルの再生中に YouTube を開くと音声が止まり、表示が切り替わる。使っていないほうのプレーヤーの通知(再生中・終了など)でボタンやループが誤動作しないこと(Task 5 のブラウザ確認で固定)
4. **大きなファイル・解析に失敗するファイル**: 波形の計算に失敗しても再生は続けられ、「波形を表示できません」と出ること。計算中に別のものを開いても、古い波形が新しいほうに描かれないこと(Task 5 のブラウザ確認で固定)
5. **iPad Safari での保存と再生**: IndexedDB に保存した Blob から再生でき、遅くしても音程が変わらないこと(Task 6 の実機チェックリストで固定)

---

## ファイル構成

| ファイル | 役割 | タスク |
|---|---|---|
| `history.js` / `tests/history.test.js` / `tests/storage.test.js` | `kind` / `id` 形式、以前の形式からの引き継ぎ、`fileId`、`titleFromFileName`、`openMedia`(押し出された記録を返す) | Task 1 |
| `waveform.js` / `tests/waveform.test.js` | `computePeaks`(純粋)、`decodePeaks`、`drawWaveform` | Task 2 |
| `media-store.js` / `tests/media-store.test.js` | `pickEvictions` / `findOrphans`(純粋)、IndexedDB の読み書き | Task 3 |
| `audio-player.js`、`tools/stamp-version.mjs`、`index.html`(import map) | 音声ファイルのプレーヤー、版番号の対象追加 | Task 4 |
| `app.js` / `index.html` / `style.css`、`tools/make-test-wav.mjs` | 画面と流れの組み込み、確認用 WAV | Task 5 |
| `README.md` / `index.html`(ヘルプ)/ `docs/manual-check.md` / 元の設計書 | 説明の更新、公開 | Task 6 |

---

### Task 1: 履歴を `kind` / `id` 形式にする

**Files:**
- Modify: `history.js`
- Test: `tests/history.test.js`(書き換え)、`tests/storage.test.js`(期待値の更新)

**Interfaces:**
- Consumes: `loop.js` の `DEFAULT_RATE` / `isValidRate` / `parseVideoId` / `setB`、`sections.js` の `addMarker`
- Produces(`history.js`):
  - `HISTORY_LIMIT = 30`
  - `fileId({ name, size, lastModified }): string`
  - `titleFromFileName(name): string`
  - `sanitizeSettings(raw) → { kind, id, a, b, rate, markers } | null`(以前の `videoId` 形式も受け付ける)
  - `sanitizeHistory(raw) → entry[]`(entry = `{ kind, id, title, a, b, rate, markers, openedAt }`)
  - `openMedia(history, { kind, id, title = '' }, now) → { history, entry, dropped }`
  - `updateEntry(history, id, patch)` / `removeEntry(history, id)`
  - `openVideo` は削除する(`app.js` は Task 5 で `openMedia` に切り替える)

- [ ] **Step 1: 失敗するテストを書く(`tests/history.test.js` を置き換える)**

```js
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
```

- [ ] **Step 2: `tests/storage.test.js` の期待値を新しい形にする**

`loadState` と `loadHistory` が返す記録は `videoId` の代わりに `kind: 'youtube'` と `id` を持つ。次のとおり置き換える。

1. `test('旧形式の状態をそのまま読み込める', ...)` の期待値:
```js
  assert.deepEqual(loadState(withRaw(state)), { kind: 'youtube', id: ID, a: 12.3, b: 18.7, rate: 0.85, markers: [] });
```
2. `test('範囲外の速度は初期値に戻し、以前の助走の値は捨てる', ...)` の期待値:
```js
  assert.deepEqual(loadState(withRaw({ videoId: ID, a: null, b: null, rate: 3, preroll: 7 })), {
    kind: 'youtube',
    id: ID,
    a: null,
    b: null,
    rate: 1,
    markers: [],
  });
```
3. `const historyEntry = ...` を次にする:
```js
const historyEntry = { kind: 'youtube', id: ID, title: '曲', a: 1, b: 2, rate: 0.9, markers: [1.5], openedAt: 1000 };
```
4. `test('履歴がなく旧形式の状態があれば、...')` の期待値:
```js
    { kind: 'youtube', id: ID, a: 3, b: 4, rate: 0.75, markers: [], title: '', openedAt: 5000 },
```

- [ ] **Step 3: テストが失敗することを確認する**

Run: `npm test`
Expected: FAIL(`does not provide an export named 'fileId'` など。history と storage のテスト)

- [ ] **Step 4: `history.js` を書き換える**

```js
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
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `npm test`
Expected: history / storage のテストはすべて PASS。`tests/version.test.js` の版番号のテストは `history.js` の中身が変わったので FAIL のまま(Step 6 で直す)

- [ ] **Step 6: 版番号を書き込み、全体のテストを通す**

Run: `npm run stamp && npm test`
Expected: すべて PASS(`# fail 0`)

注意: この時点で `app.js` はまだ `openVideo` を読み込んでいるので、ブラウザでは動かない。Task 5 で直す。Task 1〜4 は `main` に push しない。

- [ ] **Step 7: コミットする**

```bash
git add history.js tests/history.test.js tests/storage.test.js index.html
git commit -m "feat: 履歴をkind/id形式にし、音声ファイルの記録を扱えるようにする"
```

---

### Task 2: `waveform.js`(波形の計算と描画)

**Files:**
- Create: `waveform.js`
- Test: `tests/waveform.test.js`

**Interfaces:**
- Consumes: なし
- Produces:
  - `DEFAULT_BUCKETS = 2000`
  - `computePeaks(channels: Float32Array[] | number[][], buckets: number): number[]` — 長さ `buckets`、各値 0〜1
  - `decodePeaks(blob: Blob, buckets = DEFAULT_BUCKETS): Promise<number[]>`(ブラウザ専用)
  - `drawWaveform(canvas, peaks, { from, to, duration, colorAt, barWidth = 3, gap = 1 })`(ブラウザ専用。`colorAt(t)` は秒 → CSS の色の文字列)

- [ ] **Step 1: 失敗するテストを書く**

`tests/waveform.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePeaks } from '../waveform.js';

test('computePeaks: 区間ごとの振幅の最大値(絶対値)を、全体の最大値で割って 0〜1 にする', () => {
  assert.deepEqual(computePeaks([[0, 0.5, -1, 0.25]], 2), [0.5, 1]);
});

test('computePeaks: 複数チャンネルはその区間の全チャンネルの最大値を使う', () => {
  assert.deepEqual(computePeaks([[0.25, 0.5], [-1, 0.125]], 2), [1, 0.5]);
});

test('computePeaks: 無音なら 0 のまま', () => {
  assert.deepEqual(computePeaks([[0, 0, 0, 0]], 2), [0, 0]);
});

test('computePeaks: 音声が分割数より短くても、分割数ぶんの値を返す', () => {
  assert.deepEqual(computePeaks([[0.5, -1]], 4), [0.5, 0.5, 1, 1]);
});

test('computePeaks: 音声がなければ 0 の並び', () => {
  assert.deepEqual(computePeaks([], 3), [0, 0, 0]);
  assert.deepEqual(computePeaks([[]], 3), [0, 0, 0]);
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm test`
Expected: FAIL(`Cannot find module '.../waveform.js'`)

- [ ] **Step 3: `waveform.js` を実装する**

```js
// 音声ファイルの波形。計算(computePeaks)は純粋な関数で、解析と描画はブラウザで行う。
export const DEFAULT_BUCKETS = 2000;

// 音声データを buckets 個に分け、各区間の全チャンネルの振幅の最大値(絶対値)を、全体の最大値で割った 0〜1 の値にする
export function computePeaks(channels, buckets) {
  const peaks = new Array(buckets).fill(0);
  const length = channels[0]?.length ?? 0;
  if (!length) return peaks;
  for (let i = 0; i < buckets; i++) {
    const start = Math.floor((i * length) / buckets);
    const end = Math.max(start + 1, Math.floor(((i + 1) * length) / buckets));
    let max = 0;
    for (const channel of channels) {
      for (let j = start; j < end && j < length; j++) {
        const v = Math.abs(channel[j]);
        if (v > max) max = v;
      }
    }
    peaks[i] = max;
  }
  const top = peaks.reduce((m, v) => (v > m ? v : m), 0);
  return top > 0 ? peaks.map((v) => v / top) : peaks;
}

// 音声ファイルを解析して波形の値を作る(ブラウザ専用)
export async function decodePeaks(blob, buckets = DEFAULT_BUCKETS) {
  const Context = window.AudioContext || window.webkitAudioContext;
  const context = new Context();
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
    return computePeaks(channels, buckets);
  } finally {
    context.close?.();
  }
}

// from〜to 秒の範囲の波形を、縦棒の並びで canvas に描く(ブラウザ専用)。棒の色は colorAt(その棒の中央の秒) で決める
export function drawWaveform(canvas, peaks, { from, to, duration, colorAt, barWidth = 3, gap = 1 }) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height || !duration || to <= from) return;
  const ratio = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  const context = canvas.getContext('2d');
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  const bars = Math.max(1, Math.floor(width / (barWidth + gap)));
  for (let i = 0; i < bars; i++) {
    const t0 = from + ((to - from) * i) / bars;
    const t1 = from + ((to - from) * (i + 1)) / bars;
    const p0 = Math.max(0, Math.floor((t0 / duration) * peaks.length));
    const p1 = Math.min(peaks.length, Math.max(p0 + 1, Math.ceil((t1 / duration) * peaks.length)));
    let v = 0;
    for (let j = p0; j < p1; j++) if (peaks[j] > v) v = peaks[j];
    const h = Math.max(1, v * height * 0.92);
    context.fillStyle = colorAt((t0 + t1) / 2);
    context.fillRect(i * (barWidth + gap), (height - h) / 2, barWidth, h);
  }
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm test`
Expected: waveform のテストは PASS。版番号のテストは FAIL(Task 4 で `waveform.js` を対象に足すまで)。その他は PASS

- [ ] **Step 5: コミットする**

```bash
git add waveform.js tests/waveform.test.js
git commit -m "feat: 音声の波形を計算・描画するwaveform.jsを追加"
```

---

### Task 3: `media-store.js`(ファイルと波形の保存)

**Files:**
- Create: `media-store.js`
- Test: `tests/media-store.test.js`

**Interfaces:**
- Consumes: なし
- Produces:
  - `STORE_LIMIT_BYTES = 1024 ** 3`
  - `pickEvictions(files: { id, size, lastOpenedAt }[], limitBytes, keepId): string[]`(純粋)
  - `findOrphans(storedIds: string[], historyIds: string[]): string[]`(純粋)
  - IndexedDB(ブラウザ専用、すべて Promise。失敗時は reject):
    - `putFile({ id, name, type, size, blob, lastOpenedAt })`
    - `getFile(id) → record | undefined`
    - `listFiles() → { id, size, lastOpenedAt }[]`
    - `putPeaks(id, peaks)` / `getPeaks(id) → number[] | null`
    - `deleteMedia(id)`(ファイルと波形の両方)

- [ ] **Step 1: 失敗するテストを書く**

`tests/media-store.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findOrphans, pickEvictions } from '../media-store.js';

const file = (id, size, lastOpenedAt) => ({ id, size, lastOpenedAt });

test('pickEvictions: 上限以内なら何も消さない', () => {
  assert.deepEqual(pickEvictions([file('a', 40, 1), file('b', 60, 2)], 100, 'b'), []);
});

test('pickEvictions: 上限を超えたら、最後に開いた日時が古いものから上限以内になるまで消す', () => {
  const files = [file('new', 50, 30), file('old', 50, 10), file('mid', 50, 20)];
  assert.deepEqual(pickEvictions(files, 100, 'new'), ['old']);
  assert.deepEqual(pickEvictions(files, 60, 'new'), ['old', 'mid']);
});

test('pickEvictions: 今開いたファイルは古くても消さない', () => {
  const files = [file('keep', 80, 1), file('other', 80, 2)];
  assert.deepEqual(pickEvictions(files, 100, 'keep'), ['other']);
});

test('findOrphans: 履歴にない保存データだけを返す', () => {
  assert.deepEqual(findOrphans(['f:1', 'f:2', 'f:3'], ['f:2', 'abcdefghijk']), ['f:1', 'f:3']);
  assert.deepEqual(findOrphans([], ['f:1']), []);
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm test`
Expected: FAIL(`Cannot find module '.../media-store.js'`)

- [ ] **Step 3: `media-store.js` を実装する**

```js
// 音声ファイルの中身と波形を、ブラウザのデータベース(IndexedDB)に保存する。
// どの関数も失敗したら reject するので、呼ぶ側で「保存できなかった」として扱う。
export const STORE_LIMIT_BYTES = 1024 ** 3;

const DB_NAME = 'yt-practice-player';
const DB_VERSION = 1;

// 合計が上限を超えていたら、最後に開いた日時が古いものから消す(keepId は消さない)。消すものの id を返す
export function pickEvictions(files, limitBytes, keepId) {
  let total = files.reduce((sum, f) => sum + f.size, 0);
  const evict = [];
  for (const f of [...files].sort((x, y) => x.lastOpenedAt - y.lastOpenedAt)) {
    if (total <= limitBytes) break;
    if (f.id === keepId) continue;
    evict.push(f.id);
    total -= f.size;
  }
  return evict;
}

// 保存データのうち、履歴に記録がないもの
export function findOrphans(storedIds, historyIds) {
  const keep = new Set(historyIds);
  return storedIds.filter((id) => !keep.has(id));
}

let dbPromise = null;

function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('peaks')) db.createObjectStore('peaks', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  // 開けなかったときは、次に呼ばれたときにもう一度試す
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

const done = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

async function store(name, mode = 'readonly') {
  const db = await openDb();
  return db.transaction(name, mode).objectStore(name);
}

export async function putFile(record) {
  await done((await store('files', 'readwrite')).put(record));
}

export async function getFile(id) {
  return done((await store('files')).get(id));
}

export async function listFiles() {
  const records = await done((await store('files')).getAll());
  return records.map(({ id, size, lastOpenedAt }) => ({ id, size, lastOpenedAt }));
}

export async function putPeaks(id, peaks) {
  await done((await store('peaks', 'readwrite')).put({ id, peaks }));
}

export async function getPeaks(id) {
  const record = await done((await store('peaks')).get(id));
  return record?.peaks ?? null;
}

export async function deleteMedia(id) {
  const db = await openDb();
  const tx = db.transaction(['files', 'peaks'], 'readwrite');
  tx.objectStore('files').delete(id);
  tx.objectStore('peaks').delete(id);
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm test`
Expected: media-store のテストは PASS。版番号のテストは FAIL(Task 4 で直す)。その他は PASS

- [ ] **Step 5: コミットする**

```bash
git add media-store.js tests/media-store.test.js
git commit -m "feat: 音声ファイルと波形をIndexedDBに保存するmedia-store.jsを追加"
```

---

### Task 4: `audio-player.js` と版番号の対象追加

**Files:**
- Create: `audio-player.js`
- Modify: `tools/stamp-version.mjs`、`index.html`(import map)

**Interfaces:**
- Consumes: `player.js` の `PLAYER_STATE`
- Produces(`audio-player.js`):
  - `createAudioPlayer({ onStateChange(state: number) }) → AudioPlayer`
  - `AudioPlayer`: `load(blob): Promise<void>`(読み込めなければ reject。自動再生しない)、`play()`、`pause()`、`isPlaying()`、`time()`、`duration()`(不明なら 0)、`seek(seconds)`、`setRate(rate)`、`title()`(常に `''`)
  - 状態の通知は `PLAYER_STATE.PLAYING` / `PAUSED` / `BUFFERING` / `ENDED`

- [ ] **Step 1: `audio-player.js` を書く**

```js
// 音声ファイルのプレーヤー。ブラウザ標準の audio 要素で再生し、YouTube 用の player.js と同じ操作の形にする。
import { PLAYER_STATE } from './player.js';

export function createAudioPlayer({ onStateChange }) {
  const audio = new Audio();
  audio.preload = 'auto';
  // 速度を落としても音程を保つ(古い Safari 向けの名前も設定する)
  audio.preservesPitch = true;
  audio.webkitPreservesPitch = true;
  let url = null;

  audio.addEventListener('playing', () => onStateChange(PLAYER_STATE.PLAYING));
  audio.addEventListener('waiting', () => onStateChange(PLAYER_STATE.BUFFERING));
  audio.addEventListener('pause', () => {
    if (!audio.ended) onStateChange(PLAYER_STATE.PAUSED);
  });
  audio.addEventListener('ended', () => onStateChange(PLAYER_STATE.ENDED));

  return {
    load(blob) {
      audio.pause();
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(blob);
      audio.src = url;
      return new Promise((resolve, reject) => {
        const finish = (ok) => {
          audio.removeEventListener('loadedmetadata', onLoaded);
          audio.removeEventListener('error', onError);
          if (ok) resolve();
          else reject(new Error('この音声は再生できません'));
        };
        const onLoaded = () => finish(true);
        const onError = () => finish(false);
        audio.addEventListener('loadedmetadata', onLoaded);
        audio.addEventListener('error', onError);
        audio.load();
      });
    },
    play: () => audio.play().catch(() => {}),
    pause: () => audio.pause(),
    isPlaying: () => !audio.paused && !audio.ended,
    time: () => audio.currentTime || 0,
    duration: () => (Number.isFinite(audio.duration) ? audio.duration : 0),
    seek: (seconds) => {
      audio.currentTime = seconds;
    },
    setRate: (rate) => {
      audio.playbackRate = rate;
    },
    title: () => '',
  };
}
```

- [ ] **Step 2: 版番号の対象に新しいモジュールを足す**

`tools/stamp-version.mjs` の `MODULES` を次にする:

```js
export const MODULES = [
  'audio-player.js',
  'history.js',
  'keys.js',
  'loop.js',
  'media-store.js',
  'player.js',
  'sections.js',
  'storage.js',
  'waveform.js',
];
```

`index.html` の import map を次にする(`?v=` の値は Step 3 で書き込まれる):

```html
<script type="importmap">
{
  "imports": {
    "./audio-player.js": "./audio-player.js?v=0",
    "./history.js": "./history.js?v=0",
    "./keys.js": "./keys.js?v=0",
    "./loop.js": "./loop.js?v=0",
    "./media-store.js": "./media-store.js?v=0",
    "./player.js": "./player.js?v=0",
    "./sections.js": "./sections.js?v=0",
    "./storage.js": "./storage.js?v=0",
    "./waveform.js": "./waveform.js?v=0"
  }
}
</script>
```

- [ ] **Step 3: 版番号を書き込み、テストを通す**

Run: `npm run stamp && npm test`
Expected: すべて PASS(`# fail 0`)。`node --check audio-player.js` も成功する

- [ ] **Step 4: コミットする**

```bash
git add audio-player.js tools/stamp-version.mjs index.html
git commit -m "feat: 音声ファイル用のaudio-player.jsを追加し、版番号の対象に新しいモジュールを足す"
```

---

### Task 5: 画面と流れの組み込み

**Files:**
- Modify: `app.js`、`index.html`、`style.css`
- Create: `tools/make-test-wav.mjs`

**Interfaces:**
- Consumes: Task 1〜4 の Produces すべて
- Produces: なし(画面の完成)

- [ ] **Step 1: `index.html` に部品を足す**

1. アイコンの `<svg>` の中(`i-help` の次)に追加:
```html
  <symbol id="i-music" viewBox="0 0 24 24"><path d="M9 18.5V6.4l10-2.3v12.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="6.5" cy="18.5" r="2.6" fill="currentColor"/><circle cx="16.5" cy="16.3" r="2.6" fill="currentColor"/></symbol>
```
2. `<div id="toast" ...></div>` の次に追加:
```html
<div id="drop-overlay" class="drop-overlay" hidden>ここにドロップして開く</div>
<input type="file" id="file-input" accept="audio/*,.mp3,.wav,.m4a,.aac" hidden>
```
3. URL 欄の `history-open` ボタンの直前に追加:
```html
    <button type="button" id="file-open" class="icon-button tinted" aria-label="音声ファイルを開く" title="音声ファイルを開く(MP3 / WAV)"><svg><use href="#i-music"/></svg></button>
```
4. `<div class="video"><div id="player"></div></div>` を次に置き換える:
```html
  <div id="video" class="video">
    <div id="player"></div>
    <!-- 音声ファイルのときに、動画の代わりに曲全体の波形を出す -->
    <div id="wave-view" class="wave-view" hidden>
      <div id="wave-plot" class="wave-plot" title="タップ・スライドでその位置へ移動">
        <canvas id="wave-canvas"></canvas>
        <div id="wave-head" class="wave-head" hidden></div>
      </div>
      <p id="wave-status" class="wave-status" hidden></p>
      <div class="wave-info"><span id="wave-title"></span><span id="wave-duration"></span></div>
    </div>
  </div>
```
5. ループバーの `<div id="lb-track" ...>` の直後(`lb-ticks` の前)に追加:
```html
        <canvas id="lb-wave" class="lb-wave" hidden></canvas>
```

- [ ] **Step 2: `style.css` を足す**

1. `:root` の `--sec-10: #00c7be;` の次に追加:
```css
  --wave-dim: rgba(60, 60, 67, 0.22);
  --wave-strong: rgba(60, 60, 67, 0.4);
```
2. ダークモードの `--sec-10: #63e6e2;` の次に追加:
```css
    --wave-dim: rgba(235, 235, 245, 0.2);
    --wave-strong: rgba(235, 235, 245, 0.4);
```
3. `.video iframe, #player { ... }` の次に追加:
```css
/* 音声ファイルのときは YouTube の枠を隠し、曲全体の波形を出す */
.video { position: relative; }
.video.file-mode #player { display: none; }
.wave-view { position: absolute; inset: 0; background: var(--group); }
.wave-plot { position: absolute; inset: 14px 14px 44px; touch-action: none; cursor: pointer; }
.wave-plot canvas { display: block; width: 100%; height: 100%; }
.wave-head { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: var(--label); border-radius: 1px; pointer-events: none; }
.wave-status { position: absolute; inset: 0 0 30px; display: grid; place-items: center; margin: 0; font-size: 15px; color: var(--secondary); pointer-events: none; }
.wave-info {
  position: absolute;
  right: 16px;
  bottom: 12px;
  left: 16px;
  display: flex;
  gap: 12px;
  justify-content: space-between;
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}
.wave-info span:first-child { overflow: hidden; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.wave-info span:last-child { color: var(--secondary); }
/* ループバーの背景の拡大波形 */
.lb-wave { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
/* PC でファイルをドラッグしている間の表示 */
.drop-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  font-size: 22px;
  font-weight: 600;
  color: var(--tint);
  background: color-mix(in srgb, var(--tint) 14%, transparent);
  border: 3px dashed var(--tint);
  pointer-events: none;
}
```

- [ ] **Step 3: `app.js` を書き換える**

次の置き換えを順に行う(`old` → `new`)。

1. import(23〜26 行目付近)。`old`:
```js
import { PLAYER_STATE, createPlayer, isPlayingState } from './player.js';
import { openVideo, removeEntry, updateEntry } from './history.js';
```
`new`:
```js
import { PLAYER_STATE, createPlayer, isPlayingState } from './player.js';
import { createAudioPlayer } from './audio-player.js';
import { fileId, openMedia, removeEntry, titleFromFileName, updateEntry } from './history.js';
import { STORE_LIMIT_BYTES, deleteMedia, findOrphans, getFile, getPeaks, listFiles, pickEvictions, putFile, putPeaks } from './media-store.js';
import { decodePeaks, drawWaveform } from './waveform.js';
```

2. 定数。`old`:
```js
const ERROR_MESSAGES = { 100: '動画が見つかりません', 101: EMBED_BLOCKED, 150: EMBED_BLOCKED };
```
`new`:
```js
const ERROR_MESSAGES = { 100: '動画が見つかりません', 101: EMBED_BLOCKED, 150: EMBED_BLOCKED };
const YT_FAILED = 'YouTube のプレーヤーを読み込めませんでした。ネット接続を確認して、ページを開き直してください';
```

3. 状態。`old`:
```js
// selected: ループしている区間の番号(null なら A-B 全体)
const state = { videoId: null, range: EMPTY_RANGE, rate: DEFAULT_RATE, markers: [], selected: null };
let history = [];
let player = null;
```
`new`:
```js
// kind: 'youtube' | 'file'、id: 動画 ID かファイルの識別子。selected: ループしている区間の番号(null なら A-B 全体)
const state = { kind: 'youtube', id: null, range: EMPTY_RANGE, rate: DEFAULT_RATE, markers: [], selected: null };
let history = [];
let ytPlayer = null; // YouTube(読み込みに失敗したら null のまま)
let ytFailed = false;
let audioPlayer = null; // 音声ファイル
let player = null; // 今使っているほう
// 今の音声ファイルの波形(0〜1 の配列)。YouTube のときや計算前は null。peaksVersion は描き直しの判定用
let peaks = null;
let peaksVersion = 0;
let waveKey = '';
let lbWaveKey = '';
```

4. `persist`。`old`:
```js
  const { videoId, range, rate, markers } = state;
  if (!videoId) return;
  history = updateEntry(history, videoId, { a: range.a, b: range.b, rate, markers });
```
`new`:
```js
  const { id, range, rate, markers } = state;
  if (!id) return;
  history = updateEntry(history, id, { a: range.a, b: range.b, rate, markers });
```

5. `renderHistory` の中。`old`:
```js
    open.dataset.videoId = entry.videoId;
    const title = document.createElement('span');
    title.className = 'history-title';
    title.textContent = entry.title || entry.videoId;
```
`new`:
```js
    open.dataset.id = entry.id;
    const title = document.createElement('span');
    title.className = 'history-title';
    title.textContent = `${entry.kind === 'file' ? '♪ ' : ''}${entry.title || entry.id}`;
```
同じ関数の `old`:
```js
    remove.dataset.remove = entry.videoId;
    remove.setAttribute('aria-label', `${entry.title || entry.videoId} を履歴から消す`);
```
`new`:
```js
    remove.dataset.remove = entry.id;
    remove.setAttribute('aria-label', `${entry.title || entry.id} を履歴から消す`);
```

6. `renderSections` の中。`old`:
```js
  $('marker-add').disabled = !state.videoId;
```
`new`:
```js
  $('marker-add').disabled = !state.id;
```

7. `renderPosition` の先頭。`old`:
```js
  $('time').textContent = formatTime(time);
  $('duration').textContent = formatClock(duration);
```
`new`:
```js
  $('time').textContent = formatTime(time);
  $('duration').textContent = formatClock(duration);
  renderWave(time, duration);
```

8. `renderLoopbar` の中。`old`:
```js
  renderBands(range, percent);
  renderTicks(view);
```
`new`:
```js
  renderLoopbarWave(view, duration);
  renderBands(range, percent);
  renderTicks(view);
```

9. `// ループバーの区間: ...` のコメントの直前に、波形の描画を追加:
```js
// CSS 変数(区間の色など)を、canvas で使える色の文字列にする
function cssColor(value) {
  const match = /^var\((--[\w-]+)\)$/.exec(value);
  return match ? getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim() : value;
}

const isDark = () => matchMedia('(prefers-color-scheme: dark)').matches;

// 大きな波形の棒の色: 選んでいる区間 → その区間の色、A-B の中 → アクセント色、外 → 薄い灰色
function waveColorAt(range) {
  const tint = cssColor('var(--tint)');
  const dim = cssColor('var(--wave-dim)');
  const section = state.selected == null || loopDrag ? null : activeRange();
  const sectionTint = section ? cssColor(sectionColor(state.selected)) : null;
  return (t) => {
    if (section && t >= section.a && t <= section.b) return sectionTint;
    if (range.a != null && range.b != null && t >= range.a && t <= range.b) return tint;
    return dim;
  };
}

// 音声ファイルのときだけ: 動画の枠のところに曲全体の波形を描く。色が変わるときだけ描き直す
function renderWave(time, duration) {
  if (state.kind !== 'file') return;
  $('wave-duration').textContent = duration ? formatClock(duration) : '';
  $('wave-head').hidden = !duration;
  if (duration) $('wave-head').style.left = `${(time / duration) * 100}%`;
  if (!peaks || !duration) return;
  const canvas = $('wave-canvas');
  const range = loopDrag ? loopDrag.range : state.range;
  const key = [peaksVersion, canvas.clientWidth, canvas.clientHeight, duration, range.a, range.b, state.selected, state.markers.join(), loopDrag != null, isDark()].join('|');
  if (key === waveKey) return;
  waveKey = key;
  drawWaveform(canvas, peaks, { from: 0, to: duration, duration, colorAt: waveColorAt(range) });
}

// ループバーの背景に、表示範囲の波形を拡大して描く
function renderLoopbarWave(view, duration) {
  const canvas = $('lb-wave');
  canvas.hidden = state.kind !== 'file' || !peaks;
  if (canvas.hidden) return;
  const key = [peaksVersion, canvas.clientWidth, canvas.clientHeight, view.start, view.end, isDark()].join('|');
  if (key === lbWaveKey) return;
  lbWaveKey = key;
  const color = cssColor('var(--wave-strong)');
  drawWaveform(canvas, peaks, { from: view.start, to: view.end, duration, colorAt: () => color, barWidth: 2, gap: 1 });
}

function setWaveStatus(text) {
  $('wave-status').hidden = !text;
  $('wave-status').textContent = text ?? '';
}

```

10. `applyEntry` と `loadVideo` を置き換える。`old`:
```js
function applyEntry(entry) {
  state.videoId = entry.videoId;
  state.range = { a: entry.a, b: entry.b };
  state.rate = entry.rate;
  state.markers = entry.markers;
  state.selected = null; // どの区間を選んでいたかは保存しない
  $('url').value = `https://youtu.be/${entry.videoId}`;
}

function loadVideo(videoId) {
  const opened = openVideo(history, videoId, Date.now());
  history = opened.history;
  saveHistory(storage, history);
  // 履歴にある動画なら前回の A/B・速度・区切りを戻す。初めての動画なら初期設定(前の動画の A/B は持ち込まない)
  applyEntry(opened.entry);
  player.load(videoId);
  player.setRate(state.rate);
  renderControls();
  renderPosition();
  renderHistory();
}
```
`new`:
```js
function applyEntry(entry) {
  state.kind = entry.kind;
  state.id = entry.id;
  state.range = { a: entry.a, b: entry.b };
  state.rate = entry.rate;
  state.markers = entry.markers;
  state.selected = null; // どの区間を選んでいたかは保存しない
  $('url').value = entry.kind === 'youtube' ? `https://youtu.be/${entry.id}` : '';
  $('wave-title').textContent = entry.kind === 'file' ? entry.title : '';
}

function renderAll() {
  renderControls();
  renderPosition();
  renderHistory();
}

// 開いたものを履歴の先頭に入れ、前回の A/B・速度・区切りを戻す(初めてなら初期設定)。押し出された音声ファイルの保存データは消す
function commitOpened(ref) {
  const opened = openMedia(history, ref, Date.now());
  history = opened.history;
  saveHistory(storage, history);
  for (const dropped of opened.dropped) {
    if (dropped.kind === 'file') deleteMedia(dropped.id).catch(() => {});
  }
  applyEntry(opened.entry);
}

function setPlayingUi(playing) {
  $('play').classList.toggle('playing', playing);
  $('play').setAttribute('aria-label', playing ? '一時停止' : '再生');
}

// 使うプレーヤーと表示(YouTube の枠 / 曲全体の波形)を切り替える。切り替える前のほうは止める
function activate(kind) {
  const next = kind === 'file' ? audioPlayer : (ytPlayer ?? audioPlayer);
  if (player && player !== next) player.pause();
  player = next;
  $('video').classList.toggle('file-mode', kind === 'file');
  $('wave-view').hidden = kind !== 'file';
  if (kind !== 'file') {
    peaks = null;
    peaksVersion++;
  }
  setPlayingUi(false);
}

function openYouTube(videoId) {
  if (!ytPlayer) {
    showToast(ytFailed ? YT_FAILED : 'プレーヤーを準備中です。少し待ってからもう一度押してください');
    return;
  }
  activate('youtube');
  commitOpened({ kind: 'youtube', id: videoId });
  ytPlayer.load(videoId);
  ytPlayer.setRate(state.rate);
  renderAll();
}

// 音声ファイルを開く。blob は選んだ / ドロップした File か、保存データの Blob。save なら保存もする
async function openAudio({ id, title, blob, save }) {
  try {
    await audioPlayer.load(blob);
  } catch {
    showToast('このファイルは再生できません');
    return false;
  }
  activate('file');
  commitOpened({ kind: 'file', id, title });
  audioPlayer.setRate(state.rate);
  renderAll();
  if (save) storeFile(id, blob, title);
  else touchStoredFile(id);
  loadPeaks(id, blob);
  return true;
}

function openPickedFile(file) {
  return openAudio({ id: fileId(file), title: titleFromFileName(file.name), blob: file, save: true });
}

async function openStoredFile(id) {
  let record = null;
  try {
    record = await getFile(id);
  } catch {
    record = null;
  }
  if (!record) {
    showToast('ファイルが見つかりません。♪ からもう一度選んでください');
    return false;
  }
  return openAudio({ id, title: titleFromFileName(record.name), blob: record.blob, save: false });
}

// 保存して、合計が上限を超えたら古いものから消す(履歴の記録は残す)
async function storeFile(id, blob, title) {
  try {
    await putFile({ id, name: blob.name ?? title, type: blob.type, size: blob.size, blob, lastOpenedAt: Date.now() });
    const evict = pickEvictions(await listFiles(), STORE_LIMIT_BYTES, id);
    await Promise.all(evict.map((x) => deleteMedia(x)));
  } catch {
    showToast('ブラウザに保存できなかったため、次回は選び直しが必要です');
  }
}

async function touchStoredFile(id) {
  try {
    const record = await getFile(id);
    if (record) await putFile({ ...record, lastOpenedAt: Date.now() });
  } catch {
    // 開いた日時の更新に失敗しても練習の邪魔はしない
  }
}

// 波形: 保存済みならそれを使い、なければ計算して保存する。計算中に別のものを開いたら、結果は使わない
async function loadPeaks(id, blob) {
  peaks = null;
  peaksVersion++;
  setWaveStatus('波形を作成中…');
  let result = null;
  try {
    result = await getPeaks(id);
  } catch {
    result = null;
  }
  if (!result) {
    try {
      result = await decodePeaks(blob);
    } catch {
      if (state.id === id) setWaveStatus('波形を表示できません');
      return;
    }
    putPeaks(id, result).catch(() => {});
  }
  if (state.id !== id) return;
  peaks = result;
  peaksVersion++;
  setWaveStatus(null);
  renderPosition();
}

// 起動時に、履歴に記録がない保存データを消す
async function removeOrphanFiles() {
  try {
    const stored = (await listFiles()).map((f) => f.id);
    const inHistory = history.filter((e) => e.kind === 'file').map((e) => e.id);
    await Promise.all(findOrphans(stored, inHistory).map((id) => deleteMedia(id)));
  } catch {
    // 保存先が使えないときは何もしない
  }
}

function openFromHistory(id) {
  const entry = history.find((e) => e.id === id);
  if (!entry) return;
  if (entry.kind === 'file') openStoredFile(id);
  else openYouTube(id);
}
```

11. `captureTitle` を置き換える。`old`:
```js
function captureTitle() {
  if (!player || !state.videoId) return;
  const title = player.title(state.videoId);
  const entry = history.find((e) => e.videoId === state.videoId);
  if (!title || !entry || entry.title === title) return;
  history = updateEntry(history, state.videoId, { title });
```
`new`:
```js
function captureTitle() {
  if (!ytPlayer || state.kind !== 'youtube' || !state.id) return;
  const title = ytPlayer.title(state.id);
  const entry = history.find((e) => e.id === state.id);
  if (!title || !entry || entry.title === title) return;
  history = updateEntry(history, state.id, { title });
```

12. `handleStateChange` の中。`old`:
```js
  const playing = isPlayingState(playerState);
  $('play').classList.toggle('playing', playing);
  $('play').setAttribute('aria-label', playing ? '一時停止' : '再生');
```
`new`:
```js
  setPlayingUi(isPlayingState(playerState));
```

13. `handleLoadSubmit` を置き換える。`old`:
```js
  e.preventDefault(); // プレーヤーの準備前でも、フォーム送信でページを再読み込みさせない
  if (!player) {
    showToast('プレーヤーを準備中です。少し待ってからもう一度押してください');
    return;
  }
  const videoId = parseVideoId($('url').value);
  if (!videoId) {
    showToast('URL を確認してください');
    return;
  }
  $('url').blur();
  loadVideo(videoId);
```
`new`:
```js
  e.preventDefault(); // プレーヤーの準備前でも、フォーム送信でページを再読み込みさせない
  const videoId = parseVideoId($('url').value);
  if (!videoId) {
    showToast('URL を確認してください');
    return;
  }
  $('url').blur();
  openYouTube(videoId);
```

14. `setAHere` / `setBHere` / `addMarkerHere` の `if (!state.videoId) return;`(3 か所)をすべて `if (!state.id) return;` にする。

15. `bindControls` の履歴一覧のクリック。`old`:
```js
    const remove = e.target.closest('[data-remove]');
    if (remove) {
      history = removeEntry(history, remove.dataset.remove);
      saveHistory(storage, history);
      renderHistory();
      return;
    }
    const item = e.target.closest('[data-video-id]');
    if (item) {
      $('history').hidden = true;
      loadVideo(item.dataset.videoId);
    }
```
`new`:
```js
    const remove = e.target.closest('[data-remove]');
    if (remove) {
      const id = remove.dataset.remove;
      const entry = history.find((x) => x.id === id);
      history = removeEntry(history, id);
      saveHistory(storage, history);
      if (entry?.kind === 'file') deleteMedia(id).catch(() => {}); // 保存した中身と波形も消す
      renderHistory();
      return;
    }
    const item = e.target.closest('[data-id]');
    if (item) {
      $('history').hidden = true;
      openFromHistory(item.dataset.id);
    }
```

16. `bindControls` の最後。`old`:
```js
  bindSeekDrag();
  bindLoopbar();
  bindKeyboard();
}
```
`new`:
```js
  $('file-open').addEventListener('click', () => $('file-input').click());
  $('file-input').addEventListener('change', () => {
    const file = $('file-input').files[0];
    $('file-input').value = ''; // 同じファイルをもう一度選んでも change が起きるように
    if (file) openPickedFile(file);
  });

  bindSeekDrag();
  bindLoopbar();
  bindKeyboard();
  bindDrop();
}

// PC: ファイルをページにドラッグ & ドロップして開く
function bindDrop() {
  const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
  document.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    $('drop-overlay').hidden = false;
  });
  document.addEventListener('dragleave', (e) => {
    if (e.relatedTarget == null) $('drop-overlay').hidden = true; // ウィンドウの外に出たとき
  });
  document.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    $('drop-overlay').hidden = true;
    const file = e.dataTransfer.files[0];
    if (file) openPickedFile(file);
  });
}
```

17. ループバーのバーのスライド(`bindLoopbar` の後半)を、共通の `bindScrub` に置き換える。`old`(`// バー(つまみ以外)を指でスライドすると、` から `bindLoopbar` の終わりの `}` の直前まで):
```js
  // バー(つまみ以外)を指でスライドすると、再生位置の線と時刻だけが指についてきて、離した位置へ移動する(タップでも移動)。
  // 移動先は A-B の範囲に収める
  let scrubView = null;
  const scrubTimeAt = (clientX) => clampToLoop(timeAt(clientX, scrubView), state.range);
  track.addEventListener('pointerdown', (e) => {
    scrubView = loopWindow(state.range, player.duration());
    if (!scrubView) return;
    track.setPointerCapture(e.pointerId);
    dragTime = scrubTimeAt(e.clientX);
    renderPosition();
  });
  track.addEventListener('pointermove', (e) => {
    if (!scrubView) return;
    dragTime = scrubTimeAt(e.clientX);
    renderPosition();
  });
  track.addEventListener('pointerup', () => {
    if (!scrubView) return;
    player.seek(dragTime);
    lastJumpAt = performance.now();
    dragTime = null;
    scrubView = null;
  });
  track.addEventListener('pointercancel', () => {
    dragTime = null;
    scrubView = null;
  });
}
```
`new`:
```js
  // バー(つまみ以外)をタップ・スライドすると、その位置へ移動する。移動先は A-B の範囲に収める
  bindScrub(track, (clientX) => {
    const view = loopWindow(state.range, player.duration());
    return view ? clampToLoop(timeAt(clientX, view), state.range) : null;
  });
}
```

18. `bindSeekDrag` を置き換える。`old`(`// 再生バー: 指を置いてスライドしている間は` から `bindSeekDrag` の終わりの `}` まで)を、`new`:
```js
// 指を置いてスライドしている間は再生位置の表示だけ動かし、離した位置へ移動する(タップでも移動)。
// timeAt(clientX) は移動先の秒。null を返すとき(動画の長さが不明など)は何もしない
function bindScrub(element, timeAt) {
  element.addEventListener('pointerdown', (e) => {
    const t = timeAt(e.clientX);
    if (t == null) return;
    element.setPointerCapture(e.pointerId);
    dragTime = t;
    renderPosition();
  });
  element.addEventListener('pointermove', (e) => {
    if (dragTime == null || !element.hasPointerCapture(e.pointerId)) return;
    dragTime = timeAt(e.clientX) ?? dragTime;
    renderPosition();
  });
  element.addEventListener('pointerup', () => {
    if (dragTime == null) return;
    player.seek(dragTime);
    lastJumpAt = performance.now();
    dragTime = null;
  });
  element.addEventListener('pointercancel', () => {
    dragTime = null;
  });
}

// 動画(曲)全体を表すバーでの移動先
function wholeTimeAt(element) {
  return (clientX) => {
    const duration = player.duration();
    if (!duration) return null;
    const rect = element.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * duration;
  };
}

// 上の再生バーと、音声ファイルの大きな波形
function bindSeekDrag() {
  bindScrub($('seek'), wholeTimeAt($('seek')));
  bindScrub($('wave-plot'), wholeTimeAt($('wave-plot')));
}
```

19. `main` を置き換える。`old`(`async function main() {` から `main();` の直前の `}` まで)を、`new`:
```js
async function main() {
  history = loadHistory(storage, Date.now());
  saveHistory(storage, history); // 旧形式から引き継いだときに、新しい形式で保存し直しておく
  // 使っていないほうのプレーヤーの通知は無視する
  audioPlayer = createAudioPlayer({
    onStateChange: (s) => {
      if (player === audioPlayer) handleStateChange(s);
    },
  });
  player = audioPlayer;
  if (history[0]) applyEntry(history[0]); // 最後に開いたものを、その設定ごと戻す
  renderControls();
  renderHistory();
  $('load-form').addEventListener('submit', handleLoadSubmit);
  // URL を貼り付けたら、「開く」を押さなくてもすぐ読み込む
  $('url').addEventListener('paste', () => {
    setTimeout(() => {
      const videoId = parseVideoId($('url').value);
      if (ytPlayer && videoId) {
        $('url').blur();
        openYouTube(videoId);
      }
    });
  });
  // ヘルプはプレーヤーの準備を待たずに開けるようにする
  $('help-open').addEventListener('click', () => {
    $('help').hidden = false;
  });
  $('url-clear').addEventListener('click', () => {
    $('url').value = '';
    $('url').focus(); // すぐ貼り付けられるように
  });
  bindControls();
  setInterval(tick, TICK_MS);
  removeOrphanFiles();
  if (state.kind === 'file') openStoredFile(state.id); // 復元時は自動再生しない

  try {
    ytPlayer = await createPlayer('player', {
      onError: handleError,
      onStateChange: (s) => {
        if (player === ytPlayer) handleStateChange(s);
      },
    });
  } catch {
    ytFailed = true;
    if (state.kind === 'youtube') showToast(YT_FAILED);
    return;
  }
  if (state.kind === 'youtube') {
    activate('youtube');
    if (state.id) ytPlayer.load(state.id); // 復元時は自動再生しない
  }
}
```

20. 使わなくなった import がないことを確認する: `openVideo` が残っていない、`loadVideo` が残っていない。

- [ ] **Step 4: 版番号を書き込み、テストと構文を確認する**

Run: `npm run stamp && npm test && node --check app.js && grep -n "videoId\|loadVideo\|openVideo" app.js`
Expected: テストはすべて PASS、`node --check` は成功。grep は `parseVideoId` と `videoId` を引数名に使う行(`openYouTube(videoId)` や貼り付け処理)だけで、`state.videoId` / `loadVideo` / `openVideo` は出ない

- [ ] **Step 5: 確認用の WAV を作るスクリプトを書く**

`tools/make-test-wav.mjs`:

```js
// 確認用の WAV を作る: 30 秒・22.05kHz・モノラル。1 秒ごとに音の頭があり、4 秒ごとに音量が変わるので波形で区切りが見える。
// 使い方: node tools/make-test-wav.mjs <出力先>
import { writeFileSync } from 'node:fs';

const out = process.argv[2];
if (!out) throw new Error('出力先を指定してください');
const rate = 22050;
const seconds = 30;
const n = rate * seconds;
const data = Buffer.alloc(44 + n * 2);
data.write('RIFF', 0);
data.writeUInt32LE(36 + n * 2, 4);
data.write('WAVE', 8);
data.write('fmt ', 12);
data.writeUInt32LE(16, 16);
data.writeUInt16LE(1, 20); // PCM
data.writeUInt16LE(1, 22); // モノラル
data.writeUInt32LE(rate, 24);
data.writeUInt32LE(rate * 2, 28);
data.writeUInt16LE(2, 32);
data.writeUInt16LE(16, 34);
data.write('data', 36);
data.writeUInt32LE(n * 2, 40);
for (let i = 0; i < n; i++) {
  const t = i / rate;
  const beat = t % 1;
  const envelope = beat < 0.5 ? 1 - beat * 2 : 0.1;
  const loudness = Math.floor(t / 4) % 2 ? 0.9 : 0.45;
  const sample = Math.sin(2 * Math.PI * 440 * t) * envelope * loudness;
  data.writeInt16LE(Math.round(sample * 32767), 44 + i * 2);
}
writeFileSync(out, data);
```

Run: `node tools/make-test-wav.mjs .superpowers/test-beats.wav && file .superpowers/test-beats.wav`
Expected: `RIFF (little-endian) data, WAVE audio, Microsoft PCM, 16 bit, mono 22050 Hz`

(`.superpowers/` は git の対象外なので、確認用の WAV はコミットされない)

- [ ] **Step 6: ブラウザで確認する**

Run(バックグラウンド): `python3 -m http.server 8000 --bind 127.0.0.1`

chrome-devtools MCP で `http://localhost:8000/` を開き、次を確認する。ファイルは `evaluate_script` で `fetch('/.superpowers/test-beats.wav')` → `new File([blob], 'test-beats.wav', { type: 'audio/wav', lastModified: 1 })` → `DataTransfer` で `#file-input` の `files` に入れて `change` を発火する。

1. 開く: 波形の枠に波形が描かれ、「test-beats」と「0:30」が表示される。YouTube の枠は隠れる。履歴の先頭に「♪ test-beats」が入る
2. 速度 80% で再生し、`time` が 2 秒で約 1.6 秒進む
3. A / B を設定 → 波形の A-B の範囲の棒が青になる。B を過ぎると A に戻る。区切りを 2 つ入れて区間 2 を選ぶと、その範囲の棒が緑になる
4. ループバーの背景に拡大波形が描かれ、区間の帯が重なっている
5. 大きな波形の上をスライド → 時刻と縦線がついてきて、離した位置へ移動する
6. ページを再読み込み → 音声ファイルが同じ設定で戻る(自動再生しない)。波形は保存済みのものですぐ出る
7. YouTube の URL を貼る → YouTube の枠に戻り、音声は止まっている。履歴から「♪ test-beats」を選ぶ → 音声ファイルに戻り、設定も戻る。行き来しても再生ボタンの表示が正しい(Review Focus 3)
8. 履歴で「♪ test-beats」を「削除」→ `indexedDB` の `files` / `peaks` から消える(`evaluate_script` で確認)
9. 再生できないファイル(中身が `hello` の `bad.mp3`)を開く →「このファイルは再生できません」。履歴に入らない
10. 波形の計算に失敗するケース: 再生はできるが解析できないファイルは用意しにくいので、`evaluate_script` で `AudioContext.prototype.decodeAudioData` を一時的に reject するよう差し替えてから、新しいファイル(lastModified を変えた test-beats.wav)を開く →「波形を表示できません」と出て、再生はできる(Review Focus 4)
11. YouTube の読み込み失敗: `navigate_page` の `initScript` で `onYouTubeIframeAPIReady` を潰して開き直す → 10 秒後に YouTube のメッセージが出ても、♪ から音声ファイルを開いて再生・ループできる(Review Focus 2)
12. `resize_page` / `emulate` で 390×844(スマホ縦)・820×1180(iPad 縦)・1180×820(iPad 横)・844×390(スマホ横)にして、音声ファイルのときにはみ出しがない(`scrollHeight == innerHeight`、`scrollWidth == innerWidth`)。ダークモードでも波形の色が見える
13. `list_console_messages` に、`favicon.ico` の 404 以外のエラーがない

どれかが期待どおりでなければ、superpowers:systematic-debugging で原因を調べて直し、このステップをやり直す。確認が終わったら配信を止める。

- [ ] **Step 7: コミットする**

```bash
git add app.js index.html style.css tools/make-test-wav.mjs
git commit -m "feat: 音声ファイル(MP3/WAV)の再生と波形表示を画面に組み込む"
```

---

### Task 6: 説明の更新と公開

**Files:**
- Modify: `README.md`、`index.html`(ヘルプ)、`docs/manual-check.md`、`docs/superpowers/specs/2026-10-04-youtube-practice-player-design.md`

**Interfaces:**
- Consumes: Task 1〜5
- Produces: 公開(`https://pnpk.github.io/youtube-player/`)

- [ ] **Step 1: アプリ内のヘルプに追記する**

`index.html` のヘルプの `<section>` のうち「履歴」の直前に、次の節を追加する:

```html
      <section>
        <h3>音声ファイル(MP3 / WAV)</h3>
        <ul class="group help-text">
          <li>URL 欄の右の <span class="help-icon"><svg><use href="#i-music"/></svg></span> で、手持ちの音声ファイルを開けます(iPad では「ファイル」アプリから選べます。PC ではページにドラッグ & ドロップしても開けます)。</li>
          <li>動画の枠のところに曲全体の波形が出ます。A-B の範囲は青、選んだ区間はその区間の色になります。波形をタップ・スライドするとその位置へ移動します。ループバーの背景にも拡大した波形が出ます。</li>
          <li>開いたファイルはこのブラウザの中に保存され(合計 1GB まで。超えたら古いものから消えます)、履歴(♪ 付き)から選ぶだけで開けます。消えていたら、同じファイルを ♪ から選び直すと前回の設定が戻ります。</li>
          <li>速度を落としても音程は変わりません。</li>
        </ul>
      </section>
```

ヘルプの「ボタン」の一覧の `<li>`(履歴の行)の直前に追加:

```html
          <li><span class="help-icon"><svg><use href="#i-music"/></svg></span><span>音声ファイル(MP3 / WAV)を開く</span></li>
```

- [ ] **Step 2: README に追記する**

`README.md` の「## 履歴」の直前に、次の節を追加する:

```markdown
## 音声ファイル(MP3 / WAV)

手持ちの音声ファイルでも、YouTube と同じように練習できます。

- URL 欄の右の **♪** でファイルを選びます(iPad では「ファイル」アプリから。PC ではページにドラッグ & ドロップしても開けます)
- 動画の枠のところに**曲全体の波形**が出ます。A-B の範囲は青、選んだ区間はその区間の色になり、波形をタップ・スライドするとその位置へ移動します。ループバーの背景にも拡大した波形が出ます
- 開いたファイルはこのブラウザの中に保存され(合計 1GB まで。超えたら最後に開いたのが古いものから消えます)、履歴(♪ 付き)から選ぶだけで開けます。消えていたら、同じファイルを ♪ から選び直すと前回の設定が戻ります
- 履歴から「削除」すると、保存したファイルと波形も消えます
- 速度を落としても音程は変わりません
- MP3・WAV のほか、ブラウザが対応している形式(M4A など)も開けます
```

`README.md` の「ボタン」の表の「再生バー」の行の直前に追加:

```markdown
| ♪(URL 欄の右) | 音声ファイル(MP3 / WAV)を開く |
```

`README.md` の開発メモのファイル一覧の表に追加(`player.js` の行の次):

```markdown
| `audio-player.js` | 音声ファイルのプレーヤー(`player.js` と同じ操作の形) |
| `waveform.js` | 波形の計算と描画 |
| `media-store.js` | 音声ファイルと波形の保存(IndexedDB) |
```

`README.md` の「履歴」の節の「履歴はその端末のブラウザの中だけに保存されます。」の段落を次に置き換える:

```markdown
履歴と音声ファイルは、その端末のブラウザの中だけに保存されます。ほかの端末とは共有されず、ブラウザのデータを消すと消えます。Safari では、しばらく(7 日ほど)このページを開かないと保存データが消えることがあります。
```

- [ ] **Step 3: チェックリストと元の設計書に追記する**

`docs/manual-check.md` の「## ヘルプ(2026-10-05 追加)」の直前に追加:

```markdown
## 音声ファイル(2026-10-05 追加)
- [ ] iPad で ♪ から「ファイル」アプリの MP3 を選ぶと開き、曲全体の波形が出る
- [ ] 速度を 70% にしても音程が変わらない
- [ ] A-B・区切り・ループバーが YouTube のときと同じように使え、波形の色が A-B・区間に合わせて変わる
- [ ] 大きな波形とループバーを指でスライドして再生位置を動かせる
- [ ] Safari を閉じて開き直すと、最後の音声ファイルが同じ設定で戻る(自動再生しない)
- [ ] 履歴の「♪」の記録から開ける。YouTube と行き来しても正しく切り替わる
- [ ] 履歴から「削除」したあと、もう一度 ♪ から選ぶと初期設定で開く(保存データも消えている)
- [ ] PC でファイルをドラッグ & ドロップして開ける
```

`docs/superpowers/specs/2026-10-04-youtube-practice-player-design.md` の「## 3. スコープ」の直前に追加:

```markdown
> 2026-10-05: 音声ファイル(MP3 / WAV)対応を追加した。詳細は `docs/superpowers/specs/2026-10-05-audio-file-support-design.md`。履歴の形式は `kind` / `id` に変わっている。
```

- [ ] **Step 4: テストを通し、コミットして公開する**

Run: `npm run stamp && npm test`
Expected: すべて PASS

```bash
git add README.md index.html docs
git commit -m "docs: 音声ファイル対応の使い方をヘルプ・README・チェックリストに追記"
git push origin main
```

Run: `gh api repos/pnpk/youtube-player/pages/builds/latest -q '.status + " " + .commit[0:7]'`
Expected: `built <HEAD の 7 文字>`(`building` なら 20 秒ほど待って再実行)

Run: `curl -s https://pnpk.github.io/youtube-player/ | grep -c 'id="file-open"'`
Expected: `1`

- [ ] **Step 5: ユーザーに iPad での確認を依頼する(ここで止まって返事を待つ)**

`docs/manual-check.md` の「音声ファイル」の節を iPad で確認してもらう。うまくいかない項目は superpowers:systematic-debugging で調べて直す。
