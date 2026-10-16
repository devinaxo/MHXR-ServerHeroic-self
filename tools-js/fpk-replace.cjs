// Replace one file inside an FPK pack, preserving every other entry.
//
// FPK layout (from fpk-list.cjs):
//   0x00 "FPK\0"  0x0c u16 compression  0x0e u16 file count
//   entry, 80 bytes:
//     0x00  char path[64]
//     0x44  u32 size
//     0x48  u32 sizeAndFlags
//     0x4c  u32 offset
//   then the bodies
//
// Bodies are NOT compressed at the FPK layer -- each is already-compressed
// content (an ARC, a TEX, ...) written verbatim. Compression flag 2 in these
// packs means the inner container handles its own compression.
//
// Rewriting shifts every later entry's offset, so the whole body region is
// rebuilt and all offsets recomputed.
//
//   node fpk-replace.cjs <in.fpk> <out.fpk> <entry-substring> <replacement-file>
//
// Verifies by re-reading: every untouched entry must come back byte-identical
// and the replaced entry must match the replacement file.
const fs = require('fs');
const path = require('path');

function parseFpk(buf) {
  if (buf.toString('ascii', 0, 4) !== 'FPK\0') throw new Error('not an FPK file');
  const compression = buf.readUInt16LE(0x0c);
  const fileCount = buf.readUInt16LE(0x0e);
  const entries = [];
  for (let i = 0; i < fileCount; i++) {
    const off = 16 + i * 80;
    if (off + 80 > buf.length) break;
    const pbuf = buf.subarray(off, off + 64);
    const nul = pbuf.indexOf(0);
    entries.push({
      path: pbuf.toString('utf-8', 0, nul === -1 ? 64 : nul),
      raw: Buffer.from(pbuf),
      size: buf.readUInt32LE(off + 68),
      sizeAndFlags: buf.readUInt32LE(off + 72),
      offset: buf.readUInt32LE(off + 76),
    });
  }
  return { compression, entries };
}

const [, , inFile, outFile, match, replFile] = process.argv;
if (!inFile || !outFile || !match || !replFile) {
  console.error('Uso: node fpk-replace.cjs <in.fpk> <out.fpk> <entry-substring> <replacement-file>');
  process.exit(1);
}

const orig = fs.readFileSync(inFile);
const { compression, entries } = parseFpk(orig);
const idx = entries.findIndex((e) => e.path.toLowerCase().includes(match.toLowerCase()));
if (idx === -1) {
  console.error(`no entry matches ${JSON.stringify(match)}`);
  console.error(`first entries: ${entries.slice(0, 5).map((e) => e.path).join(', ')}`);
  process.exit(1);
}

const repl = fs.readFileSync(replFile);
console.log(`${path.basename(inFile)}: ${entries.length} entries, compression ${compression}`);
console.log(`replacing ${entries[idx].path}`);
console.log(`  ${entries[idx].size} bytes -> ${repl.length} bytes`);

// Header is 16 + 80*count. Bodies follow, in entry order, tightly packed.
const headerLen = 16 + entries.length * 80;
const outEntries = [];
const bodies = [];
let cursor = headerLen;

entries.forEach((e, i) => {
  const body = i === idx ? repl : orig.subarray(e.offset, e.offset + e.size);
  outEntries.push({ path: e.path, raw: e.raw, sizeAndFlags: e.sizeAndFlags });
  bodies.push(body);
  cursor += body.length;
});

const out = Buffer.alloc(16 + entries.length * 80 + bodies.reduce((a, b) => a + b.length, 0));
orig.copy(out, 0, 0, 16); // keep "FPK\0", version, compression, count
out.writeUInt16LE(entries.length, 0x0e);

let bodyCursor = headerLen;
outEntries.forEach((e, i) => {
  const off = 16 + i * 80;
  e.raw.copy(out, off);
  out.writeUInt32LE(bodies[i].length, off + 68);
  // +0x48 encodes the size too: (size & 0x1fffffff) | (flags << 29). Recompute,
  // never copy -- a stale size here makes the client crash on startup.
  out.writeUInt32LE(((bodies[i].length & 0x1fffffff) >>> 0 | ((e.sizeAndFlags ?? 0x20000000) & 0xe0000000)) >>> 0, off + 72);
  out.writeUInt32LE(bodyCursor, off + 76);
  bodies[i].copy(out, bodyCursor);
  bodyCursor += bodies[i].length;
});

fs.writeFileSync(outFile, out);
console.log(`wrote ${outFile} (${out.length} bytes, was ${orig.length})`);

// --- verify -----------------------------------------------------------------
const check = parseFpk(fs.readFileSync(outFile));
let ok = 0;
const failed = [];
for (let i = 0; i < check.entries.length; i++) {
  const e = check.entries[i];
  const got = out.subarray(e.offset, e.offset + e.size);
  const want = i === idx ? repl : orig.subarray(entries[i].offset, entries[i].offset + entries[i].size);
  if (got.equals(want)) ok++;
  else failed.push(e.path);
}
console.log(`\nverify: ${ok}/${check.entries.length} entries byte-identical to intent`);
if (failed.length) {
  console.log(`  FAILED: ${failed.slice(0, 5).join(', ')}`);
  process.exit(1);
}
console.log(`  replaced entry matches the replacement file: true`);
console.log('\n  NOTE: the pack changed size, so its crcjam in download.list changes');
console.log('  too. Delete download.list and restart the server so it is regenerated.');
