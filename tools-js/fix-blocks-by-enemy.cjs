/*
 * Ri-assegna i blocchi alle quest evento/ticket usando i CONTENUTI VERI dei
 * blocchi (tools-js/block-areas.json) invece del foglio a mano.
 *
 *   node /app/tools/fix-blocks-by-enemy.cjs --dry
 *   node /app/tools/fix-blocks-by-enemy.cjs
 *   node /app/tools/fix-blocks-by-enemy.cjs --undo
 *
 * PERCHE'
 * Il mostro che si affronta lo decide il BLOCCO (mst_block_id), non il bersaglio
 * della quest. Il foglio mst-block-ids.json etichetta i blocchi a mano e non
 * copre tutti i nemici (i "gatti d'oro" 114 = ドスゴルー, 91, 31, ...) quindi le
 * quest che li usano finivano su un blocco qualunque.
 *
 * COSA FA
 * Per ogni quest evento/ticket prende l'id nemico del bersaglio (mBossList) e
 * sceglie il blocco la cui AREA lo contiene davvero, preferendo:
 *   1. un'area dove quel nemico e' il bersaglio (mIsTarget),
 *   2. l'area con MENO nemici diversi (piu' dedicata a quel mostro),
 *   3. un ordine stabile per quest.
 * La variante (l'ultimo numero del nome blocco) e' scelta in modo stabile.
 * Tag: mBlocksSource: 'enemy-map'. La variante precedente resta in mBlocksPrima
 * se non c'era gia'.
 */
const fs = require('fs');
const mongoose = require('mongoose');

const { DB_USER = 'root', DB_PASSWORD = 'example', DB_IP = 'mongo', DB_PORT = '27017', DB_NAME = 'apypos' } = process.env;
const DRY = process.argv.includes('--dry');
const UNDO = process.argv.includes('--undo');

function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

const enemyMap = JSON.parse(fs.readFileSync('/app/tools/enemy-map.json', 'utf8'));
const areas = JSON.parse(fs.readFileSync('/app/tools/block-areas.json', 'utf8')); // l90_m12a03 -> {id:{n,target}}
const sheet = JSON.parse(fs.readFileSync('/app/tools/mst-block-ids.json', 'utf8')).slice(1);

// nome del foglio -> area normalizzata l90_m12_a03 ; e area -> varianti
const areaKey = (s) => {
  const m = String(s).match(/^(l\d+_m\d+)_?(a\d+)/);
  return m ? `${m[1]}_${m[2]}` : null;
};
const variantiPerArea = new Map();
for (const r of sheet) {
  const a = areaKey(r.A);
  const h = Number(r.F);
  if (!a || !h || isNaN(h)) continue;
  if (!variantiPerArea.has(a)) variantiPerArea.set(a, []);
  variantiPerArea.get(a).push({ nome: r.A, hash: h });
}
// normalizza le chiavi di block-areas (l90_m12a03 -> l90_m12_a03)
const nemiciPerArea = new Map();
for (const [k, v] of Object.entries(areas)) {
  const a = areaKey(k);
  if (a) nemiciPerArea.set(a, v);
}
// hash -> area (dal foglio) per sapere dove punta il blocco ATTUALE
const areaPerHash = new Map();
for (const r of sheet) {
  const a = areaKey(r.A);
  const h = Number(r.F);
  if (a && h && !isNaN(h)) areaPerHash.set(h, a);
}
console.log(`aree con nemici: ${nemiciPerArea.size}, aree con varianti nel foglio: ${variantiPerArea.size}`);

function scegliBlocco(enemyId, questId) {
  const EVENTO = /^l(70|75|9\d)_/; // mai i continenti della storia: c'e' l'isola del tutorial
  const cands = [];
  for (const [area, nemici] of nemiciPerArea) {
    if (!EVENTO.test(area + '_')) continue;
    const rec = nemici[String(enemyId)];
    if (!rec) continue;
    if (!(variantiPerArea.get(area) || []).length) continue;
    cands.push({ area, target: rec.target > 0, tipi: Object.keys(nemici).length });
  }
  if (!cands.length) return null;
  cands.sort((x, y) =>
    (y.target - x.target) || (x.tipi - y.tipi) || (x.area < y.area ? -1 : x.area > y.area ? 1 : 0));
  const scelta = cands[hash(String(questId)) % Math.min(cands.length, 3)] || cands[0];
  const vars = variantiPerArea.get(scelta.area);
  const v = vars[hash(`${questId}:${scelta.area}`) % vars.length];
  return { hash: v.hash, nome: v.nome, area: scelta.area, tipi: scelta.tipi, target: scelta.target };
}

(async () => {
  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const qs = mongoose.connection.db.collection('questsheets');

  if (UNDO) {
    const docs = await qs.find({ mBlocksSource: 'enemy-map' }).project({ mBlocks: 1, mBlocksPrima: 1 }).toArray();
    const ops = docs.map((d) => ({
      updateOne: { filter: { _id: d._id }, update: {
        $set: { mBlocks: d.mBlocksPrima || [] },
        $unset: { mBlocksSource: '', mBlocksPrima: '' },
      } },
    }));
    if (ops.length) await qs.bulkWrite(ops);
    console.log(`ripristinate ${ops.length} quest (mBlocksPrima).`);
    await mongoose.disconnect();
    return;
  }

  const docs = await qs.find({ mDefineId: /^(EVENT|TICKE|ETERN|SCORE)/ })
    .project({ mDefineId: 1, mQuestID: 1, mQuestName: 1, mBossList: 1, mBlocks: 1, mBlocksPrima: 1, mBlocksSource: 1 }).toArray();

  const ops = [];
  const esempi = [];
  let senzaBersaglio = 0, senzaArea = 0, cambiate = 0;
  let autentici = 0;
  for (const q of docs) {
    if (q.mBlocksSource === 'autentico') { autentici++; continue; } // i blocchi veri non si toccano
    const enemyId = (q.mBossList || []).map((b) => Number(b?.mEnemyID)).find((n) => Number.isFinite(n) && n > 0);
    if (!enemyId) { senzaBersaglio++; continue; }
    const scelto = scegliBlocco(enemyId, q.mQuestID);
    if (!scelto) { senzaArea++; continue; }
    // cambia solo se serve davvero: blocco di ripiego, area attuale che NON
    // contiene il bersaglio, o esiste un'area dove il nemico e' il bersaglio e
    // l'attuale no.
    const curves = (q.mBlocks || []).map((h) => areaPerHash.get(Number(h)));
    const curRec = curves.some((a) => a && nemiciPerArea.get(a)?.[String(enemyId)]);
    const serve = q.mBlocksSource === 'fallback-evento' || !curRec;
    if (!serve) continue;
    const attuale = (q.mBlocks || []).length === 1 && Number(q.mBlocks[0]) === scelto.hash;
    if (attuale) continue;
    cambiate++;
    if (esempi.length < 12) {
      const nome = enemyMap[String(enemyId)]?.nome ?? '?';
      esempi.push(`  ${q.mDefineId} [${enemyId} ${nome}] -> ${scelto.nome} (area ${scelto.area}, ${scelto.tipi} tipi${scelto.target ? ', bersaglio' : ''})  era [${q.mBlocksSource || 'originale'}]`);
    }
    ops.push({ updateOne: { filter: { _id: q._id }, update: { $set: {
      mBlocks: [scelto.hash], mBlocksSource: 'enemy-map',
      ...(q.mBlocksPrima ? {} : { mBlocksPrima: q.mBlocks || [] }),
    } } } });
  }

  console.log(`quest evento/ticket: ${docs.length}`);
  console.log(`  autentici (intoccabili): ${autentici}`);
  console.log(`  senza bersaglio   : ${senzaBersaglio}`);
  console.log(`  nessuna area con quel nemico: ${senzaArea}`);
  console.log(`  da cambiare       : ${cambiate}\n`);
  esempi.forEach((e) => console.log(e));

  if (DRY) console.log('\n[dry] nessuna scrittura.');
  else if (ops.length) {
    const r = await qs.bulkWrite(ops);
    console.log(`\nassegnate ${r.modifiedCount} quest (mBlocksSource='enemy-map').`);
  }
  await mongoose.disconnect();
})().catch((e) => { console.error('ERRORE:', e); process.exit(1); });
