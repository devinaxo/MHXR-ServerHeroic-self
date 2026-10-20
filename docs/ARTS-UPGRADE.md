# Weapon Arts Lv. upgrade (武技強化 / `box/equipment/wskillup`)

How the arts-level upgrade works now, and where the numbers came from. The
route was previously commented out in `src/routes/api/box/box.router.ts`, so the
client's request fell through to the 404 catch-all and the upgrade never
happened.

## The endpoint

The client class is `cAPIBoxEquipmentWSkillup` (see `frida/FuncList.txt`); the
client posts to `box/equipment/wskillup`.

**Request** (`cAPIBoxEquipmentWSkillup::Request::createProperty` in `libMHS.so`):

```json
{ "base_equipment_id": "...", "is_use_reinforcement": 0, "num": 1 }
```

`base_equipment_id` is the equipment instance id (`equipment_id` in the box),
`num` is the number of arts levels to gain.

**Response** (`cAPIBoxEquipmentWSkillup::Response::createProperty`):

```json
{
  "zeny": 93000,
  "base_equipment": { "...": "the updated piece, slv raised" },
  "resource_materials": [ { "mst_material_id": 18321636, "amount": 5 } ]
}
```

`resource_materials` are the materials the client has to **subtract**:
`sServer::setupBoxEquipmentWSkillupResponse` (libMHS.so) walks the array and does
`count -= amount` on the matching workspace entry. So the amounts sent are the
quantities **spent**, not what is left. `zeny` is the player's new balance.

## Where the cost came from

Nothing was invented. Both tables ship in `rsdnt_equip.arc` already in the repo:

| Table | Gives us |
| --- | --- |
| `bugiStrengthenNeedMaterialTable.mMaterialRefDataList` | `mID` -> `mIndex`, where `mID` is the weapon's `mKariwazaID` |
| `bugiStrengthenNeedMaterialTable.mMaterialDataList[mIndex]` | per-composite `mMatrial.mHash[i]` (material) + `mMatrial.mValue[i]` (amount); `mCommonUpNum` |
| `bugiStrengthenNeedZenyTable.mZenyDataList` | flat zeny per weapon rarity (`mRarity -> mZeny`) |
| `weapon_*_series` (`rsdnt_weapon.arc`) | each weapon's `mKariwazaID` |

The extractor is `tools-js/build-arts-costs.cjs`; it writes
`src/json/arts-costs.json` (1,319 kariwaza rows, 4,898 weapons). Regenerate with:

```bash
node tools-js/build-arts-costs.cjs
```

### Worked example

*Zork the Rush Zero I* (ゾークザラッシュ零Ⅰ) - `weapon_acaxe_series`, `mID`
1024651966, rarity 7, `mKariwazaID` 2606267074. The kariwaza hash maps to bugi
material row 1158:

```
5 x Twilight Ritual: Zero [Cold Severity]  (18321636)
20 x Monster Claw                         (1911177763)
20 x Monster Marrow                       (116224693)
7,000 zeny  (bugiStrengthenNeedZenyTable, rarity 7)
```

That is exactly the cost the client displays for the upgrade.

## What is NOT verified

Honest limits:

- **Multi-step scaling.** Every one of the 1,319 bugi rows has the same common
  materials (`[5, 20, 20]`, `mCommonUpNum` 10), so the per-level cost is
  constant. This server charges **one set of materials and one zeny base per
  level gained** (`num` sets for `num` levels). The single-step case is the one
  confirmed against the client display; the multi-step figure is an assumption.
  If a bulk upgrade ever looks over- or under-charged, this is the first
  suspect, and the client's own displayed total is the reference.
- **The zeny base.** `bugiStrengthenNeedZenyTable` is flat per rarity with no
  level term, unlike the per-level formula of `box/equipment/levelup`
  (`docs/UPGRADE-COSTS.md`). Charging it per level is the symmetric choice with
  the materials, but it is not independently confirmed.
- **The arts level cap.** `sPlayer::getBugiLvCap` reads a per-weapon byte from
  the client workspace, not from a table in the repo, so the server does not
  enforce a cap. The client will not send a request past its own cap anyway.
- **`is_use_reinforcement`** uses the same 0/1/2 modes as the levelup route
  (own materials / blend / 共通秘伝書 only); see `docs/UPGRADE-COSTS.md`.

## Log line

```
arti | <player>: <eqp_obj_id> slv0 -> slv1, zenny 7000 (saldo 93000), materiali 3, rinforzi 0 (tipo 0)
```
