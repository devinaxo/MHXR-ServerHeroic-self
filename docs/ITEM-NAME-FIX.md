# Item / material names - monster-name fix (2026-10-13, RES_VER 357)

## Problem

Monster part names (including the quest-reward **"Proof"** items) used a
**literal translation of the monster's Japanese epithet** instead of the
official English monster name. Examples:

| JP | old (literal epithet) | new (official) |
|---|---|---|
| 彩鳥の部位証Ⅰ | Rainbow Bird Proof I | **Qurupeco Proof I** |
| 毒狗竜の皮 | Poison Dog Wyvern Hide | **Great Wroggi Hide** |
| 青熊獣の甲殻 | Blue Bear Beast Carapace | **Arzuros Carapace** |
| 狗竜の鱗 | Dog Wyvern Scale | **Great Jaggi Scale** |
| 鋼龍の鱗 | Uragaan Scale *(mismapped)* | **Kushala Daora Scale** |
| 水竜の鱗 | Lagiacrus Scale *(mismapped)* | **Plesioth Scale** |

Monsters whose names were already correct (Rathalos, Rathian, Diablos,
Zinogre, Tigrex, Nargacuga, …) were left untouched - e.g. `Rathian Proof I`
stayed `Rathian Proof I`, confirming the intended format
**`<OfficialName> <Part>`**.

## Where the text lives

The names are **client master data**:

```
resident.00.fpk  ->  /arc_cmn/resident/rsdnt_property.arc
                 ->  tuning/xml/item/item_material   (XFS, field mItemName)
```

Verified: across every `rsdnt_*` arc, this string set appears **only** in
`item_material` (not in `item_collection`, equipment, etc.).

## Fix

Authority for the official names is
`lavoro-traduzione/quest/mostri.json :: confermati` (168 JP→EN monster names,
cross-checked against monsterhunterwiki.org).

For each item row in `src/json/materiali.json` (which carries the source
`nome` JP and the current `en`), the JP key is matched as a prefix of `nome`,
the literal-epithet substring is removed from `en`, and the official name is
substituted in place. Qualifier prefixes (`Vicious`/`Steel`/`Blast`/`Twin`/
`Reinforced`) and part suffixes (`Hide`/`Scale`/`Proof I`/`True Core`/…), as
well as the `α/β/γ` markers, are preserved.

- **2,400** item names changed (of 4,878); 422 were already correct; 2,056 are
  non-monster items (ores, plants, coins, …).
- **0 collisions**: no old string is also a correct name of a different item.

## Files changed

- **client**: `resident.00.fpk` → `rsdnt_property.arc` → `item_material`
  (`mItemName`, 2,400 substitutions).
- **server JSON**: `src/json/materiali.json` (`en` field, 2,400 rows).
- **dictionary**: `tools-js/dizionario-materiali.json` (2,400 values).
- `tools-js/aggiornamenti-risorse.txt` - `357 cmn/resident.00.fpk`.
- `src/constants/protocol.ts` - `RES_VER` 356 → **357**.

## Pipeline

```bash
PACK=src/public/res/download/android/v0282/stdDL/cmn/resident.00.fpk
# 1. pull the property arc from the LIVE pack (it already holds the English
#    names to replace) and apply the {old_en: new_en} dictionary
node tools-js/fpk-pull.cjs fpk-pull "$PACK" build/prop.arc rsdnt_property.arc
node tools-js/traduci-rsdnt-arc.cjs build/prop.arc build/item-name-fix.json build/prop_en.arc
# 2. put it back
node tools-js/fpk-replace.cjs "$PACK" build/res.new.fpk rsdnt_property.arc build/prop_en.arc
cp build/res.new.fpk "$PACK"
# 3. regenerate manifests, publish, bump RES_VER, verify
find src/public/res/download/android -name download.list -delete
sg docker -c 'docker compose -f docker-compose.prod.yml up -d --build server'
sh tools-js/pubblica-risorse.sh 357
node tools-js/verify-bump.cjs http://127.0.0.1:8081 356 357   # PASS
```

`traduci-rsdnt-arc.cjs`: 2,400/2,400 keys used, 46/46 tables re-read clean.
(`build/item-name-fix.json` above was a session-local `{old_en: new_en}` map and
was not committed; the resulting names are in the published pack.)
`fpk-replace.cjs`: 17/17 entries byte-identical, replaced entry matches.
`verify-bump`: `d0356_0357` → resident.00.fpk `crcjam 7bef25a7`,
4,181,304 bytes, **PASS**.

## Backup / rollback

- Pre-change pack was backed up locally during the operation (not shipped).
- Auto-snapshot of the published bytes: `backups/res-0357/cmn/resident.00.fpk`.
- To roll back: restore the pre-change pack, delete `download.list`, rebuild,
  and publish a **higher** version (the client only moves forward).

## Notes / follow-ups

- A few compounds are logically correct but read oddly, e.g. the Steel-Uragaan
  variant gives `Steel Steel Uragaan Scale` (elemental prefix + "Steel
  Uragaan"). That mirrors the pre-existing structure; left as-is unless asked.
- Two `confermati` entries also corrected genuine mismaps in the old English
  (`鋼龍`→Kushala Daora, `水竜`→Plesioth, `翠水竜`→Green Plesioth,
  `鞠水竜`→Whitewater Plesioth).
- Same names may still be baked into textures elsewhere; this pass fixes the
  text table the client renders for the material/proof lists.
