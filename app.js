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
