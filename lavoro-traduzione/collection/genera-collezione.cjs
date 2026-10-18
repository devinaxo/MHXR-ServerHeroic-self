/*
 * Genera il dizionario JP -> EN della "Discovery Encyclopedia"
 * (発見図鑑), cioe' le schede che il client mostra in resident.00.fpk ::
 * rsdnt_property.arc :: tuning/xml/item/item_collection.
 *
 *   node lavoro-traduzione/collection/genera-collezione.cjs [item_collection] [uscita.json]
 *
 * I testi inglesi stanno in dati-1.cjs ... dati-5.cjs, divisi per comodita' di
 * revisione e indicizzati dal nome giapponese originale (mCollectionName, unico
 * in tutta la tabella). Lo script verifica che ogni voce della tabella abbia la
 * sua traduzione e che nessuna riga superi la larghezza del riquadro.
 *
 * Il pannello della scheda e' simile a quello delle note delle isole: righe da
 * massimo 44 caratteri e al massimo 7 righe, o il testo viene tagliato.
 */
const fs = require('node:fs');
const path = require('node:path');
const { parseXfs } = require('../../tools-js/xfs-parse.cjs');

const ENTRATA =
  process.argv[2] ??
  path.resolve(__dirname, '../../build/collection/ext/tuning/xml/item/item_collection');
const USCITA = process.argv[3] ?? path.resolve(__dirname, 'collezione.json');

const MAX_RIGA = 44;
const MAX_RIGHE = 7;
const MAX_NOME = 30;

const parti = [
  require('./dati-1.cjs'),
  require('./dati-2.cjs'),
  require('./dati-3.cjs'),
  require('./dati-4.cjs'),
  require('./dati-5.cjs'),
];
const TRADUZIONI = Object.assign({}, ...parti);

function controlla(etichetta, testo, maxRighe) {
  const righe = testo.split('\n');
  if (righe.length > maxRighe) {
    throw new Error(`${etichetta}: ${righe.length} righe (max ${maxRighe})`);
  }
  righe.forEach((r, i) => {
    if (r.length > MAX_RIGA) {
      throw new Error(`${etichetta}: riga ${i + 1} = ${r.length} caratteri (max ${MAX_RIGA})`);
    }
  });
}

const doc = parseXfs(fs.readFileSync(ENTRATA));
const voci = doc.root.mDataList.mpArray;
console.log(`item_collection: ${voci.length} voci`);

const diz = {};
let mancanti = 0;
for (const v of voci) {
  const t = TRADUZIONI[v.mCollectionName];
  if (!t) {
    console.error(`  manca: ${v.mCollectionName}`);
    mancanti++;
    continue;
  }
  controlla(`${v.mCollectionName} nome`, t.name, 1);
  if (t.name.length > MAX_NOME) throw new Error(`${v.mCollectionName}: nome di ${t.name.length} caratteri`);
  controlla(`${v.mCollectionName} testo`, t.text, MAX_RIGHE);
  diz[v.mCollectionName] = t.name;
  diz[v.mExplanation] = t.text;
  delete TRADUZIONI[v.mCollectionName];
}
if (mancanti) throw new Error(`${mancanti} voci senza traduzione`);

const extra = Object.keys(TRADUZIONI);
if (extra.length) throw new Error(`traduzioni non usate: ${extra.slice(0, 5).join(', ')}`);

const chiavi = Object.keys(diz);
if (new Set(chiavi).size !== chiavi.length) throw new Error('chiavi giapponesi duplicate');
if (chiavi.length !== voci.length * 2) throw new Error(`attese ${voci.length * 2} chiavi, trovate ${chiavi.length}`);

fs.writeFileSync(USCITA, JSON.stringify(diz, null, 1) + '\n');
console.log(`${chiavi.length} voci -> ${USCITA}`);
