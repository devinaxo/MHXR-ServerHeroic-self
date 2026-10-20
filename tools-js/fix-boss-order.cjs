/*
 * Reorders the block list of story quests so the monsters are fought in the
 * order the quest info sheet promises (mBossList mAreaNo ascending, i.e. the
 * "final area" monster really is the last fight).
 *
 * WHY THIS WORKS
 * The client does not choose the boss from the quest list: each block has a
 * per-quest build entry (tools-js/quest-block-boss.json, generated from the
 * packs by build-quest-block-boss.cjs) with the mEnemyType it spawns. The
 * client spawns that monster in the order the server sends the blocks. The
 * info sheet instead labels each mBossList entry by its mAreaNo. Capcom stores
 * every multi-boss story list descending by area, so the blocks' bosses often
 * come out reversed relative to the sheet.
 *
 * USAGE
 *   node tools-js/fix-boss-order.cjs --json --dry        # no DB, report only
 *   node tools-js/fix-boss-order.cjs --dry --report out.txt
 *   node tools-js/fix-boss-order.cjs --apply             # write to Mongo
 *   node tools-js/fix-boss-order.cjs --undo              # restore mBlocksOrdinePrima
 *
 * Only the positions that currently hold a quest target are permuted; transit
 * blocks and blocks with a non-target "extra" monster stay exactly where they
 * are. A quest is skipped (never guessed) if a target monster is missing or a
 * block is not in the build sheet.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BLOCK_BOSS = JSON.parse(fs.readFileSync(path.join(__dirname, 'quest-block-boss.json'), 'utf8'));
const NORMAL_JSON = path.join(ROOT, 'src/json/questDB/normal.extended.complete.json');

const DRY = process.argv.includes('--dry') || (!process.argv.includes('--apply') && !process.argv.includes('--undo'));
const APPLY = process.argv.includes('--apply');
const UNDO = process.argv.includes('--undo');
const USE_JSON = process.argv.includes('--json');
const MARK = 'build-boss';
const ORIGIN_FIELD = 'mBlocksOrdinePrima';

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const REPORT = arg('--report', path.join(ROOT, 'lavoro-traduzione/quest/ordine-boss-report.txt'));
const BACKUP_DIR = arg('--backup-dir', path.join(ROOT, 'backups'));

function rawList(v) {
  if (Array.isArray(v)) return v;
  if (v && Array.isArray(v.mpArray)) return v.mpArray;
  if (v && v.classref_ && Array.isArray(v.classref_.mpArray)) return v.classref_.mpArray;
  return [];
}
function bosses(v) {
  const a = rawList(v);
  const out = [];
  let cur = null;
  for (const e of a) {
    if (!e || typeof e !== 'object') continue;
    if (e.mEnemyID !== undefined) {
      cur = { ...e, mEnemyID: String(e.mEnemyID) };
      out.push(cur);
    } else if (cur) {
      for (const k of Object.keys(e)) if (cur[k] === undefined) cur[k] = e[k];
    }
  }
  return out.filter((b) => b.mAreaNo !== undefined);
}

function planQuest(quest) {
  const B = bosses(quest.mBossList);
  if (B.length < 2) return { status: 'single' };

  const blocks = (quest.mBlocks || []).map((h) => {
    const info = BLOCK_BOSS[String(h)];
    return { hash: Number(h), name: info ? info.name : null, boss: info ? Number(info.boss) || 0 : null };
  });
  if (blocks.some((b) => b.name === null)) return { status: 'unknown-block' };

  const listIds = B.map((b) => Number(b.mEnemyID));
  const need = {};
  for (const id of listIds) need[id] = (need[id] || 0) + 1;

  // Choose the target blocks for duplicate bosses by block name, never by the
  // current position: that keeps the plan identical on a second run.
  const byBoss = new Map();
  for (let i = 0; i < blocks.length; i++) {
    const id = blocks[i].boss;
    if (!id) continue;
    if (!byBoss.has(id)) byBoss.set(id, []);
    byBoss.get(id).push(i);
  }
  const chosen = new Set();
  const remaining = { ...need };
  for (const [id, idxs] of byBoss) {
    const want = remaining[id] || 0;
    if (!want) continue;
    idxs.sort((a, b) => String(blocks[a].name).localeCompare(String(blocks[b].name)));
    for (const i of idxs.slice(0, want)) { chosen.add(i); remaining[id] -= 1; }
  }
  const targetPositions = [...chosen].sort((a, b) => a - b);
  const missing = Object.entries(remaining).filter(([, n]) => n > 0);
  if (missing.length) return { status: 'missing-target', missing: missing.map(([id]) => Number(id)), listIds };

  const current = targetPositions.map((i) => blocks[i].boss);
  const desired = listIds
    .map((id, i) => ({ id, area: Number(B[i].mAreaNo) }))
    .sort((a, b) => a.area - b.area)
    .map((x) => x.id);

  const extras = blocks.filter((b, i) => b.boss && !targetPositions.includes(i)).map((b) => b.boss);
  const base = { current, desired, extras, from: blocks.map((b) => b.hash), names: blocks.map((b) => b.name) };
  if (current.join(',') === desired.join(',')) return { status: 'ok', ...base };

  // permute only the target blocks among their own positions
  const pool = targetPositions.map((i) => blocks[i]);
  const used = new Set();
  const to = blocks.slice();
  for (let k = 0; k < targetPositions.length; k++) {
    const want = desired[k];
    const j = pool.findIndex((b, idx) => !used.has(idx) && b.boss === want);
    if (j < 0) return { status: 'plan-error', ...base };
    used.add(j);
    to[targetPositions[k]] = pool[j];
  }

  // hard validation before anything is written
  const a = blocks.map((b) => b.hash).sort((x, y) => x - y).join(',');
  const z = to.map((b) => b.hash).sort((x, y) => x - y).join(',');
  if (a !== z) return { status: 'plan-error', reason: 'block multiset changed', ...base };
  const finalTargets = targetPositions.map((i) => to[i].boss);
  if (finalTargets.join(',') !== desired.join(',')) return { status: 'plan-error', reason: 'target order wrong', ...base };

  return { status: 'reorder', ...base, to: to.map((b) => b.hash), toNames: to.map((b) => b.name) };
}

async function loadQuests() {
  if (USE_JSON) {
    const json = JSON.parse(fs.readFileSync(NORMAL_JSON, 'utf8'));
    return json.rQuestSheet.mQuestDataList.filter((q) => String(q.mDefineId || '').startsWith('QUEST'));
  }
  const mongoose = require('mongoose');
  const {
    DB_USER = 'root', DB_PASSWORD = 'example', DB_IP = 'mongo', DB_PORT = '27017', DB_NAME = 'apypos',
  } = process.env;
  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const qs = mongoose.connection.db.collection('questsheets');
  const list = await qs.find({ mDefineId: /^QUEST/ }).toArray();
  list.__qs = qs;
  return list;
}

(async () => {
  const quests = await loadQuests();
  const qs = quests.__qs;
  const counts = { total: 0, single: 0, ok: 0, reorder: 0, extra: 0, skipped: 0 };
  const lines = [];
  const plans = [];

  for (const q of quests) {
    if (!String(q.mDefineId || '').startsWith('QUEST')) continue;
    counts.total++;
    const p = planQuest(q);
    if (p.status === 'single') { counts.single++; continue; }
    if (p.status !== 'ok' && p.status !== 'reorder') {
      counts.skipped++;
      lines.push(`SKIP ${q.mDefineId} ${q.mQuestName} :: ${p.status}${p.missing ? ' missing=' + p.missing.join(',') : ''}${p.reason ? ' ' + p.reason : ''}`);
      continue;
    }
    if (p.extras.length) counts.extra++;
    if (p.status === 'ok') { counts.ok++; continue; }
    counts.reorder++;
    plans.push({ q, p });
    lines.push(`REORDER ${q.mDefineId} ${String(q.mQuestName).replace(/\n/g, ' ')} | targets ${p.current.join(',')} -> ${p.desired.join(',')}${p.extras.length ? ' | extra ' + p.extras.join(',') : ''}`);
    lines.push(`  from ${p.names.join(' ')}`);
    lines.push(`  to   ${p.toNames.join(' ')}`);
  }

  console.log(JSON.stringify({
    mode: USE_JSON ? 'json' : 'db',
    ...counts,
    extraQuestKeptAsIs: counts.extra,
  }, null, 2));

  if (REPORT && (APPLY || UNDO || process.argv.includes('--report'))) {
    fs.mkdirSync(path.dirname(REPORT), { recursive: true });
    fs.writeFileSync(REPORT, lines.join('\n') + '\n');
    console.log(`report: ${REPORT}`);
  }

  if (UNDO) {
    if (USE_JSON) { console.log('--undo needs the DB (no --json)'); process.exit(1); }
    const sel = { [ORIGIN_FIELD]: { $exists: true }, mBlocksOrdine: MARK };
    const docs = await qs.find(sel).project({ mQuestID: 1, [ORIGIN_FIELD]: 1 }).toArray();
    let n = 0;
    for (const d of docs) {
      await qs.updateOne({ _id: d._id }, { $set: { mBlocks: d[ORIGIN_FIELD] }, $unset: { [ORIGIN_FIELD]: '', mBlocksOrdine: '' } });
      n++;
    }
    console.log(`restored ${n} quests`);
    await qs.s.db.client.close();
    return;
  }

  if (!APPLY) {
    console.log('dry run: nothing written');
    if (qs) await qs.s.db.client.close();
    return;
  }
  if (USE_JSON) { console.log('--apply needs the DB (no --json)'); process.exit(1); }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, `boss-order-${stamp}.json`);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.writeFileSync(backupPath, JSON.stringify(plans.map(({ q, p }) => ({
    mQuestID: q.mQuestID, mDefineId: q.mDefineId, mQuestName: q.mQuestName, mBlocks: p.from, mBlocksNuovo: p.to,
  })), null, 2));
  console.log(`backup: ${backupPath}`);

  let done = 0;
  for (const { q, p } of plans) {
    const orig = p.from;
    await qs.updateOne(
      { _id: q._id },
      {
        $set: { mBlocks: p.to, mBlocksOrdine: MARK, [ORIGIN_FIELD]: orig },
      },
    );
    done++;
  }
  console.log(`applied ${done} quests`);

  // verify straight from the DB
  const after = await qs.find({ mDefineId: /^QUEST/ }).toArray();
  let bad = 0;
  for (const q of after) {
    if (!String(q.mDefineId || '').startsWith('QUEST')) continue;
    const p = planQuest(q);
    if (p.status === 'reorder' || p.status === 'plan-error') { bad++; console.log('STILL WRONG', q.mDefineId, q.mQuestName); }
  }
  console.log(bad === 0 ? 'verify: all target orders match the sheet' : `verify: ${bad} still wrong`);
  await qs.s.db.client.close();
})().catch((e) => { console.error('ERRORE:', e); process.exit(1); });
