/*
 * Recupera le mRewardItemList delle quest evento, perse durante l'importazione.
 *
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/restore-rewards.cjs --dry
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/restore-rewards.cjs
 *
 * COSA ERA SUCCESSO
 * Nel dump grezzo le ricompense sono avvolte nella struttura del convertitore
 * XFS: {"mAutoDelete":"false","array":{"mpArray":[{mItemHash,...},...]}} (in
 * alcuni file la chiave e' "classref_"). Lo schema Mongoose si aspetta un array
 * semplice: ricevendo l'oggetto ha scritto [null], e TUTTE le 1524 quest evento
 * sono rimaste senza ricompense. Stesso difetto dei boss, recuperati con
 * restore-bosses.cjs; per le ricompense non esisteva lo script.
 *
 * Conseguenza: materiali che si ottenevano solo da quelle quest (le pergamene
 * "Subjugation" delle lune, i Flower Ore, ecc.) erano irraggiungibili.
 *
 * Lo script riscrive mRewardItemList solo dove in DB NON c'e' gia' una
 * ricompensa vera, quindi e' idempotente e non tocca le quest normali.
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const {
  DB_USER = 'root', DB_PASSWORD = 'example',
  DB_IP = 'mongo', DB_PORT = '27017', DB_NAME = 'apypos',
} = process.env;

const DRY = process.argv.includes('--dry');

const SORGENTI = [
  'event.extended.blank.json',
  'event.extended.json',
  'ticket.extended.complete.json',
  'normal.extended.complete.json',
  'eternal.extended.complete.json',
  'score.extended.complete.json',
  'training.extended.complete.json',
];

// Normalizza le due forme del convertitore in un array di ricompense vere.
function estraiRicompense(valore) {
  if (Array.isArray(valore)) {
    const validi = valore.filter((r) => r && String(r.mItemHash ?? '').trim() !== '');
    return validi.length ? validi : null;
  }
  const arr = valore?.classref_?.mpArray ?? valore?.array?.mpArray;
  if (!Array.isArray(arr)) return null;
  const validi = arr.filter((r) => r && String(r.mItemHash ?? '').trim() !== '');
  return validi.length ? validi : null;
}

(async () => {
  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const qs = mongoose.connection.db.collection('questsheets');

  const premi = new Map();
  for (const f of SORGENTI) {
    const p = path.join('/app/dist/json/questDB', f);
    if (!fs.existsSync(p)) continue;
    let d;
    try { d = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { continue; }
    let n = 0;
    for (const q of d?.rQuestSheet?.mQuestDataList || []) {
      const r = estraiRicompense(q.mRewardItemList);
      if (r && q.mQuestID && !premi.has(String(q.mQuestID))) { premi.set(String(q.mQuestID), r); n++; }
    }
    console.log(`  ${f.padEnd(34)} ricompense recuperate: ${n}`);
  }
  console.log(`\ntotale quest con ricompense nei file: ${premi.size}`);

  const ids = [...premi.keys()];
  const attuali = await qs.find({ mQuestID: { $in: ids } })
    .project({ mQuestID: 1, mRewardItemList: 1, mQuestName: 1 }).toArray();

  const ops = [];
  const esempi = [];
  let gia = 0;
  for (const doc of attuali) {
    const nuovo = premi.get(String(doc.mQuestID));
    const vecchio = (doc.mRewardItemList || []).filter((r) => r && String(r.mItemHash ?? '').trim() !== '');
    if (vecchio.length > 0) { gia++; continue; } // gia' a posto
    if (esempi.length < 6) {
      const nome = String(doc.mQuestName || '').replace(/\n/g, ' ');
      // Quante ricompense e i primi id, per riconoscere le quest.
      esempi.push(`  ${nome.slice(0, 42).padEnd(44)} -> ${nuovo.length} premi (${nuovo.slice(0, 3).map((r) => r.mItemHash).join(', ')})`);
    }
    ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: { mRewardItemList: nuovo } } } });
  }

  console.log(`quest trovate in DB : ${attuali.length}`);
  console.log(`  gia' con ricompense: ${gia}`);
  console.log(`  da recuperare     : ${ops.length}`);
  console.log('\nesempi:');
  esempi.forEach((e) => console.log(e));

  if (DRY) { console.log('\n[dry] nessuna scrittura.'); }
  else if (ops.length) {
    const r = await qs.bulkWrite(ops);
    console.log(`\nrecuperate ${r.modifiedCount} liste di ricompense.`);
    const senza = await qs.countDocuments({
      mQuestType: '2',
      $or: [{ mRewardItemList: { $size: 0 } }, { 'mRewardItemList.0.mItemHash': { $exists: false } }],
    });
    console.log(`quest evento ancora senza ricompense: ${senza}`);
  }

  await mongoose.disconnect();
})().catch((e) => { console.error('ERRORE:', e); process.exit(1); });
