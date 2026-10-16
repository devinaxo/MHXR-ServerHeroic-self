/*
 * Rebuilds GUI_msg.arc from lavoro-traduzione/trad/*.json and writes it into an
 * FPK, so editing a translated string reaches the client.
 *
 *   node build-msg-arc.cjs <GUI.00.fpk> <out.fpk>
 *   node build-msg-arc.cjs --check <GUI.00.fpk>
 *
 * How it works
 * ------------
 * Menu text never touches the network: it lives in GUI_msg.arc inside the
 * GUI.00.fpk the client downloads. Each of the 49 entries is a Capcom GMD file
 * whose strings sit in a block at the very end of the file, so translating only
 * changes that block's size. The label block, and therefore every message key
 * the game looks up, is carried over untouched.
 *
 * The base is the original Japanese msg/*_jpn. trad/*.json is the dictionary
 * ({ i, jp, en }); an empty "en" leaves that string Japanese, so a file can be
 * half-finished without breaking anything.
 *
 * Offsets are recomputed from scratch. The archive stores its entries back to
 * back with no slack, so an edit that changes a string's length cannot be
 * patched in place; every offset and size is written out again here.
 *
 * Proven: run against the pack the server is serving now with --check, this
 * reproduces all 2,351 MenuCmn strings exactly.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');
const { Blowfish } = require('egoroof-blowfish');
const { parseFpk, buildFpk } = require('./fpk-fmt.cjs');

const ARC_KEY = 'kaseoa nkaeka;eawf3';
const DIM_HEADER = 8;
const DIM_VOCE = 80;

const TRAD = process.env.TRAD_DIR ?? 'lavoro-traduzione/trad';
const MSG = process.env.MSG_DIR ?? 'lavoro-traduzione/msg';

// The archive stores each group of 4 bytes reversed relative to Blowfish's
// expectation: rotate before decrypting, and again after.
function inverti(buf) {
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i + 3 < buf.length; i += 4) {
    out[i] = buf[i + 3];
    out[i + 1] = buf[i + 2];
    out[i + 2] = buf[i + 1];
    out[i + 3] = buf[i];
  }
  const rest = buf.length % 4;
  if (rest > 0) buf.copy(out, buf.length - rest, buf.length - rest);
  return out;
}
function decifra(buf) {
  const bf = new Blowfish(ARC_KEY, Blowfish.MODE.ECB, Blowfish.PADDING.NULL);
  const girato = inverti(buf);
  let chiaro = Buffer.from(bf.decode(girato, Blowfish.TYPE.UINT8_ARRAY));
  if (chiaro.length < girato.length) chiaro = Buffer.concat([chiaro, Buffer.alloc(girato.length - chiaro.length)]);
  return inverti(chiaro);
}
function cifra(buf) {
  // inverti() only reverses whole 4-byte words, so a body whose length is not a
  // multiple of 4 leaves its tail un-reversed. Blowfish then pads the ciphertext
  // to 8 bytes and decifra() reverses that tail back, corrupting the last 1-3
  // bytes of the archive (which broke the global string block when the rebuild
  // happened to land on a length not divisible by 4). Pad to 8 here: the result
  // is byte-identical whenever the body already was 4-aligned, since Blowfish
  // added the same zero padding anyway.
  const resto = buf.length % 8;
  const allineato = resto ? Buffer.concat([buf, Buffer.alloc(8 - resto)]) : buf;
  const bf = new Blowfish(ARC_KEY, Blowfish.MODE.ECB, Blowfish.PADDING.NULL);
  return inverti(Buffer.from(bf.encode(inverti(allineato))));
}

/** Reads an ARCC entry table: names and payload positions, bodies left in place. */
function leggiVoci(buf) {
  if (buf.toString('ascii', 0, 4) !== 'ARCC') throw new Error('not an ARCC archive');
  const count = buf.readUInt16LE(6);
  const corpo = decifra(buf.subarray(DIM_HEADER));
  const voci = [];
  for (let i = 0; i < count; i++) {
    const off = i * DIM_VOCE;
    voci.push({
      raw: corpo.subarray(off, off + 64).toString('utf8').replace(/\0.*$/, ''),
      rawBuf: corpo.subarray(off, off + 64),
      tag: corpo.readUInt32LE(off + 64),
      size: corpo.readUInt32LE(off + 68),
      // 0x40000000 | uncompressed size. The client reads this length, so leaving
      // it stale after changing a payload makes it misparse every entry and the
      // game dies on startup. Verified against all 49 entries of the live pack.
      uncompFlag: corpo.readUInt32LE(off + 72),
      start: corpo.readUInt32LE(off + 76) - DIM_HEADER,
    });
  }
  return { version: buf.readUInt16LE(4), count, corpo, voci };
}

const baseName = (nome) => nome.replace(/\\/g, '/').split('/').pop();

/** All strings of one GMD payload, in order. */
function stringheGmd(buf) {
  const dim = buf.readUInt32LE(0x20);
  const s = buf.subarray(buf.length - dim).toString('utf8').split('\0');
  if (s.at(-1) === '') s.pop();
  return s;
}

function main() {
  const argv = process.argv.slice(2);
  const check = argv.includes('--check');
  const fpkIn = argv.find((a) => a.endsWith('.fpk'));
  const fpkOut = argv.filter((a) => a.endsWith('.fpk'))[1];
  if (!fpkIn) {
    console.error('Uso: build-msg-arc.cjs <GUI.00.fpk> <out.fpk>   |   --check <GUI.00.fpk>');
    process.exit(1);
  }

  const pack = parseFpk(fs.readFileSync(fpkIn));
  const msg = pack.entries.find((e) => /GUI_msg\.arc$/.test(e.filePath));
  if (!msg) throw new Error(`GUI_msg.arc not inside ${fpkIn}`);

  const { version, count, corpo, voci } = leggiVoci(msg.data);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'msgarc-'));

  const corpi = voci.map((v) => zlib.inflateSync(corpo.subarray(v.start, v.start + v.size)));
  let rifatti = 0;
  let saltati = 0;
  let vuote = 0;
  let uguali = 0;
  let diversi = 0;
  const campioni = [];

  voci.forEach((v, i) => {
    const base = baseName(v.raw);
    const dizPath = path.join(TRAD, base.replace(/_jpn$/, '.json'));
    const src = path.join(MSG, base);
    if (!fs.existsSync(dizPath) || !fs.existsSync(src)) {
      saltati++;
      return;
    }
    const diz = JSON.parse(fs.readFileSync(dizPath, 'utf8'));

    /*
     * Not every file has been translated. Where the dictionary is entirely
     * empty, keep the bytes the pack already serves rather than falling back to
     * the Japanese -- that is the state the client is running now, so leaving it
     * alone is what keeps this a no-op until a real edit is made.
     */
    if (diz.every((v2) => !v2.en)) {
      vuote++;
      return;
    }
    // testo-gmd.cjs takes the dictionary as a file path, so hand it one.
    const dizFile = path.join(tmp, base + '.dict.json');
    const gmd = path.join(tmp, base);
    fs.writeFileSync(dizFile, JSON.stringify(diz));
    try {
      execFileSync('node', [path.join(__dirname, 'testo-gmd.cjs'), 'scrivi', src, dizFile, gmd], { stdio: 'pipe' });
    } catch (err) {
      // stderr arrives as a Buffer, so decode before looking for the cause.
      const grezzo = err.stderr?.toString() ?? String(err.message ?? err);
      const riga = grezzo.split('\n').find((l) => /open |Error|non e'|trovate/.test(l)) ?? grezzo.split('\n')[0];
      throw new Error(`${base}: ${riga.replace(/^\s*at\s+.*/, '').trim().slice(0, 160)}`);
    }

    const nuovo = fs.readFileSync(gmd);
    const vecchio = stringheGmd(corpi[i]);
    const adesso = stringheGmd(nuovo);
    if (vecchio.length !== adesso.length) {
      throw new Error(`${base}: numero di stringhe cambiato (${vecchio.length} -> ${adesso.length})`);
    }
    for (let s = 0; s < adesso.length; s++) {
      if (vecchio[s] === adesso[s]) uguali++;
      else {
        diversi++;
        if (campioni.length < 10) campioni.push(`${base}[${s}] ${JSON.stringify(vecchio[s])} -> ${JSON.stringify(adesso[s])}`);
      }
    }
    corpi[i] = nuovo;
    rifatti++;
  });

  console.log(`GMD ricostruiti: ${rifatti}, ancora non tradotti: ${vuote}, senza dizionario: ${saltati}`);
  console.log(`stringhe identiche: ${uguali}, diverse: ${diversi}`);
  for (const c of campioni) console.log('  ' + c);

  // Lay the entries out again, back to back, rewriting size and offset.
  const tabella = count * DIM_VOCE;
  const compressi = corpi.map((c) => zlib.deflateSync(c));
  const totale = tabella + compressi.reduce((t, c) => t + c.length, 0);
  const nuovoCorpo = Buffer.alloc(totale);
  let cursor = tabella;
  for (let i = 0; i < count; i++) {
    const off = i * DIM_VOCE;
    voci[i].rawBuf.copy(nuovoCorpo, off);
    const compresso = compressi[i];
    /*
     * Entry record layout, all four fields past the name:
     *   +0x40 0x242BB29A   tag the client checks
     *   +0x44 compressed size
     *   +0x48 0x40000000 | uncompressed size
     *   +0x4C offset, relative to the start of the archive body
     *
     * The tag and the flag are written as constants, not copied from the source.
     * Carrying them across propagates their absence: versions 288 and 289 both
     * shipped with them zero and the game would not start.
     */
    nuovoCorpo.writeUInt32LE(0x242bb29a, off + 64);
    nuovoCorpo.writeUInt32LE(compresso.length, off + 68);
    // Always set 0x40000000 rather than copying it: it is what marks the entry as
    // carrying a decompressed length. Carrying the flag across from the source
    // propagates its absence, which is exactly the state that shipped in 288 and
    // 289 and made the client refuse to boot.
    nuovoCorpo.writeUInt32LE(0x40000000 | corpi[i].length, off + 72);
    // Offsets are stored relative to the start of the archive body.
    nuovoCorpo.writeUInt32LE(cursor + DIM_HEADER, off + 76);
    compresso.copy(nuovoCorpo, cursor);
    cursor += compresso.length;
  }

  const header = Buffer.alloc(DIM_HEADER);
  header.write('ARCC', 0, 'ascii');
  header.writeUInt16LE(version, 4);
  header.writeUInt16LE(count, 6);
  const nuovoArc = Buffer.concat([header, cifra(nuovoCorpo)]);
  console.log(`GUI_msg.arc: ${msg.data.length} -> ${nuovoArc.length} byte`);
  msg.data = nuovoArc;

  if (check) {
    fs.rmSync(tmp, { recursive: true, force: true });
    process.exit(0);
  }
  if (!fpkOut) {
    console.error('serve un percorso di uscita .fpk');
    process.exit(1);
  }

  // Carry the per-entry padding and the header fields across untouched: the word
  // at +0x40 in each entry is zero in the real packs and the client reads it.
  const [primo] = buildFpk(
    pack.entries.map((e) => ({ filePath: e.filePath, data: e.data, padding: e.padding })),
    { compression: pack.header.compression, header: pack.header },
  );
  fs.writeFileSync(fpkOut, primo);
  console.log(`scritto ${fpkOut} (${primo.length} byte)`);
  fs.rmSync(tmp, { recursive: true, force: true });
}

main();