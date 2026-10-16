/*
 * Costruisce due tabelle dai BLOCCHI DEL GIOCO (i file veri, non il foglio a mano):
 *
 *   enemy-map.json   mEnemyID -> nome del mostro (per capire che mostro e')
 *   block-areas.json <lXX_mYY_aZZ> -> { "<enemyId>": { n, target } }
 *                    quali nemici stanno in quell'area, e se sono il bersaglio
 *
 *   node /app/tools/build-enemy-map.cjs
 */
const fs = require('fs');
const path = require('path');
const zlib = require('node:zlib');
const { parseXfs } = require('/app/tools/xfs-parse.cjs');

const RES = '/app/dist/public/res/download/android';
const ARC_KEY = 'kaseoa nkaeka;eawf3';

function parseFpk(buf) {
  if (buf.length < 16 || buf.toString('ascii', 0, 4) !== 'FPK\0') return null;
  const n = buf.readUInt16LE(14);
  const out = [];
  for (let i = 0; i < n; i++) {
    const off = 16 + i * 80;
    if (off + 80 > buf.length) break;
    const pb = buf.subarray(off, off + 64);
    const nul = pb.indexOf(0);
    const filePath = pb.toString('utf-8', 0, nul === -1 ? 64 : nul);
    const size = buf.readUInt32LE(off + 68);
    const dataOff = buf.readUInt32LE(off + 76);
    if (dataOff + size > buf.length) continue;
    out.push({ filePath, data: buf.subarray(dataOff, dataOff + size) });
  }
  return out;
}

function swap4(d) {
  const r = Buffer.alloc(d.length);
  for (let i = 0; i + 3 < d.length; i += 4) { r[i]=d[i+3]; r[i+1]=d[i+2]; r[i+2]=d[i+1]; r[i+3]=d[i]; }
  const rem = d.length % 4;
  if (rem > 0) d.copy(r, d.length - rem, d.length - rem);
  return r;
}

async function parseArc(buf) {
  const magic = buf.toString('ascii', 0, 4);
  if (magic !== 'ARC\0' && magic !== 'ARCC') return null;
  const fileCount = buf.readUInt16LE(6);
  let body;
  if (magic === 'ARCC') {
    const { Blowfish } = await import('egoroof-blowfish');
    const bf = new Blowfish(ARC_KEY, Blowfish.MODE.ECB, Blowfish.PADDING.NULL);
    const swapped = swap4(buf.subarray(8));
    let dec = Buffer.from(bf.decode(swapped, Blowfish.TYPE.UINT8_ARRAY));
    if (dec.length < swapped.length) dec = Buffer.concat([dec, Buffer.alloc(swapped.length - dec.length)]);
    body = swap4(dec);
  } else body = buf.subarray(8);
  const entries = [];
  for (let i = 0; i < fileCount; i++) {
    const off = i * 80;
    if (off + 80 > body.length) break;
    const nb = body.subarray(off, off + 64);
    const nul = nb.indexOf(0);
    const name = nb.toString('utf-8', 0, nul === -1 ? 64 : nul);
    const compSize = body.readUInt32LE(off + 68);
    const offset = body.readUInt32LE(off + 76);
    const start = offset - 8;
    if (start < 0 || start + compSize > body.length) continue;
    let data;
    try { data = Buffer.from(zlib.inflateSync(body.subarray(start, start + compSize))); } catch { data = null; }
    entries.push({ name, data });
  }
  return entries;
}

function placements(root) {
  const list = root && root.mDataList && root.mDataList.mpArray;
  if (!list) return [];
  return Array.isArray(list) ? list : [list];
}
function nomeBase(comment) {
  return String(comment || '').replace(/^(ENEMY|BOSS|EM_WAIT|ENEMY_WAIT|POP|START|ENEMY_POP)_/, '').replace(/_?\d+$/, '');
}

(async () => {
  const fpks = fs.readdirSync(RES, { recursive: true })
    .filter((fn) => typeof fn === 'string' && fn.endsWith('.fpk') && path.basename(fn).startsWith('quest.'))
    .map((fn) => path.join(RES, fn));
  console.log(`archivi quest.*.fpk: ${fpks.length}`);

  const mappa = new Map();      // enemyId -> Map(nome -> voti)
  const aree = new Map();       // lXX_mYY_aZZ -> Map(enemyId -> {n, target})
  let visti = 0;

  for (const f of fpks) {
    let entries;
    try { entries = parseFpk(fs.readFileSync(f)); } catch { continue; }
    if (!entries) continue;
    for (const e of entries) {
      const m = e.filePath.match(/\/block\/(l\d+)\/(m\d+)\.arc$/);
      if (!m) continue;
      visti++;
      const level = m[1];
      const arc = await parseArc(e.data);
      if (!arc) continue;
      for (const sub of arc) {
        if (!sub.data) continue;
        const mm = sub.name.match(/(m\d+a\d+)\s*$/);
        if (!mm) continue;
        const area = `${level}_${mm[1]}`;
        let root;
        try { root = parseXfs(sub.data).root; } catch { continue; }
        const nel = aree.get(area) || new Map();
        for (const p of placements(root)) {
          const prim = p.mPrimList && p.mPrimList.mpArray;
          const lista = Array.isArray(prim) ? prim : prim ? [prim] : [];
          for (const q of lista) {
            const t = Number(q.Type);
            if (!t || isNaN(t)) continue;
            if (!mappa.has(t)) mappa.set(t, new Map());
            const nomi = mappa.get(t);
            const nome = nomeBase(p.mComment);
            nomi.set(nome, (nomi.get(nome) || 0) + 1);
            const rec = nel.get(t) || { n: 0, target: 0 };
            rec.n += 1;
            if (q.mIsTarget) rec.target += 1;
            nel.set(t, rec);
          }
        }
        if (nel.size) aree.set(area, nel);
      }
    }
  }

  const out = {};
  for (const [id, nomi] of [...mappa.entries()].sort((a, b) => a[0] - b[0])) {
    const ord = [...nomi.entries()].sort((a, b) => b[1] - a[1]);
    out[id] = { nome: ord[0][0], voti: ord[0][1], altri: ord.slice(1, 3).map((x) => `${x[0]}(${x[1]})`) };
  }
  fs.writeFileSync('/app/tools/enemy-map.json', JSON.stringify(out, null, 1) + '\n');

  const areeOut = {};
  for (const [area, nel] of [...aree.entries()].sort()) {
    areeOut[area] = {};
    for (const [id, rec] of [...nel.entries()].sort((a, b) => a[0] - b[0])) areeOut[area][id] = rec;
  }
  fs.writeFileSync('/app/tools/block-areas.json', JSON.stringify(areeOut) + '\n');

  console.log(`archivi blocco visti: ${visti}`);
  console.log(`nemici mappati: ${Object.keys(out).length}`);
  console.log(`aree mappate: ${Object.keys(areeOut).length}`);
  for (const id of [90, 114, 91, 31]) {
    if (!out[id]) continue;
    const conTarget = Object.entries(areeOut).filter(([, e]) => e[id] && e[id].target > 0);
    console.log(`  enemy ${id} (${out[id].nome}): aree con quel nemico = ${Object.values(areeOut).filter((e) => e[id]).length}, di cui dove e' il bersaglio = ${conTarget.length}`);
  }
})().catch((e) => { console.error('ERRORE:', e); process.exit(1); });
