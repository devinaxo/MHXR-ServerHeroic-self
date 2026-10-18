# Hunter skill / art names — scope and progress (2026-10-14, RES_VER 361)

## Where the skill text lives

Skill, art and secret-art names are **client master data** in `resident.00.fpk`,
in tuning (XFS) tables — **not** in the `GUI_msg.arc` GMDs:

| Table | Field(s) | What it is |
|---|---|---|
| `rsdnt_player.arc → tuning/xml/player/kariwazaParam` | `mKariwazaInfo[].mName` | **Martial Art names** (the art card) |
| `rsdnt_player.arc → tuning/xml/player/equipSkillParam` | `mSkillListTextList[].mListText`, `.mFilterFindName` | **Skill-list labels** (armour/equipment skills) |
| `rsdnt_equip.arc → tuning/xml/equip/higi/higi_param` | `mHigiInfoDataList[].mName`, `.mBaseText`, `.mLvUpText` | **Secret Arts** (name + description + level line) |
| `rsdnt_player.arc → tuning/xml/player/playerBulletParam` | `mName`, `mText` | **Bullet types** (name + description) |
| `rsdnt_player.arc → tuning/xml/player/pipeMelodyParam` | `mName`, `mStatusName`, `mExplanation`, `mExplanationStatus` | **Hunting melodies** (names + status + explanations) |

The `SkillName`/`SkillText` GMDs in `GUI_msg.arc` hold related text but are a
separate, already-translated list.

## Completed (RES_VER 361)

All JP source strings below are now translated and published as **361**
(`crcjam ff914ddf`, PASS):

| Table | String(s) translated | Dict |
|---|---|---|
| `kariwazaParam` (martial arts) | **486** names | `lavoro-traduzione/skill/kariwaza_jp_en.json` |
| `equipSkillParam` (skill labels) | **1,455** (`mListText` + `mFilterFindName`) | `equipSkill_en.json` |
| `playerBulletParam` (bullet types) | **20** | `playerBullet_en.json` |
| `pipeMelodyParam` (melodies) | **122** names + 14 status + 76 explanations + 8 status descriptions | `melody_en.json` |
| `higi_param` (secret arts) | **324** names + 280 base + 9 level lines | `higi_en.json` |

Applied with a table-restricted `traduci-rsdnt-arc.cjs` copy
(`ONLY=kariwazaParam,playerBulletParam,pipeMelodyParam,equipSkillParam` for
`rsdnt_player.arc`; `ONLY=higi_param` for `rsdnt_equip.arc`) so the armour tables
(`helmData`/`hairData`/`armorSet`, which share skill strings and are **not** XFS)
are left untouched. Merged dicts: 2,180 keys (`rsdnt_player`) and 612
(`rsdnt_equip`), 0 conflicts.

The JP entries were largely the later event / "Zero" / "Absolute" variants; the
base arts and common skills were already English.

### Known data bug
The `SkillName` GMD is **misaligned** in the Zero/Absolute block — e.g.
`覇道不滅・零【傑物】 → "Princess's Melody - Zero (Magnificent Age)"` (off by
one). Do **not** reuse that GMD blindly for the JP art names; align by JP and
retranslate (or fix the shift).

## Long names (done: RES_VER 360)

**The art-name box is ~32 half-width cells and does NOT wrap** (RES_VER 358
tried inserting `\n`; the layout ignored it, so it was rolled back in 359).

So every `kariwazaParam` name must **fit on one line at ≤32 cells**. In
RES_VER 360, **865** English art names were rewritten shorter, systematically:

- long art "families" abbreviated — e.g.
  `Golden Masterful Technique → Golden Mastery`,
  `Undying Path of Supremacy → Undying Supremacy`,
  `Brilliant Talent in Bloom → Genius Bloom`,
  `Transcendent Technique → Transcendent`
- `[detail]` parts abbreviated where needed — e.g.
  `[Snow Cherry Blossom] → [Snow]`, `[Heavenly Conquest] → [Heaven]`
- variant tags shortened — `: Ultimate → : Ult`, `: Mighty → : Mig`,
  `: Extreme → : Ext`, `: Blossoming → : Bloom`

Result: **0** names over 32, no duplicate names. Examples:
```
Golden Masterful Technique [Brocade Dash]        -> Golden Mastery [Brocade Dash]   (29)
Undying Path of Supremacy [Great Talent]         -> Undying Supremacy [Talent]       (25)
Undying Path of Supremacy: Zero [Great Talent]   -> Undying Supremacy: Zero [Talent] (31)
```

- dictionary: `lavoro-traduzione/skill/kariwaza_en_short.json` (865 `old -> new`)
- applied with `traduci-rsdnt-arc.cjs` (865/865 keys used, 41/41 tables clean)
- published as **360** (`crcjam cd90daab`, PASS)

## Art descriptions (done: RES_VER 362)

The description under an art card is **not** in `kariwazaParam` (its
`mCommentID` is only a 0/1/2 enum). It is the **`SkillText` GMD** in
`GUI.00.fpk → GUI_msg.arc`, one string per art, parallel to `SkillName`.

The Japanese originals are pre-wrapped with `\n` (1–7 lines, ≤ ~53 half-width
cells each) because the box does **not** auto-wrap — it shrinks the font to fit.
The earlier English translation had collapsed every description to a single line
(0 of 1,949 had `\n`), so the long ones shrank to the point of being unreadable
(e.g. `Beast Blood [Mad Tempest]`, `TOP OF HEAVEN 2`).

In RES_VER 362, **1,568** English `SkillText` strings were re-wrapped to **≤52
half-width cells per line**, preferring the original Japanese line count
(`lavoro-traduzione/trad/SkillText.json`, rebuilt with `build-msg-arc.cjs`,
published as **362**, `crcjam 27d8720e`, PASS).

**Bug fixed while doing it:** `build-msg-arc.cjs`'s `cifra()` reversed whole
4-byte words only, so a rebuilt `GUI_msg.arc` whose body length was **not** a
multiple of 4 had its last byte corrupted by Blowfish's 8-byte padding (the
publish verifier caught it with a zlib error). `cifra()` now aligns the body to
8 bytes before encrypting; the output is byte-identical whenever the length was
already 4-aligned.

## Next

The hunter skill-text scope (arts, skill labels, secret arts, bullet types,
melodies) is **complete as of RES_VER 361**. Remaining JP in `rsdnt_player.arc` /
`rsdnt_equip.arc`, if any, is outside skill text (Palico names, dummy equipment
placeholders).

Pipeline per table (same as 357–361):
pull the arc from the live `resident.00.fpk`, apply a flat `{jp: en}` dict with a
table-restricted `traduci-rsdnt-arc.cjs`, `fpk-replace.cjs`, regenerate
`download.list`, publish a new version, bump `RES_VER`, `verify-bump`.
