// Rebuild an ARC archive from its entries. The inverse of arc-ls.cjs.
//
// Layout, established empirically against GUI_home_top.arc (41 entries) by
// round-tripping and by locating the zlib stream header of every entry:
//
//   0x00 "ARCC"   0x04 u16 version (7)   0x06 u16 entry count
//   0x08 encrypted body:
//        entry table, 80 bytes per entry, backslash-separated path
//        0x00  char path[64]           NUL padded
//        0x40  u32  tag                0x241f5deb on most entries, NOT constant
//                                        (entry 3 has 0x22948394) -- unknown
//        0x44  u32  compressed size
//        0x48  u32  uncompressed size | 0x40000000
//        0x4c  u32  body offset + 8
//        bodies, zlib deflate
//
// The body region starts at a fixed offset rather than immediately after the
// table: with 41 entries the table ends at 3280 but the first body sits at
// 32760, and the 29480 bytes between are all zero. The original file's own
// offsets are preserved on rebuild, which is what makes a byte-identical
// round-trip possible without knowing why the padding is there.
//
//   node arc-repack.cjs in.arc out.arc [--level N] [--raw]
//
// --raw reuses the stored compressed bytes instead of re-deflating, which
// separates container bugs from compression-settings mismatches.
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

function cifra(buf) {
  const bf = new Blowfish(ARC_KEY, Blowfish.MODE.ECB, Blowfish.PADDING.NULL);
  const g = inverti(buf);
  let c = Buffer.from(bf.encode(g));
  if (c.length < g.length) c = Buffer.concat([c, Buffer.alloc(g.length - c.length)]);
  return inverti(c);
}

function leggiArc(buf) {
  const magic = buf.toString('ascii', 0, 4);
  if (magic !== 'ARCC') throw new Error(`not an ARCC file (magic ${JSON.stringify(magic)})`);
  const version = buf.readUInt16LE(4);
  const n = buf.readUInt16LE(6);
  const corpo = decifra(buf.subarray(8));
  const voci = [];
  for (let i = 0; i < n; i++) {
    const off = i * 80;
    if (off + 80 > corpo.length) break;
    const stored = corpo.subarray(off, off + 64).toString('utf-8').replace(/\0.*$/, '');
    const tag = corpo.readUInt32LE(off + 64);
    const csize = corpo.readUInt32LE(off + 68);
    const usizeFlags = corpo.readUInt32LE(off + 72);
    const start = corpo.readUInt32LE(off + 76) - 8;
    const compressed = Buffer.from(corpo.subarray(start, start + csize));
    let dati = null;
    try {
      dati = zlib.inflateSync(compressed);
    } catch {
      dati = null;
    }
    voci.push({ stored, tag, csize, usizeFlags, start, compressed, dati });
  }
  return { version, voci, corpoLen: corpo.length };
}

// Rebuild by re-emitting the body region at the ORIGINAL offsets, so padding and
// layout are preserved exactly and only the bytes we chose to change differ.
function scriviArc(version, voci, corpoLen, { level, raw }) {
  // Body region must be a whole number of 8-byte Blowfish blocks; see the note
  // in arc-edit.cjs for why a partial final block corrupts the last entry.
  const corpo = Buffer.alloc(corpoLen + ((8 - (corpoLen % 8)) % 8));
  voci.forEach((v, i) => {
    const off = i * 80;
    const pathBuf = Buffer.alloc(64);
    pathBuf.write(v.stored, 0, 'utf-8');
    pathBuf.copy(corpo, off);
    corpo.writeUInt32LE(v.tag, off + 64);

    const body = raw ? v.compressed : zlib.deflateSync(v.dati, { level });
    corpo.writeUInt32LE(body.length, off + 68); // 0x44 compressed size
    corpo.writeUInt32LE(v.usizeFlags, off + 72); // 0x48 uncompressed size | flags
    corpo.writeUInt32LE(v.start + 8, off + 76); // 0x4c offset + 8

    body.copy(corpo, v.start);
  });
  const header = Buffer.alloc(8);
  header.write('ARCC', 0, 'ascii');
  header.writeUInt16LE(version, 4);
  header.writeUInt16LE(voci.length, 6);
  return Buffer.concat([header, cifra(corpo)]);
}

const [, , inFile, outFile, ...resto] = process.argv;
if (!inFile || !outFile) {
  console.error('Uso: node arc-repack.cjs in.arc out.arc [--level N] [--raw] [--quiet]');
  process.exit(1);
}
const lvl = parseInt((resto.find((a) => a.startsWith('--level=')) || '').split('=')[1] || '6', 10);
const raw = resto.includes('--raw');
const quiet = resto.includes('--quiet');

const orig = fs.readFileSync(inFile);
const { version, voci, corpoLen } = leggiArc(orig);
if (!quiet) {
  console.log(`read ${inFile}`);
  console.log(`  version ${version}, ${voci.length} entries, ${orig.length} bytes`);
  const bad = voci.filter((v) => !v.dati).length;
  console.log(`  inflate cleanly: ${voci.length - bad}/${voci.length}`);
  console.log(`  body region starts at ${Math.min(...voci.map((v) => v.start))}, table ends at ${voci.length * 80}`);
}

const attempts = raw
  ? [{ label: 'raw bodies', buf: scriviArc(version, voci, corpoLen, { level: lvl, raw: true }) }]
  : [6, 9, 1, 2, 3, 4, 5, 7, 8, 0].map((n) => ({
      label: `level ${n}`,
      buf: scriviArc(version, voci, corpoLen, { level: n, raw: false }),
    }));

let match = null;
for (const a of attempts) {
  const same = a.buf.length === orig.length && a.buf.equals(orig);
  if (!quiet) {
    let d = -1;
    if (!same) {
      const n = Math.min(a.buf.length, orig.length);
      for (let i = 0; i < n; i++) {
        if (a.buf[i] !== orig[i]) {
          d = i;
          break;
        }
      }
      if (d === -1) d = n;
    }
    console.log(`  ${a.label.padEnd(12)} ${a.buf.length} bytes  ${same ? 'IDENTICAL' : `differs at 0x${d.toString(16)}`}`);
  }
  if (same && !match) match = a;
}

if (match) {
  console.log(`\nMATCH with ${match.label}: byte-for-byte identical.`);
} else {
  console.log(`\nno setting reproduced the original exactly; writing "${attempts[0].label}".`);
  console.log(`The container is verified separately by re-reading the output.`);
}

fs.writeFileSync(outFile, (match || attempts[0]).buf);
console.log(`wrote ${outFile} (${(match || attempts[0]).buf.length} bytes)`);
