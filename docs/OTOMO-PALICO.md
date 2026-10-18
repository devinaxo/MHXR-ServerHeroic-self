# Palico (otomo): encounters, skills and names

This documents the random Palico encounter added at the end of an island quest,
the subskill rule behind the "only 2 skills at level 69" question, and the
English name translation.

## Random encounter (new Palicos)

Before this change the box only ever held the two starting Palicos from
`src/json/user-defaults.json` (Cacao and Souffle). `get_mst_otomo_id` in the
island-end response was a hardcoded `0`, so there was no way to obtain another
one.

Now, when an **island** quest ends, `islandEnd` can leave one new Palico:

- only island quests qualify. `islandEnd` also serves `/eternal/end` and the
  event ends, but those have no `mst_part_id`, so `isolaDellaMissione` returns
  null and no Palico drops.
- the Master table is `src/json/otomo-master.json` (generated from
  `rsdnt_otomo.arc :: OtomoParam`). `charNo` builds the box `otomo_id`
  (`OT_OTOMO_CHAR_ID_<charNo>`), `id` is the `mst_otomo_id`.
- the pool excludes Palicos already in the box, the collaboration/test rows
  (`event=1`, `ニャン検*`, `テスタ`) and the `ブランク` placeholder. 45 rows are
  obtainable.
- rarity is weighted: rarity 1 has weight 5, rarity 4 has weight 2, so common
  Palicos appear more often than the rare ones.
- the new Palico is written into `box.otomos` in the same update as the quest
  rewards, and the response sets `get_mst_otomo_id` to its `mst_otomo_id`. That
  is what the client reads to show the "new Palico" result; the next
  `box/otomo/get` then returns it.

Tuning, from the environment:

| Variable | Default | Meaning |
| --- | --- | --- |
| `OTOMO_ENCOUNTER_CHANCE` | `20` | Percent chance per island clear. `0` disables encounters. |
| `OTOMO_QUEST_EXP` | `10000-100000` | End-of-quest exp for the Palicos that set off (already existed). |
| `OTOMO_SKILL_ON_LEVELUP` | `1` | `0` disables teaching a subskill at the level-up slots. |

Code: `src/services/otomoEncounter.ts`, wired in
`src/routes/api/quest/questIsland.controller.ts` (`islandEnd`).

## Skills: why a level 69 Palico has only 2

A Palico has two kinds of skills:

- **main skills** (`mSkillMainId0/1` in `OtomoParam`): inherent, they come with
  the Palico and are not "unlocked" by levelling.
- **subskills** (`subskill[]` in the box): learned at the slot levels below.

The subskill slot count comes from the client
(`cOtomoWSData::calcSkillSubSlotNum`) and is reproduced by
`slotSubSkillOtomo` in `src/services/otomoGrow.ts`:

| Level | Subskill slots |
| --- | --- |
| 1-9 | 0 |
| 10-24 | 1 |
| 25-74 | 2 |
| 75+ | 3 |

So at **level 69 a Palico holds 2 subskills**, and the third one opens at
**level 75**. That is not a bug: two is the correct number for that level. At
`islandEnd`, when the quest exp pushes a Palico past one of 10/25/75,
`premiaOtomoFineQuest` teaches one subskill and reports it in
`otomo_result[].mst_otomo_subskill_id`.

If an old Palico levelled up before the teaching code existed, it simply has no
subskill yet; the next quest it takes part in fills the missing slot (one per
quest).

## English names

Palico names are **client master data**: `resident.00.fpk :: rsdnt_otomo.arc ::
tuning/xml/otomo/OtomoParam`, field `mOtomoName`. They are still Japanese in the
published pack (RES_VER 371), which is why the Palico list reads `カカオ`,
`スフレ`, etc.

The flat dictionary is `lavoro-traduzione/otomo/otomo-nomi.json` (53 entries:
every `mOtomoName`, event and test rows included). It is applied with the same
generic rewriter used for quests, skills and items.

Pipeline (do **not** run without sign-off: it publishes a new pack):

```bash
PACK=src/public/res/download/android/v0282/stdDL/cmn/resident.00.fpk
PRISTINE=heroic-packs-pristine/android/v0282/stdDL/cmn/resident.00.fpk
node tools-js/fpk-pull.cjs fpk-pull "$PRISTINE" build/otomo.arc rsdnt_otomo.arc
node tools-js/traduci-rsdnt-arc.cjs build/otomo.arc \
  lavoro-traduzione/otomo/otomo-nomi.json build/otomo_en.arc
node tools-js/fpk-replace.cjs "$PACK" build/res.new.fpk rsdnt_otomo.arc build/otomo_en.arc
cp build/res.new.fpk "$PACK"
find src/public/res/download/android -name download.list -delete
# rebuild the server so the manifests regenerate, then bump RES_VER and publish
```

For a review run without touching a pack, pull the current arc and rebuild it to
`lavoro-traduzione/otomo/rsdnt_otomo.en.arc`:

```bash
node tools-js/fpk-pull.cjs fpk-pull "$PACK" build/otomo.arc rsdnt_otomo.arc
node tools-js/traduci-rsdnt-arc.cjs \
  build/otomo.arc lavoro-traduzione/otomo/otomo-nomi.json \
  lavoro-traduzione/otomo/rsdnt_otomo.en.arc
```

`traduci-rsdnt-arc.cjs` reported 53 substitutions, 53/53 dictionary keys used,
30/30 tables re-read clean.

Name choices are romanizations (the game has no official English list for
these): `カカオ` -> Cacao, `スフレ` -> Souffle, `ワッフル` -> Waffle,
`マカロナ` -> Macarona, `フィナンシェ` -> Financier. Corrections are welcome.
