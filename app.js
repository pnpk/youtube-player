import {
  DEFAULT_RATE,
  EMPTY_RANGE,
  NUDGE,
  RATE_MAX,
  RATE_MIN,
  nudgeA,
  nudgeB,
  parseVideoId,
  rewind,
  setA,
  setB,
  shouldJump,
  stepRate,
} from './loop.js';
import { PLAYER_STATE, createPlayer, isPlayingState } from './player.js';
import { openVideo, removeEntry, updateEntry } from './history.js';
import { loadHistory, saveHistory } from './storage.js';

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

const state = { videoId: null, range: EMPTY_RANGE, rate: DEFAULT_RATE };
let history = [];
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

function formatDate(ms) {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

// 今の動画の A/B・速度を、履歴のその動画の項目に上書き保存する
function persist() {
  const { videoId, range, rate } = state;
  if (!videoId) return;
  history = updateEntry(history, videoId, { a: range.a, b: range.b, rate });
  saveHistory(storage, history);
}

function describeEntry(entry) {
  const range = entry.a == null ? '区間なし' : `A ${formatTime(entry.a)}〜B ${formatTime(entry.b)}`;
  return `${range} / ${Math.round(entry.rate * 100)}%`;
}

function renderHistory() {
  // タイトルは外部(YouTube)から来る文字列なので、innerHTML は使わず textContent で入れる
  const items = history.map((entry) => {
    const li = document.createElement('li');
    const open = document.createElement('button');
    open.className = 'history-item';
    open.dataset.videoId = entry.videoId;
    const title = document.createElement('span');
    title.className = 'history-title';
    title.textContent = entry.title || entry.videoId;
    const meta = document.createElement('span');
    meta.className = 'history-meta';
    meta.textContent = `${formatDate(entry.openedAt)} ・ ${describeEntry(entry)}`;
    open.append(title, meta);
    const remove = document.createElement('button');
    remove.className = 'history-remove';
    remove.dataset.remove = entry.videoId;
    remove.setAttribute('aria-label', `${entry.title || entry.videoId} を履歴から消す`);
    remove.textContent = '×';
    li.append(open, remove);
    return li;
  });
  $('history-list').replaceChildren(...items);
  $('history-empty').hidden = history.length > 0;
}

function renderControls() {
  const { a, b } = state.range;
  $('ab-label').textContent = `A ${formatTime(a)} / B ${formatTime(b)}`;
  $('clear-loop').hidden = a == null && b == null;
  $('rate-value').textContent = `${Math.round(state.rate * 100)}%`;
  $('rate-down').disabled = state.rate <= RATE_MIN;
  $('rate-up').disabled = state.rate >= RATE_MAX;
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
  player.seek(state.range.a);
  lastJumpAt = performance.now();
}

function applyEntry(entry) {
  state.videoId = entry.videoId;
  state.range = { a: entry.a, b: entry.b };
  state.rate = entry.rate;
  $('url').value = `https://youtu.be/${entry.videoId}`;
}

function loadVideo(videoId) {
  const opened = openVideo(history, videoId, Date.now());
  history = opened.history;
  saveHistory(storage, history);
  // 履歴にある動画なら前回の A/B・速度を戻す。初めての動画なら初期設定(前の動画の A/B は持ち込まない)
  applyEntry(opened.entry);
  player.load(videoId);
  player.setRate(state.rate);
  renderControls();
  renderPosition();
  renderHistory();
}

// タイトルは読み込み後でないと取れないので、プレーヤーの状態が変わるたびに取りに行く
function captureTitle() {
  if (!player || !state.videoId) return;
  const title = player.title(state.videoId);
  const entry = history.find((e) => e.videoId === state.videoId);
  if (!title || !entry || entry.title === title) return;
  history = updateEntry(history, state.videoId, { title });
  saveHistory(storage, history);
  renderHistory();
}

function handleStateChange(playerState) {
  captureTitle();
  $('play').textContent = isPlayingState(playerState) ? '❚❚' : '▶';
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

function handleLoadSubmit(e) {
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
}

function bindControls() {
  $('history-open').addEventListener('click', () => {
    renderHistory();
    $('history').hidden = false;
  });
  $('history-close').addEventListener('click', () => {
    $('history').hidden = true;
  });
  $('history-list').addEventListener('click', (e) => {
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
  $('rate-value').addEventListener('click', () => changeRate(DEFAULT_RATE));

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
  history = loadHistory(storage, Date.now());
  saveHistory(storage, history); // 旧形式から引き継いだときに、新しい形式で保存し直しておく
  if (history[0]) applyEntry(history[0]); // 最後に開いた動画を、その設定ごと戻す
  renderControls();
  renderHistory();
  $('load-form').addEventListener('submit', handleLoadSubmit);

  try {
    player = await createPlayer('player', { onError: handleError, onStateChange: handleStateChange });
  } catch {
    showToast('プレーヤーを読み込めませんでした。ネット接続を確認して、ページを開き直してください');
    return;
  }
  bindControls();
  if (state.videoId) player.load(state.videoId); // 復元時は自動再生しない
  setInterval(tick, TICK_MS);
}

main();
