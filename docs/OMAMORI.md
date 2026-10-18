# Charms / talismans (お守り, `omamori`) - names, unlock, drops

## What a charm is

Talismans are **charms** (`お守り`, client ids `OD_OMA…`). They are client master
data in `rsdnt_equip.arc`:

| Table | What it holds |
|---|---|
| `tuning/xml/equip/omamori/omamori_series` | 2,465 charms: `mOmamoriName`, stats, `mEquipSkillID[]`, `mReleaseID`, `mTriggerID`, time limits |
| `tuning/xml/equip/omamori/omamori_release` | 415 release rows: `mNeedZenny`, `mNeedKaridama`, `mNeedSozaiList`, probability |
| `tuning/xml/equip/omamori/omamori_trigger` | 5 usage conditions (`HR10以下`, `片手、火属性のみ`, …) |
| `tuning/xml/define/omamori_define` | `mNo` → `Hash` (= the equipment `mst_equipment_id`) |

A charm carries a **技玉 (Skill Orb)** plus a skill that are **invalid until the
charm is unlocked** (`MenuCmn`: *"the charm has not been unlocked, or its
expiration has passed, so the Skill Orb and skill are invalid"* - the client
shows `スキルなし` / "No Skill"). Skill Orbs are what power **Martial Arts (武技)**.

## Translation (RES_VER 363)

All 2,465 `mOmamoriName` strings + the 5 `omamori_trigger` conditions were
translated (`crcjam a22fda10`). The names are `{theme}の{X}{宝石|貴石}【variant】`;
e.g. `卯月暴征の火宝石【壱】` → `Uzuki Conquest Fire Jewel [I]`,
`禁断大剣の宝紋Ⅰ` → `Forbidden Great Sword Crest I`. Single line, ≤46 cells.
Generator: `lavoro-traduzione/skill/oma_tr.py`; applied with the table-restricted
`traduci-rsdnt-arc.cjs` (`ONLY=omamori_series,omamori_trigger`).

## Unlocking (server: `box/equipment/awake`)

The client helper is `sPlayer::cAwakeOmamoriAPI` (menu `uMenuEquipOmamoriAwake`).
It posts to **`box/equipment/awake`** (`cAPIBoxEquipmentAwake`):

- request: `{ base_equipment_id, resource_equipment_ids, use_karidama }`
- response: `{ base_equipment, payments, resource_equipments, resource_materials }`

The handler (`src/routes/api/box/box.controller.ts :: awake`) looks the charm up
by `mst_equipment_id` in `src/json/omamori.json` (built from the tables above),
charges the `omamori_release` cost (Hunter Coins **or** the materials, plus
zenny) and marks it unlocked.

**Two deliberate departures from the original mobile-game design:**

1. **Always succeeds** - the success roll (`mProbabilityBase`/`mProbabilityAdd`)
   is ignored.
2. **Permanent - the expiry timer is dropped.** The client decides "enabled" in
   `nPlayerWorkspace::cItemOmamori::isEnableEffect` (decoded from
   `libMHS.so`): it needs `is_awake=1` and, for `mLimitType` 1..5,
   `start_remain ≤ now ≤ end_remain`; 2/3 also need the awake-remain time > now,
   4/5 a non-zero awake count. The handler writes `start_remain=0`,
   `end_remain`/`endAwakeRemain` = 2100-01-01 and `endAwakeCount=9999`, so it
   never runs out. (`mLimitType` itself lives in the client table and is left
   untouched.)

## Enabling the charm in a quest (`enable_talisman`)

Unlocking is not enough: each **quest-start** response carries
`instance_data.enable_talisman` (and `enable_talisman_partner`), and the client
only applies the equipped charm's skill and **skill orbs** when it is 1. Every
quest controller used to hardcode both to `0`, so a released charm showed its
orbs in the menus but was ignored on the hunt - a weapon art needing 6 fire orbs
stayed locked even with 4 from armour + 12 from the charm, while 6 from armour
alone worked.

`src/services/talismanService.ts` computes the flag (`talismanAbilitato`): 1 when
the selected equip set's talisman is a released (`is_awake=1`) charm, and - as a
fallback, because the client can equip a released charm locally before the
equip-set save round-trips - 1 when the player owns any released charm. The
client still applies only the charm it actually has equipped, so the fallback
cannot over-grant. All quest starts (eternal, island, event ×3, forest ×2,
training) now use it.

## Getting more (quest drops)

Charms are ordinary **equipment rewards**: the quest reward builder already
grants the `equipaggiamento` family, and the 35 charm reward ids are in the
reward catalogue (`catalogo-ricompense.json`). They drop from the **禁断の狩場
("Forbidden Hunting Grounds")** assault-event quests. Example: quest
`815590741` (`禁断の狩場 モルドムント`, assault node `833445410`, live) lists
`OD_OMA1823` (id `598871253`, weight 1 of 14) → **~26%** to get it in one clear
(1 pick per slot, 4 slots).

So no reward wiring was needed - they already drop; they are simply rare.
