# Equipment evolution (進化)

How `box/equipment/evolve` works, now that it is implemented.

## What evolution is

A weapon or armour piece at its maximum level can be turned into the next piece
in its series: Zork the Rush Zero I becomes Zork the Rush Zero II (and II
becomes III), with a different master id and therefore new stats. The piece
keeps its instance id; the master id, level and Arts level change.

## The route

```
POST box/equipment/evolve
```

Request, from `cAPIBoxEquipmentEvolve::Request::createProperty` in
`libMHS.so`:

```json
{
  "session_id": "...",
  "base_equipment_id": "Q1024651966",
  "evolved_mst_equipment_id": 1242939944,
  "resource_equipment_ids": []
}
```

Response, from `cAPIBoxEquipmentEvolve::Response::createProperty`:

```json
{
  "zeny": 985019,
  "base_equipment": { ... },
  "resource_equipments": [ ... ],
  "resource_materials": [ { "mst_material_id": ..., "amount": ... } ]
}
```

- `base_equipment` is the same instance with `mst_equipment_id`, `elv` and `slv`
  updated. The client replaces the piece in its box with this object.
- `resource_equipments` are the equipment instances that were sacrificed; the
  client removes each one from its box.
- `resource_materials` are the materials the client must update, with
  **absolute** amounts (same convention as the level-up route).

## Where the costs come from

Nothing is invented. `tools-js/build-evolve-costs.cjs` reads
`rsdnt_equip.arc :: tuning/xml/equip/evolve_equip` and writes
`src/json/evolve-costs.json` (6,662 evolutions). Each row gives:

| Field | Meaning |
| --- | --- |
| `mEvolvePrepareHash` | piece that evolves (`mst_equipment_id`) |
| `mEvolveAfterHash` | piece it becomes |
| `mNeedZeny` | zenny cost (100 to 4,000,000) |
| `mEvolveAfterLevel` | level the result starts at |
| `mNeedItemHashList` | up to 4 requirements |
| `mNeedItemValueList` | item count, or minimum plus value for equipment |

A requirement whose hash is an equipment id in `upgrade-costs.json` is an
**equipment** requirement: one copy of that master id with at least that plus
value. Everything else is a **material** requirement with that count. The
client sends the selected equipment instances in `resource_equipment_ids` and
does not send materials at all.

Example, Zork the Rush Zero I -> II:

```
zenny 2,000,000
25 x 菊月討伐の錬成薬
25 x 菊月討伐の増成薬
 5 x 菊月討伐の昇華薬
```

Regenerate the JSON with:

```bash
node tools-js/build-evolve-costs.cjs
```

## Rules the server enforces

- the piece must be at its `levelMax` from `upgrade-costs.json`
- the target (`evolved_mst_equipment_id`, when sent) must match the table
- enough zenny (`ZENY_NOT_ENOUGH`, 80)
- enough of every material (`MATERIALS_NOT_ENOUGH`, 81)
- every selected `resource_equipment_ids` entry must exist, must not be the
  base piece, must match one equipment requirement and must have at least the
  required plus value (`EQUIP_UPGRADE_FAILED`, 79)
- no extra selected equipment is accepted

On success the result gets `slv = 1`: the game resets the Arts level on
evolution (`武技Lv.が初期化されます`). The base plus value (`potential`) is kept.

## Log line

```
evoluzione | <player>: <eqp_obj_id> 1024651966 -> 1242939944 (lv 80), zeny 2000000 (saldo ...), materiali 3, equipaggiamenti 0
```

## Known limit

949 of the 7,611 `evolve_equip` rows name a prepare or result piece that is not
in the player equipment table (otomo gear and similar). They are skipped by the
generator. A player piece is never affected by that skip.
