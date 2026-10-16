/*
 * Read and rewrite the GMD dialogue inside a GUI.NN.fpk pack.
 *
 *   node tools-js/gmd-arc.cjs extract <pack.fpk> <outdir>
 *   node tools-js/gmd-arc.cjs list    <pack.fpk>
 *   node tools-js/gmd-arc.cjs apply   <pack.fpk> <dictdir> <out.fpk>
 *
 * These packs (GUI.78..94) hold the story / camp / relic-note dialogue. Each
 * pack entry is an ARCC containing one GMD file; the dialogue text is the GMD's
 * trailing string block, exactly like the files in GUI_msg.arc.
 *
 * extract writes <outdir>/<entry>.json = [{i, jp, en:""}] for every GMD.
 * apply   rebuilds only the GMDs that have a <dictdir>/<entry>.json whose
 *         entries carry a non-empty "en"; anything else is copied from the input
 *         pack untouched, so a half-finished dictionary is safe.
 *
 * The GMD string block is rebuilt (size at 0x20 updated); labels are untouched.
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { Blowfish } = require('egoroof-blowfish');

const ARC_KEY = 'kaseoa nkaeka;eawf3';
const DIM_HEADER = 8;
const DIM_VOCE = 80;
const TAG = 0x242bb29a;

function inverti(buf) {
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i + 3 < buf.length; i += 4) {
    out[i] = buf[i + 3]; out[i + 1] = buf[i + 2]; out[i + 2] = buf[i + 1]; out[i + 3] = buf[i];
  }
  const rest = buf.length % 4;
  if (rest > 0) buf.copy(out, buf.length - rest, buf.length - rest);
  return out;
}
const decifra = (buf) => {
  const bf = new Blowfish(ARC_KEY, Blowfish.MODE.ECB, Blowfish.PADDING.NULL);
  const g = inverti(buf);
  let c = Buffer.from(bf.decode(g, Blowfish.TYPE.UINT8_ARRAY));
  if (c.length < g.length) c = Buffer.concat([c, Buffer.alloc(g.length - c.length)]);
  return inverti(c);
};
const cifra = (buf) => {
  const bf = new Blowfish(ARC_KEY, Blowfish.MODE.ECB, Blowfish.PADDING.NULL);
  return inverti(Buffer.from(bf.encode(inverti(buf))));
};
const base = (s) => s.replace(/\\/g, '/').split('/').pop();

function parseFpk(buf) {
  if (buf.toString('ascii', 0, 4) !== 'FPK\0') throw new Error('not an FPK');
  const count = buf.readUInt16LE(0x0e);
  const entries = [];
  for (let i = 0; i < count; i++) {
    const o = 16 + i * 80;
    entries.push({
      raw: buf.subarray(o, o + 64),
      filePath: buf.subarray(o, o + 64).toString('utf8').replace(/\0.*$/, ''),
      size: buf.readUInt32LE(o + 68),
      sizeAndFlags: buf.readUInt32LE(o + 72),
      offset: buf.readUInt32LE(o + 76),
    });
  }
  return { count, entries };
}
function buildFpk(bodies, header) {
  const headerLen = 16 + bodies.length * 80;
  let total = headerLen;
  for (const b of bodies) total += b.data.length;
  const out = Buffer.alloc(total);
  header.buf.copy(out, 0, 0, 16);
  out.writeUInt16LE(bodies.length, 0x0e);
  let c = headerLen;
  bodies.forEach((b, i) => {
    const o = 16 + i * 80;
    b.raw.copy(out, o);
    out.writeUInt32LE(b.data.length, o + 68);
    out.writeUInt32LE(b.sizeAndFlags, o + 72);
    out.writeUInt32LE(c, o + 76);
    b.data.copy(out, c);
    c += b.data.length;
  });
  return out;
}

const gmdStrings = (buf) => {
  const dim = buf.readUInt32LE(0x20);
  const s = buf.subarray(buf.length - dim).toString('utf8').split('\0');
  if (s.at(-1) === '') s.pop();
  return s;
};
function gmdScrivi(orig, strings) {
  const dim = orig.readUInt32LE(0x20);
  const testa = Buffer.from(orig.subarray(0, orig.length - dim));
  const blocco = Buffer.concat(strings.map((s) => Buffer.concat([Buffer.from(s, 'utf8'), Buffer.from([0])])));
  testa.writeUInt32LE(blocco.length, 0x20);
  return Buffer.concat([testa, blocco]);
}

// Legge l'archivio ARCC di una voce e restituisce le sue voci interne.
function leggiArc(arcBuf) {
  if (arcBuf.toString('ascii', 0, 4) !== 'ARCC') return null;
  const count = arcBuf.readUInt16LE(6);
  const corpo = decifra(arcBuf.subarray(DIM_HEADER));
  const voci = [];
  for (let i = 0; i < count; i++) {
    const o = i * DIM_VOCE;
    voci.push({
      raw: corpo.subarray(o, o + 64),
      name: base(corpo.subarray(o, o + 64).toString('utf8').replace(/\0.*$/, '')),
      csize: corpo.readUInt32LE(o + 68),
      // offset is stored relative to the body start; in the raw ARCC buffer the
      // body begins at +8, so the absolute position is exactly the stored value.
      abs: corpo.readUInt32LE(o + 76),
      start: corpo.readUInt32LE(o + 76) - DIM_HEADER,
    });
  }
  return { version: arcBuf.readUInt16LE(4), count, voci, corpo };
}
function scriviArc(version, voci, corpi) {
  const tabella = voci.length * DIM_VOCE;
  const compressi = corpi.map((c) => zlib.deflateSync(c));
  const totale = tabella + compressi.reduce((a, b) => a + b.length, 0);
  const corpo = Buffer.alloc(totale);
  let cursor = tabella;
  for (let i = 0; i < voci.length; i++) {
    const o = i * DIM_VOCE;
    voci[i].raw.copy(corpo, o);
    corpo.writeUInt32LE(TAG, o + 64);
    corpo.writeUInt32LE(compressi[i].length, o + 68);
    corpo.writeUInt32LE(0x40000000 | corpi[i].length, o + 72);
    corpo.writeUInt32LE(cursor + DIM_HEADER, o + 76);
    compressi[i].copy(corpo, cursor);
    cursor += compressi[i].length;
  }
  const head = Buffer.alloc(DIM_HEADER);
  head.write('ARCC', 0, 'ascii');
  head.writeUInt16LE(version, 4);
  head.writeUInt16LE(voci.length, 6);
  // Blowfish ECB (NULL padding) needs a multiple of 8; the real packs pad the
  // body too. Without this the cipher silently corrupts the tail.
  const avanzo = corpo.length % 8;
  const corpoPad = avanzo ? Buffer.concat([corpo, Buffer.alloc(8 - avanzo)]) : corpo;
  return Buffer.concat([head, cifra(corpoPad)]);
}

function main() {
  const [mode, packPath, a, b] = process.argv.slice(2);
  if (!mode || !packPath) {
    console.error('uso: gmd-arc.cjs extract|list|apply <pack.fpk> [...]');
    process.exit(1);
  }
  const packBuf = fs.readFileSync(packPath);
  const pack = parseFpk(packBuf);

  if (mode === 'list') {
    let n = 0;
    for (const e of pack.entries) {
      const arc = leggiArc(packBuf.subarray(e.offset, e.offset + e.size));
      if (!arc) continue;
      for (const v of arc.voci) { console.log(base(e.filePath) + '  ->  ' + v.name); n++; }
    }
    console.log(`${n} GMD in ${packPath}`);
    return;
  }

  if (mode === 'extract') {
    const outDir = a;
    fs.mkdirSync(outDir, { recursive: true });
    let n = 0;
    for (const e of pack.entries) {
      const arc = leggiArc(packBuf.subarray(e.offset, e.offset + e.size));
      if (!arc) continue;
      for (const v of arc.voci) {
        const gmd = zlib.inflateSync(arc.corpo.subarray(v.start, v.start + v.csize));
        if (gmd.toString('ascii', 0, 3) !== 'GMD') continue;
        const strs = gmdStrings(gmd);
        const diz = strs.map((jp, i) => ({ i, jp, en: '' }));
        fs.writeFileSync(path.join(outDir, v.name + '.json'), JSON.stringify(diz, null, 1));
        n++;
      }
    }
    console.log(`${n} GMD estratti in ${outDir}`);
    return;
  }

  if (mode === 'apply') {
    const dictDir = a;
    const outPath = b;
    const bodies = [];
    let rifatti = 0, uguali = 0;
    for (const e of pack.entries) {
      const arcBuf = packBuf.subarray(e.offset, e.offset + e.size);
      const arc = leggiArc(arcBuf);
      if (!arc) { bodies.push({ raw: e.raw, data: arcBuf, sizeAndFlags: e.sizeAndFlags }); continue; }
      const corpi = arc.voci.map((v) => zlib.inflateSync(arc.corpo.subarray(v.start, v.start + v.csize)));
      let toccato = false;
      for (let i = 0; i < arc.voci.length; i++) {
        const v = arc.voci[i];
        if (corpi[i].toString('ascii', 0, 3) !== 'GMD') continue;
        const dp = path.join(dictDir, v.name + '.json');
        if (!fs.existsSync(dp)) continue;
        const diz = JSON.parse(fs.readFileSync(dp, 'utf8'));
        if (diz.every((x) => !x.en)) continue;
        const strs = gmdStrings(corpi[i]);
        const nuove = strs.slice();
        for (const x of diz) if (x.en && x.i >= 0 && x.i < nuove.length) nuove[x.i] = x.en;
        corpi[i] = gmdScrivi(corpi[i], nuove);
        toccato = true;
        rifatti++;
      }
      if (toccato) bodies.push({ raw: e.raw, data: scriviArc(arc.version, arc.voci, corpi), sizeAndFlags: e.sizeAndFlags });
      else { bodies.push({ raw: e.raw, data: arcBuf, sizeAndFlags: e.sizeAndFlags }); uguali++; }
    }
    const out = buildFpk(bodies, { buf: packBuf.subarray(0, 16) });
    fs.writeFileSync(outPath, out);
    console.log(`${packPath} -> ${outPath}`);
    console.log(`  GMD riscritti: ${rifatti}   voci copiate: ${uguali}   ${packBuf.length} -> ${out.length} byte`);
    return;
  }

  console.error('modo sconosciuto: ' + mode);
  process.exit(1);
}
main();
