/*
 * Builds tools-js/quest-block-boss.json from the client packs.
 *
 * Every block a quest sends has a per-quest build entry inside
 *   <res>/quest.<N>.fpk -> /arc_cmn/quest/table/lXX/mYY/aZZ.arc
 *   -> quest\blockBuild\lXX\mYY\aZZ\<blockName>
 * and that entry's mBossList.mEnemyType is the monster that block actually
 * spawns. This sheet records it per block hash so fix-boss-order.cjs can
 * reorder a quest without parsing the packs again.
 *
 *   node tools-js/build-quest-block-boss.cjs [--res <stdDL/cmn>] [--out <file>]
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { Blowfish } = require('egoroof-blowfish');
const { parseXfs } = require('./xfs-parse.cjs');

const ROOT = path.resolve(__dirname, '..');
const KEY = 'kaseoa nkaeka;eawf3';

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const RES = path.resolve(arg('--res', path.join(ROOT, 'src/public/res/download/android/v0282/stdDL/cmn')));
const OUT = path.resolve(arg('--out', path.join(ROOT, 'tools-js/quest-block-boss.json')));
const BLOCKS_CSV = path.join(ROOT, 'src/csv/blocks.csv');

function inv(b) {
  const o = Buffer.alloc(b.length);
  for (let i = 0; i + 3 < b.length; i += 4) { o[i]=b[i+3]; o[i+1]=b[i+2]; o[i+2]=b[i+1]; o[i+3]=b[i]; }
  const r = b.length % 4; if (r > 0) b.copy(o, b.length - r, b.length - r);
  return o;
}
function dec(b) {
  const bf = new Blowfish(KEY, Blowfish.MODE.ECB, Blowfish.PADDING.NULL);
  const g = inv(b);
  let c = Buffer.from(bf.decode(g, Blowfish.TYPE.UINT8_ARRAY));
  if (c.length < g.length) c = Buffer.concat([c, Buffer.alloc(g.length - c.length)]);
  return inv(c);
}
function parseFpk(buf) {
  if (buf.length < 16 || buf.toString('ascii', 0, 4) !== 'FPK\0') return null;
  const n = buf.readUInt16LE(14); const out = [];
  for (let i = 0; i < n; i++) {
    const off = 16 + i * 80; if (off + 80 > buf.length) break;
    const pb = buf.subarray(off, off + 64); const nul = pb.indexOf(0);
    out.push({ fp: pb.toString('utf-8', 0, nul === -1 ? 64 : nul), size: buf.readUInt32LE(off + 68), dataOff: buf.readUInt32LE(off + 76) });
  }
  return out;
}
function arcSubs(buf) {
  const magic = buf.toString('ascii', 0, 4);
  const body = magic === 'ARCC' ? dec(buf.subarray(8)) : buf.subarray(8);
  const n = buf.readUInt16LE(6); const out = [];
  for (let i = 0; i < n; i++) {
    const o = i * 80; const nm = body.subarray(o, o + 64); const nul = nm.indexOf(0);
    const name = nm.toString('utf-8', 0, nul === -1 ? 64 : nul);
    const cs = body.readUInt32LE(o + 68); const start = body.readUInt32LE(o + 76) - 8;
    let data = null;
    try { data = zlib.inflateSync(body.subarray(start, start + cs)); } catch { /* not zlib */ }
    out.push({ name, data });
  }
  return out;
}

// name -> hash from the game sheet the server already uses
const nameToHash = new Map();
for (const row of fs.readFileSync(BLOCKS_CSV, 'utf8').split('\n').slice(1)) {
  const [name, hash] = row.trim().split(',');
  if (name && hash) nameToHash.set(name, Number(hash));
}

const result = {};
let tables = 0, entries = 0, skipped = 0;
for (const file of fs.readdirSync(RES).filter((f) => /^quest\.\d+\.fpk$/.test(f))) {
  const buf = fs.readFileSync(path.join(RES, file));
  for (const e of parseFpk(buf) || []) {
    if (!/\/quest\/table\/l\d+\/m\d+\/a\d+\.arc$/.test(e.fp)) continue;
    tables++;
    for (const sub of arcSubs(buf.subarray(e.dataOff, e.dataOff + e.size))) {
      if (!sub.data) continue;
      const blockName = sub.name.split(/[\\/]/).pop();
      const hash = nameToHash.get(blockName);
      if (!hash) { skipped++; continue; }
      let boss = 0;
      try {
        const doc = parseXfs(sub.data).root;
        const data = doc.mData || doc;
        let list = data.mBossList && data.mBossList.mpArray;
        if (list && !Array.isArray(list)) list = [list];
        if (list && list.length) boss = Number(list[0].mEnemyType) || 0;
      } catch {
        skipped++;
        continue;
      }
      result[String(hash)] = { name: blockName, boss };
      entries++;
    }
  }
}

fs.writeFileSync(OUT, JSON.stringify(result, null, 0) + '\n');
console.log(`table arcs: ${tables}`);
console.log(`blocks mapped: ${entries} (skipped ${skipped})`);
console.log(`written: ${OUT}`);
