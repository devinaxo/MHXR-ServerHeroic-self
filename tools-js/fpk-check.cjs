// Controllo di integrita' di un FPK prima di pubblicarlo.
//
//   node tools-js/fpk-check.cjs <pack.fpk> [--quiet]
//
// Verifica le condizioni che fanno crashare il client e che i tool di
// ricostruzione possono rompere silenziosamente:
//
//   1. +0x44 (size) deve essere uguale a (+0x48 & 0x1fffffff). Il campo +0x48
//      contiene ANCHE la dimensione ((size & 0x1fffffff) | flags << 29): se un
//      archivio viene ricostruito piu' grande e +0x48 resta quello vecchio, il
//      client dimensiona male l'entry e va in crash (schermo nero). E' il bug
//      che ha fatto crashare le versioni 327 e tutti gli archivi in
//      `excludedTargets`.
//   2. il padding +0x40 dell'entry FPK deve essere zero (0xCDCDCDCD = crash).
//   3. dentro ogni ARC: ogni corpo deve gonfiare (zlib) e ogni offset/dimensione
//      deve stare su un multiplo di 8 (griglia Blowfish).
const fs = require('fs');
const zlib = require('zlib');
const { Blowfish } = require('egoroof-blowfish');

const ARC_KEY = 'kaseoa nkaeka;eawf3';
const bf = new Blowfish(ARC_KEY, Blowfish.MODE.ECB, Blowfish.PADDING.NULL);
function inv(b){const o=Buffer.alloc(b.length);const n=b.length-(b.length%4);for(let i=0;i<n;i+=4){o[i]=b[i+3];o[i+1]=b[i+2];o[i+2]=b[i+1];o[i+3]=b[i];}if(b.length%4)b.copy(o,n,n);return o;}
const dec=(b)=>{const g=inv(b);let c=Buffer.from(bf.decode(g,Blowfish.TYPE.UINT8_ARRAY));if(c.length<g.length)c=Buffer.concat([c,Buffer.alloc(g.length-c.length)]);return inv(c);};

const file = process.argv[2];
const quiet = process.argv.includes('--quiet');
if (!file) { console.error('uso: node fpk-check.cjs <pack.fpk> [--quiet]'); process.exit(1); }
const buf = fs.readFileSync(file);
if (buf.toString('ascii', 0, 4) !== 'FPK\0') { console.error('non e\' un FPK'); process.exit(1); }
const count = buf.readUInt16LE(0x0e);

let sizeMismatch = 0, paddingBad = 0, arcProblems = 0, arcEntries = 0;
const problems = [];
const warnings = [];
for (let i = 0; i < count; i++) {
  const o = 16 + i * 80;
  const raw = buf.subarray(o, o + 64);
  const nul = raw.indexOf(0);
  const p = raw.toString('utf-8', 0, nul === -1 ? 64 : nul);
  const size = buf.readUInt32LE(o + 68);
  const saf = buf.readUInt32LE(o + 72);
  const off = buf.readUInt32LE(o + 76);
  const pad = buf.readUInt32LE(o + 64);

  const sizeInFlags = saf & 0x1fffffff;
  if (sizeInFlags !== size) {
    sizeMismatch++;
    problems.push(`+0x44/${'+0x48'}: ${p} size=${size} ma sizeAndFlags.size=${sizeInFlags} (delta ${size - sizeInFlags})`);
  }
  if (pad !== 0) { paddingBad++; warnings.push(`+0x40 padding: ${p} = 0x${pad.toString(16)} (Capcom packs vary; not fatal here)`); }

  const arc = buf.subarray(off, off + size);
  if (arc.toString('ascii', 0, 4) !== 'ARCC') continue;
  const n = arc.readUInt16LE(6);
  const body = dec(arc.subarray(8));
  for (let j = 0; j < n; j++) {
    const x = j * 80;
    const cs = body.readUInt32LE(x + 68);
    const st = body.readUInt32LE(x + 76) - 8;
    arcEntries++;
    if (st % 8 || cs % 8) { arcProblems++; warnings.push(`ARC ${p}: entry ${j} non allineata a 8 (start=${st} cs=${cs})`); }
    if (st < 0 || st + cs > body.length) { arcProblems++; problems.push(`ARC ${p}: entry ${j} fuori range`); continue; }
    try { zlib.inflateSync(body.subarray(st, st + cs)); }
    catch { arcProblems++; problems.push(`ARC ${p}: entry ${j} non gonfia`); }
  }
}

const ok = sizeMismatch === 0 && problems.length === 0;
if (!quiet || !ok) {
  console.log(`${file}`);
  console.log(`  voci FPK: ${count}   entry ARC controllate: ${arcEntries}`);
  console.log(`  size +0x44 vs +0x48: ${sizeMismatch} incoerenze  (FATALE: fa crashare l'entry che cresce)`);
  console.log(`  padding +0x40 non zero: ${paddingBad}  (avviso)`);
  console.log(`  ARC non allineati/fuori range/non gonfiano: ${arcProblems}  (allineamento = avviso)`);
  for (const p of problems.slice(0, 30)) console.log(`    !! ${p}`);
  if (problems.length > 30) console.log(`    ... altri ${problems.length - 30}`);
  for (const w of warnings.slice(0, 10)) console.log(`    ~ ${w}`);
  if (warnings.length > 10) console.log(`    ... altri ${warnings.length - 10} avvisi`);
}
console.log(ok ? 'OK: pack coerente' : 'FALLITO: non pubblicare questo pack');
process.exit(ok ? 0 : 1);
