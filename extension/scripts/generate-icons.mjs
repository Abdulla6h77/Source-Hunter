// generate-icons.mjs — creates placeholder PNG icons for the extension
// Uses raw PNG binary structure to create valid PNG files without external deps.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(iconsDir, { recursive: true });

function crc32(buf) {
  let crc = 0xffffffff;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function uint32BE(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n, 0);
  return b;
}

function chunk(type, data) {
  const len = uint32BE(data.length);
  const typeData = Buffer.from(type, 'ascii');
  const crcBuf = crc32(Buffer.concat([typeData, data]));
  return Buffer.concat([len, typeData, data, uint32BE(crcBuf)]);
}

function makePng(size) {
  // Simple purple-ish icon: dark background with a magnifying-glass-like circle
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.concat([
    uint32BE(size), uint32BE(size),
    Buffer.from([8, 2, 0, 0, 0]) // 8-bit depth, RGB, no interlace
  ]);

  // Build raw scanlines
  const rows = [];
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.35;
  const lineW = size * 0.08;

  for (let y = 0; y < size; y++) {
    const row = [0]; // filter byte
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Dark purple background
      let red = 15, green = 17, blue = 23;

      // Accent ring (magnifying glass circle)
      if (Math.abs(dist - r) < lineW) {
        red = 108; green = 99; blue = 255; // #6c63ff
      }
      // Handle (bottom-right)
      if (x > cx + r * 0.6 && y > cy + r * 0.6) {
        const hx = x - (cx + r * 0.6);
        const hy = y - (cy + r * 0.6);
        const hDist = Math.sqrt(hx * hx + hy * hy);
        if (hDist < lineW * 0.9 && hDist + dist < r * 1.5) {
          red = 108; green = 99; blue = 255;
        }
      }

      row.push(red, green, blue);
    }
    rows.push(Buffer.from(row));
  }

  const rawPixels = Buffer.concat(rows);
  const compressed = zlib.deflateSync(rawPixels, { level: 9 });
  const idat = chunk('IDAT', compressed);
  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, chunk('IHDR', ihdr), idat, iend]);
}

for (const size of [16, 48, 128]) {
  const png = makePng(size);
  const outPath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`Generated icons/icon${size}.png (${png.length} bytes)`);
}

console.log('Icons generated.');
