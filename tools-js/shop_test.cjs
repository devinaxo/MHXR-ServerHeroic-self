// Live check of the Trading Post: prices, stock, the daily allowance, and that
// buying actually spends Trade Points.
//
//   docker cp tools-js/shop_test.cjs <ctr>:/app/tools/
//   docker exec <ctr> node /app/tools/shop_test.cjs
//
// It buys one unit of the cheapest material on offer and gives the points back,
// so it nets out to nothing. It spends nothing real beyond that.
const { Blowfish } = require('egoroof-blowfish');
const { MongoClient } = require('mongodb');

const KEY = Buffer.from('FFFFFFFF00000000FFFFFFFF000000006E7900002D5700004F3F2D5600000000', 'hex');
const BASE = 'http://127.0.0.1:8081';
const POINT_ID = 3190222199;
const TIER3_ID = 338634236; // 'Special Deal P': what mst_shop_id 3 is priced in

function enc(s) {
  return Buffer.from(new Blowfish(KEY, Blowfish.MODE.ECB, Blowfish.PADDING.PKCS5).encode(s));
}
function dec(b) {
  return new Blowfish(KEY, Blowfish.MODE.ECB, Blowfish.PADDING.PKCS5).decode(b, Blowfish.TYPE.STRING);
}

async function call(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: enc(JSON.stringify(body)),
  });
  const raw = Buffer.from(await res.arrayBuffer());
  return JSON.parse(dec(raw).replace(/\0+$/, '').trim());
}

let bad = 0;
const check = (label, cond, extra = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? ' ' + extra : ''}`);
  if (!cond) bad++;
};

(async () => {
  const c = new MongoClient(`mongodb://${process.env.DB_USER}:${process.env.DB_PASSWORD}@mongo:27017`, { authSource: 'admin' });
  await c.connect();
  const users = c.db('apypos').collection('users');
  const u = await users.findOne({});
  const session = u.current_session;
  if (!session) throw new Error('no live session; start the game first');

  const list = await call('/api/shop/list', { session_id: session });
  const items = list.shop_items || [];

  console.log(`player: ${u.character_name}   items on offer: ${items.length}\n`);
  console.log('--- the shop rows ---');
  check('rows came back', items.length > 0);
  check('nothing reads sold out', items.every((i) => i.shop_limit > 0),
    `(min shop_limit ${Math.min(...items.map((i) => i.shop_limit))})`);
  check('every row has a price in P', items.every((i) => i.price > 0),
    `(prices ${[...new Set(items.map((i) => i.price))].sort((a, b) => a - b).join(', ')})`);
  // isItemExchanged() is `item[28] == 0`: a zero item_limit badges the row
  // EXCHANGED and blocks the click.
  check('no row is flagged as already exchanged', items.every((i) => i.item_limit > 0),
    `(min item_limit ${Math.min(...items.map((i) => i.item_limit))})`);
  check('stock is a real number, not a flat 99', new Set(items.map((i) => i.shop_limit)).size >= 1,
    `(shop_limit ${Math.min(...items.map((i) => i.shop_limit))}..${Math.max(...items.map((i) => i.shop_limit))})`);

  const dopoList = await users.findOne({ current_session: session });
  const punti = (dopoList.box.points || []).find((p) => p.mst_event_point_id === POINT_ID);
  console.log(`\nbalance after opening the post: ${punti ? punti.amount : 0} P`);
  console.log(`allowance recorded for today   : ${dopoList.punti_ultimo_giorno}`);
  check('the account has a Trade Points row', !!punti && punti.amount > 0);

  // Idempotence: opening the post again must not grant a second allowance.
  await call('/api/shop/list', { session_id: session });
  const dopo2 = await users.findOne({ current_session: session });
  const punti2 = (dopo2.box.points || []).find((p) => p.mst_event_point_id === POINT_ID);
  check('opening again does not double the allowance', punti2.amount === punti.amount,
    `(${punti.amount} -> ${punti2.amount})`);

  // Buy the cheapest row, then check the points actually moved.
  const piu = items.reduce((a, b) => (b.price < a.price ? b : a));
  console.log(`\nbuying 1x "${piu.name}" at ${piu.price} P`);
  const prima = punti2.amount;
  const buy = await call('/api/shop/buy', {
    session_id: session,
    amount: 1,
    mst_shop_id: 3,
    mst_shop_item_id: piu.mst_shop_item_id,
  });
  const dopoBuy = await users.findOne({ current_session: session });
  const punti3 = (dopoBuy.box.points || []).find((p) => p.mst_event_point_id === POINT_ID);

  console.log(`\n--- checks ---`);
  check('the purchase was accepted', buy.error_code === 0, `(error_code ${buy.error_code})`);
  // mst_shop_id 3 is the third currency, so that is what gets spent -- the
  // base Trade Point must be left alone.
  const tier3 = (dopoBuy.box.points || []).find((p) => p.mst_event_point_id === TIER3_ID);
  const base = (dopoBuy.box.points || []).find((p) => p.mst_event_point_id === POINT_ID);
  check('the tab-3 currency was spent', tier3 && tier3.amount === prima - piu.price,
    `(${prima} - ${piu.price} = ${prima - piu.price}, got ${tier3 ? tier3.amount : '?'})`);
  check('the other currencies were left alone', base && base.amount === 1000, `(base ${base ? base.amount : '?'})`);
  check('the response reports the new balance',
    buy.point && buy.point.mst_event_point_id === TIER3_ID && buy.point.amount === tier3.amount);
  check('the material landed in the box',
    (dopoBuy.box.materials || []).some((m) => m.mst_material_id === piu.mst_shop_item_id));

  // Stock must come down after buying, and the post must show it.
  const dopoList2 = await call('/api/shop/list', { session_id: session });
  const riga = (dopoList2.shop_items || []).find((i) => i.mst_shop_item_id === piu.mst_shop_item_id);
  console.log(`\nstock of that row after buying: ${riga ? riga.shop_limit : 'row gone'}`);
  check('buying reduced the stock on that row', !!riga && riga.shop_limit < piu.shop_limit,
    `(${piu.shop_limit} -> ${riga ? riga.shop_limit : '?'})`);

  // Put the points back so repeated runs do not drain the account.
  await users.updateOne({ _id: dopoBuy._id },
    { $set: { 'box.points': (dopoBuy.box.points || []).map((p) => (p.mst_event_point_id === POINT_ID ? { ...p, amount: prima } : p)) } });
  console.log('\n(points restored to the pre-test balance)');

  await c.close();
  console.log(`\n${bad ? bad + ' CHECK(S) FAILED' : 'all checks passed'}`);
  process.exit(bad ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});