/*
 * Builds the otomo (Palico) master tables out of the game's own data:
 *
 *   src/json/otomo-grow.json    mst_otomo_id -> { maxLevel, expByLevel[] }
 *   src/json/otomo-skills.json  the subskill pool (OtomoSkillSub)
 *
 * Sources (rsdnt_otomo.arc, extracted with tools-js/xfs-parse.cjs):
 *   tuning\xml\otomo\OtomoParam     mMaxLevel per otomo
 *   tuning\xml\otomo\OtomoGrow      per otomo + level: cumulative mExp
 *   tuning\xml\otomo\OtomoSkillSub  mSkillId + mSkillName for every subskill
 *
 * mOtomoCharId in the master IS the mst_otomo_id the box uses, so the tables are
 * keyed by it directly. The client derives level + stats from `exp` alone
 * (sOtomo::getLevelFromExp), so expByLevel is all the server needs.
 *
 * Run: node tools-js/build-otomo-tables.cjs
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ARC = path.join(__dirname, 'rsdnt_otomo.arc');
const OUT_GROW = path.join(ROOT, 'src/json/otomo-grow.json');
const OUT_SKILLS = path.join(ROOT, 'src/json/otomo-skills.json');

const PARAM_TABLE = 'OtomoParam';
const GROW_TABLE = 'OtomoGrow';
const SKILL_TABLE = 'OtomoSkillSub';

function main() {
  const { parseXfs } = require('./xfs-parse.cjs');
  const { Blowfish } = require('egoroof-blowfish');
  const zlib = require('node:zlib');
  const KEY = 'kaseoa nkaeka;eawf3';

  // Same Blowfish + 4-byte reversal the other extractors use.
  const unscramble = (buf) => {
    const out = Buffer.alloc(buf.length);
    for (let i = 0; i + 3 < buf.length; i += 4) {
      out[i] = buf[i + 3];
      out[i + 1] = buf[i + 2];
      out[i + 2] = buf[i + 1];
      out[i + 3] = buf[i];
    }
    const rest = buf.length % 4;
    if (rest > 0) buf.copy(out, buf.length - rest, buf.length - rest);
    return out;
  };

  const decode = (buf) => {
    const bf = new Blowfish(KEY, Blowfish.MODE.ECB, Blowfish.PADDING.NULL);
    const scrambled = unscramble(buf);
    let plain = Buffer.from(bf.decode(scrambled, Blowfish.TYPE.UINT8_ARRAY));
    if (plain.length < scrambled.length) {
      plain = Buffer.concat([plain, Buffer.alloc(scrambled.length - plain.length)]);
    }
    return unscramble(plain);
  };

  function readTable(wanted) {
    const raw = fs.readFileSync(ARC);
    const body = decode(raw.subarray(8));
    const count = raw.readUInt16LE(6);
    for (let i = 0; i < count; i++) {
      const entry = i * 80;
      const name = body
        .subarray(entry, entry + 64)
        .toString('utf8')
        .replace(/\0.*$/, '')
        .split('\\')
        .pop();
      if (name !== wanted) continue;
      const size = body.readUInt32LE(entry + 68);
      const start = body.readUInt32LE(entry + 76) - 8;
      return parseXfs(zlib.inflateSync(body.subarray(start, start + size)));
    }
    throw new Error(`${wanted} not found in ${path.basename(ARC)}`);
  }

  // --- levels + cumulative exp per otomo -------------------------------------
  const params = readTable(PARAM_TABLE).root.mDataList.mpArray;
  const maxLevelById = {};
  for (const p of params) maxLevelById[p.mOtomoCharId] = p.mMaxLevel;

  const growRows = readTable(GROW_TABLE).root.mDataList.mpArray;
  const perOtomo = {};
  for (const row of growRows) {
    (perOtomo[row.mOtomoCharId] ??= []).push({ level: row.mLevel, exp: row.mExp });
  }

  const byOtomo = {};
  for (const [id, rows] of Object.entries(perOtomo)) {
    rows.sort((a, b) => a.level - b.level);
    // Index i === level i+1; index 0 (level 1) must be 0.
    const expByLevel = rows.map((r) => r.exp);
    byOtomo[id] = {
      maxLevel: maxLevelById[id] ?? rows.length,
      expByLevel,
    };
  }

  // --- subskill pool ----------------------------------------------------------
  const subRows = readTable(SKILL_TABLE).root.mDataList.mpArray;
  const skills = subRows.map((s) => ({ id: s.mSkillId, name: s.mSkillName }));

  fs.writeFileSync(
    OUT_GROW,
    JSON.stringify(
      {
        _comment:
          'Generated from rsdnt_otomo.arc (OtomoParam + OtomoGrow). Per mst_otomo_id: maxLevel and the CUMULATIVE exp to reach each level (index 0 = level 1). The client derives level and stats from exp with the same table.',
        byOtomo,
      },
      null,
      1,
    ) + '\n',
  );
  fs.writeFileSync(
    OUT_SKILLS,
    JSON.stringify(
      {
        _comment:
          'Generated from rsdnt_otomo.arc :: OtomoSkillSub. Every otomo subskill (mSkillId is the hash stored in box.otomos[].subskill). Entry 0 is the "No Skill" placeholder.',
        skills,
      },
      null,
      1,
    ) + '\n',
  );

  console.log(`otomo-grow.json: ${Object.keys(byOtomo).length} otomos`);
  console.log(`otomo-skills.json: ${skills.length} subskills`);
}

main();
