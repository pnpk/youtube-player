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
    // 読み込めなかったときは、それまでのファイル(と再生位置)に戻してから reject する
    load(blob) {
      audio.pause();
      const previous = url ? { url, time: audio.currentTime } : null;
      const next = URL.createObjectURL(blob);
      const loadSource = (src) =>
        new Promise((resolve, reject) => {
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
          audio.src = src;
          audio.load();
        });
      return loadSource(next).then(
        () => {
          if (previous) URL.revokeObjectURL(previous.url);
          url = next;
        },
        async (error) => {
          URL.revokeObjectURL(next);
          if (previous) {
            await loadSource(previous.url).catch(() => {});
            audio.currentTime = previous.time;
          } else {
            audio.removeAttribute('src');
          }
          throw error;
        },
      );
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
