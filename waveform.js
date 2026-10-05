// 音声ファイルの波形。計算(computePeaks)は純粋な関数で、解析と描画はブラウザで行う。
export const DEFAULT_BUCKETS = 2000;

// 音声データを buckets 個に分け、各区間の全チャンネルの振幅の最大値(絶対値)を、全体の最大値で割った 0〜1 の値にする
export function computePeaks(channels, buckets) {
  const peaks = new Array(buckets).fill(0);
  const length = channels[0]?.length ?? 0;
  if (!length) return peaks;
  for (let i = 0; i < buckets; i++) {
    const start = Math.floor((i * length) / buckets);
    const end = Math.max(start + 1, Math.floor(((i + 1) * length) / buckets));
    let max = 0;
    for (const channel of channels) {
      for (let j = start; j < end && j < length; j++) {
        const v = Math.abs(channel[j]);
        if (v > max) max = v;
      }
    }
    peaks[i] = max;
  }
  const top = peaks.reduce((m, v) => (v > m ? v : m), 0);
  return top > 0 ? peaks.map((v) => v / top) : peaks;
}

// 音声ファイルを解析して波形の値を作る(ブラウザ専用)
export async function decodePeaks(blob, buckets = DEFAULT_BUCKETS) {
  const Context = window.AudioContext || window.webkitAudioContext;
  const context = new Context();
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
    return computePeaks(channels, buckets);
  } finally {
    context.close?.();
  }
}

// from〜to 秒の範囲の波形を、縦棒の並びで canvas に描く(ブラウザ専用)。棒の色は colorAt(その棒の中央の秒) で決める
export function drawWaveform(canvas, peaks, { from, to, duration, colorAt, barWidth = 3, gap = 1 }) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height || !duration || to <= from) return;
  const ratio = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  const context = canvas.getContext('2d');
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  const bars = Math.max(1, Math.floor(width / (barWidth + gap)));
  for (let i = 0; i < bars; i++) {
    const t0 = from + ((to - from) * i) / bars;
    const t1 = from + ((to - from) * (i + 1)) / bars;
    const p0 = Math.max(0, Math.floor((t0 / duration) * peaks.length));
    const p1 = Math.min(peaks.length, Math.max(p0 + 1, Math.ceil((t1 / duration) * peaks.length)));
    let v = 0;
    for (let j = p0; j < p1; j++) if (peaks[j] > v) v = peaks[j];
    const h = Math.max(1, v * height * 0.92);
    context.fillStyle = colorAt((t0 + t1) / 2);
    context.fillRect(i * (barWidth + gap), (height - h) / 2, barWidth, h);
  }
}
