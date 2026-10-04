// Generates the PWA icons as pixel art (no image assets, no native deps).
// Usage: bun run icons   → writes public/icons/*.png
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

// 16×16 sprite: a playing card showing a joker face on green felt.
// . felt  g dark felt  w card  k black outline  r red  y gold  s skin
const SPRITE = [
  '................',
  '...kkkkkkkkkk...',
  '..kwwwwwwwwwwk..',
  '..kwrrrrrrrrwk..',
  '..kwyrwwwwrywk..',
  '..kwwyywwyywwk..',
  '..kwwwyyyywwwk..',
  '..kwwwssssswwk..',
  '..kwwskssksswk..',
  '..kwwssssssswk..',
  '..kwwsrrrrsswk..',
  '..kwwwssssswwk..',
  '..kwrrwrrwrrwk..',
  '..kwwwwwwwwwwk..',
  '...kkkkkkkkkk...',
  '................',
];

const COLORS = {
  '.': [0x0e, 0x5a, 0x2c],
  g: [0x07, 0x3a, 0x1c],
  w: [0xf4, 0xf0, 0xdc],
  k: [0x10, 0x10, 0x10],
  r: [0xe0, 0x28, 0x28],
  y: [0xff, 0xd0, 0x20],
  s: [0xf0, 0xc0, 0x90],
};

function crc32(buf) {
  let c;
  const table = crc32.table ??= Array.from({ length: 256 }, (_, n) => {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** size px PNG; `pad` = fraction of the size kept as felt border (maskable safe zone). */
function png(size, pad) {
  const inner = Math.floor((size * (1 - 2 * pad)) / 16) * 16;
  const cell = inner / 16;
  const off = Math.floor((size - inner) / 2);
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const sx = Math.floor((x - off) / cell);
      const sy = Math.floor((y - off) / cell);
      const key = sx >= 0 && sx < 16 && sy >= 0 && sy < 16 ? SPRITE[sy][sx] : '.';
      const [r, g, b] = COLORS[key];
      const i = y * (size * 3 + 1) + 1 + x * 3;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = new URL('../public/icons/', import.meta.url);
mkdirSync(out, { recursive: true });
for (const [name, size, pad] of [
  ['icon-192.png', 192, 0.02],
  ['icon-512.png', 512, 0.02],
  ['maskable-512.png', 512, 0.12],
  ['apple-touch-icon.png', 180, 0.06],
  ['favicon-32.png', 32, 0],
]) {
  writeFileSync(new URL(name, out), png(size, pad));
  console.log('wrote', name);
}
