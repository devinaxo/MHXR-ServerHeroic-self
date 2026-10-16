// Dump every rTexture entry out of the GUI resource packs, as raw .tex files,
// with a manifest describing each one.
//
//   node tools-js/gui-tex-dump.cjs [--root <pack dir>] [--out dump]
//                                  [--match '^GUI\.']  [--dry-run]
//
// Container chain (all verified, see sprites/REPACK.md and docs/PALETTE-RECOVERY.md):
//
//   FPK  "FPK\0"  u16 version(2) @0x0c  u16 count @0x0e
//        entry 80 bytes: path[64], size @+68, sizeAndFlags @+72, offset @+76
//        bodies stored verbatim
//
//   ARC  "ARCC"  u16 version(7) @4  u16 count @6
//        body after byte 8 is Blowfish-ECB encrypted with key
//        "kaseoa nkaeka;eawf3", and every 4-byte group is byte-reversed both
//        before and after the cipher. Entries 80 bytes each:
//        name[64], extHash @+64, compSize @+68, uncompSize|0x40000000 @+72,
//        offset @+76 (absolute, from arc start). Bodies are zlib deflate.
//
// Only the bytes actually needed are decrypted: the entry table for every arc,
// plus the body ranges of rTexture entries. Blowfish is ECB, so any 8-byte
// aligned slice decrypts independently.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { Blowfish } = require('egoroof-blowfish');

const ARC_KEY = 'kaseoa nkaeka;eawf3';

// ---------------------------------------------------------------- crc / hashes

const CRC_TBL = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

// finalized crc32 (same value zlib.crc32 returns)
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TBL[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

// the game's "jamcrc": crc32 complemented and masked to 31 bits
const jamcrc = (s) => (crc32(Buffer.from(s, 'utf8')) ^ 0xffffffff) & 0x7fffffff;

const HASH_TEXTURE = jamcrc('rTexture');

// ------------------------------------------------------------ blowfish helpers

const bf = new Blowfish(ARC_KEY, Blowfish.MODE.ECB, Blowfish.PADDING.NULL);

function invertWords(buf) {
  const out = Buffer.alloc(buf.length);
  const n = buf.length - (buf.length % 4);
  for (let i = 0; i < n; i += 4) {
    out[i] = buf[i + 3];
    out[i + 1] = buf[i + 2];
    out[i + 2] = buf[i + 1];
    out[i + 3] = buf[i];
  }
  if (buf.length % 4) buf.copy(out, n, n);
  return out;
}

// Decrypt an absolute 8-byte-aligned range of an arc into a Buffer.
// `want` is [start, end); it is widened to 8-byte alignment, decrypted, and the
// padding trimmed back off.
//
// NB: egoroof-blowfish with PADDING.NULL strips trailing zero bytes from the
// decoded result, so the output has to be re-padded to the input length. The
// last byte of an entry table is usually zero (it is the high byte of the last
// entry's offset), so without this the final entry of an arc is lost.
function decryptRange(arc, start, end) {
  const from = start - (start % 8);
  let to = end + ((8 - (end % 8)) % 8);
  if (to > arc.length) to = arc.length;
  const slice = arc.subarray(from, to);
  const padded = Buffer.alloc(Math.ceil(slice.length / 8) * 8); // Blowfish pads with 0
  slice.copy(padded);
  let dec = Buffer.from(bf.decode(invertWords(padded), Blowfish.TYPE.UINT8_ARRAY));
  if (dec.length < padded.length) dec = Buffer.concat([dec, Buffer.alloc(padded.length - dec.length)]);
  return invertWords(dec).subarray(start - from, start - from + (end - start));
}

// ------------------------------------------------------------------ containers

function readFpk(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString('ascii', 0, 4) !== 'FPK\0') throw new Error('not an FPK file');
  const count = buf.readUInt16LE(0x0e);
  const entries = [];
  for (let i = 0; i < count; i++) {
    const off = 16 + i * 80;
    if (off + 80 > buf.length) break;
    const raw = buf.subarray(off, off + 64);
    const nul = raw.indexOf(0);
    const p = raw.toString('utf-8', 0, nul === -1 ? 64 : nul);
    entries.push({
      path: p.replace(/^\/+/, '').split('\\').join('/'),
      size: buf.readUInt32LE(off + 68),
      offset: buf.readUInt32LE(off + 76),
    });
  }
  return { buf, entries };
}

// Read an arc's entry table (decrypting only those bytes) and its rTexture
// entries. Returns { name, extHash, compSize, uncompSize, offset }[].
function readArcEntries(buf, start, size) {
  const arc = buf.subarray(start, start + size);
  const magic = arc.toString('ascii', 0, 4);
  if (magic !== 'ARCC' && magic !== 'ARC\0') return { magic, entries: [] };
  const count = arc.readUInt16LE(6);
  const tableEnd = Math.min(arc.length, 8 + count * 80);
  let table;
  if (magic === 'ARCC') {
    table = decryptRange(arc, 8, tableEnd);
    // the reversal happens over the whole body; a slice is fine because the
    // start is 8-byte aligned, but the partial tail needs care
    if (tableEnd - 8 < count * 80) table = Buffer.concat([table, Buffer.alloc(count * 80 - table.length)]);
  } else {
    table = arc.subarray(8, tableEnd);
  }
  const entries = [];
  for (let i = 0; i < count; i++) {
    const o = i * 80;
    const raw = table.subarray(o, o + 64);
    const nul = raw.indexOf(0);
    entries.push({
      name: raw.toString('utf-8', 0, nul === -1 ? 64 : nul).split('\\').join('/'),
      extHash: table.readUInt32LE(o + 64),
      compSize: table.readUInt32LE(o + 68),
      uncompSize: table.readUInt32LE(o + 72) & 0x3fffffff,
      offset: table.readUInt32LE(o + 76),
    });
  }
  return { magic, entries };
}

// ------------------------------------------------------------------ tex header

const TEX_FORMAT = { 0x01: 'RGBA8', 0x06: 'R5G6B5', 0x07: 'RGBA4', 0x0a: 'ETC1', 0x0c: 'BC3', 0x0d: 'PVRTC4' };
const TEX_TYPE = { 0: 'Common', 1: 'BM', 2: 'MM', 5: 'AM', 6: 'CM', 7: 'LP4', 8: 'Nuki' };

function readTexHeader(d) {
  if (d.length < 0x28 || d.toString('ascii', 0, 4) !== 'TEX ') return null;
  const bf0c = d.readUInt32LE(0x0c);
  return {
    version: d.readUInt16LE(4),
    format: d[6],
    type: d.readUInt32LE(8) >> 4,
    width: bf0c & 0x1fff,
    height: (bf0c >> 13) & 0x1fff,
    numMips: (bf0c >> 26) & 0xf,
    dataOffset: d.readUInt32LE(0x10),
  };
}

// ----------------------------------------------------------------------- main

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : dflt;
};

const ROOT = arg('root', 'src/public/res/download/android/v0286/stdDL/cmn');
const OUT = arg('out', 'dump');
const MATCH = new RegExp(arg('match', '^GUI\\.'), 'i');
const DRY = argv.includes('--dry-run');

if (!fs.existsSync(ROOT)) {
  console.error(`pack directory not found: ${ROOT}`);
  process.exit(1);
}

const packs = fs.readdirSync(ROOT).filter((f) => f.endsWith('.fpk') && MATCH.test(f)).sort();
if (!packs.length) {
  console.error(`no packs matching ${MATCH} in ${ROOT}`);
  process.exit(1);
}
console.log(`packs: ${packs.length}  (${ROOT})`);
console.log(`out:   ${OUT}${DRY ? '   [dry run]' : ''}`);
console.log(`rTexture hash: ${HASH_TEXTURE} (0x${HASH_TEXTURE.toString(16)})\n`);

const records = [];
const seen = new Map(); // sha256 -> first tex_path
const skipReasons = {}; // why an arc yielded nothing
const t0 = Date.now();
let arcsSeen = 0;
let texFound = 0;

const skip = (why) => {
  skipReasons[why] = (skipReasons[why] || 0) + 1;
};

for (const pack of packs) {
  const file = path.join(ROOT, pack);
  let fpk;
  try {
    fpk = readFpk(file);
  } catch (e) {
    console.log(`  !! ${pack}: ${e.message}`);
    continue;
  }
  const packName = pack.replace(/\.fpk$/i, '');
  let packTex = 0;

  for (const arcEntry of fpk.entries) {
    arcsSeen++;
    let arc;
    if (arcEntry.offset + arcEntry.size > fpk.buf.length) {
      skip('arc out of bounds');
      continue;
    }
    try {
      arc = readArcEntries(fpk.buf, arcEntry.offset, arcEntry.size);
    } catch (e) {
      skip(`read error: ${e.message}`);
      continue;
    }
    if (arc.magic !== 'ARCC' && arc.magic !== 'ARC\0') {
      // raw media (mp4/wav/ogg) is stored directly in the pack, no textures
      skip(`not an arc (${arc.magic.replace(/[^\x20-\x7e]/g, '.')})`);
      continue;
    }
    if (!arc.entries.length) {
      skip('arc has no entries');
      continue;
    }
    const wanted = arc.entries.filter((e) => e.extHash === HASH_TEXTURE);
    if (!wanted.length) continue;

    const arcRel = arcEntry.path.replace(/\.arc$/i, '');

    // collect the body ranges we need, then decrypt them in as few passes as
    // possible (Blowfish is the slow part, so batch adjacent bodies)
    const ranges = [];
    for (const e of wanted) {
      if (e.compSize <= 0 || e.offset < 8 || e.offset + e.compSize > arcEntry.size) continue;
      ranges.push([e.offset, e.offset + e.compSize]);
    }
    if (!ranges.length) continue;

    // merge overlapping/adjacent ranges
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [ranges[0].slice()];
    for (const [s, e] of ranges.slice(1)) {
      const last = merged[merged.length - 1];
      if (s <= last[1] + 8) last[1] = Math.max(last[1], e);
      else merged.push([s, e]);
    }
    const blobs = merged.map(([s, e]) => decryptRange(fpk.buf.subarray(arcEntry.offset, arcEntry.offset + arcEntry.size), s, e));
    const blobFor = (s) => {
      for (let i = 0; i < merged.length; i++) {
        if (s >= merged[i][0] && s < merged[i][1]) return blobs[i].subarray(s - merged[i][0]);
      }
      return null;
    };

    for (const e of wanted) {
      const comp = blobFor(e.offset);
      if (!comp || comp.length < e.compSize) continue;
      let raw;
      try {
        raw = zlib.inflateSync(comp.subarray(0, e.compSize));
      } catch {
        continue;
      }
      if (raw.length !== e.uncompSize) continue; // sanity: sizes must agree
      texFound++;

      const hdr = readTexHeader(raw) || {};
      const rel = path.join(arcRel, e.name);
      const texPath = path.join(OUT, 'tex', packName, rel) + '.tex';
      const sha = crypto.createHash('sha256').update(raw).digest('hex');
      const dupOf = seen.get(sha);

      let status = 'raw-only';
      let pngPath = '';
      if (dupOf) status = 'duplicate';
      else if (!DRY) {
        fs.mkdirSync(path.dirname(texPath), { recursive: true });
        fs.writeFileSync(texPath, raw);
        seen.set(sha, texPath);
        // RGBA4 is decodable locally; everything else (PVRTC4, ETC1, ...) stays raw
        status = hdr.format === 0x07 ? 'ok' : 'raw-only';
      }

      records.push({
        pack: packName,
        arc: arcEntry.path,
        entry: e.name,
        format: TEX_FORMAT[hdr.format] || String(hdr.format),
        type: TEX_TYPE[hdr.type] || String(hdr.type),
        width: hdr.width || 0,
        height: hdr.height || 0,
        size: raw.length,
        sha256: sha,
        tex_path: dupOf ? dupOf : texPath,
        status,
        ...(dupOf ? { duplicate_of: dupOf } : {}),
      });
      packTex++;
    }
  }
  const done = packs.indexOf(pack) + 1;
  if (done % 10 === 0 || done === packs.length) {
    const el = ((Date.now() - t0) / 1000).toFixed(0);
    console.log(`  [${done}/${packs.length}] ${pack}: ${packTex} textures  (total ${texFound}, ${el}s)`);
  }
}

// ------------------------------------------------------------------- manifest

const byFmt = {};
const byType = {};
const jpn = records.filter((r) => /_jpn/i.test(r.entry));
for (const r of records) {
  byFmt[r.format] = (byFmt[r.format] || 0) + 1;
  byType[r.type] = (byType[r.type] || 0) + 1;
}
const unique = records.filter((r) => r.status !== 'duplicate').length;

if (!DRY) {
  fs.mkdirSync(OUT, { recursive: true });
  const cols = ['pack', 'arc', 'entry', 'format', 'type', 'width', 'height', 'size', 'sha256', 'tex_path', 'status'];
  const csv = [
    cols.join(','),
    ...records.map((r) => cols.map((c) => {
      const v = String(r[c] ?? '');
      return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(',')),
  ].join('\n');
  fs.writeFileSync(path.join(OUT, 'manifest.csv'), csv + '\n');
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(records, null, 1));

  fs.writeFileSync(path.join(OUT, 'summary.txt'), [
    `dumped from ${ROOT}`,
    `packs:            ${packs.length}`,
    `arcs scanned:     ${arcsSeen}`,
    `arcs skipped:     ${Object.entries(skipReasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join('  ') || 'none'}`,
    `texture entries:  ${texFound} (unique: ${unique}, duplicates skipped: ${texFound - unique})`,
    `by format:        ${Object.entries(byFmt).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join('  ')}`,
    `by type:          ${Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join('  ')}`,
    `_jpn entries:     ${jpn.length}   <- text-bearing art, translation targets`,
    ``,
    `jpn files (${jpn.length}):`,
    ...jpn.slice(0, 400).map((r) => `  ${r.pack}  ${r.entry}  [${r.format} ${r.width}x${r.height}]`),
    jpn.length > 400 ? `  ... and ${jpn.length - 400} more` : '',
  ].filter((l) => l !== undefined).join('\n'));
}

console.log(`
arcs scanned      ${arcsSeen}
arcs skipped      ${Object.entries(skipReasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join('  ') || 'none'}
texture entries   ${texFound}
unique written    ${unique}
duplicates        ${texFound - unique}
by format         ${Object.entries(byFmt).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join('  ')}
by type           ${Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join('  ')}
_jpn (has JP text) ${jpn.length}
elapsed           ${((Date.now() - t0) / 1000).toFixed(1)}s
${DRY ? '' : `manifest: ${path.join(OUT, 'manifest.csv')}`}`);
