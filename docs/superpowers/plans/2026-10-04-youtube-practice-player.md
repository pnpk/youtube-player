# YouTube 練習プレーヤー Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** YouTube 動画を A-B 区間ループ・スロー再生・助走付きで練習できる、スマホ / iPad / PC 対応の Web アプリ(PWA)を作り、GitHub Pages で公開する。

**Architecture:** ビルドなしの静的サイト。YouTube IFrame Player API で動画を埋め込み、50ms ごとに再生位置を監視して B を過ぎたら `A − 助走` へ `seekTo` する。計算ロジックは依存のない `loop.js` に集めて `node --test` でテストし、`player.js`(YouTube の薄いラッパー)・`storage.js`(状態の保存と復元)・`app.js`(画面とのつなぎ)に分ける。

**Tech Stack:** HTML / CSS / JavaScript(ES Modules)、YouTube IFrame Player API、Node.js 26 の標準テストランナー(`node --test`)、GitHub Pages(`gh` CLI で作成)

**Spec:** `docs/superpowers/specs/2026-10-04-youtube-practice-player-design.md`

## Global Constraints

- フレームワーク・ビルドツール・npm の依存パッケージは使わない。ブラウザ側は ES Modules をそのまま読み込む
- 自動テストは `node --test` のみ(追加パッケージなし)
- 速度: 50〜100%、5% 刻み。初期値 100%
- 助走: 0 / 1 / 2 / 3 秒。初期値 1 秒
- A/B の微調整: ±0.1 秒。A と B の間隔は最低 0.1 秒。A は 0 以上、B は動画の長さ以下
- 3 秒戻る: `max(0, 現在位置 − 3)`
- ループ監視: 50ms ごと。戻り先は `max(0, A − 助走)`
- ボタンの高さ: 56px 以上
- レイアウト: 横長(幅 > 高さ)かつ幅 700px 以上 → 2 カラム(右に操作ボタン 5 段)/ それ以外で幅 600px 以上 → 1 カラム・A と B を 1 段に並べた 4 段 / 幅 600px 未満 → 1 カラム・A と B を別の段にした 5 段
- 表示する文言(仕様書どおり):
  - 「URL を確認してください」
  - 「この動画は埋め込み再生が許可されていません(YouTube アプリで見てください)」(エラー 101 / 150)
  - 「動画が見つかりません」(エラー 100)
  - 「再生できませんでした(エラー番号)」(その他。`再生できませんでした(エラー 5)` のように番号を入れる)
  - 「A より後ろで押してください」
- 状態の保存・復元の失敗は表示しない。初期状態で起動する。復元時は自動再生しない
- 広告をプログラムでブロック・スキップする処理は作らない
- リポジトリは公開(`youtube-player`)。秘密情報は含めない
- GitHub の MCP サーバーは接続に失敗しているため、GitHub 操作は `gh` CLI で行う(アカウント `pnpk` でログイン済み)

## Review Focus

1. **URL のバリエーション**: 共有ボタンからコピーした URL には `?si=…`、`&t=42s`、`&list=…` が付き、`m.` / `music.` のドメインや `https://` なしで貼られることもある → どれも動画 ID を取り出せること(Task 2 のテストで固定)
2. **小数の誤差の蓄積**: ±0.1 秒や ±5% を何十回も押すと `0.8999999` のような値になる → 何回押しても 0.01 単位のきれいな値に戻り、50% / 100% の端でボタンが正しく止まること(Task 2 のテストで固定)
3. **壊れた・古い保存データ**: `localStorage` に不正な JSON、範囲外の速度(3 など)、B < A、不正な動画 ID が入っている、または `localStorage` 自体が例外を投げる(プライベートブラウズ)→ 落ちずに、使える項目だけ復元して起動すること(Task 3 のテストで固定)
4. **別の動画を読み込んだときの A/B**: 前の動画の A/B が残っていると、新しい動画で関係ない位置にループしてしまう → 読み込み時に A/B を消すこと(Task 4 の手動確認で固定)
5. **動画の終端付近に B を置いた場合**: 50ms の監視より先に動画が終わる(ENDED)と、ループせずに止まる → ENDED のときもループ中なら A の助走位置へ戻って再生を続けること(実装は Task 4 の `handleStateChange`、確認は Task 5 のチェックリストで固定)

---

## ファイル構成

| ファイル | 役割 | 作成するタスク |
|---|---|---|
| `tools/make-icons.mjs` | ホーム画面用アイコン(PNG)を生成するスクリプト | Task 1 |
| `icons/icon-180.png` / `icons/icon-512.png` | アイコン | Task 1 |
| `manifest.webmanifest` | ホーム画面に追加したときの名前・アイコン・全画面表示 | Task 1 |
| `index.html` | Task 1 では広告確認用の最小ページ、Task 4 で本番の画面に置き換える | Task 1, 4 |
| `package.json` | `"type": "module"` と `npm test` の定義だけ | Task 2 |
| `loop.js` / `tests/loop.test.js` | A/B・助走・速度・URL 解析の純粋関数 | Task 2 |
| `storage.js` / `tests/storage.test.js` | 状態の保存と復元 | Task 3 |
| `player.js` | `YT.Player` の薄いラッパー | Task 4 |
| `style.css` | 3 種類のレイアウト | Task 4 |
| `app.js` | ボタン・監視ループ・画面更新 | Task 4 |
| `docs/manual-check.md` | 実機での確認チェックリスト | Task 5 |

---

### Task 1: 最小ページを GitHub Pages に公開し、ホーム画面起動時の広告を確認する

仕様書 8 章のリスク確認。結果によって使い方(ホーム画面から起動するか、Safari のブックマークから開くか)が決まるので最初に行う。

**Files:**
- Create: `tools/make-icons.mjs`
- Create: `icons/icon-180.png`, `icons/icon-512.png`(スクリプトで生成)
- Create: `manifest.webmanifest`
- Create: `index.html`(最小版)

**Interfaces:**
- Consumes: なし
- Produces: `manifest.webmanifest` と `icons/icon-180.png`(Task 4 の本番 `index.html` が `<link rel="manifest">` / `<link rel="apple-touch-icon">` で参照する)。公開 URL `https://pnpk.github.io/youtube-player/`

- [ ] **Step 1: アイコン生成スクリプトを書く**

`tools/make-icons.mjs`:

```js
// ホーム画面用アイコン(青地に白い再生マーク)を PNG で生成する。
// 依存パッケージなしで書くため、PNG のバイナリを直接組み立てる。
import { mkdirSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

const BG = [0x2f, 0x7d, 0xe1];
const FG = [0xff, 0xff, 0xff];

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

// 再生マークの三角形: 頂点 (0.36, 0.28) (0.36, 0.72) (0.72, 0.5)
function isPlayMark(x, y) {
  return x >= 0.36 && Math.abs(y - 0.5) <= (0.22 * (0.72 - x)) / 0.36;
}

function png(size) {
  const stride = size * 3 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // フィルタなし
    for (let x = 0; x < size; x++) {
      const [r, g, b] = isPlayMark(x / size, y / size) ? FG : BG;
      const i = y * stride + 1 + x * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // ビット深度
  header[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('icons', { recursive: true });
for (const size of [180, 512]) {
  writeFileSync(`icons/icon-${size}.png`, png(size));
}
```

- [ ] **Step 2: アイコンを生成して中身を確認する**

Run: `node tools/make-icons.mjs && file icons/*.png`
Expected:
```
icons/icon-180.png: PNG image data, 180 x 180, 8-bit/color RGB, non-interlaced
icons/icon-512.png: PNG image data, 512 x 512, 8-bit/color RGB, non-interlaced
```
さらに Read ツールで `icons/icon-512.png` を開き、青地に白い三角形が描かれていることを目で確認する。

- [ ] **Step 3: manifest を書く**

`manifest.webmanifest`:

```json
{
  "name": "練習プレーヤー",
  "short_name": "練習",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#111111",
  "theme_color": "#111111",
  "icons": [
    { "src": "icons/icon-180.png", "sizes": "180x180", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 4: 広告確認用の最小 `index.html` を書く**

`index.html`(Task 4 で置き換える):

```html
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="練習">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/icon-180.png">
<title>練習プレーヤー</title>
<style>
  body { margin: 16px; font-family: -apple-system, system-ui, sans-serif; background: #111; color: #eee; }
  form { display: flex; gap: 8px; }
  input { flex: 1; font-size: 16px; padding: 10px; }
  button { font-size: 16px; padding: 10px 16px; }
  #wrap { margin-top: 12px; aspect-ratio: 16 / 9; }
  #wrap iframe { width: 100%; height: 100%; }
</style>
</head>
<body>
<form id="f"><input id="url" placeholder="YouTube の URL を貼り付け" autocomplete="off"><button>読み込む</button></form>
<div id="wrap"><div id="player"></div></div>
<script>
  let player;
  window.onYouTubeIframeAPIReady = () => {
    player = new YT.Player('player', { playerVars: { playsinline: 1 } });
  };
  document.getElementById('f').addEventListener('submit', (e) => {
    e.preventDefault();
    const m = document.getElementById('url').value.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/);
    if (m && player) player.loadVideoById(m[1]);
  });
</script>
<script src="https://www.youtube.com/iframe_api"></script>
</body>
</html>
```

- [ ] **Step 5: コミットする**

```bash
git add tools/make-icons.mjs icons manifest.webmanifest index.html
git commit -m "feat: ホーム画面用アイコンとmanifest、広告確認用の最小ページを追加"
```

- [ ] **Step 6: GitHub にリポジトリを作って push する**

外部への公開になる操作。設計で合意済み(公開リポジトリ + GitHub Pages)なので実行してよい。

Run:
```bash
gh repo create youtube-player --public --source=. --remote=origin --push
```
Expected: `https://github.com/pnpk/youtube-player` が作成され、`main` が push される。

- [ ] **Step 7: GitHub Pages を有効にする**

Run:
```bash
gh api -X POST repos/pnpk/youtube-player/pages -f "source[branch]=main" -f "source[path]=/"
```
Expected: JSON に `"html_url": "https://pnpk.github.io/youtube-player/"` が含まれる。

- [ ] **Step 8: 公開されたことを確認する**

初回の公開には 1〜2 分かかる。

Run: `gh api repos/pnpk/youtube-player/pages/builds/latest -q .status`
Expected: `built`(`building` のときは 30 秒ほど待って再実行)

Run: `curl -s -o /dev/null -w "%{http_code}\n" https://pnpk.github.io/youtube-player/manifest.webmanifest`
Expected: `200`

- [ ] **Step 9: ユーザーに iPad で確認してもらう(ここで止まって返事を待つ)**

ユーザーに次を依頼する:
1. iPad の Safari で `https://pnpk.github.io/youtube-player/` を開き、共有ボタン →「ホーム画面に追加」
2. ホーム画面のアイコン「練習」から起動し、普段広告が入る動画を 2〜3 本再生して、広告が出るかを見る
3. 結果を教えてもらう

結果に応じた扱い:
- 広告が出ない → ホーム画面から起動する使い方にする
- 広告が出る → Safari のブックマーク(またはタブ)から開く使い方にする。実装内容は変わらないので、そのまま Task 2 へ進む。結果は Task 5 の `docs/manual-check.md` に記録する

---

### Task 2: `loop.js`(区間・速度・URL 解析の計算)

**Files:**
- Create: `package.json`
- Create: `loop.js`
- Test: `tests/loop.test.js`

**Interfaces:**
- Consumes: なし
- Produces(`loop.js` から export。時刻はすべて秒の `number`、区間は `{ a: number|null, b: number|null }`):
  - 定数: `MIN_GAP = 0.1`, `NUDGE = 0.1`, `RATE_MIN = 0.5`, `RATE_MAX = 1`, `RATE_STEP = 0.05`, `DEFAULT_RATE = 1`, `PREROLLS = [0, 1, 2, 3]`, `DEFAULT_PREROLL = 1`, `REWIND_SECONDS = 3`, `EMPTY_RANGE = { a: null, b: null }`(freeze 済み)
  - `parseVideoId(text: unknown): string | null`
  - `setA(range, time): range` — 常に新しい区間を返す
  - `setB(range, time): range | null` — 記録できないときは `null`
  - `nudgeA(range, delta): range` / `nudgeB(range, delta, duration): range` — 変更できないときは**引数の `range` をそのまま(同じオブジェクト)返す**
  - `shouldJump(time, range): boolean`
  - `loopTarget(a, preroll): number`
  - `stepRate(rate, direction: -1 | 1): number` — 範囲外になるときは `rate` をそのまま返す
  - `isValidRate(value: unknown): boolean`
  - `rewind(time, seconds = REWIND_SECONDS): number`

- [ ] **Step 1: `package.json` を書く**

```json
{
  "name": "youtube-player",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: 失敗するテストを書く**

`tests/loop.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_RANGE,
  parseVideoId,
  setA,
  setB,
  nudgeA,
  nudgeB,
  shouldJump,
  loopTarget,
  stepRate,
  isValidRate,
  rewind,
} from '../loop.js';

const ID = 'dQw4w9WgXcQ';

test('parseVideoId: 共有 URL などから動画 ID を取り出す', () => {
  const inputs = [
    ID,
    `  ${ID}  `,
    `https://www.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/watch?v=${ID}&t=42s&list=PL123`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}&si=abc`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=xyz&t=10`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube.com/live/${ID}?feature=share`,
    `youtube.com/watch?v=${ID}`,
  ];
  for (const input of inputs) assert.equal(parseVideoId(input), ID, input);
});

test('parseVideoId: 動画 ID を含まない入力は null', () => {
  const inputs = [
    '',
    '   ',
    'hello',
    `https://example.com/watch?v=${ID}`,
    'https://www.youtube.com/',
    'https://www.youtube.com/watch?v=short',
    null,
    undefined,
  ];
  for (const input of inputs) assert.equal(parseVideoId(input), null, String(input));
});

test('setA: 空の区間に A を記録する(0.01 秒単位に丸める)', () => {
  assert.deepEqual(setA(EMPTY_RANGE, 12.344), { a: 12.34, b: null });
});

test('setA: 負の時刻は 0 にする', () => {
  assert.deepEqual(setA(EMPTY_RANGE, -1), { a: 0, b: null });
});

test('setA: B との間隔が 0.1 秒以上なら B を残す', () => {
  assert.deepEqual(setA({ a: 1, b: 10 }, 5), { a: 5, b: 10 });
  assert.deepEqual(setA({ a: 1, b: 10 }, 9.9), { a: 9.9, b: 10 });
});

test('setA: B が A 以前になる、または間隔が 0.1 秒未満なら B を消す', () => {
  assert.deepEqual(setA({ a: 1, b: 10 }, 12), { a: 12, b: null });
  assert.deepEqual(setA({ a: 1, b: 10 }, 9.95), { a: 9.95, b: null });
});

test('setB: A が未設定なら null', () => {
  assert.equal(setB(EMPTY_RANGE, 8), null);
});

test('setB: A との間隔が 0.1 秒未満なら null', () => {
  assert.equal(setB({ a: 5, b: null }, 4), null);
  assert.equal(setB({ a: 5, b: null }, 5.05), null);
});

test('setB: A より 0.1 秒以上後ろなら B を記録する', () => {
  assert.deepEqual(setB({ a: 5, b: null }, 8.123), { a: 5, b: 8.12 });
  assert.deepEqual(setB({ a: 5, b: null }, 5.1), { a: 5, b: 5.1 });
  assert.deepEqual(setB({ a: 5, b: 9 }, 7), { a: 5, b: 7 });
});

test('nudgeA: 0.1 秒ずつ動かす', () => {
  assert.deepEqual(nudgeA({ a: 5, b: 8 }, 0.1), { a: 5.1, b: 8 });
  assert.deepEqual(nudgeA({ a: 5, b: 8 }, -0.1), { a: 4.9, b: 8 });
});

test('nudgeA: 0 より前には行かない', () => {
  assert.deepEqual(nudgeA({ a: 0.05, b: 8 }, -0.1), { a: 0, b: 8 });
});

test('nudgeA: B との間隔が 0.1 秒未満になる調整は無視して同じ区間を返す', () => {
  const range = { a: 7.9, b: 8 };
  assert.equal(nudgeA(range, 0.1), range);
});

test('nudgeA: A が未設定なら同じ区間を返す', () => {
  assert.equal(nudgeA(EMPTY_RANGE, 0.1), EMPTY_RANGE);
});

test('nudgeA: 何度押しても誤差が溜まらない', () => {
  let range = { a: 0, b: 100 };
  for (let i = 0; i < 30; i++) range = nudgeA(range, 0.1);
  assert.equal(range.a, 3);
  for (let i = 0; i < 30; i++) range = nudgeA(range, -0.1);
  assert.equal(range.a, 0);
});

test('nudgeB: 動画の長さより後ろには行かない', () => {
  assert.deepEqual(nudgeB({ a: 1, b: 9.95 }, 0.1, 10), { a: 1, b: 10 });
});

test('nudgeB: 動画の長さが不明(0)なら上限なしで動かす', () => {
  assert.deepEqual(nudgeB({ a: 1, b: 2 }, 0.1, 0), { a: 1, b: 2.1 });
});

test('nudgeB: A との間隔が 0.1 秒未満になる調整は無視して同じ区間を返す', () => {
  const range = { a: 5, b: 5.1 };
  assert.equal(nudgeB(range, -0.1, 60), range);
});

test('nudgeB: B が未設定なら同じ区間を返す', () => {
  const range = { a: 5, b: null };
  assert.equal(nudgeB(range, 0.1, 60), range);
});

test('shouldJump: A と B が揃っていて B 以上のときだけ true', () => {
  assert.equal(shouldJump(10, EMPTY_RANGE), false);
  assert.equal(shouldJump(10, { a: 5, b: null }), false);
  assert.equal(shouldJump(7.99, { a: 5, b: 8 }), false);
  assert.equal(shouldJump(8, { a: 5, b: 8 }), true);
  assert.equal(shouldJump(9, { a: 5, b: 8 }), true);
});

test('loopTarget: A から助走ぶん手前。0 より前には行かない', () => {
  assert.equal(loopTarget(10, 1), 9);
  assert.equal(loopTarget(10, 0), 10);
  assert.equal(loopTarget(0.5, 2), 0);
  assert.equal(loopTarget(3.3, 1), 2.3);
});

test('stepRate: 5% ずつ変え、50〜100% の外には出ない', () => {
  assert.equal(stepRate(1, -1), 0.95);
  assert.equal(stepRate(0.85, 1), 0.9);
  assert.equal(stepRate(1, 1), 1);
  assert.equal(stepRate(0.5, -1), 0.5);
});

test('stepRate: 端から端まで押しても誤差が溜まらない', () => {
  const down = [];
  let rate = 1;
  for (let i = 0; i < 12; i++) down.push((rate = stepRate(rate, -1)));
  assert.deepEqual(down, [0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 0.5, 0.5]);
  for (let i = 0; i < 12; i++) rate = stepRate(rate, 1);
  assert.equal(rate, 1);
});

test('isValidRate: 50〜100% の 5% 刻みだけを許す', () => {
  for (const ok of [0.5, 0.55, 0.85, 1]) assert.equal(isValidRate(ok), true, String(ok));
  for (const ng of [0.45, 1.05, 0.83, Number.NaN, '0.85', null]) assert.equal(isValidRate(ng), false, String(ng));
});

test('rewind: 3 秒戻す。0 より前には行かない', () => {
  assert.equal(rewind(10), 7);
  assert.equal(rewind(2), 0);
  assert.equal(rewind(10, 5), 5);
});
```

- [ ] **Step 3: テストが失敗することを確認する**

Run: `npm test`
Expected: FAIL(`Cannot find module '.../loop.js'`)

- [ ] **Step 4: `loop.js` を実装する**

```js
// 区間ループ・速度・URL 解析の計算。YouTube にもブラウザにも依存しない。
// 時刻は秒。区間は { a, b }(未設定は null)。

export const MIN_GAP = 0.1;
export const NUDGE = 0.1;
export const RATE_MIN = 0.5;
export const RATE_MAX = 1;
export const RATE_STEP = 0.05;
export const DEFAULT_RATE = 1;
export const PREROLLS = [0, 1, 2, 3];
export const DEFAULT_PREROLL = 1;
export const REWIND_SECONDS = 3;
export const EMPTY_RANGE = Object.freeze({ a: null, b: null });

const VIDEO_ID = /^[\w-]{11}$/;
const EPSILON = 1e-9;

// ±0.1 や ±5% を繰り返しても誤差が溜まらないよう、0.01 単位に丸める
const round2 = (x) => Math.round(x * 100) / 100;
const gapOk = (a, b) => round2(b - a) >= MIN_GAP - EPSILON;

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

export function loopTarget(a, preroll) {
  return round2(Math.max(0, a - preroll));
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
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `npm test`
Expected: すべて PASS(`# fail 0`)

- [ ] **Step 6: コミットする**

```bash
git add package.json loop.js tests/loop.test.js
git commit -m "feat: 区間ループ・速度・URL解析の計算ロジックを追加"
```

---

### Task 3: `storage.js`(状態の保存と復元)

**Files:**
- Create: `storage.js`
- Test: `tests/storage.test.js`

**Interfaces:**
- Consumes(`loop.js`): `parseVideoId`, `setB`, `isValidRate`, `PREROLLS`, `DEFAULT_RATE`, `DEFAULT_PREROLL`
- Produces(`storage.js` から export):
  - `STORAGE_KEY = 'yt-practice-player:v1'`
  - `saveState(storage: Storage | null, state: { videoId, a, b, rate, preroll }): void` — 例外を外に出さない
  - `loadState(storage: Storage | null): { videoId: string, a: number|null, b: number|null, rate: number, preroll: number } | null` — 例外を外に出さない。動画 ID が不正なら `null`、それ以外の不正な項目は初期値か `null` に置き換える

- [ ] **Step 1: 失敗するテストを書く**

`tests/storage.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEY, loadState, saveState } from '../storage.js';

const ID = 'dQw4w9WgXcQ';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value);
    },
  };
}

const throwingStorage = {
  getItem() {
    throw new Error('denied');
  },
  setItem() {
    throw new Error('denied');
  },
};

const withRaw = (value) => memoryStorage({ [STORAGE_KEY]: typeof value === 'string' ? value : JSON.stringify(value) });

test('保存した状態をそのまま復元できる', () => {
  const storage = memoryStorage();
  const state = { videoId: ID, a: 12.3, b: 18.7, rate: 0.85, preroll: 2 };
  saveState(storage, state);
  assert.deepEqual(loadState(storage), state);
});

test('何も保存されていなければ null', () => {
  assert.equal(loadState(memoryStorage()), null);
});

test('storage が使えない(null / 例外)ときは null を返し、保存しても例外を出さない', () => {
  assert.equal(loadState(null), null);
  assert.equal(loadState(throwingStorage), null);
  assert.doesNotThrow(() => saveState(null, { videoId: ID, a: null, b: null, rate: 1, preroll: 1 }));
  assert.doesNotThrow(() => saveState(throwingStorage, { videoId: ID, a: null, b: null, rate: 1, preroll: 1 }));
});

test('壊れた JSON は null', () => {
  assert.equal(loadState(withRaw('{not json')), null);
  assert.equal(loadState(withRaw('null')), null);
  assert.equal(loadState(withRaw('"text"')), null);
});

test('動画 ID が不正なら null', () => {
  assert.equal(loadState(withRaw({ videoId: 'short', a: 1, b: 2, rate: 1, preroll: 1 })), null);
  assert.equal(loadState(withRaw({ videoId: 123, a: 1, b: 2, rate: 1, preroll: 1 })), null);
});

test('範囲外の速度と助走は初期値に戻す', () => {
  assert.deepEqual(loadState(withRaw({ videoId: ID, a: null, b: null, rate: 3, preroll: 7 })), {
    videoId: ID,
    a: null,
    b: null,
    rate: 1,
    preroll: 1,
  });
});

test('不正な A は A と B の両方を消す', () => {
  for (const a of [-1, '5', Number.NaN, null]) {
    const loaded = loadState(withRaw({ videoId: ID, a, b: 8, rate: 1, preroll: 1 }));
    assert.equal(loaded.a, null, String(a));
    assert.equal(loaded.b, null, String(a));
  }
});

test('A との間隔が 0.1 秒未満の B や、数値でない B は消す', () => {
  for (const b of [4, 5.05, '8', null]) {
    const loaded = loadState(withRaw({ videoId: ID, a: 5, b, rate: 1, preroll: 1 }));
    assert.equal(loaded.a, 5, String(b));
    assert.equal(loaded.b, null, String(b));
  }
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm test`
Expected: FAIL(`Cannot find module '.../storage.js'`)

- [ ] **Step 3: `storage.js` を実装する**

```js
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
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm test`
Expected: すべて PASS(`# fail 0`、loop と storage の両方)

- [ ] **Step 5: コミットする**

```bash
git add storage.js tests/storage.test.js
git commit -m "feat: 最後の状態の保存と復元を追加"
```

---

### Task 4: 本番の画面(`player.js` / `style.css` / `app.js` / `index.html`)

**Files:**
- Create: `player.js`
- Create: `style.css`
- Create: `app.js`
- Modify: `index.html`(Task 1 の最小版をすべて置き換える)

**Interfaces:**
- Consumes:
  - `loop.js`: `EMPTY_RANGE`, `NUDGE`, `RATE_MIN`, `RATE_MAX`, `DEFAULT_RATE`, `DEFAULT_PREROLL`, `parseVideoId`, `setA`, `setB`, `nudgeA`, `nudgeB`, `shouldJump`, `loopTarget`, `stepRate`, `rewind`
  - `storage.js`: `loadState(storage)`, `saveState(storage, state)`
  - Task 1: `manifest.webmanifest`, `icons/icon-180.png`
- Produces(`player.js` から export):
  - `PLAYER_STATE = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 }`
  - `createPlayer(elementId: string, { onError(code: number), onStateChange(state: number) }): Promise<Player>`
  - `Player`: `load(videoId)`(自動再生しない)、`play()`、`pause()`、`isPlaying(): boolean`、`time(): number`、`duration(): number`(不明なら 0)、`seek(seconds)`、`setRate(rate)`

- [ ] **Step 1: `player.js` を書く**

```js
// YouTube IFrame Player API の薄いラッパー。
// API の読み込み完了は index.html の window.ytReady(Promise)で受け取る。

export const PLAYER_STATE = Object.freeze({ ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 });

export async function createPlayer(elementId, { onError, onStateChange }) {
  await window.ytReady;
  return new Promise((resolve) => {
    const yt = new YT.Player(elementId, {
      playerVars: { playsinline: 1, rel: 0, origin: location.origin },
      events: {
        onReady: () => resolve(api),
        onError: (e) => onError(e.data),
        onStateChange: (e) => onStateChange(e.data),
      },
    });
    const api = {
      load: (videoId) => yt.cueVideoById(videoId),
      play: () => yt.playVideo(),
      pause: () => yt.pauseVideo(),
      isPlaying: () => yt.getPlayerState() === PLAYER_STATE.PLAYING,
      time: () => yt.getCurrentTime() || 0,
      duration: () => yt.getDuration() || 0,
      seek: (seconds) => yt.seekTo(seconds, true),
      setRate: (rate) => yt.setPlaybackRate(rate),
    };
  });
}
```

- [ ] **Step 2: `index.html` を本番の画面に置き換える**

```html
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black">
<meta name="apple-mobile-web-app-title" content="練習">
<meta name="theme-color" content="#111111">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/icon-180.png">
<link rel="stylesheet" href="style.css">
<title>練習プレーヤー</title>
</head>
<body>
<div id="toast" class="toast" role="status" hidden></div>

<section class="media">
  <form id="load-form" class="load-form">
    <input id="url" type="text" inputmode="url" placeholder="YouTube の URL を貼り付け" autocomplete="off" autocapitalize="off" spellcheck="false">
    <button type="submit">読み込む</button>
  </form>
  <div class="video"><div id="player"></div></div>
  <div class="seek-row">
    <div id="seek" class="seek">
      <div id="seek-range" class="seek-range" hidden></div>
      <div id="seek-head" class="seek-head"></div>
    </div>
    <button id="clear-loop" class="clear" aria-label="ループ解除" hidden>×</button>
  </div>
  <div class="readout"><span id="time">0:00.0</span><span id="ab-label">A — / B —</span></div>
</section>

<main class="controls">
  <div class="row row-transport">
    <button id="rewind">⟲ 3秒</button>
    <button id="play" class="play" aria-label="再生/一時停止">▶</button>
    <button id="to-a">A に戻る</button>
  </div>
  <div class="row row-a">
    <button id="set-a" class="ab">A</button>
    <button id="a-minus">−0.1</button>
    <button id="a-plus">+0.1</button>
  </div>
  <div class="row row-b">
    <button id="set-b" class="ab">B</button>
    <button id="b-minus">−0.1</button>
    <button id="b-plus">+0.1</button>
  </div>
  <div class="row row-rate">
    <button id="rate-down">−5%</button>
    <div id="rate-value" class="rate-value">100%</div>
    <button id="rate-up">+5%</button>
  </div>
  <div class="row row-preroll">
    <span class="label">助走</span>
    <button data-preroll="0">0s</button>
    <button data-preroll="1">1s</button>
    <button data-preroll="2">2s</button>
    <button data-preroll="3">3s</button>
  </div>
</main>

<script>window.ytReady = new Promise((resolve) => { window.onYouTubeIframeAPIReady = resolve; });</script>
<script src="https://www.youtube.com/iframe_api"></script>
<script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 3: `style.css` を書く(3 種類のレイアウト)**

```css
:root {
  --bg: #111;
  --panel: #1e1e1e;
  --btn: #333;
  --btn-active: #4a4a4a;
  --text: #f2f2f2;
  --muted: #9a9a9a;
  --accent: #2f7de1;
  --ab: #e1a32f;
  --error: #c0262d;
  --gap: 10px;
  --btn-min: 56px;
}

* { box-sizing: border-box; }
[hidden] { display: none !important; }

html, body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, system-ui, sans-serif;
  -webkit-tap-highlight-color: transparent;
}

/* 既定: スマホ縦(幅 600px 未満)。1 カラム、操作ボタン 5 段 */
body {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  gap: var(--gap);
  padding: calc(env(safe-area-inset-top) + 10px) calc(env(safe-area-inset-right) + 12px)
    calc(env(safe-area-inset-bottom) + 12px) calc(env(safe-area-inset-left) + 12px);
}

button {
  font: inherit;
  font-size: 20px;
  color: var(--text);
  background: var(--btn);
  border: 0;
  border-radius: 14px;
  min-height: var(--btn-min);
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
}
button:active { background: var(--btn-active); }
button:disabled { opacity: 0.35; }
button[aria-pressed="true"] { background: var(--text); color: var(--bg); }

.media { display: flex; flex-direction: column; gap: var(--gap); }

.load-form { display: flex; gap: 8px; }
.load-form input {
  flex: 1;
  min-width: 0;
  min-height: 48px;
  padding: 0 12px;
  font-size: 16px; /* 16px 未満だと iOS が入力時にズームする */
  color: var(--text);
  background: #000;
  border: 1px solid #444;
  border-radius: 10px;
}
.load-form button { min-height: 48px; padding: 0 16px; font-size: 16px; }

.video { width: 100%; aspect-ratio: 16 / 9; background: #000; border-radius: 10px; overflow: hidden; }
.video iframe, #player { display: block; width: 100%; height: 100%; }

.seek-row { display: flex; align-items: center; gap: 8px; }
.seek { position: relative; flex: 1; height: 28px; background: #2a2a2a; border-radius: 8px; overflow: hidden; }
.seek-range { position: absolute; top: 0; bottom: 0; background: var(--accent); opacity: 0.7; }
.seek-head { position: absolute; top: 0; bottom: 0; left: 0; width: 3px; background: #fff; }
.clear { min-height: 44px; min-width: 44px; font-size: 22px; }

.readout {
  display: flex;
  justify-content: space-between;
  color: var(--muted);
  font-size: 18px;
  font-variant-numeric: tabular-nums;
}

.controls {
  flex: 1;
  display: grid;
  gap: var(--gap);
  grid-auto-rows: minmax(var(--btn-min), 1fr);
  grid-template-areas: "transport" "a" "b" "rate" "preroll";
}
.row { display: grid; gap: var(--gap); }
.row-transport { grid-area: transport; grid-template-columns: 1fr 1.6fr 1fr; }
.row-a { grid-area: a; grid-template-columns: 1.2fr 1fr 1fr; }
.row-b { grid-area: b; grid-template-columns: 1.2fr 1fr 1fr; }
.row-rate { grid-area: rate; grid-template-columns: 1fr 1.2fr 1fr; }
.row-preroll { grid-area: preroll; grid-template-columns: auto repeat(4, 1fr); align-items: stretch; }
.row-preroll .label { display: flex; align-items: center; padding: 0 6px; color: var(--muted); }

.play { background: var(--accent); font-size: 28px; font-weight: 700; }
.ab { background: var(--ab); color: #111; font-size: 26px; font-weight: 800; }
.rate-value {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  font-weight: 700;
  background: var(--panel);
  border-radius: 14px;
  font-variant-numeric: tabular-nums;
}

.toast {
  position: fixed;
  top: calc(env(safe-area-inset-top) + 12px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  max-width: calc(100% - 32px);
  padding: 12px 18px;
  font-size: 17px;
  color: #fff;
  background: var(--error);
  border-radius: 12px;
}

/* iPad 縦など(幅 600px 以上): A と B を 1 段に並べて 4 段 */
@media (min-width: 600px) {
  .controls {
    grid-template-columns: 1fr 1fr;
    grid-template-areas: "transport transport" "a b" "rate rate" "preroll preroll";
  }
}

/* iPad 横・PC・スマホ横(横長かつ幅 700px 以上): 左に動画、右に操作ボタン 5 段 */
@media (orientation: landscape) and (min-width: 700px) {
  body {
    display: grid;
    grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
    align-items: stretch;
  }
  .media { justify-content: center; }
  /* 動画が画面の高さに収まるように幅を抑える(URL 欄・シークバー・時刻表示ぶんの 150px を引く) */
  .video { width: min(100%, calc((100dvh - 150px) * 16 / 9)); align-self: center; }
  .controls {
    grid-template-columns: 1fr;
    grid-template-areas: "transport" "a" "b" "rate" "preroll";
  }
}
```

- [ ] **Step 4: `app.js` を書く**

```js
import {
  DEFAULT_PREROLL,
  DEFAULT_RATE,
  EMPTY_RANGE,
  NUDGE,
  RATE_MAX,
  RATE_MIN,
  loopTarget,
  nudgeA,
  nudgeB,
  parseVideoId,
  rewind,
  setA,
  setB,
  shouldJump,
  stepRate,
} from './loop.js';
import { PLAYER_STATE, createPlayer } from './player.js';
import { loadState, saveState } from './storage.js';

const TICK_MS = 50;
// seekTo 直後は getCurrentTime が古い値を返すことがあり、二重に戻ると間が伸びるので少し待つ
const JUMP_GUARD_MS = 300;
const TOAST_MS = 3000;
const EMBED_BLOCKED = 'この動画は埋め込み再生が許可されていません(YouTube アプリで見てください)';
const ERROR_MESSAGES = { 100: '動画が見つかりません', 101: EMBED_BLOCKED, 150: EMBED_BLOCKED };

const $ = (id) => document.getElementById(id);
const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();

const state = { videoId: null, range: EMPTY_RANGE, rate: DEFAULT_RATE, preroll: DEFAULT_PREROLL };
let player = null;
let lastJumpAt = 0;
let toastTimer = 0;

function showToast(message) {
  const el = $('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, TOAST_MS);
}

function formatTime(t) {
  if (t == null) return '—';
  const m = Math.floor(t / 60);
  const s = (t - m * 60).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
}

function persist() {
  const { videoId, range, rate, preroll } = state;
  saveState(storage, { videoId, a: range.a, b: range.b, rate, preroll });
}

function renderControls() {
  const { a, b } = state.range;
  $('ab-label').textContent = `A ${formatTime(a)} / B ${formatTime(b)}`;
  $('clear-loop').hidden = a == null && b == null;
  $('rate-value').textContent = `${Math.round(state.rate * 100)}%`;
  $('rate-down').disabled = state.rate <= RATE_MIN;
  $('rate-up').disabled = state.rate >= RATE_MAX;
  for (const btn of document.querySelectorAll('[data-preroll]')) {
    btn.setAttribute('aria-pressed', String(Number(btn.dataset.preroll) === state.preroll));
  }
}

function renderPosition() {
  const duration = player ? player.duration() : 0;
  const time = player ? player.time() : 0;
  $('time').textContent = formatTime(time);
  const head = $('seek-head');
  const rangeEl = $('seek-range');
  if (!duration) {
    head.style.left = '0%';
    rangeEl.hidden = true;
    return;
  }
  head.style.left = `${(time / duration) * 100}%`;
  const { a, b } = state.range;
  if (a == null) {
    rangeEl.hidden = true;
    return;
  }
  // B が未設定のときは A の位置に細い印だけを出す
  const end = b ?? a;
  rangeEl.hidden = false;
  rangeEl.style.left = `${(a / duration) * 100}%`;
  rangeEl.style.width = `max(3px, ${((end - a) / duration) * 100}%)`;
}

function updateRange(next) {
  if (next === state.range) return;
  state.range = next;
  persist();
  renderControls();
  renderPosition();
}

function changeRate(rate) {
  if (rate === state.rate) return;
  state.rate = rate;
  player.setRate(rate);
  persist();
  renderControls();
}

function jumpToLoopStart() {
  player.seek(loopTarget(state.range.a, state.preroll));
  lastJumpAt = performance.now();
}

function loadVideo(videoId) {
  state.videoId = videoId;
  state.range = EMPTY_RANGE; // 前の動画の A/B を新しい動画に持ち込まない
  player.load(videoId);
  persist();
  renderControls();
  renderPosition();
}

function handleStateChange(playerState) {
  $('play').textContent = playerState === PLAYER_STATE.PLAYING ? '❚❚' : '▶';
  // 読み込み直後に設定した速度が効かないことがあるので、再生が始まるたびに当て直す
  if (playerState === PLAYER_STATE.PLAYING) player.setRate(state.rate);
  // B が動画の終端付近だと、監視より先に動画が終わるので、ここでもループさせる
  if (playerState === PLAYER_STATE.ENDED && state.range.a != null && state.range.b != null) {
    jumpToLoopStart();
    player.play();
  }
}

function handleError(code) {
  showToast(ERROR_MESSAGES[code] ?? `再生できませんでした(エラー ${code})`);
}

function bindControls() {
  $('load-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const videoId = parseVideoId($('url').value);
    if (!videoId) {
      showToast('URL を確認してください');
      return;
    }
    $('url').blur();
    loadVideo(videoId);
  });

  $('play').addEventListener('click', () => (player.isPlaying() ? player.pause() : player.play()));
  $('rewind').addEventListener('click', () => player.seek(rewind(player.time())));
  $('to-a').addEventListener('click', () => {
    if (state.range.a == null) return;
    jumpToLoopStart();
    player.play();
  });

  $('set-a').addEventListener('click', () => {
    if (!state.videoId) return;
    updateRange(setA(state.range, player.time()));
  });
  $('set-b').addEventListener('click', () => {
    if (!state.videoId) return;
    const next = setB(state.range, player.time());
    if (!next) {
      showToast('A より後ろで押してください');
      return;
    }
    updateRange(next);
    jumpToLoopStart();
  });
  $('a-minus').addEventListener('click', () => updateRange(nudgeA(state.range, -NUDGE)));
  $('a-plus').addEventListener('click', () => updateRange(nudgeA(state.range, NUDGE)));
  $('b-minus').addEventListener('click', () => updateRange(nudgeB(state.range, -NUDGE, player.duration())));
  $('b-plus').addEventListener('click', () => updateRange(nudgeB(state.range, NUDGE, player.duration())));
  $('clear-loop').addEventListener('click', () => updateRange(EMPTY_RANGE));

  $('rate-down').addEventListener('click', () => changeRate(stepRate(state.rate, -1)));
  $('rate-up').addEventListener('click', () => changeRate(stepRate(state.rate, 1)));

  for (const btn of document.querySelectorAll('[data-preroll]')) {
    btn.addEventListener('click', () => {
      state.preroll = Number(btn.dataset.preroll);
      persist();
      renderControls();
    });
  }

  $('seek').addEventListener('click', (e) => {
    const duration = player.duration();
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    player.seek(((e.clientX - rect.left) / rect.width) * duration);
  });
}

function tick() {
  if (shouldJump(player.time(), state.range) && performance.now() - lastJumpAt > JUMP_GUARD_MS) {
    jumpToLoopStart();
  }
  renderPosition();
}

async function main() {
  const saved = loadState(storage);
  if (saved) {
    state.videoId = saved.videoId;
    state.range = { a: saved.a, b: saved.b };
    state.rate = saved.rate;
    state.preroll = saved.preroll;
  }
  renderControls();

  player = await createPlayer('player', { onError: handleError, onStateChange: handleStateChange });
  bindControls();
  if (state.videoId) {
    $('url').value = `https://youtu.be/${state.videoId}`;
    player.load(state.videoId); // 復元時は自動再生しない
  }
  setInterval(tick, TICK_MS);
}

main();
```

- [ ] **Step 5: 自動テストが壊れていないことを確認する**

Run: `npm test`
Expected: すべて PASS(`# fail 0`)

- [ ] **Step 6: ローカルで配信して、ブラウザで動作を確認する**

Run(バックグラウンド): `python3 -m http.server 8000 --bind 127.0.0.1`

chrome-devtools MCP(`mcp__plugin_chrome-devtools-mcp_chrome-devtools__*`)で `http://localhost:8000/` を開き、次を確認する。どれか一つでも期待どおりでなければ、原因を直してからこのステップをやり直す。

1. `list_console_messages` にエラーがない
2. URL 欄に `https://youtu.be/dQw4w9WgXcQ?si=test` を入れて「読み込む」→ 動画が表示される(自動再生はしない)
3. 「再生」→ 数秒後に「A」→ 3 秒後に「B」→ 表示が `A 0:0x.x / B 0:0x.x` になり、シークバーに青い区間が出て、再生位置が A の 1 秒手前に戻る。そのまま 10 秒待つと、B を過ぎるたびに戻る(`evaluate_script` で `document.getElementById('time').textContent` を何度か読んで確かめる)
4. 「−5%」を 3 回 → 表示が `85%`。`evaluate_script` で iframe の外から確認できないため、表示と、再生が続いていることを確認する
5. 「−5%」を押し続けると `50%` でボタンが無効になる
6. URL 欄に `hello` を入れて「読み込む」→「URL を確認してください」が出て 3 秒で消える
7. A/B を設定したまま、別の動画(`https://www.youtube.com/watch?v=jNQXAC9IVRw`)を読み込む → 表示が `A — / B —` に戻り、シークバーの青い区間が消える(Review Focus 4)
8. ページを再読み込み → 直前の動画・A/B・速度・助走が戻り、自動再生されない
9. `resize_page` で次のサイズにし、それぞれ `take_screenshot` でレイアウトを確認する
   - 390×844(スマホ縦): 1 カラム、A の段と B の段が分かれた 5 段
   - 820×1180(iPad 縦): 1 カラム、A と B が 1 段に並んだ 4 段
   - 1180×820(iPad 横): 左に動画、右に 5 段のボタン
   - 844×390(スマホ横): 左に動画、右に 5 段のボタン。全部が画面内に収まる
   - すべてのサイズで、ボタンの高さが 56px 以上(`evaluate_script` で `Math.min(...[...document.querySelectorAll('.controls button')].map(b => b.getBoundingClientRect().height))` が 56 以上)

確認が終わったら配信を止める。

- [ ] **Step 7: コミットする**

```bash
git add index.html player.js style.css app.js
git commit -m "feat: 区間ループ・スロー再生・助走の画面を追加(スマホ/iPad/PC対応)"
```

---

### Task 5: 公開と実機での確認

**Files:**
- Create: `docs/manual-check.md`

**Interfaces:**
- Consumes: Task 1〜4 のすべて。公開 URL `https://pnpk.github.io/youtube-player/`
- Produces: 実機での確認結果(`docs/manual-check.md`)

- [ ] **Step 1: チェックリストを書く**

`docs/manual-check.md`:

```markdown
# 実機での確認チェックリスト

公開 URL: https://pnpk.github.io/youtube-player/

## ホーム画面から起動したときの広告(Task 1 の結果)
- [ ] 結果: (広告が出た / 出なかった)→ 使い方: (ホーム画面から起動 / Safari のブックマークから開く)

## iPad(縦)
- [ ] URL を貼って読み込める(`?si=` 付きの共有 URL でも)
- [ ] A → B でループが始まり、B を過ぎるたびに A の助走ぶん手前へ戻る
- [ ] 助走 0s / 1s / 2s / 3s で戻る位置が変わる
- [ ] A/B の −0.1 / +0.1 で位置が変わり、表示も変わる
- [ ] 速度 −5% / +5% が効き、50% と 100% でボタンが止まる
- [ ] 「3 秒戻る」「A に戻る」が効く
- [ ] シークバーで区間の外へ移動しても、B を過ぎれば A に戻る
- [ ] B を動画の最後の 1 秒以内に置いても、止まらずにループする(Review Focus 5)
- [ ] A/B を設定したまま別の動画を読み込むと、A/B が消える(Review Focus 4)
- [ ] アプリを閉じて開き直すと、動画・A/B・速度・助走が戻る(自動再生はしない)
- [ ] 埋め込みが禁止された動画で「この動画は埋め込み再生が許可されていません(YouTube アプリで見てください)」が出る
- [ ] 楽器を持ったまま、片手でボタンを押せる

## iPad(横)
- [ ] 左に動画、右にボタンの 2 カラムになる。回転するとすぐ切り替わる

## スマホ(縦・横)
- [ ] 縦: A の段と B の段が分かれた 1 カラム。スクロールせずに全部のボタンが見える
- [ ] 横: 左に動画、右にボタン。全部が画面内に収まる

## PC
- [ ] 横長のウィンドウで 2 カラムになり、マウスで全部の操作ができる
```

- [ ] **Step 2: Task 1 の広告確認の結果をチェックリストに書き込む**

Task 1 Step 9 でユーザーから聞いた結果を、「ホーム画面から起動したときの広告」の行に書き込む。

- [ ] **Step 3: コミットして push する**

```bash
git add docs/manual-check.md
git commit -m "docs: 実機での確認チェックリストを追加"
git push origin main
```

- [ ] **Step 4: 公開が更新されたことを確認する**

Run: `gh api repos/pnpk/youtube-player/pages/builds/latest -q .status`
Expected: `built`(`building` のときは 30 秒ほど待って再実行)

Run: `curl -s https://pnpk.github.io/youtube-player/ | grep -c 'app.js'`
Expected: `1`

- [ ] **Step 5: ユーザーに実機で確認してもらう(ここで止まって返事を待つ)**

`docs/manual-check.md` の項目を、iPad・スマホ・PC で確認してもらう。うまくいかなかった項目があれば、その内容を聞いてから修正する(修正は superpowers:systematic-debugging に沿って行う)。全項目の結果を `docs/manual-check.md` に反映してコミット・push する。
