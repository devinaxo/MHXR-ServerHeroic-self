/*
 * Sync lavoro-traduzione/trad/*.json with what the server actually serves.
 *
 *   node tools-js/sync-trad.cjs <GUI.00.fpk> [--dry]
 *
 * WHY
 * The trad/ dictionaries drifted from the served GUI_msg.arc: dialogue files
 * that are English in the pack have no trad entry at all, and some entries
 * (Monster.json) still hold older, wrong text. Running build-msg-arc.cjs from
 * that stale trad/ would REGRESS the pack.
 *
 * WHAT IT DOES
 * For every GMD inside the pack's GUI_msg.arc, pairs the original Japanese
 * (lavoro-traduzione/msg/<name>_jpn) with the exact string the pack serves now,
 * and writes trad/<name>.json = [{i, jp, en}]. After this, build-msg-arc.cjs
 * --check reproduces the pack with zero differences.
 *
 * The msg/ originals are never modified.
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { Blowfish } = require('egoroof-blowfish');
const { parseFpk } = require('./fpk-fmt.cjs');

const ROOT = path.resolve(__dirname, '..');
const TRAD = path.join(ROOT, 'lavoro-traduzione/trad');
const MSG = path.join(ROOT, 'lavoro-traduzione/msg');
const ARC_KEY = 'kaseoa nkaeka;eawf3';
const DIM_HEADER = 8;
const DIM_VOCE = 80;

const fpkPath = process.argv[2];
const DRY = process.argv.includes('--dry');
if (!fpkPath) {
  console.error('uso: node tools-js/sync-trad.cjs <GUI.00.fpk> [--dry]');
  process.exit(1);
}

function inverti(buf) {
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i + 3 < buf.length; i += 4) {
    out[i] = buf[i + 3]; out[i + 1] = buf[i + 2]; out[i + 2] = buf[i + 1]; out[i + 3] = buf[i];
  }
  const rest = buf.length % 4;
  if (rest > 0) buf.copy(out, buf.length - rest, buf.length - rest);
  return out;
}
const decifra = (buf) => {
  const bf = new Blowfish(ARC_KEY, Blowfish.MODE.ECB, Blowfish.PADDING.NULL);
  const g = inverti(buf);
  let c = Buffer.from(bf.decode(g, Blowfish.TYPE.UINT8_ARRAY));
  if (c.length < g.length) c = Buffer.concat([c, Buffer.alloc(g.length - c.length)]);
  return inverti(c);
};
const nomeBase = (s) => s.replace(/\\/g, '/').split('/').pop();
const stringheGmd = (buf) => {
  const dim = buf.readUInt32LE(0x20);
  const s = buf.subarray(buf.length - dim).toString('utf8').split('\0');
  if (s.at(-1) === '') s.pop();
  return s;
};

const pack = parseFpk(fs.readFileSync(fpkPath));
const msg = pack.entries.find((e) => /GUI_msg\.arc$/.test(e.filePath));
if (!msg) throw new Error('GUI_msg.arc not inside ' + fpkPath);

const corpo = decifra(msg.data.subarray(DIM_HEADER));
const count = msg.data.readUInt16LE(6);
let scritti = 0, nonTrovati = 0, diversi = 0;

for (let i = 0; i < count; i++) {
  const off = i * DIM_VOCE;
  const nome = nomeBase(corpo.subarray(off, off + 64).toString('utf8').replace(/\0.*$/, ''));
  const csize = corpo.readUInt32LE(off + 68);
  const start = corpo.readUInt32LE(off + 76) - DIM_HEADER;
  const gmd = zlib.inflateSync(corpo.subarray(start, start + csize));
  const en = stringheGmd(gmd);

  const srcJp = path.join(MSG, nome);
  if (!fs.existsSync(srcJp)) { nonTrovati++; console.log(`  ?? nessun originale: ${nome}`); continue; }
  const jp = stringheGmd(fs.readFileSync(srcJp));

  const diz = jp.map((j, idx) => ({ i: idx, jp: j, en: en[idx] ?? '' }));
  if (jp.length !== en.length) { diversi++; console.log(`  !! ${nome}: ${jp.length} jp vs ${en.length} en`); }
  const out = path.join(TRAD, nome.replace(/_jpn$/, '.json'));
  if (!DRY) fs.writeFileSync(out, JSON.stringify(diz, null, 1));
  scritti++;
}

console.log(`${DRY ? '[dry] ' : ''}trad riscritti: ${scritti}, senza originale: ${nonTrovati}, conteggi diversi: ${diversi}`);
console.log('ora: node tools-js/build-msg-arc.cjs --check <GUI.00.fpk>  deve dire "diverse: 0"');
