# Material obtainability (why some items could not be obtained)

A short reference for the bug that left 1,524 event quests without rewards, and
for how the Trading Post now guarantees access to upgrade materials.

## The symptom

Items that only came from certain event quests could not be obtained at all:

- the "Moon Subjugation" reagents/elixirs (e.g. *Dream-Seeing Moon Subjugation
  Test Reagent*, *Chrysanthemum Moon Subjugation Refining/Augmenting Elixir*);
- every `* Flower Ore` (Flame / Aqua / Earth / Thunder / Frost);
- and, more importantly, ~414 of the 802 materials consumed by weapon and armour
  upgrades.

They were not missing from the data. They were lost **on the way into MongoDB**.

## The cause

The XFS converter wraps some arrays in `{ "array": { "mpArray": [...] } }` (or
`{ "classref_": { "mpArray": [...] } }`). `src/model/questSheet.ts` declares
`mRewardItemList` and `mBossList` as plain arrays. When Mongoose is handed the
wrapped object it casts it to a one-element array whose element has no fields -
stored as `[null]`.

- The **normal / ticket / eternal / score** files were pre-flattened
  (`*.extended.complete.json`), so their rewards survived.
- The **event** file (`*.extended.blank.json`) was inserted raw, so all 1,524
  event quests ended up with `mRewardItemList: [null]`.
- `mBossList` had the exact same problem and was later repaired with
  `tools-js/restore-bosses.cjs`; there was **no** equivalent script for rewards.

Numbers, before the fix (of 4,878 materials in `src/json/materiali.json`):

| | obtainable | unobtainable |
| --- | --- | --- |
| before | 1,341 | 3,537 |
| after restoring event rewards | 2,360 | 2,518 |

## The fix

Two independent things:

1. **Stop losing them on seed.** `src/services/seedService.ts` now runs each
   quest through `normalizzaQuest()`, which unwraps `mRewardItemList` and
   `mBossList` before `insertMany`. A database created from scratch is correct.

2. **Repair the existing database.** `tools-js/restore-rewards.cjs` re-reads the
   event quest sheets and rewrites `mRewardItemList` only where the stored list
   has no real `mItemHash`. It is idempotent.

   ```bash
   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/restore-rewards.cjs --dry
   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/restore-rewards.cjs
   ```

## The Trading Post fallback

`src/routes/api/shop/shop.controller.ts` still samples the catalogue to keep the
response small, but now always adds, per shelf:

- every material referenced by a reinforcement set in
  `src/json/upgrade-costs.json` (so an upgrade can never be blocked), and
- the event materials (`Subjugation` reagents, `Flower Ore`) so they stay
  buyable even when the event is not running.

All ids still come from `materiali.json`; nothing is invented. The added rows are
priced by rarity like everything else (max 50 P) and share the 99/day stock.

After that the shop serves ~1,470 rows (~570 KB across the three shelves),
against ~245 KB before.

## What is still unobtainable

Even after restoring the event rewards, 2,518 materials have no source at all in
the current data (collab/limited events and older seasonal content that is not
present). Only 8 of them are used by upgrades, and those are covered by the shop:

- Dawnlight Hollow Core / Dawnlight True Core
- Ultimate / Remains / Honey Wrought Iron
- Natalie's Recipe: Third Tier
- Festival Jewel Fragment
- Map of the Deep Realm

## Plus Upgrade Stones

The `Plus Upgrade Stone` items (プラス強化石, with a dedicated
"Plus Upgrade Stone Exchange" in the client) are **not** in `materiali.json` or
any other extracted item table in the repo - only the UI strings survive in
`lavoro-traduzione/`. They cannot be sold or granted until their item ids are
extracted from a table the repo does not currently have.
