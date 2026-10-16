/*
 * Estrae tutte le stringhe (mName/mText/...) da una tabella XFS.
 *   node /app/tools/dump-xfs-strings.cjs <file> [--pairs]
 * --pairs: raggruppa per oggetto e stampa i campi testuali per voce.
 */
const fs = require('fs');
const { parseXfs } = require('/app/tools/xfs-parse.cjs');

const file = process.argv[2];
const pairMode = process.argv.includes('--pairs');
const buf = fs.readFileSync(file);
const doc = parseXfs(buf);

const stringhe = new Set();
const voci = [];
const CAMPI = /^(mName|mText|mComment|mDesc|mDescription)$/;

function cammina(v) {
  if (Array.isArray(v)) return v.forEach(cammina);
  if (v && typeof v === 'object') {
    const keys = Object.keys(v);
    if (keys.some((k) => CAMPI.test(k))) {
      const rec = {};
      for (const k of keys) if (typeof v[k] === 'string') rec[k] = v[k];
      if (Object.keys(rec).length) voci.push(rec);
    }
    for (const k of keys) {
      if (typeof v[k] === 'string') stringhe.add(v[k]);
      else cammina(v[k]);
    }
  }
}

cammina(doc.root);

if (pairMode) {
  console.log(JSON.stringify(voci, null, 1));
} else {
  const arr = [...stringhe].sort();
  console.log(JSON.stringify(arr, null, 1));
  console.error(`stringhe: ${arr.length}, voci con campi testuali: ${voci.length}`);
}
