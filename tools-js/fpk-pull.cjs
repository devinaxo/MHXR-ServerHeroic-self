// Pull a single file out of an FPK pack to a standalone file, or push one back.
// The ARC tools operate on standalone .arc files, but the art lives inside
// GUI.00.fpk, so this bridges the two.
//
//   node fpk-pull.cjs <in.fpk> <out> <entry-substring>
//   node fpk-push.cjs <in.fpk> <out> <entry-substring> <replacement-file>
//
// Verified to round-trip: pull then push reproduces the original byte-for-byte
// when the replacement is the pulled file.

const fs = require('fs');

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

function rebuild(orig, entries, replacementIdx, replacement) {
  const headerLen = 16 + entries.length * 80;
  const bodies = [];
  let cursor = headerLen;
  entries.forEach((e, i) => {
    const body =
      i === replacementIdx ? replacement : orig.subarray(e.offset, e.offset + e.size);
    bodies.push(body);
    cursor += body.length;
  });
  const out = Buffer.alloc(headerLen + bodies.reduce((a, b) => a + b.length, 0));
  orig.copy(out, 0, 0, 16);
  out.writeUInt16LE(entries.length, 0x0e);
  let c = headerLen;
  entries.forEach((e, i) => {
    const off = 16 + i * 80;
    e.raw.copy(out, off);
    out.writeUInt32LE(bodies[i].length, off + 68);
    // +0x48 encodes the size as well as the flags; recompute it so it never goes
    // stale when the replacement changes the entry length (client-crash bug).
    out.writeUInt32LE(((bodies[i].length & 0x1fffffff) >>> 0 | ((e.sizeAndFlags ?? 0x20000000) & 0xe0000000)) >>> 0, off + 72);
    out.writeUInt32LE(c, off + 76);
    bodies[i].copy(out, c);
    c += bodies[i].length;
  });
  return out;
}

const [, , mode, inFile, outFile, match, replFile] = process.argv;
// Invoked by basename (the documented "node fpk-pull.cjs" form) or by full path;
// in the container it is always called as /app/tools/fpk-pull.cjs, so fall back to
// the directory this file lives in rather than assuming a relative path.
const HERE = __dirname;
if (!mode || !inFile || !outFile) {
  console.error(
    'Uso: node fpk-pull.cjs <in.fpk> <out> <entry-substring>\n' +
      '     node fpk-push.cjs <in.fpk> <out> <entry-substring> <replacement>'
  );
  process.exit(1);
}

const orig = fs.readFileSync(inFile);
const { compression, entries } = parseFpk(orig);
const idx = entries.findIndex((e) => e.path.toLowerCase().includes(match.toLowerCase()));
if (idx === -1) {
  console.error(`no entry matches ${JSON.stringify(match)}`);
  console.error(`entries: ${entries.length}, first: ${entries[0].path}`);
  process.exit(1);
}

if (mode === 'fpk-pull') {
  const e = entries[idx];
  fs.writeFileSync(outFile, orig.subarray(e.offset, e.offset + e.size));
  console.log(`${e.path}`);
  console.log(`  ${e.size} bytes -> ${outFile}`);
  console.log(`  (pack had ${entries.length} entries, compression ${compression})`);
} else {
  if (!replFile) {
    console.error('fpk-push needs a replacement file');
    process.exit(1);
  }
  const repl = fs.readFileSync(replFile);
  const out = rebuild(orig, entries, idx, repl);
  fs.writeFileSync(outFile, out);
  console.log(`replaced ${entries[idx].path}`);
  console.log(`  ${entries[idx].size} -> ${repl.length} bytes`);
  console.log(`wrote ${outFile} (${out.length} bytes, was ${orig.length})`);

  // verify
  const check = parseFpk(fs.readFileSync(outFile));
  let ok = 0;
  const failed = [];
  for (let i = 0; i < check.entries.length; i++) {
    const e = check.entries[i];
    const got = out.subarray(e.offset, e.offset + e.size);
    const want =
      i === idx ? repl : orig.subarray(entries[i].offset, entries[i].offset + entries[i].size);
    if (got.equals(want)) ok++;
    else failed.push(e.path);
  }
  console.log(`\nverify: ${ok}/${check.entries.length} entries byte-identical to intent`);
  if (failed.length) {
    console.log(`  FAILED: ${failed.slice(0, 5).join(', ')}`);
    process.exit(1);
  }
}
