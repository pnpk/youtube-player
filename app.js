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
  seekBy,
  moveA,
  moveB,
  loopWindow,
  loopTicks,
  formatDelta,
  clampToLoop,
  setA,
  setB,
  shouldJump,
  stepRate,
} from './loop.js';
import { PLAYER_STATE, createPlayer, isPlayingState } from './player.js';
import { createAudioPlayer } from './audio-player.js';
import { fileId, openMedia, removeEntry, titleFromFileName, updateEntry } from './history.js';
import { STORE_LIMIT_BYTES, deleteMedia, findOrphans, getFile, getPeaks, listFiles, pickEvictions, putFile, putPeaks } from './media-store.js';
import { decodePeaks, drawWaveform } from './waveform.js';
import { MAX_MARKERS, findSection, loopRange, placeMarker, pruneMarkers, removeNearestMarker, restartPoint, sectionColor, sectionsOf } from './sections.js';
import { loadHistory, saveHistory } from './storage.js';
import { commandForKey } from './keys.js';

const TICK_MS = 50;
// seekTo 直後は getCurrentTime が古い値を返すことがあり、二重に戻ると間が伸びるので少し待つ
const JUMP_GUARD_MS = 300;
const TOAST_MS = 3000;
const EMBED_BLOCKED = 'この動画は埋め込み再生が許可されていません(YouTube アプリで見てください)';
const ERROR_MESSAGES = { 100: '動画が見つかりません', 101: EMBED_BLOCKED, 150: EMBED_BLOCKED };
const YT_FAILED = 'YouTube のプレーヤーを読み込めませんでした。ネット接続を確認して、ページを開き直してください';

const $ = (id) => document.getElementById(id);
const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();

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
// 再生バーを指でスライドしている間の位置(秒)。スライドしていないときは null
let dragTime = null;
// ループバーで A / B をドラッグしている間の、仮の A-B と表示範囲。ドラッグしていないときは null
let loopDrag = null;
// 目盛りを描き直すかどうかの判定用(表示範囲と幅が変わったときだけ描き直す)
let ticksKey = '';
// 長い目盛りの間隔の目安(px)。これより詰まらないように目盛りの間隔を選ぶ
const TICK_MIN_GAP_PX = 48;
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

// 動画の長さの表示用(1:07 のように秒の小数なし)
function formatClock(t) {
  const m = Math.floor(t / 60);
  return `${m}:${String(Math.floor(t - m * 60)).padStart(2, '0')}`;
}

function formatDate(ms) {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

// 今の動画の A/B・速度・区切りを、履歴のその動画の項目に上書き保存する
function persist() {
  const { id, range, rate, markers } = state;
  if (!id) return;
  history = updateEntry(history, id, { a: range.a, b: range.b, rate, markers });
  saveHistory(storage, history);
}

function describeEntry(entry) {
  const range = entry.a == null ? '区間なし' : `A ${formatTime(entry.a)}〜B ${formatTime(entry.b)}`;
  const markers = entry.markers.length ? ` / 区切り${entry.markers.length}` : '';
  return `${range} / ${Math.round(entry.rate * 100)}%${markers}`;
}

function renderHistory() {
  // タイトルは外部(YouTube)から来る文字列なので、innerHTML は使わず textContent で入れる
  const items = history.map((entry) => {
    const li = document.createElement('li');
    const open = document.createElement('button');
    open.className = 'history-item';
    open.dataset.id = entry.id;
    const title = document.createElement('span');
    title.className = 'history-title';
    title.textContent = `${entry.kind === 'file' ? '♪ ' : ''}${entry.title || entry.id}`;
    const meta = document.createElement('span');
    meta.className = 'history-meta';
    meta.textContent = `${formatDate(entry.openedAt)} ・ ${describeEntry(entry)}`;
    open.append(title, meta);
    const remove = document.createElement('button');
    remove.className = 'history-remove';
    remove.dataset.remove = entry.id;
    remove.setAttribute('aria-label', `${entry.title || entry.id} を履歴から消す`);
    remove.textContent = '削除';
    li.append(open, remove);
    return li;
  });
  $('history-list').replaceChildren(...items);
  $('history-empty').hidden = history.length > 0;
}

function renderControls() {
  const { a, b } = state.range;
  $('a-time').textContent = formatTime(a);
  $('b-time').textContent = formatTime(b);
  $('a-time').disabled = a == null;
  $('clear-loop').hidden = a == null && b == null;
  $('rate-value').textContent = `${Math.round(state.rate * 100)}%`;
  $('rate-down').disabled = state.rate <= RATE_MIN;
  $('rate-up').disabled = state.rate >= RATE_MAX;
  renderSections();
}

// 区間のボタンが横にスクロールしているとき、選んでいるボタンが隠れないように見える位置までずらす
function revealSelectedChip() {
  const list = $('section-chips');
  const chip = list.querySelector('[aria-pressed="true"]');
  if (!chip) return;
  const left = chip.offsetLeft;
  const right = left + chip.offsetWidth;
  if (left < list.scrollLeft) list.scrollLeft = left - 4;
  else if (right > list.scrollLeft + list.clientWidth) list.scrollLeft = right - list.clientWidth + 4;
}

// 今ループしている範囲(区間を選んでいればその区間、なければ A-B 全体)
function activeRange() {
  return loopRange(state.range, state.markers, state.selected);
}

function renderSections() {
  const sections = sectionsOf(state.range, state.markers);
  // A/B が未設定でも押せる(A は動画の先頭、B は動画の最後になる)
  $('marker-add').disabled = !state.id;
  $('marker-remove').disabled = state.markers.length === 0;
  const chips = sections.length > 1 ? [null, ...sections.map((_, i) => i)] : [];
  $('section-chips').replaceChildren(
    ...chips.map((index) => {
      const chip = document.createElement('button');
      chip.dataset.section = index ?? '';
      if (index == null) {
        chip.textContent = '全体';
      } else {
        // 番号の左に、その区間の色の丸を付ける
        chip.style.setProperty('--sec', sectionColor(index));
        const dot = document.createElement('span');
        dot.className = 'sec-dot';
        chip.append(dot, String(index + 1));
      }
      chip.setAttribute('aria-pressed', String(index === state.selected));
      chip.title = index == null ? '全体(0)' : `区間 ${index + 1}(${index + 1})`;
      return chip;
    }),
  );
  revealSelectedChip();
  // 再生バーの区切りの線(位置は renderPosition で動画の長さに合わせて決める)
  $('section-hint').hidden = chips.length > 0;
  $('seek-marks').replaceChildren(
    ...state.markers.map(() => {
      const mark = document.createElement('div');
      mark.className = 'seek-mark';
      return mark;
    }),
  );
}

function renderPosition() {
  const duration = player ? player.duration() : 0;
  const time = dragTime ?? (player ? player.time() : 0);
  $('time').textContent = formatTime(time);
  $('duration').textContent = formatClock(duration);
  renderWave(time, duration);
  const head = $('seek-head');
  const rangeEl = $('seek-range');
  const sectionEl = $('seek-section');
  const percent = (t) => `${(t / duration) * 100}%`;
  sectionEl.hidden = true;
  if (!duration) {
    head.style.left = '0%';
    rangeEl.hidden = true;
    return;
  }
  head.style.left = percent(time);
  [...$('seek-marks').children].forEach((mark, i) => {
    mark.style.left = percent(state.markers[i]);
  });
  const { a, b } = state.range;
  if (a == null) {
    rangeEl.hidden = true;
    return;
  }
  // B が未設定のときは A の位置に細い印だけを出す
  const end = b ?? a;
  rangeEl.hidden = false;
  rangeEl.style.left = percent(a);
  rangeEl.style.width = `max(3px, ${percent(end - a)})`;
  if (state.selected != null) {
    const section = activeRange();
    sectionEl.hidden = false;
    sectionEl.style.left = percent(section.a);
    sectionEl.style.width = percent(section.b - section.a);
    sectionEl.style.background = sectionColor(state.selected);
  }
  renderLoopbar(time, duration);
}

// ループバー: A-B の付近だけを拡大して表示する。ドラッグ中は仮の A-B と、つかんだときの表示範囲を使う
function renderLoopbar(time, duration) {
  const range = loopDrag ? loopDrag.range : state.range;
  const view = loopDrag ? loopDrag.view : loopWindow(range, duration);
  $('loopbar').hidden = !view || !duration;
  if ($('loopbar').hidden) return;
  const span = view.end - view.start;
  const percent = (t) => `${Math.min(100, Math.max(0, ((t - view.start) / span) * 100))}%`;
  $('lb-range').style.left = percent(range.a);
  $('lb-range').style.width = `calc(${percent(range.b)} - ${percent(range.a)})`;
  $('lb-a').style.left = percent(range.a);
  $('lb-b').style.left = percent(range.b);
  $('lb-head').style.left = percent(time);
  $('lb-head').hidden = time < view.start || time > view.end;
  renderLoopbarWave(view, duration);
  renderBands(range, percent);
  renderTicks(view);
  renderDragFeedback(range, percent);
}

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

// ループバーの区間: 区間ごとの色で塗り分け、帯の中に番号を出す。選んでいる区間だけ濃くする
function renderBands(range, percent) {
  const markers = state.markers.filter((m) => m > range.a && m < range.b);
  const sections = markers.length ? sectionsOf(range, markers) : [];
  $('lb-range').hidden = sections.length > 0;
  const bands = $('lb-bands');
  if (bands.children.length !== sections.length) {
    bands.replaceChildren(
      ...sections.map((_, i) => {
        const band = document.createElement('div');
        band.className = 'lb-band';
        band.style.setProperty('--sec', sectionColor(i));
        const label = document.createElement('span');
        label.textContent = String(i + 1);
        band.append(label);
        return band;
      }),
    );
  }
  const selected = loopDrag ? null : state.selected;
  [...bands.children].forEach((band, i) => {
    band.style.left = percent(sections[i].a);
    band.style.width = `calc(${percent(sections[i].b)} - ${percent(sections[i].a)})`;
    band.classList.toggle('on', selected === i);
    band.classList.toggle('dim', selected != null && selected !== i);
  });
}

// ループバーの目盛り(長い線と短い線)
function renderTicks(view) {
  const width = $('lb-track').clientWidth;
  const key = `${view.start}-${view.end}-${width}`;
  if (key === ticksKey || !width) return;
  ticksKey = key;
  const { major, minor } = loopTicks(view, Math.max(2, Math.floor(width / TICK_MIN_GAP_PX)));
  const span = view.end - view.start;
  const tick = (t, cls) => {
    const el = document.createElement('div');
    el.className = cls;
    el.style.left = `${((t - view.start) / span) * 100}%`;
    return el;
  };
  $('lb-ticks').replaceChildren(...major.map((t) => tick(t, 'lb-tick major')), ...minor.map((t) => tick(t, 'lb-tick')));
}

// ドラッグ中だけ: つまみの上の吹き出し(時刻と元の位置からの差)と、元の位置に残す影
function renderDragFeedback(range, percent) {
  const tip = $('lb-tip');
  const ghost = $('lb-ghost');
  tip.hidden = ghost.hidden = !loopDrag;
  if (!loopDrag) return;
  const now = loopDrag.which === 'a' ? range.a : range.b;
  $('a-time').textContent = formatTime(range.a);
  $('b-time').textContent = formatTime(range.b);
  ghost.style.left = percent(loopDrag.origin);
  tip.textContent = `${formatTime(now)}  ${formatDelta(now - loopDrag.origin)}`;
  // 吹き出しがバーの端からはみ出さないよう、位置を左右で詰める
  const trackWidth = $('lb-track').clientWidth;
  const half = tip.offsetWidth / 2;
  const x = (parseFloat(percent(now)) / 100) * trackWidth;
  tip.style.left = `${Math.min(trackWidth - half, Math.max(half, x))}px`;
}

// 区切りや A/B が変わっても、選んでいた区間と同じ位置から始まる区間があれば選び続ける
function setLoop(range, markers) {
  const start = state.selected == null ? null : activeRange().a;
  state.range = range;
  state.markers = pruneMarkers(range, markers);
  state.selected = start == null ? null : findSection(state.range, state.markers, start);
  persist();
  renderControls();
  renderPosition();
}

function updateRange(next) {
  if (next === state.range) return;
  setLoop(next, state.markers);
}

function changeRate(rate) {
  if (rate === state.rate) return;
  state.rate = rate;
  player.setRate(rate);
  persist();
  renderControls();
}

function jumpToLoopStart() {
  player.seek(activeRange().a);
  lastJumpAt = performance.now();
}

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

// タイトルは読み込み後でないと取れないので、プレーヤーの状態が変わるたびに取りに行く
function captureTitle() {
  if (!ytPlayer || state.kind !== 'youtube' || !state.id) return;
  const title = ytPlayer.title(state.id);
  const entry = history.find((e) => e.id === state.id);
  if (!title || !entry || entry.title === title) return;
  history = updateEntry(history, state.id, { title });
  saveHistory(storage, history);
  renderHistory();
}

function handleStateChange(playerState) {
  captureTitle();
  setPlayingUi(isPlayingState(playerState));
  // 読み込み直後に設定した速度が効かないことがあるので、再生が始まるたびに当て直す
  if (playerState === PLAYER_STATE.PLAYING) player.setRate(state.rate);
  // B が動画の終端付近だと、監視より先に動画が終わるので、ここでもループさせる
  if (playerState === PLAYER_STATE.ENDED && activeRange().a != null && activeRange().b != null) {
    jumpToLoopStart();
    player.play();
  }
}

function handleError(code) {
  showToast(ERROR_MESSAGES[code] ?? `再生できませんでした(エラー ${code})`);
}

function handleLoadSubmit(e) {
  e.preventDefault(); // プレーヤーの準備前でも、フォーム送信でページを再読み込みさせない
  const videoId = parseVideoId($('url').value);
  if (!videoId) {
    showToast('URL を確認してください');
    return;
  }
  $('url').blur();
  openYouTube(videoId);
}

// --- ボタンとキーボードの両方から呼ぶ操作 ---
function togglePlay() {
  if (player.isPlaying()) player.pause();
  else player.play();
}

function restart() {
  player.seek(restartPoint(state.range, state.markers, state.selected));
  lastJumpAt = performance.now();
  player.play();
}

function jumpToA() {
  if (state.range.a == null) return;
  player.seek(state.range.a);
  lastJumpAt = performance.now();
}

function setAHere() {
  if (!state.id) return;
  updateRange(setA(state.range, player.time()));
}

function setBHere() {
  if (!state.id) return;
  const next = setB(state.range, player.time());
  if (!next) {
    showToast('A より後ろで押してください');
    return;
  }
  updateRange(next);
  jumpToLoopStart();
}

function addMarkerHere() {
  if (!state.id) return;
  const placed = placeMarker(state.range, state.markers, player.time(), player.duration());
  if (placed) {
    setLoop(placed.range, placed.markers);
  } else if (state.markers.length >= MAX_MARKERS) {
    showToast(`区切りは ${MAX_MARKERS} 個までです`);
  } else {
    showToast('A と B の間で押してください');
  }
}

// index は区間の番号(0 始まり)。null なら全体。区切りがないときや、ない番号のときは何もしない
function selectSection(index) {
  const count = sectionsOf(state.range, state.markers).length;
  if (count < 2 || (index != null && index >= count)) return;
  state.selected = index;
  renderControls();
  jumpToLoopStart();
  player.play();
}

function bindControls() {
  $('history-open').addEventListener('click', () => {
    renderHistory();
    $('history').hidden = false;
  });
  $('history-close').addEventListener('click', () => {
    $('history').hidden = true;
  });
  $('help-close').addEventListener('click', () => {
    $('help').hidden = true;
  });
  // シートの外側(暗くなった部分)をタップしても閉じる
  for (const id of ['history', 'help']) {
    $(id).addEventListener('click', (e) => {
      if (e.target === e.currentTarget) $(id).hidden = true;
    });
  }
  $('history-list').addEventListener('click', (e) => {
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
  });

  $('play').addEventListener('click', togglePlay);
  $('rewind').addEventListener('click', () => player.seek(rewind(player.time())));
  $('to-a').addEventListener('click', restart);

  $('set-a').addEventListener('click', setAHere);
  $('a-time').addEventListener('click', jumpToA);
  $('set-b').addEventListener('click', setBHere);
  $('a-minus').addEventListener('click', () => updateRange(nudgeA(state.range, -NUDGE)));
  $('a-plus').addEventListener('click', () => updateRange(nudgeA(state.range, NUDGE)));
  $('b-minus').addEventListener('click', () => updateRange(nudgeB(state.range, -NUDGE, player.duration())));
  $('b-plus').addEventListener('click', () => updateRange(nudgeB(state.range, NUDGE, player.duration())));
  $('clear-loop').addEventListener('click', () => updateRange(EMPTY_RANGE));

  $('rate-down').addEventListener('click', () => changeRate(stepRate(state.rate, -1)));
  $('rate-up').addEventListener('click', () => changeRate(stepRate(state.rate, 1)));
  $('rate-value').addEventListener('click', () => changeRate(DEFAULT_RATE));

  $('marker-add').addEventListener('click', addMarkerHere);
  $('marker-remove').addEventListener('click', () => {
    setLoop(state.range, removeNearestMarker(state.markers, player.time()));
  });
  $('section-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-section]');
    if (!chip) return;
    selectSection(chip.dataset.section === '' ? null : Number(chip.dataset.section));
  });

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

// ループバー: A / B のつまみのドラッグと、バーのタップでの移動
function bindLoopbar() {
  const track = $('lb-track');
  const timeAt = (clientX, view) => {
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return view.start + ratio * (view.end - view.start);
  };
  for (const handle of [$('lb-a'), $('lb-b')]) {
    handle.addEventListener('pointerdown', (e) => {
      const view = loopWindow(state.range, player.duration());
      if (!view) return;
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      // 表示範囲はつかんだときのまま固定する(動かすたびに範囲が変わると、つまみが指から逃げるため)
      const which = handle.dataset.handle;
      loopDrag = { which, view, range: state.range, origin: state.range[which] };
      renderPosition();
      handle.classList.add('dragging');
    });
    handle.addEventListener('pointermove', (e) => {
      if (!loopDrag) return;
      const t = timeAt(e.clientX, loopDrag.view);
      loopDrag.range = loopDrag.which === 'a' ? moveA(loopDrag.range, t) : moveB(loopDrag.range, t, player.duration());
      renderPosition();
    });
    const finish = () => {
      if (!loopDrag) return;
      const { range } = loopDrag;
      loopDrag = null;
      handle.classList.remove('dragging');
      updateRange(range); // 指を離したときに確定する(区切りの整理と保存もここで)
    };
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
  }
  // バー(つまみ以外)をタップ・スライドすると、その位置へ移動する。移動先は A-B の範囲に収める
  bindScrub(track, (clientX) => {
    const view = loopWindow(state.range, player.duration());
    return view ? clampToLoop(timeAt(clientX, view), state.range) : null;
  });
}

function runCommand(command) {
  switch (command.type) {
    case 'toggle':
      return togglePlay();
    case 'seekBy':
      return player.seek(seekBy(player.time(), command.seconds, player.duration()));
    case 'rate':
      return changeRate(stepRate(state.rate, command.direction));
    case 'setA':
      return setAHere();
    case 'jumpA':
      return jumpToA();
    case 'setB':
      return setBHere();
    case 'restart':
      return restart();
    case 'addMarker':
      return addMarkerHere();
    case 'section':
      return selectSection(command.index);
  }
}

// キーボード操作(PC 向け)。割り当ては keys.js
function bindKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return; // URL 欄の入力を優先する
    const command = commandForKey(e);
    if (!command) return;
    const openSheet = ['history', 'help'].map($).find((sheet) => !sheet.hidden);
    if (openSheet) {
      // 履歴やヘルプを開いている間は Esc で閉じるだけ(ヘルプは ? でも閉じる)
      if (command.type === 'close' || (command.type === 'help' && openSheet.id === 'help')) {
        e.preventDefault();
        openSheet.hidden = true;
      }
      return;
    }
    if (command.type === 'close') return;
    if (command.type === 'help') {
      e.preventDefault();
      $('help').hidden = false;
      return;
    }
    e.preventDefault(); // スペースや矢印キーでページがスクロールしないように
    // 押しっぱなしのくりかえしは、移動と速度だけ受け付ける(スペースの押しっぱなしで再生と停止を往復しないように)
    if (e.repeat && command.type !== 'seekBy' && command.type !== 'rate') return;
    runCommand(command);
  });
  // ボタンにフォーカスがあると、スペースを離したときにそのボタンも押されてしまうので止める
  document.addEventListener('keyup', (e) => {
    if (e.key === ' ' && !(e.target instanceof HTMLInputElement)) e.preventDefault();
  });
}

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
    if (dragTime == null) return;
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

function tick() {
  if (shouldJump(player.time(), activeRange()) && performance.now() - lastJumpAt > JUMP_GUARD_MS) {
    jumpToLoopStart();
  }
  renderPosition();
}

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
main();
