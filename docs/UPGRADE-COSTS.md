# Equipment upgrade costs (強化 / reinforcement)

How `box/equipment/levelup` works now, and where the numbers came from.

## The problem

The route used to raise `elv` for free and reply with only:

```json
{ "levelup": { "equipment": { ... } } }
```

Three things were wrong:

1. **No zenny was deducted.** Nothing in the code path touched `box.zeny`.
2. **No materials were consumed.** A comment admitted it:
   `// Not fully implemented due to pricing tables/material ids pending in repo`.
3. **The response was missing the fields the client reads back.**

The third one caused the visible symptom. `999,999,999` is `0x3B9AC9FF`, the
game's standard "value not set" sentinel. When the level-up response omits the
remaining zenny, the client renders the sentinel instead of a balance. A quest
re-reads the real box, which is why the number looked like it healed itself.

## Where the data came from

Nothing was invented. The costs are read out of the game's own master data,
which ships in the resource archives already in the repo:

| Archive | Table | Gives us |
| --- | --- | --- |
| `tools-js/rsdnt_equip.arc` | `bugiStrengthenNeedZenyTable` | zenny base per rarity (`mRarity -> mZeny`) |
| `tools-js/rsdnt_equip.arc` | `strengthenNeedMaterialTable` | material set per `mStrengthenNeedMaterialID` |
| `tools-js/rsdnt_weapon.arc` | `weapon_*_series` | each weapon's `mRarity`, `mStrengthenNeedMaterialID` |
| `tools-js/rsdnt_equip.arc` | `equip_*_series` | same, for armour |

These are Blowfish-wrapped XFS tables, the same format `tools-js/arc-*.cjs`
already handles. The extractor is `tools-js/build-upgrade-costs.cjs`; it writes
`src/json/upgrade-costs.json` (15,541 pieces, 5,608 material sets).

Regenerate with:

```bash
node tools-js/build-upgrade-costs.cjs
```

## The formulas

**Zenny.** The table stores a flat base per rarity: rarity 8 costs 8,000. The
per-level price is

```
floor((base - 10) * fromLevel / 16)
```

and a multi-level upgrade sums that over each level gained.

**Materials.** One set per level gained, from the piece's own row.

### How the zenny formula was pinned down

The client displays the cost before the player confirms, so there is a ground
truth to match. A rarity 8 lance (*Over The Wall Zero III*) at level 30 shows:

| Upgrade | Displayed |
| --- | --- |
| 30 -> 31 | 14,981 |
| 30 -> 32 | 30,461 |
| 30 -> 33 | 46,441 |

Per-level that is 14,981 / 15,480 / 15,980 — differences of 499 and 500, so the
price is very nearly linear in the level. Solving for the coefficient over the
rarity table gives `7990 / 16 = 499.375`, and `7990 = 8 * 1000 - 10`. That
reproduces all three figures exactly:

```
floor(7990 * 30 / 16) = 14981
floor(7990 * 31 / 16) = 15480
floor(7990 * 32 / 16) = 15980
```

### What is NOT verified

Honest limits on that formula:

- It is fitted to **three data points from one weapon at one rarity**. It may
  be right for rarity 8 and slightly off elsewhere.
- The `- 10` is the part with no independent confirmation. `base/16` on its own
  gives 15,000 / 15,500 / 16,000 — too high by 19 / 20 / 20. The `-10` is what
  makes it exact here, but a different constant would also fit three points.

So: if upgrade prices ever look wrong on some other piece, this formula is the
first suspect, and the client's own displayed figure is the reference to check
against. The rarity bases themselves (1,000 per rarity) are straight from the
game table and are not in doubt.

## Worked example

*Over The Wall Zero III* — rarity 8, `mStrengthenNeedMaterialID` 1255:

```
Zenny, 30 -> 31:  floor((8000 - 10) * 30 / 16) = 14981

Materials, per level:
   10 x Frost Glaive Dragon Bone
    8 x Ice Fang Dragon Carapace
   17 x Poison Mystery Dragon Hide
    5 x Landslide Dragon Claw
```

## Guards

Both checks run before anything is deducted, so a refusal leaves the box
untouched and the player keeps the piece:

- insufficient zenny -> `ZENY_NOT_ENOUGH` (80), response carries the real balance
- insufficient materials -> `MATERIALS_NOT_ENOUGH` (81), response carries what
  the player actually has of the missing item
- unknown `mst_equipment_id` -> refused rather than upgraded free, since there
  is no way to price it

## Log lines

```
potenziamento | <player>: <eqp_obj_id> lv30 -> lv31, zenny 14981 (saldo 985019), materiali 4
```

## Notes for the client side

The response must carry all three of these, or the client shows 999,999,999:

```json
{
  "levelup":    { "equipment": { ... } },
  "zeny":       985019,
  "materials":  [ { "mst_material_id": ..., "amount": ... } ]
}
```

Field names are suffix-merged in the client's string table, which is why
`levelup`, `zeny`, `materials` and `equipment` do not appear as standalone
strings in `libMHS.so` — they are tails of longer strings like
`box/equipment/levelup` and `resource_materials`. Confirmed by disassembling
`sServer::setupBoxEquipmentLevelupResponse`, which reads a zenny field into the
player workspace and then loops over a material array calling
`updateBoxMaterialData`.

The client also sends a third field the server ignores: `is_use_reinforcement`
(`sPlayerWorkspace::getRequestBoxEquipmentLevelupUseMaterialType`). It selects
which material set to spend. Currently all sets are treated the same way.