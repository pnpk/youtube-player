// index.html の JS / CSS の読み込みに、中身から計算した版番号(?v=…)を書き込む。
// GitHub Pages はファイルを 10 分間ブラウザに保存させるので、更新直後に新しい HTML と
// 古い JS が混ざらないよう、中身が変わるたびに URL を変える。JS / CSS を変えたら npm run stamp。
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// app.js から読み込まれるモジュール(import map で版番号を付ける)
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
const VERSIONED = ['app.js', ...MODULES, 'style.css'];
const root = new URL('..', import.meta.url);

export function computeVersion() {
  const hash = createHash('sha256');
  for (const file of VERSIONED) hash.update(readFileSync(new URL(file, root)));
  return hash.digest('hex').slice(0, 10);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const htmlUrl = new URL('index.html', root);
  const version = computeVersion();
  const html = readFileSync(htmlUrl, 'utf8').replace(/\?v=[0-9a-f]+/g, `?v=${version}`);
  writeFileSync(htmlUrl, html);
  console.log(`index.html を版番号 ${version} にしました`);
}
