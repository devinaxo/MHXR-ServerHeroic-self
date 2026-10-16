// List the contents of a Capcom ARC archive (the container inside every .fpk).
// Format is already known from tools-js/fpk-list.cjs and verifica-traduzione-arc.cjs:
//   magic "ARCC", 16-byte entry table of 80 bytes each, zlib-deflated bodies,
//   optional Blowfish + 4-byte word reversal for the encrypted variant.
//
//   node arc-ls.cjs <file.arc> [--filter=x] [--limit=N]
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

function leggiArc(file) {
  const buf = fs.readFileSync(file);
  const magic = buf.toString('ascii', 0, 4);
  const n = buf.readUInt16LE(6);
  const corpo = magic === 'ARCC' ? decifra(buf.subarray(8)) : buf.subarray(8);
  const voci = [];
  for (let i = 0; i < n; i++) {
    const off = i * 80;
    if (off + 80 > corpo.length) break;
    const raw = corpo.subarray(off, off + 64).toString('utf-8');
    const nome = raw.replace(/\0.*$/, '').split('\\').join('/');
    const compSize = corpo.readUInt32LE(off + 68);
    const inizio = corpo.readUInt32LE(off + 76) - 8;
    let dati = null;
    if (inizio >= 0 && inizio + compSize <= corpo.length) {
      try {
        dati = zlib.inflateSync(corpo.subarray(inizio, inizio + compSize));
      } catch {
        dati = null;
      }
    }
    voci.push({ nome, compSize, dati });
  }
  return { magic, voci };
}

const [, , file, ...resto] = process.argv;
if (!file) {
  console.error('Uso: node arc-ls.cjs <file.arc> [--filter=x] [--limit=N]');
  process.exit(1);
}
const filtro = (resto.find((a) => a.startsWith('--filter=')) || '').split('=')[1];
const limite = parseInt((resto.find((a) => a.startsWith('--limit=')) || '').split('=')[1] || '60', 10);

const { magic, voci } = leggiArc(file);
console.log(`${file}\n  magic=${magic} entries=${voci.length}\n`);
let shown = 0;
for (const v of voci) {
  if (filtro && !v.nome.toLowerCase().includes(filtro.toLowerCase())) continue;
  if (shown++ >= limite) break;
  const head = v.dati ? v.dati.subarray(0, 8).toString('hex') : '(no data)';
  console.log(`  ${String(v.dati ? v.dati.length : 0).padStart(9)} B  ${v.nome}  [${head}]`);
}
