// ホーム画面用アイコン(青地に白い再生マーク)を PNG で生成する。
// 依存パッケージなしで書くため、PNG のバイナリを直接組み立てる。
import { mkdirSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

const BG = [0x2f, 0x7d, 0xe1];
const FG = [0xff, 0xff, 0xff];

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

// 再生マークの三角形: 頂点 (0.36, 0.28) (0.36, 0.72) (0.72, 0.5)
function isPlayMark(x, y) {
  return x >= 0.36 && Math.abs(y - 0.5) <= (0.22 * (0.72 - x)) / 0.36;
}

function png(size) {
  const stride = size * 3 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // フィルタなし
    for (let x = 0; x < size; x++) {
      const [r, g, b] = isPlayMark(x / size, y / size) ? FG : BG;
      const i = y * stride + 1 + x * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // ビット深度
  header[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('icons', { recursive: true });
for (const size of [180, 512]) {
  writeFileSync(`icons/icon-${size}.png`, png(size));
}
