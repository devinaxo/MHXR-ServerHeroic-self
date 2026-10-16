// Simulate what the client does on a version bump, and verify the result.
//
// The client at res_ver 282 sees the server at 286 (gap 4), so it requests
// d0282_0286/stdDL/download.list, downloads the packs listed there, checks each
// against the crcjam in that same manifest, and saves res_ver 286.
//
// This walks that path over HTTP exactly as the client would, so a failure here
// is a failure the client will also hit.
//
//   node verify-bump.cjs <base-url> <from-ver> <to-ver>
const http = require('http');

const [, , base, fromV, toV] = process.argv;
if (!base || !fromV || !toV) {
  console.error('Uso: node verify-bump.cjs <base-url> <from-ver> <to-ver>');
  process.exit(1);
}

const TAB = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i >>> 0;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crcjamContinue(crc, buf) {
  for (let i = 0; i < buf.length; i++) crc = TAB[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return crc >>> 0;
}

function get(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} ${url}`));
          return;
        }
        resolve(res);
      })
      .on('error', reject);
  });
}

const pad = (n) => String(n).padStart(4, '0');

// Read one manifest and verify every pack it lists.
async function verifyStep(folder) {
  const listUrl = `${base}/res/download/android/${folder}/stdDL/download.list`;
  const res = await get(listUrl);
  const raw = (
    await new Promise((r) => {
      const c = [];
      res.on('data', (d) => c.push(d));
      res.on('end', () => r(Buffer.concat(c)));
    })
  ).toString('utf8');

  const lines = raw.split('\n').filter((l) => l.trim());
  console.log(`manifest: ${lines.length} packs, ${raw.length} bytes`);
  if (!lines.length) {
    console.log('  FAIL: empty manifest, the client would consider the update broken.');
    return { bad: 1, total: 0, bytes: 0 };
  }

  let bad = 0;
  let bytes = 0;
  for (const line of lines) {
    const [p, crc, size] = line.split(',');
    // Manifest paths start with their group (/stdDL/...), and the folder we are
    // already inside IS that group, so it must come off or the path doubles
    // and 404s.
    const rel = p.replace(/^\/+/, '').replace(/^stdDL\//, '');
    const url = `${base}/res/download/android/${folder}/stdDL/${rel}`;
    process.stdout.write(`  ${p} ... `);
    const r = await get(url);
    let got = 0xffffffff;
    let n = 0;
    for await (const chunk of r) {
      n += chunk.length;
      got = crcjamContinue(got, chunk);
    }
    const okCrc = (got >>> 0) === Number.parseInt(crc, 16);
    const okSize = n === Number(size);
    bytes += n;
    if (okCrc && okSize) {
      console.log(`ok (${n} bytes, crcjam ${crc})`);
    } else {
      bad++;
      console.log(
        `FAIL crc=${okCrc ? 'ok' : `${(got >>> 0).toString(16)} != ${crc}`} ` +
          `size=${okSize ? 'ok' : `${n} != ${size}`}`
      );
    }
  }
  return { bad, total: lines.length, bytes };
}

(async () => {
  const from = Number(fromV);
  const to = Number(toV);
  const gap = to - from;
  console.log(`client at ${from}, server at ${to}, gap ${gap}\n`);

  let bad = 0;
  let total = 0;
  let bytes = 0;

  if (gap >= 10 || from === 0) {
    const folder = `v${pad(to)}`;
    console.log(`full install -> ${folder}\n`);
    const r = await verifyStep(folder);
    bad += r.bad;
    total += r.total;
    bytes += r.bytes;
  } else {
    // The client steps ONE version at a time. Confirmed by the 404 it logged on
    // 2026-10-07: sitting at 282 with the server at 286 it requested
    // d0282_0283, not d0282_0286. So walk every adjacent pair.
    console.log('stepwise diff (client advances one version at a time)\n');
    for (let v = from; v < to; v++) {
      const folder = `d${pad(v)}_${pad(v + 1)}`;
      console.log(`step ${v} -> ${v + 1}   ${folder}`);
      const r = await verifyStep(folder);
      console.log('');
      bad += r.bad;
      total += r.total;
      bytes += r.bytes;
    }
  }

  console.log(`${bad === 0 ? 'PASS' : 'FAIL'}: ${total - bad}/${total} packs verified`);
  console.log(`total downloaded: ${(bytes / 1073741824).toFixed(2)} GB`);
  process.exit(bad ? 1 : 0);
})().catch((e) => {
  console.error(`\nFAIL: ${e.message}`);
  process.exit(1);
});
