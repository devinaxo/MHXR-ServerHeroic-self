// Normalise every ARC inside an FPK: pad each compressed body to 8 bytes and
// rewrite the offsets, the way Capcom's packer does.
//
//   node tools-js/fpk-align.cjs <in.fpk> <out.fpk>
//
// Why: Capcom keeps every body offset and compressed size on an 8-byte
// boundary (all original cs values are multiples of 8). arc-edit did not, so
// every archive it rebuilt ended up with entries landing off the Blowfish block
// grid, and the client -- which decrypts each entry at its own offset -- read
// garbage. That showed up as a black equip screen and a TOWN crash.
//
// Only archives whose layout is already off are rewritten. Everything else is
// copied byte-for-byte, and each arc's header, entry table, tags and
// uncompressed sizes are preserved.
const fs = require('fs');
const zlib = require('zlib');
const { Blowfish } = require('egoroof-blowfish');

const ARC_KEY = 'kaseoa nkaeka;eawf3';
const bf = new Blowfish(ARC_KEY, Blowfish.MODE.ECB, Blowfish.PADDING.NULL);

function inv(b) {
  const o = Buffer.alloc(b.length);
  const n = b.length - (b.length % 4);
  for (let i = 0; i < n; i += 4) { o[i] = b[i + 3]; o[i + 1] = b[i + 2]; o[i + 2] = b[i + 1]; o[i + 3] = b[i]; }
  if (b.length % 4) b.copy(o, n, n);
  return o;
}
const dec = (b) => {
  const g = inv(b);
  let c = Buffer.from(bf.decode(g, Blowfish.TYPE.UINT8_ARRAY));
  if (c.length < g.length) c = Buffer.concat([c, Buffer.alloc(g.length - c.length)]);
  return inv(c);
};
const enc = (b) => {
  const g = inv(b);
  let c = Buffer.from(bf.encode(g));
  if (c.length < g.length) c = Buffer.concat([c, Buffer.alloc(g.length - c.length)]);
  return inv(c);
};
const pad8 = (b) => (b.length % 8 ? Buffer.concat([b, Buffer.alloc(8 - (b.length % 8))]) : b);
const padEnc = (b) => (b.length % 8 ? Buffer.concat([b, Buffer.alloc(8 - (b.length % 8))]) : b);

// FPK entry +0x48 = (size & 0x1fffffff) | (flags << 29). The flags live in the
// top 3 bits and are constant (1 for these packs); the low 29 bits are the size.
const sizeAndFlags = (size, prev) => ((size & 0x1fffffff) >>> 0 | ((prev ?? 0x20000000) & 0xe0000000)) >>> 0;

function parseFpk(buf) {
  if (buf.toString('ascii', 0, 4) !== 'FPK\0') throw new Error('not an FPK');
  const count = buf.readUInt16LE(0x0e);
  const out = [];
  for (let i = 0; i < count; i++) {
    const o = 16 + i * 80;
    const raw = Buffer.from(buf.subarray(o, o + 64));
    const nul = raw.indexOf(0);
    out.push({
      path: raw.toString('utf-8', 0, nul === -1 ? 64 : nul),
      raw,
      size: buf.readUInt32LE(o + 68),
      sizeAndFlags: buf.readUInt32LE(o + 72),
      offset: buf.readUInt32LE(o + 76),
    });
  }
  return { count, entries: out };
}

// returns a normalised arc buffer, or null if it was already fine
function normaliseArc(arc) {
  if (arc.toString('ascii', 0, 4) !== 'ARCC') return null;
  const count = arc.readUInt16LE(6);
  if (count === 0) return null;
  const body = dec(arc.subarray(8));
  const voci = [];
  let dirty = false;
  for (let i = 0; i < count; i++) {
    const o = i * 80;
    const cs = body.readUInt32LE(o + 68);
    const st = body.readUInt32LE(o + 76) - 8;
    if (st % 8 || cs % 8) dirty = true;
    if (st < 0 || st + cs > body.length) throw new Error(`entry ${i} out of range`);
    voci.push({ o, cs, st, tag: body.readUInt32LE(o + 64), us: body.readUInt32LE(o + 72) });
  }
  if (!dirty) return null;

  const bodyStart = Math.min(...voci.map((v) => v.st));
  const pieces = voci.map((v) => {
    const comp = body.subarray(v.st, v.st + v.cs);
    // the original cs already includes Capcom's padding; keep the stream, but
    // if it was written unpadded, re-pad it now
    return v.cs % 8 ? pad8(comp) : comp;
  });
  const total = bodyStart + pieces.reduce((a, b) => a + b.length, 0);
  const need = Math.max(body.length, total);
  const out = Buffer.from(body);
  const grown = Buffer.alloc(need + ((8 - (need % 8)) % 8));
  out.copy(grown);
  let cursor = bodyStart;
  voci.forEach((v, i) => {
    grown.writeUInt32LE(pieces[i].length, v.o + 68);
    grown.writeUInt32LE(v.us, v.o + 72);
    grown.writeUInt32LE(cursor + 8, v.o + 76);
    pieces[i].copy(grown, cursor);
    cursor += pieces[i].length;
  });
  const hdr = Buffer.alloc(8);
  hdr.write('ARCC', 0, 'ascii');
  hdr.writeUInt16LE(arc.readUInt16LE(4), 4);
  hdr.writeUInt16LE(count, 6);
  return Buffer.concat([hdr, enc(padEnc(grown))]);
}

const [, , inFile, outFile] = process.argv;
if (!inFile || !outFile) { console.error('uso: node fpk-align.cjs <in.fpk> <out.fpk>'); process.exit(1); }
const buf = fs.readFileSync(inFile);
const { entries } = parseFpk(buf);

let fixed = 0, ok = 0, nonArc = 0;
for (const e of entries) {
  const arc = buf.subarray(e.offset, e.offset + e.size);
  let next = null;
  try { next = normaliseArc(arc); } catch (err) { console.error(`  ${e.path}: ${err.message}`); next = null; }
  if (next) { e.body = next; fixed++; } else if (arc.toString('ascii', 0, 4) === 'ARCC') ok++; else nonArc++;
}

const headerLen = 16 + entries.length * 80;
const bodies = entries.map((e) => e.body || buf.subarray(e.offset, e.offset + e.size));
const totalLen = headerLen + bodies.reduce((a, b) => a + b.length, 0);
const outBuf = Buffer.alloc(totalLen);
buf.copy(outBuf, 0, 0, 16);
outBuf.writeUInt16LE(entries.length, 0x0e);
let c = headerLen;
entries.forEach((e, i) => {
  const o = 16 + i * 80;
  // Copy the path, then zero the rest of the record and write the fields we know.
  // The +0x40 padding must be zero: some builders fill it with 0xCDCDCDCD
  // (uninitialised memory) and the client reads it -- the res 288/289 launch crash.
  buf.copy(outBuf, o, 16 + i * 80, 16 + i * 80 + 0x40);
  outBuf.fill(0, o + 0x40, o + 0x50);
  outBuf.writeUInt32LE(bodies[i].length, o + 68);
  // +0x48 encodes the entry size too ((size & 0x1fffffff) | flags << 29). It
  // must be recomputed whenever the body length changes, not copied: if an
  // archive grows and +0x48 keeps the old size, the client sizes the entry
  // wrong and crashes on the screen that loads it.
  outBuf.writeUInt32LE(sizeAndFlags(bodies[i].length, e.sizeAndFlags), o + 72);
  outBuf.writeUInt32LE(c, o + 76);
  bodies[i].copy(outBuf, c);
  c += bodies[i].length;
});
fs.writeFileSync(outFile, outBuf);

// ------------------------------------------------------------------- verify
const chk = parseFpk(fs.readFileSync(outFile));
let bad = 0, fail = 0, checked = 0;
for (const e of chk.entries) {
  const arc = outBuf.subarray(e.offset, e.offset + e.size);
  if (arc.toString('ascii', 0, 4) !== 'ARCC') continue;
  const body = dec(arc.subarray(8));
  const n = arc.readUInt16LE(6);
  for (let i = 0; i < n; i++) {
    const o = i * 80;
    const cs = body.readUInt32LE(o + 68), st = body.readUInt32LE(o + 76) - 8;
    checked++;
    if (st % 8 || cs % 8) bad++;
    try { zlib.inflateSync(body.subarray(st, st + cs)); } catch { fail++; }
  }
}
console.log(`${inFile} -> ${outFile}`);
console.log(`  entries: ${entries.length}   arcs already ok: ${ok}   arcs normalised: ${fixed}   non-arc: ${nonArc}`);
console.log(`  verify: ${checked} arc entries, misaligned=${bad}, inflateFailures=${fail}  ${bad === 0 && fail === 0 ? '-> CLEAN' : '-> PROBLEM'}`);
if (bad || fail) process.exit(1);
