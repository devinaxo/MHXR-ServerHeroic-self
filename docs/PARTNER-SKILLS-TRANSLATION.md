# Partner skill texts - translation (2026-10-13, RES_VER 354)

Partner (mercenary) skill names and descriptions are **client master data**, not
server data. They live in:

```
resident.00.fpk  ->  /arc_cmn/resident/rsdnt_player.arc
                 ->  tuning/xml/partner/partnerSkillParam   (XFS table)
```

Each row has `mID / mName / mType / mSubType / mCulcType / mElement / mParam /
mText`. The UI shows `mText` under a `Lv. N` prefix (the level is added by the
client) and `mName` in the list. Example (Ciel):

| level | source (`mText`) | English |
|---|---|---|
| Lv. 1 | シエルの初期パラメータがUP | Ciel: base stats up |
| Lv. 2 | 防御力が100UPする | DEF +100 |
| Lv. 3 | 攻撃力が30UPする | ATK +30 |
| Lv. 4 | ライトボウガン装備時、与ダメージがUP | Light Bowgun: DMG up |
| Lv. 5 | 会心率が2％UPする | Affinity +2％ |

> **The description field is narrow (~44 half-width cells).** The longest
> Japanese line is only ~38 cells, so the first English pass (RES_VER 354, e.g.
> "Damage dealt increases while a Light Bowgun is equipped") got **clipped**.
> RES_VER 355 shortened everything and switched to game-style abbreviations:
> **HP / ATK / DEF / DMG**, elemental lines like `Fire weapon: ATK up`, weapon
> lines like `Great Sword: DMG up`, and `HP, ATK, DEF +15 each`. Longest value
> is now 31 chars. Keep future edits inside ~40 cells.

The same table also holds the generic skills (Health/Attack/Defense/Affinity Up,
the elemental Stances, Evasion, Guard Reduction, Command, and the per-weapon
"Unlock 1/2" skills). 90 rows → **157 unique Japanese strings**.

## Files

- **new** `lavoro-traduzione/partner/partner-skill.json` - flat `{ "jp": "en" }`,
  161 entries (157 strings + the 5 partner names). Used by
  `tools-js/traduci-rsdnt-arc.cjs`.
- **new** helper tools used to find/extract the strings:
  - `tools-js/scan-packs.cjs <regex>` - list pack entries whose internal path matches.
  - `tools-js/extract-entry.cjs <regex> <out>` - pull one entry out of the packs.
  - `tools-js/dump-xfs-strings.cjs <file> [--pairs]` - dump `mName`/`mText` from an XFS table.
- `tools-js/aggiornamenti-risorse.txt` - added `354 cmn/resident.00.fpk`.
- `src/constants/protocol.ts` - `RES_VER` 353 → **354**.

## Pipeline (same as the quest-name translation)

> Re-runs must pull the arc from the **original** pack (e.g.
> `heroic-packs-pristine/android/v0282/stdDL/cmn/resident.00.fpk`), not from the
> live pack: once published, the live arc is already English and the JP→EN
> dictionary no longer matches. Only the `fpk-replace` target is the live pack.

```bash
PACK=src/public/res/download/android/v0282/stdDL/cmn/resident.00.fpk
node tools-js/fpk-pull.cjs  fpk-pull  heroic-packs-pristine/android/v0282/stdDL/cmn/resident.00.fpk build/player.arc rsdnt_player.arc
node tools-js/traduci-rsdnt-arc.cjs build/player.arc \
     lavoro-traduzione/partner/partner-skill.json build/player_en.arc
node tools-js/fpk-replace.cjs "$PACK" build/res.new.fpk rsdnt_player.arc build/player_en.arc
cp build/res.new.fpk "$PACK"
find src/public/res/download/android -name download.list -delete
sg docker -c 'docker compose -f docker-compose.prod.yml up -d --build server'  # regen manifests
sh tools-js/pubblica-risorse.sh 354                                            # diff + auto-backup
# set RES_VER to 354, rebuild, then:
node tools-js/verify-bump.cjs http://127.0.0.1:8081 353 354                    # PASS
```

`traduci-rsdnt-arc.cjs` reported: 185 substitutions, 161/161 dictionary keys
used, 41/41 tables re-read clean. `fpk-replace.cjs`: 17/17 entries byte-identical,
replaced entry matches. `verify-bump`: `d0353_0354` → resident.00.fpk
`crcjam 5d553f28`, 4181336 bytes, **PASS**.

## Backup / rollback

- Pre-change pack saved to `backups/res-0354/` is the **new** bytes (the
  auto-snapshot). A copy of the **old** pack (crcjam `11585fd6`, md5
  `11585fd6bf60b86f2b04de82e463487d`) and the translated arc were kept locally
  during the operation (not shipped).
- To roll back: restore the pre-change pack into
  `src/public/res/download/android/v0282/stdDL/cmn/resident.00.fpk`, delete
  `download.list`, rebuild, and publish a **higher** version (the client only
  moves forward). The dump of the original `partnerSkillParam` is reproducible
  from `heroic-packs-pristine/android/v0282/stdDL/cmn/resident.00.fpk`.

## Notes

- Partner display names used here are the UI ones from `trad/MenuCmn.json`
  (Ciel / Eremia / Lacoris / Valt / Berg). The item names in
  `lavoro-traduzione/quest/oggetti-e-parti.json` spell two of them differently
  (Elemya / Racoris / Berk); align those if you want, but leave the skills as
  above unless the UI names change.
- Literal percent uses the full-width `％` (like the source and other packs) so
  the game's printf-style text engine does not eat `%`.
