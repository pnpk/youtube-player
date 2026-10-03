import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER_STATE, isPlayingState, withTimeout } from '../player.js';

test('isPlayingState: 再生中とバッファ中は「再生中」として扱う', () => {
  assert.equal(isPlayingState(PLAYER_STATE.PLAYING), true);
  assert.equal(isPlayingState(PLAYER_STATE.BUFFERING), true);
  for (const s of [PLAYER_STATE.ENDED, PLAYER_STATE.PAUSED, PLAYER_STATE.CUED, -1]) {
    assert.equal(isPlayingState(s), false, String(s));
  }
});

test('withTimeout: 時間内に解決すればその値を返す', async () => {
  assert.equal(await withTimeout(Promise.resolve('ok'), 50), 'ok');
});

test('withTimeout: 時間内に解決しなければ失敗する', async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 20), /timeout/);
});
