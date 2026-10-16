/*
 * Ricostruisce resident.00.fpk in modo SICURO dopo la traduzione.
 *
 * Perche' serve: traduci-rsdnt-arc.cjs/xfs-clone.cjs ricostruiscono ogni tabella
 * XFS leggendo e riscrivendo. Per alcune tabelle (es. tuning/xml/weapon/series)
 * la loro traversata NON e' fedele all'originale, quindi tradurle le corrompe.
 * Inoltre copiavano il campo "size" dei CLASSREF senza ricalcolarlo: per le
 * tabelle in cui quel campo E' davvero "8 + byte dell'oggetto" (es. higi_param)
 * un valore stantio fa leggere al client oltre la tabella -> SIGSEGV all'avvio.
 *
 * Regola, tabella per tabella:
 *   - se ricostruire la tabella ORIGINALE (pristine) con clonaBuf la riproduce
 *     byte per byte, la traversata e' fedele -> si tiene la tabella tradotta e
 *     si ricalcolano i "size" (clonaBuf sulla versione viva);
 *   - altrimenti la tabella non si tocca: si ripristina quella pristine
 *     (in giapponese), perche' tradurla la romperebbe.
 *
 *   node ricostruisci-resident.cjs <resident.vivo.fpk> <resident.pristine.fpk> <out.fpk>
 */
const fs = require('fs');
const zlib = require('zlib');
const { Blowfish } = require('egoroof-blowfish');
const { parseXfs } = require('./xfs-parse.cjs');
const { parseFpk, buildFpk } = require('./fpk-fmt.cjs');

const CHIAVE_ARC = 'kaseoa nkaeka;eawf3';
const DIM_HEADER = 8;
const DIM_VOCE = 80;
const XFS_HEADER = 24;

function inverti(buf) {
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i + 3 < buf.length; i += 4) { out[i] = buf[i + 3]; out[i + 1] = buf[i + 2]; out[i + 2] = buf[i + 1]; out[i + 3] = buf[i]; }
  const resto = buf.length % 4;
  if (resto > 0) buf.copy(out, buf.length - resto, buf.length - resto);
  return out;
}
function decifra(buf) {
  const bf = new Blowfish(CHIAVE_ARC, Blowfish.MODE.ECB, Blowfish.PADDING.NULL);
  const girato = inverti(buf);
  let chiaro = Buffer.from(bf.decode(girato, Blowfish.TYPE.UINT8_ARRAY));
  if (chiaro.length < girato.length) chiaro = Buffer.concat([chiaro, Buffer.alloc(girato.length - chiaro.length)]);
  return inverti(chiaro);
}
function cifra(buf) {
  const resto = buf.length % 8;
  const allineato = resto ? Buffer.concat([buf, Buffer.alloc(8 - resto)]) : buf;
  const bf = new Blowfish(CHIAVE_ARC, Blowfish.MODE.ECB, Blowfish.PADDING.NULL);
  return inverti(Buffer.from(bf.encode(inverti(allineato))));
}
const senzaNulli = (buf) => { const i = buf.indexOf(0); return buf.toString('utf-8', 0, i === -1 ? buf.length : i); };

function leggiArc(buf) {
  const magic = buf.toString('ascii', 0, 4);
  const versione = buf.readUInt16LE(4);
  const numFile = buf.readUInt16LE(6);
  const corpo = magic === 'ARCC' ? decifra(buf.subarray(DIM_HEADER)) : buf.subarray(DIM_HEADER);
  const voci = [];
  for (let i = 0; i < numFile; i++) {
    const off = i * DIM_VOCE;
    const nomeInterno = senzaNulli(corpo.subarray(off, off + 64));
    const tipo = corpo.readUInt32LE(off + 64);
    const compSize = corpo.readUInt32LE(off + 68);
    const dimReale = corpo.readUInt32LE(off + 72);
    const inizio = corpo.readUInt32LE(off + 76) - DIM_HEADER;
    let dati = null;
    let grezzo = null;
    try { dati = zlib.inflateSync(corpo.subarray(inizio, inizio + compSize)); } catch { grezzo = corpo.subarray(inizio, inizio + compSize); }
    voci.push({ nomeInterno, tipo, dimReale, dati, grezzo });
  }
  return { magic, versione, voci };
}
function scriviArc(voci, magic, versione) {
  const tabella = Buffer.alloc(voci.length * DIM_VOCE);
  const corpi = [];
  let cursore = DIM_HEADER + tabella.length;
  voci.forEach((v, i) => {
    let compresso;
    if (v.dati) {
      compresso = zlib.deflateSync(v.dati);
      if (compresso.length % 8) compresso = Buffer.concat([compresso, Buffer.alloc(8 - (compresso.length % 8))]);
    } else {
      compresso = v.grezzo || Buffer.alloc(0);
    }
    const off = i * DIM_VOCE;
    tabella.write(v.nomeInterno, off, 64, 'utf-8');
    tabella.writeUInt32LE(v.tipo >>> 0, off + 64);
    tabella.writeUInt32LE(compresso.length, off + 68);
    tabella.writeUInt32LE(v.dati ? ((v.dati.length | 0x40000000) >>> 0) : (v.dimReale >>> 0), off + 72);
    tabella.writeUInt32LE(cursore, off + 76);
    corpi.push(compresso);
    cursore += compresso.length;
  });
  const testa = Buffer.alloc(DIM_HEADER);
  testa.write(magic, 0, 4, 'ascii');
  testa.writeUInt16LE(versione, 4);
  testa.writeUInt16LE(voci.length, 6);
  let corpo = Buffer.concat([tabella, ...corpi]);
  if (magic === 'ARCC') {
    const avanzo = corpo.length % 8;
    if (avanzo) corpo = Buffer.concat([corpo, Buffer.alloc(8 - avanzo)]);
    corpo = cifra(corpo);
  }
  return Buffer.concat([testa, corpo]);
}

/** Come xfs-clone.cjs::clona, ma con i size dei CLASSREF ricalcolati. */
function clonaBuf(buf) {
  const doc = parseXfs(buf);
  const defSize = buf.readInt32LE(20);
  const testa = buf.subarray(0, XFS_HEADER + defSize);
  const pezzi = [testa];
  const ctxIn = { buf, classi: doc.classi, pos: XFS_HEADER + defSize };
  function scriviClassRef() {
    if (ctxIn.pos + 4 > buf.length) return;
    const type = buf.readInt16LE(ctxIn.pos);
    const testaRef = buf.subarray(ctxIn.pos, ctxIn.pos + 4);
    ctxIn.pos += 4;
    pezzi.push(testaRef);
    if (type === 0x7fff || (type & 1) === 0) return;
    ctxIn.pos += 8;
    const idxSize = pezzi.length;
    pezzi.push(null);
    const inizio = pezzi.length;
    scriviOggetto(type >> 1);
    let n = 0;
    for (let k = inizio; k < pezzi.length; k++) n += pezzi[k].length;
    const sizeBuf = Buffer.alloc(8);
    sizeBuf.writeBigInt64LE(BigInt(n + 8));
    pezzi[idxSize] = sizeBuf;
  }
  function scriviOggetto(classIndex) {
    const cls = ctxIn.classi[classIndex];
    if (!cls) throw new Error(`classe ${classIndex} inesistente`);
    for (const prop of cls.props) {
      const count = buf.readInt32LE(ctxIn.pos);
      pezzi.push(buf.subarray(ctxIn.pos, ctxIn.pos + 4));
      ctxIn.pos += 4;
      for (let j = 0; j < count; j++) scriviValore(prop.type);
    }
  }
  function scriviValore(type) {
    switch (type) {
      case 1: case 2: return scriviClassRef();
      case 3: case 4: case 8: pezzi.push(buf.subarray(ctxIn.pos, ctxIn.pos + 1)); ctxIn.pos += 1; return;
      case 5: case 9: pezzi.push(buf.subarray(ctxIn.pos, ctxIn.pos + 2)); ctxIn.pos += 2; return;
      case 6: case 10: case 12: case 0x0f: pezzi.push(buf.subarray(ctxIn.pos, ctxIn.pos + 4)); ctxIn.pos += 4; return;
      case 7: case 11: case 13: pezzi.push(buf.subarray(ctxIn.pos, ctxIn.pos + 8)); ctxIn.pos += 8; return;
      case 0x10: case 0x11: case 0x36: pezzi.push(buf.subarray(ctxIn.pos, ctxIn.pos + (type === 0x36 ? 12 : 8))); ctxIn.pos += (type === 0x36 ? 12 : 8); return;
      case 0x12: case 0x14: case 0x15: case 0x16: case 0x24: pezzi.push(buf.subarray(ctxIn.pos, ctxIn.pos + 16)); ctxIn.pos += 16; return;
      case 0x22: pezzi.push(buf.subarray(ctxIn.pos, ctxIn.pos + 8)); ctxIn.pos += 8; return;
      case 0x23: case 0x37: pezzi.push(buf.subarray(ctxIn.pos, ctxIn.pos + 12)); ctxIn.pos += 12; return;
      case 14: case 0x20: {
        const fine = buf.indexOf(0, ctxIn.pos);
        pezzi.push(buf.subarray(ctxIn.pos, fine + 1));
        ctxIn.pos = fine + 1;
        return;
      }
      default: throw new Error(`tipo ${type} (0x${type.toString(16)}) non gestito`);
    }
  }
  while (ctxIn.pos < buf.length) {
    const prima = ctxIn.pos;
    scriviClassRef();
    if (ctxIn.pos === prima) break;
  }
  if (ctxIn.pos < buf.length) pezzi.push(buf.subarray(ctxIn.pos));
  return Buffer.concat(pezzi);
}

function eXfs(buf) { try { parseXfs(buf); return true; } catch { return false; } }
function fedele(buf) { try { return clonaBuf(buf).equals(buf); } catch { return false; } }

const [, , LIVE, PRISTINE, OUT] = process.argv;
if (!LIVE || !PRISTINE || !OUT) {
  console.error('Uso: node ricostruisci-resident.cjs <resident.vivo.fpk> <resident.pristine.fpk> <out.fpk>');
  process.exit(1);
}
const livePk = parseFpk(fs.readFileSync(LIVE));
const prPk = parseFpk(fs.readFileSync(PRISTINE));
const prMap = new Map(prPk.entries.map((e) => [e.filePath, e.data]));

let ripristinate = 0, ricalcolate = 0;
const entries = livePk.entries.map((e) => {
  const prArc = prMap.get(e.filePath);
  const { magic, versione, voci } = leggiArc(e.data);
  const prVoci = prArc ? leggiArc(prArc).voci : [];
  const prByName = new Map(prVoci.map((v) => [v.nomeInterno, v]));
  const nuove = voci.map((v) => {
    if (!v.dati || !eXfs(v.dati)) return v;
    const p = prByName.get(v.nomeInterno);
    // Tabelle che la ricostruzione non sa riprodurre fedelmente: si lasciano in
    // giapponese (pristine). Se non c'e' un pristine, si lascia la viva com'e'.
    if (p && p.dati && !fedele(p.dati)) {
      ripristinate++;
      return { ...v, dati: p.dati };
    }
    try { ricalcolate++; return { ...v, dati: clonaBuf(v.dati) }; } catch { return v; }
  });
  return { filePath: e.filePath, data: scriviArc(nuove, magic, versione), padding: e.padding };
});
const [buf] = buildFpk(entries, { compression: livePk.header.compression, header: livePk.header });
fs.writeFileSync(OUT, buf);
console.log(`scritto ${OUT} (${buf.length} byte) | tabelle ricalcolate: ${ricalcolate}, ripristinate pristine: ${ripristinate}`);
