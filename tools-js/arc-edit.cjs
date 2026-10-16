// Prove the ARC write path end to end: read an archive, replace one entry's
// bytes, rebuild, then re-read and confirm the replacement survived.
//
//   node arc-edit.cjs <in.arc> <out.arc> <entry-substring> <replacement-file>
//
// With --replace-entry-only the archive layout is untouched (same offsets, same
// sizes) because the replacement is padded/truncated to the original body size;
// that is the case worth testing, since it is what a same-size texture edit
// produces. Without it, the entry grows and offsets shift.
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

function leggi(file) {
  const buf = fs.readFileSync(file);
  const n = buf.readUInt16LE(6);
  const corpo = decifra(buf.subarray(8));
  const voci = [];
  for (let i = 0; i < n; i++) {
    const o = i * 80;
    const stored = corpo.subarray(o, o + 64).toString('utf-8').replace(/\0.*$/, '');
    const csize = corpo.readUInt32LE(o + 68);
    const start = corpo.readUInt32LE(o + 76) - 8;
    let dati = null;
    try {
      dati = zlib.inflateSync(corpo.subarray(start, start + csize));
    } catch {
      /* keep null */
    }
    voci.push({
      stored,
      tag: corpo.readUInt32LE(o + 64),
      csize,
      usizeFlags: corpo.readUInt32LE(o + 72),
      start,
      dati,
    });
  }
  return { version: buf.readUInt16LE(4), voci, corpoLen: corpo.length };
}

const [, , inFile, outFile, match, replFile, ...resto] = process.argv;
if (!inFile || !outFile || !match || !replFile) {
  console.error(
    'Uso: node arc-edit.cjs <in.arc> <out.arc> <entry-substring> <replacement-file> [--grow]'
  );
  process.exit(1);
}
const grow = resto.includes('--grow');

const { version, voci, corpoLen } = leggi(inFile);
const idx = voci.findIndex((v) => v.stored.includes(match));
if (idx === -1) {
  console.error(`no entry matches ${JSON.stringify(match)}`);
  process.exit(1);
}
const target = voci[idx];
const repl = fs.readFileSync(replFile);
console.log(`replacing ${target.stored}`);
console.log(`  original ${target.dati.length} bytes, replacement ${repl.length} bytes`);
if (!grow && repl.length !== target.dati.length) {
  console.log(
    `  WARNING: sizes differ and --grow was not passed. Padding/truncating to ` +
      `${target.dati.length} to keep the archive layout identical.`
  );
}

const newData =
  grow || repl.length === target.data?.length
    ? repl
    : (() => {
        const b = Buffer.alloc(target.dati.length);
        repl.copy(b, 0, 0, Math.min(repl.length, target.dati.length));
        return b;
      })();

const bodies = voci.map((v, i) => (i === idx ? zlib.deflateSync(newData, { level: 6 }) : null));

// Prefer keeping every original offset. That only works if the replacement
// compresses to exactly the original size, which a same-size edit will not
// generally do -- the deflate output shifts. So: if the compressed size happens
// to match, patch in place; otherwise repack the body region and rewrite all
// offsets. Both paths are valid containers; only the in-place one is minimal.
const bodyStart = Math.min(...voci.map((v) => v.start));
// Capcom keeps every body offset and compressed size on an 8-byte boundary. If
// an archive was ever rebuilt without that padding, patching in place would
// preserve the misalignment forever (re-deflating the same input gives the same
// length, so the in-place path keeps getting chosen). Only use it when the
// layout is already aligned; otherwise fall through to the grow path, which
// repads and rewrites every offset.
const layoutAligned = voci.every((v) => v.start % 8 === 0 && v.csize % 8 === 0);
let corpo;
if (!grow && layoutAligned && bodies[idx].length === target.csize) {
  corpo = Buffer.from(decifra(fs.readFileSync(inFile).subarray(8)));
  bodies[idx].copy(corpo, target.start);
  const o = idx * 80;
  corpo.writeUInt32LE(bodies[idx].length, o + 68);
  corpo.writeUInt32LE((newData.length | 0x40000000) >>> 0, o + 72);
  console.log(`  same-size path: layout preserved, only ${bodies[idx].length} body bytes change`);
} else {
  // Capcom pads every compressed body up to a multiple of 8 bytes, and the
  // stored compressed size includes that padding -- the original archives all
  // have cs % 8 == 0 and body offsets that are multiples of 8. Without the
  // padding every offset after the first lands off the Blowfish block grid, so
  // an entry decrypted at its own offset (which is how the client reads it)
  // comes back as garbage and the screen crashes.
  const pad8 = (buf) => (buf.length % 8 ? Buffer.concat([buf, Buffer.alloc(8 - (buf.length % 8))]) : buf);
  const bodyFor = (i) => pad8(bodies[i] || zlib.deflateSync(voci[i].dati, { level: 6 }));
  const total = bodyStart + voci.reduce((a, _v, i) => a + bodyFor(i).length, 0);
  // The body region must be padded to a whole number of 8-byte Blowfish
  // blocks. cifra/decifra only round-trip at multiples of 8: inverti() leaves a
  // partial 4-byte tail unreversed, but the decoder reverses the padded group
  // again, which byte-swaps the last entry in place (it sits at the very end of
  // the body region, so it is always the victim). Capcom's own packer pads the
  // same way.
  const need = Math.max(corpoLen, total);
  // Seed from the original plaintext instead of zeros, so the padding and any
  // junk Capcom left between the table and the first body survives the rewrite
  // untouched; only the regions we actually write over change.
  corpo = Buffer.from(decifra(fs.readFileSync(inFile).subarray(8)));
  if (corpo.length < need + ((8 - (need % 8)) % 8)) {
    corpo = Buffer.concat([corpo, Buffer.alloc(need + ((8 - (need % 8)) % 8) - corpo.length)]);
  }
  let cursor = bodyStart;
  voci.forEach((v, i) => {
    const o = i * 80;
    const pb = Buffer.alloc(64);
    pb.write(v.stored, 0, 'utf-8');
    pb.copy(corpo, o);
    corpo.writeUInt32LE(v.tag, o + 64);
    const b = bodyFor(i);
    corpo.writeUInt32LE(b.length, o + 68);
    corpo.writeUInt32LE((v.dati.length | 0x40000000) >>> 0, o + 72);
    corpo.writeUInt32LE(cursor + 8, o + 76);
    b.copy(corpo, cursor);
    cursor += b.length;
  });
  console.log(`  grow path: repacked from ${bodyStart}, new size ${corpo.length}`);
}

const header = Buffer.alloc(8);
header.write('ARCC', 0, 'ascii');
header.writeUInt16LE(version, 4);
header.writeUInt16LE(voci.length, 6);
fs.writeFileSync(outFile, Buffer.concat([header, cifra(corpo)]));
console.log(`wrote ${outFile}`);

// --- verify by reading it back ---------------------------------------------
const check = leggi(outFile);
let ok = 0;
let bad = [];
for (let i = 0; i < check.voci.length; i++) {
  const want = i === idx ? newData : voci[i].dati;
  const got = check.voci[i].dati;
  if (got && want && got.equals(want)) ok++;
  else bad.push(check.voci[i].stored);
}
console.log(`\nverify: ${ok}/${check.voci.length} entries read back with the expected bytes`);
if (bad.length) {
  console.log(`  FAILED: ${bad.join(', ')}`);
  process.exit(1);
}
console.log(`  replacement survived the write: ${check.voci[idx].dati.equals(newData)}`);
