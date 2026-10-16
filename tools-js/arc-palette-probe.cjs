// Dump the small non-TEX, non-GUI entries in an ARC. These are the best
// candidates for a palette or a colour lookup: EAN files here are 72 and 408
// bytes, and 16 colours x 4 bytes + an 8-byte header is exactly 72.
//
//   node arc-palette-probe.cjs <file.arc>
const fs = require('fs');
const zlib = require('zlib');
const { Blowfish } = require('egoroof-blowfish');

const ARC_KEY = 'kaseoa nkaeka;eawf3';

function inverti(buf) {
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i + 3 < buf.length; i += 4) {
    out[i] = buf[i + 3];
    out[i + 1] = buf[i + 2];
    out[i + 2] = buf[i + 1];
    out[i + 3] = buf[i];
  }
  const r = buf.length % 4;
  if (r > 0) buf.copy(out, buf.length - r, buf.length - r);
  return out;
}

function decifra(buf) {
  const bf = new Blowfish(ARC_KEY, Blowfish.MODE.ECB, Blowfish.PADDING.NULL);
  const g = inverti(buf);
  let c = Buffer.from(bf.decode(g, Blowfish.TYPE.UINT8_ARRAY));
  if (c.length < g.length) c = Buffer.concat([c, Buffer.alloc(g.length - c.length)]);
  return inverti(c);
}

const file = process.argv[2];
if (!file) {
  console.error('Uso: node arc-palette-probe.cjs <file.arc>');
  process.exit(1);
}
const buf = fs.readFileSync(file);
const corpo = decifra(buf.subarray(8));
const n = buf.readUInt16LE(6);

for (let i = 0; i < n; i++) {
  const o = i * 80;
  const nome = corpo.subarray(o, o + 64).toString('utf8').replace(/\0.*$/, '').split('\\').join('/');
  const cs = corpo.readUInt32LE(o + 68);
  const st = corpo.readUInt32LE(o + 76) - 8;
  let d;
  try {
    d = zlib.inflateSync(corpo.subarray(st, st + cs));
  } catch {
    continue;
  }
  const magic = d.subarray(0, 4).toString('latin1');
  if (/TEX|GUI/.test(magic)) continue;
  if (d.length > 4096) continue;

  console.log(`\n=== ${nome}  (${d.length} bytes)`);
  console.log(`    magic ${JSON.stringify(magic)}`);
  const show = Math.min(d.length, 256);
  for (let o2 = 0; o2 < show; o2 += 16) {
    const row = d.subarray(o2, o2 + 16);
    console.log(
      `    0x${o2.toString(16).padStart(2, '0')}  ${[...row].map((x) => x.toString(16).padStart(2, '0')).join(' ').padEnd(48)}  ` +
        [...row].map((x) => (x >= 32 && x < 127 ? String.fromCharCode(x) : '.')).join('')
    );
  }
  // If it looks like 16 x RGBA, print it as such.
  if (d.length === 72 || d.length === 68) {
    console.log('    as 16 RGBA (from +8):');
    for (let c = 0; c < 16; c++) {
      const p = 8 + c * 4;
      if (p + 4 <= d.length) {
        const [r, g, b, a] = [d[p], d[p + 1], d[p + 2], d[p + 3]];
        console.log(`      ${String(c).padStart(2)}: ${String(r).padStart(3)},${String(g).padStart(3)},${String(b).padStart(3)} a=${a}  #${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`);
      }
    }
  }
  // If it looks like 16 x RGB555 or RGB565, try that too.
  if (d.length === 72 || d.length === 40) {
    console.log('    as 16 RGB565 (from +8):');
    for (let c = 0; c < 16; c++) {
      const p = 8 + c * 2;
      if (p + 2 <= d.length) {
        const v = d.readUInt16LE(p);
        const r = ((v >> 11) & 0x1f) * 255 / 31;
        const g = ((v >> 5) & 0x3f) * 255 / 63;
        const b = (v & 0x1f) * 255 / 31;
        console.log(`      ${String(c).padStart(2)}: 0x${v.toString(16).padStart(4, '0')} -> rgb(${r | 0},${g | 0},${b | 0})`);
      }
    }
  }
}
