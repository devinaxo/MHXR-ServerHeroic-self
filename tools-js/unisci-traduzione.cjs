/*
 * Ricostruisce resident.00.fpk tenendo le traduzioni e correggendo i size.
 *
 * Prende la versione PRISTINE (stringhe originali, size corretti) e la versione
 * TRADOTTA (stringhe inglesi, ma con i size dei CLASSREF sbagliati dal vecchio
 * tool): le unisce in parallelo. Struttura e size vengono dalla pristine, il
 * testo dalla tradotta. Per ogni CLASSREF il campo dopo il tipo e' la lunghezza
 * serializzata dell'oggetto, quindi si scrive:
 *
 *     size = size_pristine + (byte_oggetto_tradotto - byte_oggetto_pristine)
 *
 * Senza traduzione la differenza e' 0 -> byte-identico (fedele su ogni tabella).
 * Con traduzione il campo si aggiusta della differenza delle stringhe, senza
 * dover sapere esattamente cosa significhi per ogni tipo di tabella.
 *
 *   node unisci-traduzione.cjs <resident.tradotto.fpk> <resident.pristine.fpk> <out.fpk>
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
  const g = inverti(buf);
  let c = Buffer.from(bf.decode(g, Blowfish.TYPE.UINT8_ARRAY));
  if (c.length < g.length) c = Buffer.concat([c, Buffer.alloc(g.length - c.length)]);
  return inverti(c);
}
function cifra(buf) {
  const r = buf.length % 8;
  const a = r ? Buffer.concat([buf, Buffer.alloc(8 - r)]) : buf;
  const bf = new Blowfish(CHIAVE_ARC, Blowfish.MODE.ECB, Blowfish.PADDING.NULL);
  return inverti(Buffer.from(bf.encode(inverti(a))));
}
const senzaNulli = (b) => { const i = b.indexOf(0); return b.toString('utf-8', 0, i === -1 ? b.length : i); };
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
    let dati = null, grezzo = null;
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
    if (v.dati) { compresso = zlib.deflateSync(v.dati); if (compresso.length % 8) compresso = Buffer.concat([compresso, Buffer.alloc(8 - (compresso.length % 8))]); }
    else compresso = v.grezzo || Buffer.alloc(0);
    const off = i * DIM_VOCE;
    tabella.write(v.nomeInterno, off, 64, 'utf-8');
    tabella.writeUInt32LE(v.tipo >>> 0, off + 64);
    tabella.writeUInt32LE(compresso.length, off + 68);
    tabella.writeUInt32LE(v.dati ? ((v.dati.length | 0x40000000) >>> 0) : (v.dimReale >>> 0), off + 72);
    tabella.writeUInt32LE(cursore, off + 76);
    corpi.push(compresso); cursore += compresso.length;
  });
  const testa = Buffer.alloc(DIM_HEADER);
  testa.write(magic, 0, 4, 'ascii');
  testa.writeUInt16LE(versione, 4);
  testa.writeUInt16LE(voci.length, 6);
  let corpo = Buffer.concat([tabella, ...corpi]);
  if (magic === 'ARCC') { const a = corpo.length % 8; if (a) corpo = Buffer.concat([corpo, Buffer.alloc(8 - a)]); corpo = cifra(corpo); }
  return Buffer.concat([testa, corpo]);
}

/**
 * Unisce pristine (struttura + size) e tradotto (testo). Ritorna la tabella
 * tradotta con i size corretti. Se le due tabelle non combaciano, ritorna null.
 */
function unisci(prBuf, trBuf) {
  let prDoc;
  try { prDoc = parseXfs(prBuf); } catch { return null; }
  try { parseXfs(trBuf); } catch { return null; }
  const prDefSize = prBuf.readInt32LE(20);
  const trDefSize = trBuf.readInt32LE(20);
  if (prDefSize !== trDefSize) return null;
  // Intestazione + blocco definizioni: identici (e' lo schema, non i dati).
  const testa = trBuf.subarray(0, XFS_HEADER + trDefSize);
  const pezzi = [testa];
  const P = { pos: XFS_HEADER + prDefSize, len: prBuf.length };
  const T = { pos: XFS_HEADER + trDefSize, len: trBuf.length };

  function classRef() {
    if (P.pos + 4 > prBuf.length) return;
    const type = trBuf.readInt16LE(T.pos);
    const testaRef = trBuf.subarray(T.pos, T.pos + 4);
    const sizeVal = prBuf.readBigInt64LE(P.pos + 4);
    P.pos += 4; T.pos += 4;
    pezzi.push(testaRef);
    if (type === 0x7fff || (type & 1) === 0) { P.pos += 8; T.pos += 8; return; }
    P.pos += 8; T.pos += 8;
    const idxSize = pezzi.length; pezzi.push(null);
    const inizio = pezzi.length;
    const prObjStart = P.pos;
    objeto(type >> 1);
    const prObjBytes = P.pos - prObjStart;
    let newBytes = 0;
    for (let k = inizio; k < pezzi.length; k++) newBytes += pezzi[k].length;
    const sb = Buffer.alloc(8);
    sb.writeBigInt64LE(sizeVal + BigInt(newBytes - prObjBytes));
    pezzi[idxSize] = sb;
  }
  function objeto(classIndex) {
    const cls = prDoc.classi[classIndex];
    if (!cls) throw new Error('classe ' + classIndex);
    for (const prop of cls.props) {
      const cP = prBuf.readInt32LE(P.pos);
      const cT = trBuf.readInt32LE(T.pos);
      if (cP !== cT) throw new Error('count mismatch ' + prop.name);
      pezzi.push(trBuf.subarray(T.pos, T.pos + 4));
      P.pos += 4; T.pos += 4;
      for (let j = 0; j < cT; j++) valore(prop.type);
    }
  }
  function valore(type) {
    switch (type) {
      case 1: case 2: return classRef();
      case 3: case 4: case 8: pezzi.push(trBuf.subarray(T.pos, T.pos + 1)); P.pos += 1; T.pos += 1; return;
      case 5: case 9: pezzi.push(trBuf.subarray(T.pos, T.pos + 2)); P.pos += 2; T.pos += 2; return;
      case 6: case 10: case 12: case 0x0f: pezzi.push(trBuf.subarray(T.pos, T.pos + 4)); P.pos += 4; T.pos += 4; return;
      case 7: case 11: case 13: pezzi.push(trBuf.subarray(T.pos, T.pos + 8)); P.pos += 8; T.pos += 8; return;
      case 0x10: case 0x11: case 0x36: { const n = type === 0x36 ? 12 : 8; pezzi.push(trBuf.subarray(T.pos, T.pos + n)); P.pos += n; T.pos += n; return; }
      case 0x12: case 0x14: case 0x15: case 0x16: case 0x24: pezzi.push(trBuf.subarray(T.pos, T.pos + 16)); P.pos += 16; T.pos += 16; return;
      case 0x22: pezzi.push(trBuf.subarray(T.pos, T.pos + 8)); P.pos += 8; T.pos += 8; return;
      case 0x23: case 0x37: pezzi.push(trBuf.subarray(T.pos, T.pos + 12)); P.pos += 12; T.pos += 12; return;
      case 14: case 0x20: {
        const fineP = prBuf.indexOf(0, P.pos);
        const fineT = trBuf.indexOf(0, T.pos);
        pezzi.push(trBuf.subarray(T.pos, fineT + 1)); // testo tradotto
        P.pos = fineP + 1; T.pos = fineT + 1;
        return;
      }
      default: throw new Error('tipo ' + type);
    }
  }
  try {
    while (P.pos < prBuf.length && T.pos < trBuf.length) {
      const p0 = P.pos, t0 = T.pos;
      classRef();
      if (P.pos === p0 && T.pos === t0) break;
    }
  } catch { return null; }
  // coda residua
  if (T.pos < trBuf.length) pezzi.push(trBuf.subarray(T.pos));
  return Buffer.concat(pezzi);
}

const [, , TRAD, PRISTINE, OUT] = process.argv;
if (!TRAD || !PRISTINE || !OUT) {
  console.error('Uso: node unisci-traduzione.cjs <resident.tradotto.fpk> <resident.pristine.fpk> <out.fpk>');
  process.exit(1);
}
const trPk = parseFpk(fs.readFileSync(TRAD));
const prPk = parseFpk(fs.readFileSync(PRISTINE));
const prMap = new Map(prPk.entries.map((e) => [e.filePath, e.data]));
let merged = 0, kept = 0, failed = 0; const falliti = [];
const entries = trPk.entries.map((e) => {
  const prArc = prMap.get(e.filePath);
  if (!prArc) return { filePath: e.filePath, data: e.data, padding: e.padding };
  const { magic, versione, voci } = leggiArc(e.data);
  const prVoci = leggiArc(prArc).voci;
  const prByName = new Map(prVoci.map((v) => [v.nomeInterno, v]));
  const nuove = voci.map((v) => {
    const p = prByName.get(v.nomeInterno);
    if (!v.dati || !p || !p.dati) return v;
    const u = unisci(p.dati, v.dati);
    if (u) { merged++; return { ...v, dati: u }; }
    failed++; falliti.push(e.filePath.replace(/.*\//, '') + ' :: ' + v.nomeInterno); return { ...v, dati: p.dati }; // se non combaciano, pristine (sicuro)
  });
  return { filePath: e.filePath, data: scriviArc(nuove, magic, versione), padding: e.padding };
});
const [buf] = buildFpk(entries, { compression: trPk.header.compression, header: trPk.header });
fs.writeFileSync(OUT, buf);
console.log(`scritto ${OUT} (${buf.length} byte) | tabelle unite: ${merged}, fallite->pristine: ${failed}`); if (falliti.length) fs.writeFileSync(OUT + '.falliti.txt', falliti.join('\n'));
