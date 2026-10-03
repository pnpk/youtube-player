// YouTube IFrame Player API の薄いラッパー。
// API の読み込み完了は index.html の window.ytReady(Promise)で受け取る。

export const PLAYER_STATE = Object.freeze({ ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 });
const API_TIMEOUT_MS = 10000;

// ループで戻るたびにバッファが入るので、バッファ中も「再生中」として扱う
export function isPlayingState(playerState) {
  return playerState === PLAYER_STATE.PLAYING || playerState === PLAYER_STATE.BUFFERING;
}

export function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function createPlayer(elementId, { onError, onStateChange }) {
  // オフラインや読み込みのブロックで API が来ないときは、待ち続けずに失敗させる
  await withTimeout(window.ytReady, API_TIMEOUT_MS);
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
      isPlaying: () => isPlayingState(yt.getPlayerState()),
      time: () => yt.getCurrentTime() || 0,
      duration: () => yt.getDuration() || 0,
      seek: (seconds) => yt.seekTo(seconds, true),
      setRate: (rate) => yt.setPlaybackRate(rate),
    };
  });
}
