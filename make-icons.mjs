// Generates the app icons (no dependencies). Run: node make-icons.mjs
import zlib from 'node:zlib';
import fs from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
function encodePNG(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// signed distance to a rounded box centred at (cu, 0), mirrored on both sides of the bar
const box = (u, v, cu, hu, hv, r) => {
  const dx = Math.abs(Math.abs(u) - cu) - (hu - r), dy = Math.abs(v) - (hv - r);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
};
const inside = (u, v) =>
  box(u, v, 0, 0.30, 0.03, 0.03) < 0 ||        // bar
  box(u, v, 0.165, 0.035, 0.17, 0.03) < 0 ||    // inner plate
  box(u, v, 0.25, 0.025, 0.115, 0.022) < 0;     // outer plate

function draw(size) {
  const rgb = Buffer.alloc(size * size * 3), A = 3, ang = (-32 * Math.PI) / 180, cs = Math.cos(ang), sn = Math.sin(ang);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let cover = 0;
    for (let sy = 0; sy < A; sy++) for (let sx = 0; sx < A; sx++) {
      const px = (x + (sx + 0.5) / A) / size - 0.5, py = (y + (sy + 0.5) / A) / size - 0.5;
      if (inside(px * cs + py * sn, -px * sn + py * cs)) cover++;
    }
    const f = cover / (A * A), t = (x + y) / (2 * size);
    const bg = [255 - 24 * t, 132 - 62 * t, 70 - 40 * t]; // warm orange gradient
    const o = (y * size + x) * 3;
    for (let c = 0; c < 3; c++) rgb[o + c] = Math.round(bg[c] * (1 - f) + 255 * f);
  }
  return encodePNG(size, size, rgb);
}

fs.mkdirSync('icons', { recursive: true });
for (const [name, size] of [['icon-192', 192], ['icon-512', 512], ['apple-touch-icon', 180]]) fs.writeFileSync(`icons/${name}.png`, draw(size));
console.log('icons written');
