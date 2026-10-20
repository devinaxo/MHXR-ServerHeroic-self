// Live end-to-end test of box/equipment/levelup against the running server.
//
//   docker cp tools-js/levelup_test.cjs <container>:/app/tools/
//   docker exec <container> node /app/tools/levelup_test.cjs
//
// Reuses the player's live session id from Mongo, so it upgrades real gear.
// It picks the cheapest piece in the box whose material set is fully owned,
// then checks that the reply carries the three fields the client reads, that the
// zenny figure matches the cost formula, and that both the balance and the
// level actually landed in Mongo.
//
// It spends real zenny and real materials on every run. Start the game first so
// there is a live session.
const { Blowfish } = require('egoroof-blowfish');
const { MongoClient } = require('mongodb');

const KEY = Buffer.from('FFFFFFFF00000000FFFFFFFF000000006E7900002D5700004F3F2D5600000000', 'hex');
const BASE = 'http://127.0.0.1:8081';

function encrypt(s) {
  return Buffer.from(new Blowfish(KEY, Blowfish.MODE.ECB, Blowfish.PADDING.PKCS5).encode(s));
}
function decrypt(buf) {
  return new Blowfish(KEY, Blowfish.MODE.ECB, Blowfish.PADDING.PKCS5).decode(buf, Blowfish.TYPE.STRING);
}

async function call(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: encrypt(JSON.stringify(body)),
  });
  const raw = Buffer.from(await res.arrayBuffer());
  return JSON.parse(decrypt(raw).replace(/\0+$/, '').trim());
}

let bad = 0;
const check = (label, cond, extra = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? ' ' + extra : ''}`);
  if (!cond) bad++;
};

(async () => {
  const auth = `mongodb://${process.env.DB_USER ?? 'root'}:${process.env.DB_PASSWORD}@mongo:27017`;
  const client = new MongoClient(auth, { authSource: 'admin' });
  await client.connect();
  const db = client.db('apypos');
  const user = await db.collection('users').findOne({});
  if (!user) throw new Error('no user in the database');

  const session = user.current_session;
  if (!session) throw new Error('the user has no live session; start the game first');

  const costs = JSON.parse(require('node:fs').readFileSync('/app/dist/json/upgrade-costs.json', 'utf8'));

  // Pick the cheapest piece in the box whose material set is fully owned, so
  // the test does real work without needing anything expensive.
  const have = {};
  for (const m of user.box.materials ?? []) have[m.mst_material_id] = (have[m.mst_material_id] ?? 0) + m.amount;

  let pick = null;
  for (const eq of user.box.equipments ?? []) {
    const mst = costs.equipment[String(eq.mst_equipment_id)];
    if (!mst) continue;
    const base = costs.zenyByRarity[String(mst.rarity)];
    if (!base) continue;
    const lv = Number(eq.elv ?? 0);
    const cost = Math.floor(((base - 10) * lv) / 16);
    const setIdx = costs.strengthRef[String(mst.strengthenNeedMaterialId)]?.[lv];
    const set = costs.materialSets[String(setIdx)] ?? [];
    if (!set.length) continue;
    if (!set.every((m) => (have[m.mst_material_id] ?? 0) >= m.amount)) continue;
    if (cost > 0 && Number(user.box.zeny) >= cost && (!pick || cost < pick.cost)) {
      pick = { eq, lv, cost, base, set };
    }
  }

  if (!pick) {
    console.log('no piece in the box can be upgraded with the current materials; nothing to test');
    await client.close();
    process.exit(0);
  }

  console.log(`target: ${pick.eq.equipment_id} lv${pick.lv} -> lv${pick.lv + 1}, rarity cost ${pick.cost} zenny`);
  console.log(`        materials ${JSON.stringify(pick.set)}`);

  const zenyBefore = Number(user.box.zeny);
  const reply = await call('/api/box/equipment/levelup', {
    session_id: session,
    eqp_obj_id: pick.eq.equipment_id,
    num: 1,
  });

  console.log('\n--- response ---');
  console.log(`  error_code : ${reply.error_code}`);
  console.log(`  zeny       : ${reply.zeny}`);
  console.log(`  levelup    : ${reply.levelup ? JSON.stringify(reply.levelup.equipment).slice(0, 120) : 'MISSING'}`);
  console.log(`  zeny       : ${reply.levelup?.zeny}`);
  console.log(`  materials  : ${reply.levelup?.materials ? JSON.stringify(reply.levelup.materials).slice(0, 160) : 'MISSING'}`);

  console.log('\n--- checks ---');
  check('error_code is 0', reply.error_code === 0);
  // The client parses zeny and materials INSIDE "levelup" (Response::setup
  // passes the levelup property as their parent).
  check('levelup.zeny is present and numeric', typeof reply.levelup?.zeny === 'number' && !Number.isNaN(reply.levelup.zeny));
  check('levelup.zeny is not the 999999999 sentinel', reply.levelup?.zeny !== 999999999);
  check('levelup.equipment is present', !!reply.levelup?.equipment);
  check('levelup.equipment.elv was raised', reply.levelup?.equipment?.elv === pick.lv + 1);
  check('levelup.materials array is present', Array.isArray(reply.levelup?.materials));
  check('levelup.zeny equals the old balance minus the cost', reply.levelup?.zeny === zenyBefore - pick.cost,
    `(${zenyBefore} - ${pick.cost} = ${zenyBefore - pick.cost}, got ${reply.levelup?.zeny})`);

  // Confirm it really persisted, not just that the reply looks right.
  const after = await db.collection('users').findOne({ current_session: session });
  console.log('\n--- database ---');
  console.log(`  zeny in Mongo: ${after.box.zeny}`);
  const persisted = (after.box.equipments ?? []).find((e) => e.equipment_id === pick.eq.equipment_id);
  console.log(`  ${pick.eq.equipment_id}.elv in Mongo: ${persisted?.elv}`);

  check('zeny persisted to the database', Number(after.box.zeny) === zenyBefore - pick.cost);
  check('the new level persisted', persisted?.elv === pick.lv + 1);

  const matsAfter = {};
  for (const m of after.box.materials ?? []) matsAfter[m.mst_material_id] = (matsAfter[m.mst_material_id] ?? 0) + m.amount;
  for (const m of pick.set) {
    const had = (have[m.mst_material_id] ?? 0);
    check(`material ${m.mst_material_id} went down by ${m.amount}`,
      (matsAfter[m.mst_material_id] ?? 0) === had - m.amount,
      `(${had} -> ${matsAfter[m.mst_material_id] ?? 0})`);
  }

  await client.close();
  console.log(`\n${bad ? bad + ' CHECK(S) FAILED' : 'all checks passed'}`);
  process.exit(bad ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});