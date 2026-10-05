// 確認用の WAV を作る: 30 秒・22.05kHz・モノラル。1 秒ごとに音の頭があり、4 秒ごとに音量が変わるので波形で区切りが見える。
// 使い方: node tools/make-test-wav.mjs <出力先>
import { writeFileSync } from 'node:fs';

const out = process.argv[2];
if (!out) throw new Error('出力先を指定してください');
const rate = 22050;
const seconds = 30;
const n = rate * seconds;
const data = Buffer.alloc(44 + n * 2);
data.write('RIFF', 0);
data.writeUInt32LE(36 + n * 2, 4);
data.write('WAVE', 8);
data.write('fmt ', 12);
data.writeUInt32LE(16, 16);
data.writeUInt16LE(1, 20); // PCM
data.writeUInt16LE(1, 22); // モノラル
data.writeUInt32LE(rate, 24);
data.writeUInt32LE(rate * 2, 28);
data.writeUInt16LE(2, 32);
data.writeUInt16LE(16, 34);
data.write('data', 36);
data.writeUInt32LE(n * 2, 40);
for (let i = 0; i < n; i++) {
  const t = i / rate;
  const beat = t % 1;
  const envelope = beat < 0.5 ? 1 - beat * 2 : 0.1;
  const loudness = Math.floor(t / 4) % 2 ? 0.9 : 0.45;
  const sample = Math.sin(2 * Math.PI * 440 * t) * envelope * loudness;
  data.writeInt16LE(Math.round(sample * 32767), 44 + i * 2);
}
writeFileSync(out, data);
