/*
 * Estrae una voce (per nome interno) dai pack del gioco verso un file.
 *   node /app/tools/extract-entry.cjs <regexNomeInterno> <outFile>
 */
const fs = require('fs');
const path = require('path');

const RES = '/app/dist/public/res/download/android';
const RE = new RegExp(process.argv[2], 'i');
const OUT = process.argv[3] || '/tmp/entry.bin';

function parseFpk(buf) {
  if (buf.length < 16 || buf.toString('ascii', 0, 4) !== 'FPK\0') return null;
  const n = buf.readUInt16LE(14);
  const out = [];
  for (let i = 0; i < n; i++) {
    const off = 16 + i * 80;
    if (off + 80 > buf.length) break;
    const pb = buf.subarray(off, off + 64);
    const nul = pb.indexOf(0);
    const filePath = pb.toString('utf-8', 0, nul === -1 ? 64 : nul);
    const size = buf.readUInt32LE(off + 68);
    const dataOff = buf.readUInt32LE(off + 76);
    if (dataOff + size > buf.length) continue;
    out.push({ filePath, data: buf.subarray(dataOff, dataOff + size) });
  }
  return out;
}

const fpks = fs.readdirSync(RES, { recursive: true })
  .filter((f) => typeof f === 'string' && f.endsWith('.fpk'))
  .map((f) => path.join(RES, f));

let trovato = null;
outer:
for (const f of fpks) {
  let entries;
  try { entries = parseFpk(fs.readFileSync(f)); } catch { continue; }
  if (!entries) continue;
  for (const e of entries) {
    if (RE.test(e.filePath)) { trovato = { f, e }; break outer; }
  }
}
if (!trovato) { console.error('voce non trovata'); process.exit(1); }
fs.writeFileSync(OUT, trovato.e.data);
console.log(`da ${path.relative(RES, trovato.f)} :: ${trovato.e.filePath} (${trovato.e.data.length} B) -> ${OUT}`);
