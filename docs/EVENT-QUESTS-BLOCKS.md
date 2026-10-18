# Event quests: fixing error 10001 (empty `mBlocks`)

Applied 2026-10-12. This is a **database-only** change (collection
`apypos.questsheets`); no code, no resource pack, no `RES_VER` bump.

## Symptom

Starting an event / ticket / eternal / score quest returned **error 10001**
("Failed to get quest info" / "quest data not found") instead of the quest.

## Cause

`src/routes/api/quest/questEvent.controller.ts` (`eventNormalStart`,
`eventTicketStart`, `eventScoreStart`) builds the `block_list` from
`blocchiPerAvvio(quest)` (`src/services/blocchiQuest.ts`), which returns
`quest.mBlocks` (or the per-area families in `quest.mBlocchiCasuali`). When that
is empty the controller answers `ERROR_CODE.QUEST_INFO_FAILED` (10001) before
sending anything.

The seeder loads `src/services/seedService.ts` →
`json/questDB/event.extended.blank.json`, which has **zero** blocks, and the
earlier `mBlocks` repairs had been reverted to the pristine baseline (see
`docs/HANDOFF-QUEST-TRANSLATION.md` §A). So every non-story quest had an empty
block list. The raw game files contain no per-quest block list (only
`mbRandomBlock`), so the mapping has to come from the tools.

## Baseline (before)

`questsheets` = 4175 documents; **2161 with empty `mBlocks`**:

| mDefineId | total | empty |
|---|---|---|
| EVENT | 1524 | 1524 |
| TICKE | 596 | 596 |
| ETERN | 20 | 20 |
| SCORE | 20 | 20 |
| QUEST (story) | 1995 | 0 |
| TRAIN | 15 | 0 |

No repair markers existed (`mBlocksSource`, `mBlocksPrima`, `mBlocchiCasuali`
all absent).

## The plan (Heroic853's toolchain, already in the repo)

The tools live in `tools-js/` and were added by commit `357df40`
("Event quest restoration: visibility, bosses, rewards, monster assignment",
Heroic853; ancestor of the current branch). "Map blocks and their ids" =
`mst-block-ids.json`, the sheet mapping each block name (`l90_m12_a01_0011`) to
its `mst_block_id` hash, its map, and the monster it contains.

Pipeline, in this order (reconstruct first, then overwrite with the authentic
lists where they exist):

1. `restore-bosses.cjs` - recovers `mBossList`. An XFS-conversion bug had
   written `[null]` for 1525 event quests; the boss is needed for `fix-monsters`
   to place it on the right area.
2. `fix-monsters.cjs --forza-foglio-inglese` - for each EVENT/TICKE/ETERN/SCORE
   quest, picks blocks from `mst-block-ids.json`: right continent
   (`EVENT90xxxx → l90`), right map, right monster/variant, boss on its
   `mAreaNo`, other areas filled from the same map. Saves the previous value in
   `mBlocksPrima`; tags the row `mBlocksSource: 'foglio-mst_block_ids-v3'`.
   (The script is disabled by default; `--forza-foglio-inglese` runs it.)
3. `restore-real-blocks.cjs` - overwrites with the **authentic** block lists
   where they exist (`json/questDB/event.extended.json`, 967 of 1524 event
   quests; the other `*.extended.complete.json` have no authentic blocks).
   Tags `mBlocksSource: 'autentico'`.

Commands (all run inside the `server` container, which has `tools-js` bind-mounted
at `/app/tools`):

```bash
sg docker -c "docker exec mhxr-serverheroic-self-server-1 node /app/tools/restore-bosses.cjs"
sg docker -c "docker exec mhxr-serverheroic-self-server-1 node /app/tools/fix-monsters.cjs --forza-foglio-inglese"
sg docker -c "docker exec mhxr-serverheroic-self-server-1 node /app/tools/restore-real-blocks.cjs"
```

Dry runs were done first (`--dry`, and `--dry --forza-foglio-inglese`), then the
writes.

## Result (after)

**326 empty** (was 2161); 3849 quests playable.

| mDefineId | total | empty |
|---|---|---|
| EVENT | 1524 | **9** |
| TICKE | 596 | 316 |
| ETERN | 20 | 0 |
| SCORE | 20 | 0 |
| QUEST | 1995 | 0 |

Block sources: `originale del dump` 2340, `autentico` 962,
`foglio-mst_block_ids-v3` 873, plus the 326 empty.

Live check (`/api/quest/event/normal/start`, session of `devinaxo`, account
restored afterwards):

- `EVENT900101` → `error_code 0`, 4 blocks (`1540212443,3227288781,1187575395,2375292454`).
- a `TICKET` quest → `error_code 0`.
- `EVENT94003` (still empty) → `10001`, as expected.

## Backup / rollback

`questsheets` was dumped before any write:

```
backups/db-questsheets-20261012-200740.archive   (mongodump --gzip, 4175 docs)
```

Restore:

```bash
sg docker -c "docker cp backups/db-questsheets-20261012-200740.archive mhxr-serverheroic-self-mongo-1:/tmp/restore.archive"
sg docker -c "docker exec mhxr-serverheroic-self-mongo-1 sh -c 'mongorestore --username \"\$MONGO_INITDB_ROOT_USERNAME\" --password \"\$MONGO_INITDB_ROOT_PASSWORD\" --authenticationDatabase admin --drop --archive=/tmp/restore.archive --gzip'"
```

Partial rollback is possible too: `fix-monsters.cjs --undo` restores
`mBlocksPrima`, and (`fix-blocks.cjs --undo`, then manually clear the
`mBlocksSource: 'autentico'` rows) removes the rest.

## Remaining gap (326) - now closed

_Update, same day: the 326 were fixed too, leaving 0 empty._

### The real cause: split `mBossList`

310 of the 325 remaining quests had a **malformed `mBossList`**. The old XFS
import wrote each boss field in a separate object:

```json
[{ "mEnemyID": "114" }, { "mAreaNo": "2" }, { "mFieldSkillPackId": "0" }]
```

instead of one `{ mEnemyID, mAreaNo, mFieldSkillPackId }`. Two bits of fallout:

- `restore-bosses.cjs` didn't see them as broken (its "already has a boss" check
  was `b.mEnemyID` alone), so it skipped them - 558 quests stayed split.
- `fix-monsters.cjs` reads `b.mAreaNo` to place the boss and found nothing.

Fixes:
- **patched `tools-js/restore-bosses.cjs`** so `estraiBoss` groups single-key
  objects by `mEnemyID` (a quest with several monsters no longer collapses to
  the last one) and so the "already has a boss" check requires the area too.
- **new `tools-js/fix-bosses-split.cjs`** - recomposes the split arrays from the
  data already in the DB (preserving the area, which the source files sometimes
  omit). Repaired **558** quests.

### The last 325: placeholder enemies

The remaining quests use boss ids **114, 91, 31, 22, 36, 160**, which are
unnamed special enemies (not monsters) - the zeny / flag / explorer reward
quests and the "レア装備確定/%" (rare-equipment) ones. No monster name exists for
them in any table, so `fix-monsters` can't match (the titles name an event, not a
monster). The original block data for them is in no game file.

- **new `tools-js/fix-empty-event-blocks.cjs`** - assigns each a deterministic
  block per boss area from **event continents only** (l70/l75/l9x, never the
  story continents where the tutorial island lives), tagged
  `mBlocksSource: 'fallback-evento'`, with `--undo`. Covered all 325.

### Guard against clobbering the authentic blocks

Re-running `fix-monsters.cjs` after `restore-real-blocks.cjs` used to overwrite
the 962 authentic rows. `fix-monsters.cjs` now **skips any quest marked
`mBlocksSource: 'autentico'`**, so the two scripts can run in any order.

### Final state

`questsheets`: **0** with empty `mBlocks` (all 4175 playable). Sources:

| `mBlocksSource` | count |
| --- | --- |
| (none - story/training original) | 2014 |
| `autentico` | 962 |
| `foglio-mst_block_ids-v3` | 873 |
| `fallback-evento` | 326 |

Live check: `TICKET00238` (was 10001) now starts with 2 blocks; the
`【HEAVEN OR HELL】` event starts too.

### Caveat

The 326 `fallback-evento` quests start on an event continent and give their
server-side reward, but their **monster is the one in the fallback block**, not
the original (which isn't recoverable). `--undo` puts them back to 10001.

### Monsters depend on the block, and the block files are the ground truth

A quest's **target** name comes from the quest data (`mBossList.mEnemyID`), but the
monster you **actually fight** is spawned by the client from the block
(`mst_block_id`) sent in the quest-start response. So a wrong block = wrong
monster even when the target is shown correctly.

The block files
(`quest.*.fpk` → `/arc_cmn/quest/block/lv<L>/m<M>.arc` → `m<M>a<AA>`) list every
placement with its real spawn name (`mComment`), e.g. for
`l93_m13_a01` (the area behind the goruru block `l93_m13_a01_3125`):

```
START_0   ENEMY_メラルー_6  ENEMY_ブルファンゴ_6  ENEMY_フロギィ_6 …
ENEMY_ドスゴルルー_1   EM_WAIT_ゴルルー   ENEMY_ゴルルー_6      <- goruru
BOSS_ドスジャギィ BOSS_クルペッコ BOSS_ウラガンキン …
BOSS_ウラガンキン宝岩種 … BOSS_ジンオウガ不死種 …                  <- the ones seen
```

Consequences / open points:

- **The block file is per AREA, not per variant.** `l93_m13_a01_*` are 138
  variants sharing the `m13a01` file, and the variant number is **not** stored
  in the file - so *which* placement spawns is decided client-side
  (`sQuestNew::setupBlockType` in `libMHS.so` derives a type bitfield and walks a
  placement array). We cannot read the exact per-variant spawn out of the data.
- `mst-block-ids.json` labels each variant (e.g. `_3125` = Goruru) and the labels
  are systematic (the last digits encode the enemy kind), but they were built
  largely for **story** blocks; the label for an event variant is unverified.
- The quest-start `block_list` we send carries `block_instance_list`,
  `repop_list`, `drop_list` as **empty/placeholder** values
  (`shop`-style minimal). These are what the client walks to pick placements, so
  the mismatch (goruru target, Uragaan/Zinogre fight) most likely comes from
  here, not from the block id itself.

So: the block ids we assigned for the goruru tickets are *area-plausible*
(`_3125` = Goruru, and its area does contain goruru), but the exact spawn is not
something the extracted data settles. Tracing how the client builds
`cQuestBlockData` from the response (what `block_instance_list` must contain) is
the next step to make the fought monster match the target.

Unrelated note: the ~326 quests we filled with `fallback-evento` blocks
(`fix-empty-event-blocks.cjs`) DO have arbitrary monsters, because their boss
enemy ids (114/91/31/…) were not mappable. Those are the clearest "wrong
monster" cases.

### Enemy ids are named by the block files (2026-10-13)

The block files name **every** placement, and each placement's `mPrimList.mpArray.Type`
is the enemy id. So the block files give a ground-truth `mEnemyID → monster`
table - built by the new `tools-js/build-enemy-map.cjs` into
`tools-js/enemy-map.json` (148 enemies). It agrees with heroic's hand table on
the entries it had (162 Tigrex Unit-02, 163 Alphonse, 140 Yoga Gigginox, 157
Destruction Rathalos) and fills the ones it lacked:

```
114 -> ドスゴルルー   (Great Goruru)      <- the "placeholder" id, is a golden cat
 91 -> メタルー
 31 -> メラルー                            <- Melynx
 90 -> ゴルルー        (Goruru)
 76 -> ブルファンゴ    (Bulldrome)
 48 -> フロギィ        (Wroggi)
 10 -> ジャギィ        (Jaggi)
```

So the ticket quests we couldn't map were **not** gibberish: **353 event/ticket
quests use enemy 114, i.e. Great Goruru**. Those are exactly the "golden cat"
quests, and they are the ones most likely to show the wrong monster because we
filled them with `fallback-evento` blocks.

### How the client picks spawns from a block

From `libMHS.so`:

- `sQuestNew::createBlockLayout` calls `createLayoutEnemy(uint, BlockInfo*,
  MtTypedArray<cQuestMonsterData>*)`, `createLayoutEnemyWait(...)`,
  `createLayoutTranslate`, `createLayoutObstacle`, … - i.e. the block file's
  per-type lists drive the spawn.
- `createLayoutEnemy` walks the block's `cQuestMonsterData` (each has
  `mMonsterId, mSubId, mRank, mTarget, mInstanceId, mParamGroupID, mOtherGroupID`),
  gates on `getBlockParam(mParamGroupID)` and calls `sEnemy::createEnemy(mMonsterId)`.
- `getBlockParam(id)` reads the param out of the **currently selected** block
  data (`[sQuestNew+0xe8][sQuestNew+0x118]`). So the block file supplies the
  monsters and the selected block supplies the params that enable them.

The catch remains: the block NAME's variant (`_3125`) is not stored in the file,
and the selected-block index/params come from data we don't fully see - so the
sheet's per-variant label (e.g. `_3125` = Goruru) is unverified for event blocks.
The goruru block's area (`m13a01`) does contain goruru (`ENEMY_ゴルルー_6`, Type
90), but as a **non-target**; the `mIsTarget: true` placement in it is a boss -
consistent with fighting a boss instead.

### Re-pick done: blocks chosen from the real block contents (2026-10-13)

`tools-js/fix-blocks-by-enemy.cjs` wires `enemy-map.json` +
`block-areas.json` into the block picker. For every EVENT/TICKE/ETERN/SCORE
quest it takes the target enemy (`mBossList[].mEnemyID`) and picks a block whose
**area actually contains that enemy**, preferring:

1. an area where the enemy is the block's target (`mIsTarget`),
2. the area with the fewest distinct enemies (most dedicated to that monster),
3. a stable order per quest (FNV-1a of quest id / area).

Candidates are restricted to **event continents** (`l70`/`l75`/`l9x`) so the
story continents (and their tutorial island) can never be selected. Only
non-authentic rows are touched: `mBlocksSource:'autentico'` is skipped, so the
real lists are safe. The previous value is kept in `mBlocksPrima`; the row is
tagged `mBlocksSource:'enemy-map'`.

```bash
sg docker -c "docker exec mhxr-serverheroic-self-server-1 node /app/tools/fix-blocks-by-enemy.cjs --dry"
sg docker -c "docker exec mhxr-serverheroic-self-server-1 node /app/tools/fix-blocks-by-enemy.cjs"
sg docker -c "docker exec mhxr-serverheroic-self-server-1 node /app/tools/fix-blocks-by-enemy.cjs --undo"   # restore mBlocksPrima
```

Result: **517 quests** re-picked (326 were `fallback-evento`, 191 were
sheet-based rows whose area did not contain the target). **331** of them are
enemy **114 (ドスゴルルー, Great Goruru)** - the golden-cat quests. After the
run, **all 517** have a block whose area contains the quest's target (verified),
and `fallback-evento` dropped from 326 to **2** (two quests whose chosen block
already equalled the current one, so they were left tagged as-is).

| `mBlocksSource` | after |
| --- | --- |
| (none - story/training original) | 2014 |
| `autentico` | 962 |
| `foglio-mst_block_ids-v3` | 680 |
| `enemy-map` | 517 |
| `fallback-evento` | 2 |

`block-areas.json` is also a useful reference: e.g. enemy **114** lives in a
2-monster area (`l91_m12_a03`: Great Goruru + Melynx) and in a `l99_m27_a01`
area where all 59 of its placements are the target; enemy **90** never appears as
a target (it is a wait/small enemy), so its areas always mix 13 monsters.

> Note: the same area file is duplicated inside many `quest.*.fpk` archives, so
> the "distinct enemies" count is a union across those copies - it is a ranking
> aid, not a per-variant truth. And the variant (last digits of the block name)
> is still chosen best-effort; see the caveat below.

### Next / open

- The variant still matters in principle: `l91_m12_a03` has 4 variants and 59
  Great-Goruru placements, `l70_m02_a11` has 12. With every placement being the
  same monster the variant is harmless, but for mixed areas it is a guess.
- Resolve `[sQuestNew+0x118]` (the selected block params) in `libMHS.so` to
  confirm the per-variant spawn rule; until then the variant is best-effort.

## Notes

- No resource pack was rebuilt or published, so nothing was added to
  `backups/res-*` and `RES_VER` was not bumped. This whole document is a
  `apypos.questsheets` (database-only) change, read live at quest start
  (`blocchiPerAvvio`, no in-memory cache).
- The client picks the monster from the **block**, not from `mBossList`, so a
  reconstructed quest may still show a different monster than the original. The
  authentic 962 are exact; the `enemy-map` 517 are correct at the **area** level
  (the target monster is in the block's area); the 680 sheet-based ones are
  best-effort.
- Backup taken right before the re-pick:
  `backups/db-questsheets-pre-undo-20261012-enemy-map.archive` plus the full
  `backups/db-apypos-full-20261012-220319.archive` (restore only the collection:
  `mongorestore --gzip --archive=... --nsInclude='apypos.questsheets' --drop`).
