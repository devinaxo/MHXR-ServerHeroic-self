// API round-trip: encrypt a request the way the client does, POST it, decrypt
// the reply. Proves the crypto path works, not just that nothing 500s.
//
//   docker exec mhxr-serverheroic-self-server-1 node /app/tools/api_test.cjs
const { Blowfish } = require('egoroof-blowfish');

const KEY = Buffer.from('FFFFFFFF00000000FFFFFFFF000000006E7900002D5700004F3F2D5600000000', 'hex');
const BASE = 'http://127.0.0.1:8081';

function encrypt(s) {
  const bf = new Blowfish(KEY, Blowfish.MODE.ECB, Blowfish.PADDING.PKCS5);
  return Buffer.from(bf.encode(s));
}
function decrypt(buf) {
  const bf = new Blowfish(KEY, Blowfish.MODE.ECB, Blowfish.PADDING.PKCS5);
  return bf.decode(buf, Blowfish.TYPE.STRING);
}

const now = Math.floor(Date.now() / 1000);
const oneDay = 86400;

// Step 6 of the client's startup sequence; must answer {"flag": 1} to disable
// SafetyNet.
const body = {
  game_id: '09.03.06',
  device_uuid: 'smoke-test-device',
  now_time: now,
  one_day_time: oneDay,
};

(async () => {
  const res = await fetch(`${BASE}/api/welcome/safety/flag/get`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: encrypt(JSON.stringify(body)),
  });
  const raw = Buffer.from(await res.arrayBuffer());
  console.log(`status: ${res.status}`);
  console.log(`content-type: ${res.headers.get('content-type')}`);
  console.log(`raw response (${raw.length} bytes): ${raw.toString('hex').slice(0, 120)}`);
  if (raw.length === 0) {
    console.log('EMPTY RESPONSE');
    process.exit(1);
  }
  const text = decrypt(raw).replace(/\0+$/, '').trim();
  console.log(`decrypted: ${text}`);
  const parsed = JSON.parse(text);
  console.log('\n--- checks ---');
  const checks = [
    ['error_code is 0 (success)', parsed.error_code === 0],
    ['flag === 1 (SafetyNet disabled)', parsed.flag === 1],
    ['res_ver present', parsed.res_ver !== undefined],
    ['app_ver is 09.03.06', parsed.app_ver === '09.03.06'],
    ['now_time present', parsed.now_time !== undefined],
    ['one_day_time present', parsed.one_day_time !== undefined],
  ];
  let bad = 0;
  for (const [label, cond] of checks) {
    console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}`);
    if (!cond) bad++;
  }
  console.log(`\nres_ver=${parsed.res_ver}`);
  process.exit(bad ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
