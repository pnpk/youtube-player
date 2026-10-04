import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandForKey } from '../keys.js';

const key = (k, extra = {}) => ({ key: k, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, ...extra });

test('スペースで再生 / 一時停止', () => {
  assert.deepEqual(commandForKey(key(' ')), { type: 'toggle' });
});

test('← / → で 3 秒、Shift 付きで 10 秒移動', () => {
  assert.deepEqual(commandForKey(key('ArrowLeft')), { type: 'seekBy', seconds: -3 });
  assert.deepEqual(commandForKey(key('ArrowRight')), { type: 'seekBy', seconds: 3 });
  assert.deepEqual(commandForKey(key('ArrowLeft', { shiftKey: true })), { type: 'seekBy', seconds: -10 });
  assert.deepEqual(commandForKey(key('ArrowRight', { shiftKey: true })), { type: 'seekBy', seconds: 10 });
});

test('↑ / ↓ で速度を上げ下げ', () => {
  assert.deepEqual(commandForKey(key('ArrowUp')), { type: 'rate', direction: 1 });
  assert.deepEqual(commandForKey(key('ArrowDown')), { type: 'rate', direction: -1 });
});

test('A / B / R / M(大文字・小文字どちらでも)', () => {
  for (const k of ['a', 'A']) assert.deepEqual(commandForKey(key(k)), { type: 'setA' }, k);
  for (const k of ['b', 'B']) assert.deepEqual(commandForKey(key(k)), { type: 'setB' }, k);
  for (const k of ['r', 'R']) assert.deepEqual(commandForKey(key(k)), { type: 'restart' }, k);
  for (const k of ['m', 'M']) assert.deepEqual(commandForKey(key(k)), { type: 'addMarker' }, k);
});

test('1〜9 で区間を選び、0 で全体に戻す', () => {
  assert.deepEqual(commandForKey(key('1')), { type: 'section', index: 0 });
  assert.deepEqual(commandForKey(key('9')), { type: 'section', index: 8 });
  assert.deepEqual(commandForKey(key('0')), { type: 'section', index: null });
});

test('? でヘルプを開く(Shift を押しながら入力するキーボードでも)', () => {
  assert.deepEqual(commandForKey(key('?')), { type: 'help' });
  assert.deepEqual(commandForKey(key('?', { shiftKey: true })), { type: 'help' });
});

test('Esc で閉じる', () => {
  assert.deepEqual(commandForKey(key('Escape')), { type: 'close' });
});

test('Command / Ctrl / Option 付きのキーはブラウザの操作に任せる(null)', () => {
  assert.equal(commandForKey(key('r', { metaKey: true })), null);
  assert.equal(commandForKey(key('a', { ctrlKey: true })), null);
  assert.equal(commandForKey(key('ArrowLeft', { altKey: true })), null);
});

test('割り当てのないキーは null', () => {
  for (const k of ['x', 'Enter', 'Tab', 'Shift', '-']) assert.equal(commandForKey(key(k)), null, k);
});
