import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { MODULES, computeVersion } from '../tools/stamp-version.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('index.html の版番号が、今の JS / CSS の中身と一致している(違ったら npm run stamp)', () => {
  const versions = [...html.matchAll(/\?v=([0-9a-f]+)/g)].map((m) => m[1]);
  assert.ok(versions.length > 0, '版番号が見つからない');
  for (const v of versions) assert.equal(v, computeVersion());
});

test('入口の app.js と style.css は版番号付きで読み込む', () => {
  assert.match(html, /<script type="module" src="app\.js\?v=[0-9a-f]+"><\/script>/);
  assert.match(html, /<link rel="stylesheet" href="style\.css\?v=[0-9a-f]+">/);
});

test('app.js から読み込むモジュールは、すべて import map で版番号付きにしている', () => {
  const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]);
  const rootModules = readdirSync(new URL('..', import.meta.url)).filter((f) => f.endsWith('.js') && f !== 'app.js');
  assert.deepEqual([...MODULES].sort(), rootModules.sort(), 'MODULES に新しいファイルを足し忘れていないか');
  for (const file of MODULES) assert.match(map.imports[`./${file}`] ?? '', new RegExp(`^\\./${file.replace('.', '\\.')}\\?v=[0-9a-f]+$`), file);
});
