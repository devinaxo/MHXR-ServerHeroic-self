// Extract entries from a Capcom ARC archive to disk, so sprites can be edited in
// an image editor and put back.
//
//   node arc-extract.cjs <file.arc> <outdir> [--filter=substr] [--only=name]
//
// Same container format as arc-ls.cjs: "ARCC" magic, Blowfish + 4-byte word
// reversal for the encrypted variant, zlib-deflated bodies.
const fs = require('fs');
const path = require('path');
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
    const nome = corpo.subarray(off, off + 64).toString('utf-8').replace(/\0.*$/, '').split('\\').join('/');
    const cs = corpo.readUInt32LE(off + 68);
    const st = corpo.readUInt32LE(off + 76) - 8;
    let dati = null;
    if (st >= 0 && st + cs <= corpo.length) {
      try {
        dati = zlib.inflateSync(corpo.subarray(st, st + cs));
      } catch {
        dati = null;
      }
    }
    voci.push({ nome, dati });
  }
  return voci;
}

const [, , file, outdir, ...resto] = process.argv;
if (!file || !outdir) {
  console.error('Uso: node arc-extract.cjs <file.arc> <outdir> [--filter=substr] [--only=name]');
  process.exit(1);
}
const filtro = (resto.find((a) => a.startsWith('--filter=')) || '').split('=')[1];
const only = (resto.find((a) => a.startsWith('--only=')) || '').split('=')[1];

let n = 0;
for (const v of leggiArc(file)) {
  if (only && v.nome !== only) continue;
  if (filtro && !v.nome.toLowerCase().includes(filtro.toLowerCase())) continue;
  if (!v.dati) {
    console.log(`  skip (no data) ${v.nome}`);
    continue;
  }
  const dest = path.join(outdir, v.nome);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, v.dati);
  const magic = v.dati.subarray(0, 4).toString('latin1').replace(/[^\x20-\x7e]/g, '.');
  console.log(`  ${String(v.dati.length).padStart(9)} B  [${magic}]  ${dest}`);
  n++;
}
console.log(`\n${n} file estratti in ${outdir}`);
