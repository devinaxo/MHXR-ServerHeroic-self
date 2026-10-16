/*
 * Builds src/json/upgrade-costs.json from the game's own master data
 * (rsdnt_equip.arc / rsdnt_weapon.arc), extracted with tools-js/xfs-parse.cjs.
 *
 * Sources, and what each one gives us:
 *   bugiStrengthenNeedZenyTable     -> zenyBase per rarity (mRarity -> mZeny)
 *   strengthenNeedMaterialTable     -> mStrengthenNeedMaterialID -> 4 materials
 *   weapon_lance_series / equip_*_series -> per-item mRarity + mStrengthenNeedMaterialID
 *
 * Run: node tools-js/build-upgrade-costs.cjs
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'tools-js');
const OUT = path.join(ROOT, 'src/json/upgrade-costs.json');

/** Entries we need out of the (Blowfish-wrapped) master-data archives. */
const ARCS = {
  equip: path.join(SRC, 'rsdnt_equip.arc'),
  weapon: path.join(SRC, 'rsdnt_weapon.arc'),
};

const ZENY_TABLE = 'bugiStrengthenNeedZenyTable';
const MATERIAL_TABLE = 'strengthenNeedMaterialTable';

function main() {
  // Imported lazily so this script fails loudly if the parser deps move.
  const { parseXfs } = require('./xfs-parse.cjs');
  const { Blowfish } = require('egoroof-blowfish');
  const zlib = require('node:zlib');
  const KEY = 'kaseoa nkaeka;eawf3';

  // The archives store each entry's payload Blowfish-encrypted, 4 bytes at a
  // time reversed; see tools-js/arc-extract.cjs for the same transform.
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

  /** Reads one named XFS table out of an archive. */
  function readTable(archivePath, wanted) {
    const raw = fs.readFileSync(archivePath);
    const body = decode(raw.subarray(8));
    const count = raw.readUInt16LE(6);
    for (let i = 0; i < count; i++) {
      const entry = i * 80;
      // Names are stored with single backslashes: tuning\xml\equip\foo.
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

  // zeny: rarity -> flat per-level base. The game stores exactly 10,000 x rarity.
  const zenyRows = readTable(ARCS.equip, ZENY_TABLE).root.mZenyDataList.mpArray;
  const zenyByRarity = {};
  for (const row of zenyRows) zenyByRarity[row.mRarity] = row.mZeny;

  // Materials are PER LEVEL. The piece's mStrengthenNeedMaterialID is a row of
  // mTableRefList, and that row's mTableIdx[level] picks the mMaterialSet row
  // used for the step level -> level+1. The old code used
  // mMaterialSet[mStrengthenNeedMaterialID] as one fixed set, which is why the
  // server asked for different materials than the client past ~level 29 and
  // refused real upgrades with error 81 (MATERIALS_NOT_ENOUGH).
  const materialTable = readTable(ARCS.equip, MATERIAL_TABLE).root;
  const materialSets = materialTable.mMaterialSet.mpArray;
  const tableRefs = materialTable.mTableRefList.mpArray;

  // set index -> its (up to four) { item, num } pairs; only non-empty ones.
  const materialSetsById = {};
  materialSets.forEach((set, id) => {
    const list = [];
    for (let slot = 0; slot < 4; slot++) {
      const item = set[`mMaterialData[${slot}].mItemID`];
      const num = set[`mMaterialData[${slot}].mNum`];
      if (item) list.push({ mst_material_id: item, amount: num });
    }
    if (list.length) materialSetsById[id] = list;
  });

  // mTableID -> the per-level set-index array (trailing -1 padding trimmed).
  const strengthRef = {};
  tableRefs.forEach((r) => {
    const idx = (r.mTableIdx || []).slice();
    while (idx.length && idx[idx.length - 1] === -1) idx.pop();
    strengthRef[r.mTableID] = idx;
  });

  // Every weapon and armour piece, keyed by its master id.
  const equipment = {};
  const series = [
    [ARCS.weapon, 'weapon_lance_series'],
    [ARCS.weapon, 'weapon_sword_series'],
    [ARCS.weapon, 'weapon_hammer_series'],
    [ARCS.weapon, 'weapon_hbowgun_series'],
    [ARCS.weapon, 'weapon_lbowgun_series'],
    [ARCS.weapon, 'weapon_gunlance_series'],
    [ARCS.weapon, 'weapon_wsword_series'],
    [ARCS.weapon, 'weapon_stick_series'],
    [ARCS.weapon, 'weapon_chaxe_series'],
    [ARCS.weapon, 'weapon_acaxe_series'],
    [ARCS.weapon, 'weapon_pipe_series'],
    [ARCS.weapon, 'weapon_bow_series'],
    [ARCS.weapon, 'weapon_axe_series'],
    [ARCS.weapon, 'weapon_lsword_series'],
    [ARCS.weapon, 'weapon_lsword2_series'],
    [ARCS.equip, 'equip_arm_series'],
    [ARCS.equip, 'equip_body_series'],
    [ARCS.equip, 'equip_head_series'],
    [ARCS.equip, 'equip_leg_series'],
    [ARCS.equip, 'equip_waist_series'],
  ];
  for (const [archive, table] of series) {
    const rows = readTable(archive, table).root.mDataList.mpArray;
    for (const row of rows) {
      if (!row.mRarity) continue;
      equipment[row.mID] = {
        name: row.mName,
        rarity: row.mRarity,
        levelMax: row.mEquipLevelMax,
        strengthenNeedMaterialId: row.mStrengthenNeedMaterialID,
      };
    }
  }

  const out = {
    _comment:
      'Generated by tools-js/build-upgrade-costs.cjs from the game master data ' +
      '(rsdnt_equip.arc, rsdnt_weapon.arc). Do not edit by hand.',
    // Per-level zeny is floor((zenyBase[rarity] - 10) * fromLevel / 16).
    // Verified against the client's own displayed cost for a rarity 8 lance:
    // 14,981 / 30,461 / 46,441 zenny for level 30 -> 31 / 32 / 33.
    // See docs/UPGRADE-COSTS.md for how this was derived and what is still unverified.
    _formula: 'floor((zenyBase[rarity] - 10) * fromLevel / 16)',
    // Materials per level: strengthRef[strengthenNeedMaterialId][level] is a
    // materialSets key; -1 means "no step from that level" (already max).
    zenyByRarity,
    materialSets: materialSetsById,
    strengthRef,
    equipment,
  };

  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(
    `wrote ${OUT}: ${Object.keys(equipment).length} pieces, ` +
      `${Object.keys(materialSetsById).length} material sets, ` +
      `${Object.keys(strengthRef).length} strengthen rows, ` +
      `${Object.keys(zenyByRarity).length} rarity rows`,
  );
}

main();
