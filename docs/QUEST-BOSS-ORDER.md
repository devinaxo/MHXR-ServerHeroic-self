# Quest boss order: why the info card and the hunt disagreed

Applied 2026-10-20. This is a **database-only** change (collection
`apypos.questsheets`); no code, no resource pack, no `RES_VER` bump.

## Symptom

Quest 5-7 `Dragon in the Fire` lists `Great Wroggi` in Area 3 and `Agnaktor` in
the Final Area, but the hunt was fought the other way round: Agnaktor third,
Great Wroggi last. The night twin 5-8 did the same.

## The two sources

The quest info card is drawn by the client from its own quest sheet
(`resident.00.fpk` -> `rsdnt_quest.arc` -> `tuning/xml/quest/questData/normal`).
For 5-7 that sheet says:

```
mBossList = [ {mEnemyID 19, mAreaNo 4},   // 19 = Agnaktor
              {mEnemyID 45, mAreaNo 3} ]  // 45 = Great Wroggi
```

The card labels each entry by `mAreaNo` (`エリア%d`, `最終エリア`, string ids
1109 and 1108 in `MenuCmn`). Capcom stores every multi-boss story list
descending by area.

The hunt is driven by the block sequence the server sends at quest start
(`blocchiPerAvvio` -> `mBlocks`). For 5-7 that was:

```
l06_m02_a09  l06_m05_a04  l06_m05_a05  l06_m05_a07
```

## What actually decides the monster

It is not the quest list. Every block has a **per-quest build entry** in the
client packs:

```
<res>/quest.<N>.fpk
  /arc_cmn/quest/table/lXX/mYY/aZZ.arc
    quest\blockBuild\lXX\mYY\aZZ\<blockName>
```

The build entry contains `mBossList.mpArray[0].mEnemyType`, the monster that
block spawns. For 5-7 the entries are:

| block | build boss |
| --- | --- |
| `l06_m02_a09_0507` | 0 (none) |
| `l06_m05_a04_0507` | 0 (none) |
| `l06_m05_a05_0507` | 19 Agnaktor |
| `l06_m05_a07_0507` | 45 Great Wroggi |

The client spawns the build boss of each block in the order the server sends
the blocks. Swapping the last two blocks in `mBlocks` (tested live on 5-7 and
5-8) moved Agnaktor to the last fight, which confirmed the rule.

## The fix

For every story quest with two or more bosses, reorder the blocks so the build
bosses appear in `mBossList` `mAreaNo` ascending order. That is the same order
the info card displays, so the monster tagged `Final Area` is the last boss
fought.

Only the positions that hold a quest target are permuted. Transit blocks and
blocks whose build boss is not in the quest list (115 quests have at least one)
stay exactly where they were. Duplicate bosses are selected by block name, so a
second run plans the same thing and does nothing.

## Tools

- `tools-js/build-quest-block-boss.cjs` reads the packs and writes
  `tools-js/quest-block-boss.json` (`blockHash -> {name, boss}`).
- `tools-js/fix-boss-order.cjs` plans and applies the reorder.

Commands (inside the `server` container, which has `tools-js` at `/app/tools`):

```bash
# read-only check, no DB writes
docker compose -f docker-compose.prod.yml exec -T server \
  node /app/tools/fix-boss-order.cjs --dry --report /app/tools/ordine-boss-report.txt

# apply (writes backups/boss-order-<timestamp>.json on the host)
docker compose -f docker-compose.prod.yml exec -T server \
  node /app/tools/fix-boss-order.cjs --apply \
  --backup-dir /app/tools --report /app/tools/ordine-boss-report.txt

# undo every quest changed by this tool
docker compose -f docker-compose.prod.yml exec -T server \
  node /app/tools/fix-boss-order.cjs --undo
```

`--json --dry` runs against
`src/json/questDB/normal.extended.complete.json` instead of Mongo.

The tool stores the old list in `mBlocksOrdinePrima` and tags the document with
`mBlocksOrdine: 'build-boss'`. `--undo` restores those lists and removes both
fields. It only touches documents it tagged.

## Result (2026-10-20)

- 1363 multi-boss story quests checked.
- 613 reordered (45 of them also carry a non-target block boss, left in place).
- 750 were already in the correct order.
- After the apply the dry run reports 0 to reorder, and every quest's target
  sequence matches the card.

Backup: `backups/boss-order-2026-10-20.json`.
Full per-quest report: `lavoro-traduzione/quest/ordine-boss-report.txt`.

## Caveats

- The database is the live source. `normal.extended.complete.json` still holds
  the old orders, so if the collection is ever re-seeded the fix must be run
  again (or the seed patched the same way).
- 115 story quests send a block whose build boss is not in their `mBossList`
  (mostly high-difficulty and training quests). This tool does not remove or
  move those blocks; it only orders the listed targets. If those extra bosses
  are unwanted, that is a separate block-selection issue.
- This covers story (`QUEST`) quests only. Event, ticket, eternal and score
  quests use the same block build data and can be added later.
