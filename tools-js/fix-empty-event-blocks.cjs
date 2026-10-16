/*
 * Blocchi di ripiego per le quest evento/ticket rimaste SENZA mBlocks.
 *
 *   node /app/tools/fix-empty-event-blocks.cjs --dry
 *   node /app/tools/fix-empty-event-blocks.cjs
 *   node /app/tools/fix-empty-event-blocks.cjs --undo   (rimette mBlocks vuoto)
 *
 * PERCHE' SERVE
 * tools-js/fix-monsters.cjs assegna i blocchi dal mostro (titolo, id nemico,
 * ricompense). Restano scoperte ~326 quest il cui boss e' un id SENZA NOME
 * (114, 91, 31, 22, 36, 160: nemici "speciali", non mostri — missioni
 * zeny/bandiera/esploratore e le "レア装備確定" a percentuale). Per quelle non
 * esiste alcun mostro da cercare, quindi nessuno script puo' indovinare il
 * blocco originale: quei dati non sono in nessun file del gioco.
 *
 * COSA FA
 * Assegna un blocco di un CONTINENTE EVENTO (l70/l75/l9x — mai i continenti
 * della storia, dove c'e' l'isola del tutorial: era la causa della missione
 * iniziale che partiva per sbaglio) per ogni area del boss. La scelta e'
 * deterministica per quest+area, quindi stabile fra riavvii e identica per
 * tutti i giocatori della stessa stanza.
 *
 * ATTENZIONE: il MOSTRO di queste quest sara' quello del blocco scelto, non
 * necessariamente quello originale (che non e' recuperabile). La RICOMPENSA
 * non cambia: la consegna il server a fine quest da mRewardItemList.
 *
 * Le righe toccate sono marcate mBlocksSource: 'fallback-evento', cosi' si
 * distinguono sempre e --undo le riporta a vuoto.
 */
const fs = require('fs');
const mongoose = require('mongoose');

const {
  DB_USER = 'root', DB_PASSWORD = 'example',
  DB_IP = 'mongo', DB_PORT = '27017', DB_NAME = 'apypos',
} = process.env;

const DRY = process.argv.includes('--dry');
const UNDO = process.argv.includes('--undo');
const CONTINENTI_EVENTO = /^l(70|75|9\d)$/;
const NOTA_VIETATA = /collection|node|dialog|dialolgue|treasur|tresur|coin|nothing|empty|none|gathering|tutorial|dead|\btest\b|story|delete|hp:|hunter|^\?/i;

function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}
function eMostro(n) {
  const s = String(n || '').replace(/\s+/g, ' ').trim().toLowerCase();
  return s.length > 0 && !NOTA_VIETATA.test(s);
}

(async () => {
  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const qs = mongoose.connection.db.collection('questsheets');

  if (UNDO) {
    const r = await qs.updateMany({ mBlocksSource: 'fallback-evento' }, { $set: { mBlocks: [] }, $unset: { mBlocksSource: '' } });
    console.log(`riportate a vuoto ${r.modifiedCount} quest.`);
    await mongoose.disconnect();
    return;
  }

  // Pool di blocchi evento con un vero mostro, per area della mappa.
  const righe = JSON.parse(fs.readFileSync('/app/tools/mst-block-ids.json', 'utf8')).slice(1);
  const perArea = new Map();   // numero area -> [hash, ...]
  const tutteEvento = [];
  for (const r of righe) {
    const h = Number(r.F);
    if (!h || isNaN(h)) continue;
    if (!CONTINENTI_EVENTO.test(String(r.B || ''))) continue;
    if (!eMostro(r.G)) continue;
    const a = parseInt(String(r.D || '').replace(/\D/g, ''), 10) || 0;
    if (!perArea.has(a)) perArea.set(a, []);
    perArea.get(a).push(h);
    tutteEvento.push(h);
  }
  if (!tutteEvento.length) throw new Error('nessun blocco evento con mostro nel foglio');
  const aree = [...perArea.keys()].sort((x, y) => x - y);
  console.log(`blocchi evento con mostro: ${tutteEvento.length} su ${aree.length} aree (${aree.join(',')})`);

  function scegliArea(qid, area) {
    const pool = perArea.get(area);
    if (pool && pool.length) return pool[hash(`${qid}:${area}`) % pool.length];
    return tutteEvento[hash(`${qid}:${area}`) % tutteEvento.length];
  }

  const tutti = await qs.find({
    $or: [{ mBlocks: { $size: 0 } }, { mBlocks: { $exists: false } }],
  }).project({ mDefineId: 1, mQuestID: 1, mQuestName: 1, mBossList: 1 }).toArray();
  // Tutto ciò che è evento/ticket/eternal/score, PIÙ le poche senza prefisso;
  // restano fuori la storia, l'addestramento e il tutorial, che funzionano.
  const docs = tutti.filter((d) => !/^(QUEST|TRAIN|TUTOR)/.test(String(d.mDefineId || '')));

  const ops = [];
  const esempi = [];
  for (const d of docs) {
    const qid = String(d.mQuestID);
    const areeBoss = [...new Set((d.mBossList || [])
      .map((b) => parseInt(b?.mAreaNo, 10)).filter((n) => !isNaN(n)))].sort((a, b) => a - b);
    const maxArea = areeBoss.length ? Math.max(...areeBoss) : 3;
    const finali = [];
    for (let a = 1; a <= maxArea; a++) finali.push(scegliArea(qid, a));
    if (esempi.length < 8) esempi.push(`  ${d.mDefineId}  ${String(d.mQuestName || '').replace(/\n/g, ' ').slice(0, 40)}  ->  ${finali.join(',')}`);
    ops.push({ updateOne: { filter: { _id: d._id }, update: { $set: { mBlocks: finali, mBlocksSource: 'fallback-evento' } } } });
  }

  console.log(`quest senza blocchi da coprire: ${ops.length}\n`);
  esempi.forEach((e) => console.log(e));

  if (DRY) { console.log('\n[dry] nessuna scrittura.'); }
  else if (ops.length) {
    const r = await qs.bulkWrite(ops);
    console.log(`\nassegnate ${r.modifiedCount} quest.`);
    const vuoti = await qs.countDocuments({ $or: [{ mBlocks: { $size: 0 } }, { mBlocks: { $exists: false } }] });
    console.log(`questsheets ancora senza blocchi: ${vuoti}`);
  }

  await mongoose.disconnect();
})().catch((e) => { console.error('ERRORE:', e); process.exit(1); });
