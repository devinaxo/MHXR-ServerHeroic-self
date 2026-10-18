/*
 * Normalizza i nomi propri nei dialoghi di storia (GUI.78-94.fpk).
 *
 *   node lavoro-traduzione/dialogue/normalizza.cjs <in.fpk> <out.fpk>
 *
 * Riutilizza tools-js/gmd-arc.cjs: estrae le stringhe correnti, applica le
 * sostituzioni di normalizza-nomi.json e rimette solo le stringhe cambiate.
 * Le voci non cambiate restano byte per byte identiche, quindi il pack di
 * uscita differisce dall'ingresso solo dove serve.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const HERE = __dirname;
const REPO = path.resolve(HERE, '../..');
const GMD = path.join(REPO, 'tools-js/gmd-arc.cjs');
const MAPPA = JSON.parse(fs.readFileSync(path.join(HERE, 'normalizza-nomi.json'), 'utf8'));

const [, , packIn, packOut] = process.argv;
if (!packIn || !packOut) {
  console.error('uso: normalizza.cjs <in.fpk> <out.fpk>');
  process.exit(1);
}

function normalizza(testo) {
  let out = testo;
  for (const [da, a] of Object.entries(MAPPA)) out = out.split(da).join(a);
  return out;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'normalizza-'));
execFileSync('node', [GMD, 'extract', packIn, tmp], { stdio: 'inherit' });

let cambiate = 0;
for (const f of fs.readdirSync(tmp)) {
  if (!f.endsWith('.json')) continue;
  const p = path.join(tmp, f);
  const voci = JSON.parse(fs.readFileSync(p, 'utf8'));
  let toccato = false;
  for (const v of voci) {
    const nuovo = normalizza(v.jp);
    if (nuovo !== v.jp) {
      v.en = nuovo;
      toccato = true;
      cambiate++;
    }
  }
  if (toccato) fs.writeFileSync(p, JSON.stringify(voci, null, 1));
  else fs.rmSync(p);
}

execFileSync('node', [GMD, 'apply', packIn, tmp, packOut], { stdio: 'inherit' });
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`stringhe normalizzate: ${cambiate}`);
