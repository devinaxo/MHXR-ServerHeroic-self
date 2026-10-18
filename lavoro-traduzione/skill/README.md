# Skill, art and charm dictionaries

Flat `{ "japanese": "english" }` dictionaries (plus the generators that produced
them) for the **client master-data text** that lives in `resident.00.fpk`'s
tuning (XFS) tables — not in `GUI_msg.arc`. Applied with
[`traduci-rsdnt-arc.cjs`](../../tools-js/traduci-rsdnt-arc.cjs) (or the
table-restricted `traduci-arc-only.cjs` here), then `fpk-replace.cjs`.

Scope, coverage and the per-table work log: [`docs/SKILL-TRANSLATION.md`](../../docs/SKILL-TRANSLATION.md).

## Dictionaries

| File | Table (`resident.00.fpk`) | Field(s) | Entries |
|---|---|---|---|
| `kariwaza_jp_en.json` | `rsdnt_player.arc` → `player/kariwazaParam` | `mName` | 486 |
| `kariwaza_en_short.json` | same, follow-up pass | `mName` (English → shorter) | 865 |
| `equipSkill_en.json` | `rsdnt_player.arc` → `player/equipSkillParam` | `mSkillListTextList[].mListText`, `.mFilterFindName` | 1,455 |
| `playerBullet_en.json` | `rsdnt_player.arc` → `player/playerBulletParam` | `mName`, `mText` | 20 |
| `melody_en.json` | `rsdnt_player.arc` → `player/pipeMelodyParam` | `mName`, `mStatusName`, `mExplanation`, `mExplanationStatus` (nested) | 220 |
| `higi_en.json` | `rsdnt_equip.arc` → `equip/higi/higi_param` | `mName`, `mBaseText`, `mLvUpText` (nested) | 613 |
| `omamori_apply.json` | `rsdnt_equip.arc` → `equip/omamori/*` | `mOmamoriName` + `omamori_trigger.mTriggerText` | 2,470 |

`kariwaza_en_short.json` is the **second** pass: the art-name box is ~32
half-width cells and does **not** wrap, so long English names were shortened
(`Golden Masterful Technique → Golden Mastery`) after the first translation.

## Inputs

`inputs/` holds the table extracts the generators read — `kariwaza.json`,
`equipSkillList.json`, `omamori_names.json`, `quest_fragments.txt`,
`tech_jp.txt` — so the scripts run straight from the repo.

## Generators (provenance)

[`generators/`](generators) holds the **one-off** scripts that produced these
dictionaries from the game data (`translate_kariwaza.py`, `translate_equip.py`,
`translate_higi_p1.py`, `translate_higi_p2.py`, `translate_melody.py`,
`oma_tr.py`, `quest_tr.py`, `tech_tr.py`). They read the extracts in
[`inputs/`](inputs) and write their outputs here (intermediates go back into
`inputs/`), so they are reproducible from the repo. The published source is the
flat dictionaries in this folder.

[`traduci-arc-only.cjs`](traduci-arc-only.cjs) is the table-restricted copy of
[`../../tools-js/traduci-rsdnt-arc.cjs`](../../tools-js/traduci-rsdnt-arc.cjs)
used to apply a dictionary to only the named tables, so shared tables
(`helmData` / `hairData` / `armorSet`, which are not XFS) are left untouched.

Charm names and quest text also use
[`../../tools-js/dizionario-materiali.json`](../../tools-js/dizionario-materiali.json),
[`../partner/partner-skill.json`](../partner/partner-skill.json) and
[`../quest/`](../quest).
