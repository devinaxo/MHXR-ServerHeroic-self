# Quest detail "equipment" panel: real rewards instead of random gear

Applied 2026-10-13.

## Symptom

Opening a quest's detail and its equipment section showed **6 pieces of gear**
(weapons + armour mixed), and the set **changed every time** the tab was
re-opened. It also never matched what the quest actually gives, and the message
"Equipment Crystals cannot be obtained in this quest" could never be triggered.

## Cause

The panel is fed by **`POST /api/quest/katamari/content/get`**. The client sends
`{ session_id, mst_quest_id, mst_event_node_id, mst_part_id }` (read from
`cAPIQuestKatamariContentGet::Request::to_json`), and expects
`{ katamari_content_list: [{ elv, end_remain, is_awake, mst_equipment_id,
prob_type_id, slv, start_remain }] }` (from `::Response::setup`).

`src/routes/api/quest/questKatamari.controller.ts` **ignored the quest and the
part** and called `pescaEquipaggiamenti(rarita, 6)` — six `Math.random()` picks
from a rarity pool. So the panel was random and unrelated to the quest.

(Not the culprit, checked and ruled out: `/api/dictionary/equipment/get` is a
static catalogue the client only requested once, and `uGUIEventEquipHint`'s
`createQuestEquipHintList` reads a client-side quest resource.)

## Fix

`contentGet` now:

1. Looks up the quest by `mst_quest_id` (`QuestSheet`) and returns the ids in its
   `mRewardItemList` whose catalogue family is `equipaggiamento` (the
   `mRewardType` field is not reliable — see `questIsland.controller.ts`),
   **sorted by rarity descending** (rarest first). These are the real equipment
   rewards the event/ticket quests promise. **No cap** — every piece in the table
   is sent, so quests that promise more than six (e.g. `TICKET00337`, 18 pieces)
   list them all.
2. For quests that list **no** equipment it returns an **empty list**, so the
   client shows *"Equipment Crystals cannot be obtained in this quest"* instead
   of inventing gear. (The previous revision faked a seeded set; the user asked
   for the honest message instead.)

## Verified live

- `TICKET00337` → 18 pieces, rarities `5×10, 4×8` (rarest first), all from its
  reward table.
- `QUEST0010210` (materials only) → empty list.
- Unit tests in `questKatamari.controller.spec.ts` (real rewards rarest-first,
  empty when no equipment, no invention). Full suite 646/646.

## Limitation (story quests)

The exact per-part contents (part → katamari → equipment) are **not in the game
data**, so they cannot be reconstructed. Extraction pass (2026-10-13) checked the
resident archives and found no such table:

- `rsdnt_property.arc` → `katamari_define` (the 5 `KATAMARI0000x` ids) and
  `katamari_info` (`{mID, mIconID, mDirectionID}`) — **no equipment pool**.
- `rsdnt_quest.arc` → `questData/{normal,event,ticket,…}` (per-quest fields are
  exactly what `QuestSheet` already has: `mBossList`, `mRewardItemList`,
  `mRewardDataList` = a shared 18-row table) and `equip_hint` (a *recommended
  gear* table covering only **30 quests**: 1 weapon + 5 armour each).
- `rsdnt_enemy.arc` → `EnemyList`, `enemy_breakName` (`mEnemyId`/`mRemNo`/name:
  Head, Tail…) — parts, but **no drops**.
- `rsdnt_equip.arc` → the `equip_*_series` / `equip_series_*_define` tables —
  equipment stats and name→hash, **no monster link**.
- `rsdnt_quest_block.arc` → `quest_block_define_l*` — block name→hash only.

Conclusion: the panel's per-quest contents were produced by the original server,
not read from the client. So for story quests (whose reward tables list only
materials) the accurate answer is the empty list → *"Equipment Crystals cannot be
obtained in this quest"*, which is what the handler returns. If the original did
put gear there, we cannot reproduce it exactly.

Also still empty (same family of data): the `katamari_content_list` in the
`quest/island/end` response (`questIsland.controller.ts`), which is the reward
bundle shown at quest end.

## Backups

- `backups/db-apypos-full-20261012-220319.archive` — whole `apypos` database
  (quests, events, users, everything), `mongodump --gzip`.
  Restore: `mongorestore --drop --gzip --archive=… ` (see the mongorestore form
  in `docs/EVENT-QUESTS-BLOCKS.md`).
- `backups/db-questsheets-20261012-200740.archive` (before the block work) and
  `…-post-20261012-202834.archive`.
