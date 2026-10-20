# Plus value (プラス値) on equipment

The equipment `potential` field is its **plus value**. It raises the weapon's
damage multiplier (the game caps the effect at 20 or 25 depending on the piece)
and is capped per rarity.

The server stores `potential`; the client shows the value and computes the damage
multiplier. The two upgrade endpoints had no implementation at all, so the plus
value could never move.

## Client protocol

Read out of `libMHS.so`:

| Endpoint | Request | Response |
| --- | --- | --- |
| `POST /api/box/equipment/potentialupmaterial` | `{ session_id, base_equipment_id, resource_materials: [{ mst_material_id, amount }] }` | `{ zeny, base_equipment, resource_materials }` |
| `POST /api/box/equipment/potentialup` | `{ session_id, base_equipment_id, resource_equipment_ids: [instance id] }` | `{ zeny, base_equipment, resource_equipments }` |
| `POST /api/box/equipment/potentialup/auto/set` | `{ eqp_obj_infos }` | `{ set_equipments }` (auto-set is not implemented, answers `[]`) |

## The numbers

All from the game's own table, `rsdnt_equip.arc :: tuning/xml/equip/potentialValue`,
generated into `src/json/potential-values.json` by
`tools-js/costruisci-potential-values.cjs`:

- `maxPlus` per rarity: 1 -> 5, 2 -> 10, 3 -> 15, 4 -> 20, 5..10 -> 25.
- `upValue` = `[5, 1]`: one fodder equipment adds 5, one plus-up material adds 1.
  This is `sPlayer::getEquipPotentialValue(rarity, count, kind)`, which returns
  `mUpValueList[kind] * count`.
- `prezzoBase` per rarity (2000..11000), the zeny charged per fodder equipment.

The only materials the client lets you feed come from
`rsdnt_property.arc :: tuning/xml/item/item_plusup_material` (717 ids, rarity
5/6/7, 50 zeny each). They are not ordinary monster materials: a request naming
any other id is refused, so a client cannot smuggle an arbitrary id into the box.

## Model in use, and what is not certain

`potentialupMaterial`: each unit adds 1 and costs 50 zeny, capped at `maxPlus`.
`potentialup`: each fodder adds 5 and costs `prezzoBase` zeny, capped at
`maxPlus`; the fodder is removed from the box.

What is **not** verified against retail:

- Whether a fodder equipment should also transfer its own plus value instead of a
  flat 5. The repo's implementation uses the flat `upValue[0]` from the table.
- The exact zeny for the equipment path (`prezzoBase` per fodder is a choice).
- `potentialup/auto/set` does not choose a set; the player picks by hand.

The per-rarity cap and the per-unit values are the game's; the rest is a
documented approximation that can be tuned after in-game testing.

## Files

| File | Role |
| --- | --- |
| `tools-js/costruisci-potential-values.cjs` | builds `src/json/potential-values.json` from the game master data |
| `src/json/potential-values.json` | caps, per-unit values, plus-up material table |
| `src/routes/api/box/box.controller.ts` | `potentialup`, `potentialupMaterial`, `potentialupAutoSet` |
| `src/routes/api/box/box.schema.ts`, `box.router.ts` | request schemas and routes |
