/*
 * Builds src/json/arts-costs.json from the game's own master data
 * (rsdnt_equip.arc / rsdnt_weapon.arc), extracted with tools-js/xfs-parse.cjs.
 *
 * The weapon "Arts Lv." (武技Lv, the equipment's `slv`) is raised with
 * `box/equipment/wskillup` (client cAPIBoxEquipmentWSkillup). Its cost lives in
 * two tables in rsdnt_equip.arc, keyed by the weapon's `mKariwazaID`:
 *
 *   bugiStrengthenNeedMaterialTable
 *        mMaterialRefDataList: { mID -> mIndex }
 *            mID is the kariwaza hash (= the weapon series' mKariwazaID)
 *            mIndex points into mMaterialDataList
 *        mMaterialDataList[mIndex]:
 *            mMatrial.mHash[i] / mMatrial.mValue[i] -> the i-th material + amount
 *            mCommonUpNum -> number of arts levels covered by one composite
 *   bugiStrengthenNeedZenyTable
 *        mZenyDataList: { mRarity, mZeny } -> flat zeny base per weapon rarity
 *
 * NOTE: in the shipped data every bugi row is identical in the *common*
 * materials (20 Monster Claw + 20 Monster Marrow) and differs only in the
 * weapon-specific 逢魔祀典 (Twilight Ritual) scroll; mCommonUpNum is 10 for all
 * rows. The per-level scaling of the arts upgrade is NOT independently verified
 * (see docs/ARTS-UPGRADE.md) -- only the single-step cost is confirmed against
 * the client display.
 *
 * Run: node tools-js/build-arts-costs.cjs
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'tools-js');
const OUT = path.join(ROOT, 'src/json/arts-costs.json');

const ARCS = {
  equip: path.join(SRC, 'rsdnt_equip.arc'),
  weapon: path.join(SRC, 'rsdnt_weapon.arc'),
};

const MATERIAL_TABLE = 'bugiStrengthenNeedMaterialTable';
const ZENY_TABLE = 'bugiStrengthenNeedZenyTable';

function main() {
  const { parseXfs } = require('./xfs-parse.cjs');
  const { Blowfish } = require('egoroof-blowfish');
  const zlib = require('node:zlib');
  const KEY = 'kaseoa nkaeka;eawf3';

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

  function readTable(archivePath, wanted) {
    const raw = fs.readFileSync(archivePath);
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
    throw new Error(`${wanted} not found in ${path.basename(archivePath)}`);
  }

  // --- Zeny: flat base per weapon rarity --------------------------------
  const zenyByRarity = {};
  for (const row of readTable(ARCS.equip, ZENY_TABLE).root.mZenyDataList.mpArray) {
    zenyByRarity[row.mRarity] = row.mZeny;
  }

  // --- Arts material sets, keyed by kariwaza hash -----------------------
  const materialTable = readTable(ARCS.equip, MATERIAL_TABLE).root;
  const materialData = materialTable.mMaterialDataList.mpArray;
  const materialRefs = materialTable.mMaterialRefDataList.mpArray;

  const byKariwaza = {};
  for (const ref of materialRefs) {
    const row = materialData[ref.mIndex];
    if (!row) continue;
    const hashes = row['mMatrial.mHash'] ?? [];
    const values = row['mMatrial.mValue'] ?? [];
    const materials = [];
    for (let i = 0; i < hashes.length; i++) {
      const id = Number(hashes[i] ?? 0);
      if (id) materials.push({ mst_material_id: id, amount: Number(values[i] ?? 0) });
    }
    byKariwaza[String(ref.mID)] = { materials, commonUpNum: Number(row.mCommonUpNum ?? 0) };
  }

  // --- Weapon master id -> its kariwaza hash ----------------------------
  const weaponSeries = [
    'weapon_lance_series',
    'weapon_sword_series',
    'weapon_hammer_series',
    'weapon_hbowgun_series',
    'weapon_lbowgun_series',
    'weapon_gunlance_series',
    'weapon_wsword_series',
    'weapon_stick_series',
    'weapon_chaxe_series',
    'weapon_acaxe_series',
    'weapon_pipe_series',
    'weapon_bow_series',
    'weapon_axe_series',
    'weapon_lsword_series',
    'weapon_lsword2_series',
  ];
  const kariwazaByEquipment = {};
  for (const table of weaponSeries) {
    for (const row of readTable(ARCS.weapon, table).root.mDataList.mpArray) {
      if (!row.mKariwazaID) continue;
      if (!byKariwaza[String(row.mKariwazaID)]) continue;
      kariwazaByEquipment[row.mID] = row.mKariwazaID;
    }
  }

  const out = {
    _comment:
      'Generated by tools-js/build-arts-costs.cjs from the game master data ' +
      '(rsdnt_equip.arc, rsdnt_weapon.arc). Do not edit by hand.',
    _source: {
      materials: MATERIAL_TABLE,
      zeny: ZENY_TABLE,
      weaponSeries,
    },
    zenyByRarity,
    byKariwaza,
    kariwazaByEquipment,
  };

  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(
    `wrote ${OUT}: ${Object.keys(byKariwaza).length} kariwaza rows, ` +
      `${Object.keys(kariwazaByEquipment).length} weapons, ` +
      `${Object.keys(zenyByRarity).length} rarity rows`,
  );
}

main();
