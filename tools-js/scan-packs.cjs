/*
 * Cerca nei pack del gioco i file il cui nome interno contiene un pattern.
 *   node /app/tools/scan-packs.cjs <regex>
 */
const fs = require('fs');
const path = require('path');

const RES = '/app/dist/public/res/download/android';
const RE = new RegExp(process.argv[2] || '.', 'i');

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
    out.push({ filePath, size, dataOff });
  }
  return out;
}

const fpks = fs.readdirSync(RES, { recursive: true })
  .filter((f) => typeof f === 'string' && f.endsWith('.fpk'))
  .map((f) => path.join(RES, f));
let n = 0, hits = 0;
for (const f of fpks) {
  let entries;
  try { entries = parseFpk(fs.readFileSync(f)); } catch { continue; }
  if (!entries) continue;
  n++;
  for (const e of entries) {
    if (RE.test(e.filePath)) {
      hits++;
      console.log(`${path.relative(RES, f)}  ::  ${e.filePath}  (${e.size} B)`);
    }
  }
}
console.log(`\nfpk letti: ${n}, voci trovate: ${hits}`);
