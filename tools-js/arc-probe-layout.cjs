// Probe the ARC entry-record layout to find which field is the compressed size
// and whether the offset is relative to the decrypted body or absolute in file.
//
// Ground truth available here: every entry inflates cleanly, so for each entry
// exactly one (offset, size) pair will succeed. That turns the question into a
// search instead of a guess.
//
//   node arc-probe-layout.cjs <file.arc>
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

const file = fs.readFileSync(process.argv[2]);
const n = file.readUInt16LE(6);
const corpo = decifra(file.subarray(8));
console.log(`${process.argv[2]}`);
console.log(`  file ${file.length}, entries ${n}, corpo ${corpo.length}`);
console.log(`  table ${n * 80} bytes, so bodies would start at corpo[${n * 80}]`);
console.log(`  but the smallest declared offset is at corpo[${(() => {
  let m = Infinity;
  for (let i = 0; i < n; i++) m = Math.min(m, corpo.readUInt32LE(i * 80 + 76) - 8);
  return m;
})()}] -- so there is padding after the table\n`);

// For each entry, try every (field, base) combination and see which inflates.
const FIELDS = [
  [0x44, 'f44'],
  [0x48, 'f48'],
  [0x4c, 'f4c'],
  [0x50, 'f50'],
];
const BASES = [
  ['-8 from f4c', (o) => o - 8],
  ['raw f4c', (o) => o],
  ['-8 from f48', (o) => o - 8],
  ['raw f48', (o) => o],
  ['+8 from f4c', (o) => o + 8],
];

const tally = new Map();
for (let i = 0; i < n; i++) {
  const o = i * 80;
  for (const [fo, fname] of FIELDS) {
    const v = corpo.readUInt32LE(o + fo);
    if (!v || v > corpo.length) continue;
    for (const [bname, bf] of BASES) {
      const start = bf(v);
      if (start < 0 || start + v > corpo.length) continue;
      try {
        const d = zlib.inflateSync(corpo.subarray(start, start + v));
        if (d.length > 0) {
          const key = `size@${fname} off@${bname}`;
          if (!tally.has(key)) tally.set(key, { ok: 0, bytes: 0 });
          const t = tally.get(key);
          t.ok++;
          t.bytes += d.length;
        }
      } catch {
        /* not this one */
      }
    }
  }
}

console.log('  combinations that inflate every entry:');
const rows = [...tally.entries()].filter(([, t]) => t.ok === n);
if (!rows.length) {
  console.log('    (none -- trying per-entry instead)');
  const first = [];
  for (let i = 0; i < Math.min(3, n); i++) {
    const o = i * 80;
    for (const [fo] of FIELDS) {
      const v = corpo.readUInt32LE(o + fo);
      if (!v || v > corpo.length) continue;
      for (const [bname, bf] of BASES) {
        const start = bf(v);
        if (start < 0 || start + v > corpo.length) continue;
        try {
          const d = zlib.inflateSync(corpo.subarray(start, start + v));
          if (d.length) first.push(`    entry ${i}: size@0x${fo.toString(16)} off@${bname} -> ${d.length} bytes`);
        } catch {
          /* no */
        }
      }
    }
  }
  first.forEach((x) => console.log(x));
} else {
  rows.forEach(([k, t]) => console.log(`    ${k}  -> ${t.ok}/${n} entries, ${t.bytes} bytes total`));
}
