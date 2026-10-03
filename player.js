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
