/*
 * Ricompone le mBossList "spezzate" lasciate dall'import XFS.
 *
 *   node /app/tools/fix-bosses-split.cjs --dry
 *   node /app/tools/fix-bosses-split.cjs
 *
 * COSA È SUCCESSO
 * Un vecchio import scriveva i campi di ogni boss in OGGETTI SEPARATI:
 *     [{mEnemyID:"114"},{mAreaNo:"2"},{mFieldSkillPackId:"0"}]
 * invece di un solo oggetto {mEnemyID, mAreaNo, mFieldSkillPackId}. In quella
 * forma:
 *   - tools-js/restore-bosses.cjs non le vedeva rotte (il solo mEnemyID le
 *     faceva contare come "già col boss"), quindi le saltava;
 *   - tools-js/fix-monsters.cjs legge `b.mAreaNo` per mettere il boss nell'area
 *     giusta e non lo trovava.
 * Il campo area c'è: è solo in un oggetto diverso. Questo script lo riunifica,
 * quindi NON serve rifare il match dal nome: si usano i dati già in archivio.
 *
 * Non tocca le quest già ben formate.
 */
const mongoose = require('mongoose');

const {
  DB_USER = 'root', DB_PASSWORD = 'example',
  DB_IP = 'mongo', DB_PORT = '27017', DB_NAME = 'apypos',
} = process.env;

const DRY = process.argv.includes('--dry');

/** true se la lista ha campi separati (un oggetto per campo). */
function spezzata(arr) {
  if (!Array.isArray(arr) || arr.length < 2) return false;
  const nemSenzaArea = arr.some((e) => e && e.mEnemyID !== undefined && e.mAreaNo === undefined);
  const areaSenzaNem = arr.some((e) => e && e.mAreaNo !== undefined && e.mEnemyID === undefined);
  return nemSenzaArea && areaSenzaNem;
}

/** Un mEnemyID apre un boss; i campi seguenti si uniscono a quello corrente. */
function normalizza(arr) {
  const out = [];
  let cur = null;
  for (const e of arr) {
    if (!e || typeof e !== 'object') continue;
    if (e.mEnemyID !== undefined) { cur = { ...e }; out.push(cur); }
    else if (cur) { for (const k of Object.keys(e)) if (cur[k] === undefined) cur[k] = e[k]; }
  }
  return out;
}

(async () => {
  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const qs = mongoose.connection.db.collection('questsheets');

  const docs = await qs.find({ mDefineId: /^(EVENT|TICKE|ETERN|SCORE)/ })
    .project({ mDefineId: 1, mQuestID: 1, mQuestName: 1, mBossList: 1 }).toArray();

  const ops = [];
  const esempi = [];
  for (const d of docs) {
    if (!spezzata(d.mBossList)) continue;
    const nuovo = normalizza(d.mBossList);
    if (!nuovo.length || nuovo.some((b) => b.mAreaNo === undefined)) continue;
    if (esempi.length < 8) {
      esempi.push(`  ${d.mDefineId}  ${JSON.stringify(d.mBossList)}  ->  ${JSON.stringify(nuovo)}`);
    }
    ops.push({ updateOne: { filter: { _id: d._id }, update: { $set: { mBossList: nuovo } } } });
  }

  console.log(`quest evento/ticket/eternal/score esaminate: ${docs.length}`);
  console.log(`da ricomporre (boss spezzato): ${ops.length}\n`);
  esempi.forEach((e) => console.log(e));

  if (DRY) { console.log('\n[dry] nessuna scrittura.'); }
  else if (ops.length) {
    const r = await qs.bulkWrite(ops);
    console.log(`\nricomposte ${r.modifiedCount} quest.`);
    const restano = (await qs.find({ mDefineId: /^(EVENT|TICKE|ETERN|SCORE)/ }).project({ mBossList: 1 }).toArray())
      .filter((d) => spezzata(d.mBossList)).length;
    console.log(`ancora spezzate: ${restano}`);
  }

  await mongoose.disconnect();
})().catch((e) => { console.error('ERRORE:', e); process.exit(1); });
