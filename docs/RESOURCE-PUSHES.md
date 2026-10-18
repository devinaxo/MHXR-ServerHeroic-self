# Resource push log

Every published client-resource version (`RES_VER`), what changed, and why.
The machine-readable history the publisher reads is
`tools-js/aggiornamenti-risorse.txt`; the per-version byte backups are in
`backups/res-<ver>/`. This file is the human-readable ledger.

**Before publishing:** back up the packs you are about to change, then run
`tools-js/pubblica-risorse.sh <ver>` (it auto-snapshots into `backups/`). See
`docs/RESOURCES-ROLLBACK.md`.

**Always run `node tools-js/fpk-check.cjs <pack.fpk>` on the rebuilt pack before
publishing.** It fails if an entry's `+0x44` size disagrees with the size encoded
in `+0x48` - the exact corruption behind the texture-screen crashes. See
`docs/TEXTURE-CRASH-FPK-SIZE.md`.

Conventions:
- The client only moves **forward** one version at a time; a rollback is
  published as a **new, higher** version that re-serves the old bytes.
- `RES_VER` lives in `src/constants/protocol.ts`; the history in
  `tools-js/aggiornamenti-risorse.txt` drives the `dXXXX_YYYY` diff folders.
- CRC is `crcjam` (table CRC-32, no final inversion) - `python3 tools-js/crcjam.py <file>`.

| Ver | Packs | What | CRC / notes |
|---|---|---|---|
| 283 | GUI.00, resident | English menus; resident aligned | |
| 284 | resident | English weapon names | |
| 285 | GUI.00 | In-hunt pause menu (Quest messages) | |
| 286 | GUI.00 | Rebuilt via arc-edit/fpk-replace; self-host fork | bd6f0090 |
| 287 | GUI.00 | Header/footer menus (GROUP/CHAT/TOP/…/MESSAGES) | f93dc921 |
| 288 | GUI.00 | MenuCmn hand edits + 6 drift fixes | 7f2f0c5b |
| 289 | GUI.00 | Fix FPK entry `+0x40` padding (`0xCDCDCDCD` → 0) | 9f27265b |
| 290 | GUI.00 | Fix ARC entry `+0x40` tag + `+0x48` flag | |
| 291 | GUI.00 | 9 textures (T1) | 6177bd9b |
| 292 | GUI.00 | 7 textures, first PVRTC4 lot | 7c4060cd |
| 293 | GUI.00 | Fix PVRTC4 gamma (`-ics lRGB`) | |
| 294 | GUI.00 | Nyan-expedition menu textures | |
| 295 | GUI.00 | 6 menu labels, every copy | |
| 296 | GUI.00 | `arc-edit` 8-byte body alignment fix | 5d846bf9 |
| 297 | GUI.00 | Revert `GUI_home_town.arc` (black screen) | f492bb26 |
| 298 | GUI.00 | Every-copy textures + new `fpk-align.cjs` | ceb11dbf |
| 299 | GUI.00 | 2 labels + server activity ticker string | 4d5fa0b7 |
| 300 | GUI.00 | Bottom nav bar retouch | |
| 301 | resident | Quest-name translation PoC (island 1 + probes) | 5b5cbd6e→… |
| 302 | resident | Shorter probes (title field ~25 chars) | |
| 303 | resident | Two-line modifier probe | |
| 304 | resident | Island-1 quest names (33) | |
| 305 | resident | Full story set (1999) + training/score/eternal/event/ticket | |
| 306 | resident | All 4,173 quest names have an entry (long ones clip) | |
| 307 | resident | Strip `%`/`★`/roman numerals; mBlocks repair | |
| 308 | resident | **Revert** to original names (5b5cbd6e) - isolate post-quest hang | 5b5cbd6e |
| 309 | resident | Align resident arcs (reverted; crashed) | 27d69699 |
| 310 | resident | FPK `+0x40` zeroed (also reverted) | a3fce6d9 |
| 311 | resident | Restore exactly 308 (client needs original layout) | 5b5cbd6e |
| 312 | GUI.00 | Restore 3 broken textures to Japanese | b7a9f7a0→275b8148 |
| 313 | GUI.00 | Re-restore those 3 as of 311 | b7a9f7a0 |
| 314 | GUI.00 | Keep crash-prone screens Japanese | |
| 315-324 | - | **Skipped.** Whole set re-downloaded clean from Heroic's server | |
| 325 | resident | Full set swap (jump 314→325; client re-downloads all) | |
| 326 | GUI.00 | 19 textures on the clean Heroic set | |
| 327 | GUI.00 | All 26 textures (incl. town/results/nyan) | 476e66ec |
| 328 | GUI.00 | **Rollback** to the 19 of 326 (those 3 broke) | 476e66ec |
| 329 | resident | English quest names restored on the live set | 6b9f58b6 |
| 330 | resident | Quest sub-targets (`subTargetList`) | |
| 331 | resident | Item/part names (`enemy_breakName`, `item_event_point/pcoin/payment`, …) | |
| 332 | resident | Tickets, cat-expedition names, tech notes, field skills, equip hints | |
| 333 | GUI.81 | First dialogue batch (Dr. Hawk camp scene) | |
| 334 | GUI.81 | Same scenes, rewrapped to the dialogue box | |
| 335 | GUI.81 | 19 island-1 story/camp scenes | def3757f |
| 336 | GUI.81 | 33 relic notes (islands 1-2) | ea24c942 |
| 337 | GUI.81 | 7 event scenes (`event_9001001`-`9006002`) | 4d262815 |
| 338 | GUI.81 | Remaining events (`9007…9024`, `deep_*`) - GUI.81 at 74/100 | |
| 339 | GUI.81 + GUI.82 | Two final GUI.81 events (`9012`, `9015`) → 76/100; **GUI.82 100/100** | b8b99a99 |
| 340 | GUI.83 | **GUI.83 100/100** - island-3/4 story + relic notes | 2c69bbe0 |
| 341 | GUI.84 | **GUI.84 100/100** - island-4/5 story (Valt arc) + relic notes | 776ca4f7 |
| 342 | GUI.85 | **GUI.85 100/100** - island-5/6 story (Eremia arc) + relic notes | a409ea7b |
| 343 | GUI.86 | **GUI.86 100/100** - island-6/7 story (Yuno arc) + relic notes | 4f5c07bb |
| 344 | GUI.87 | **GUI.87 100/100** - island-7/8 story (Yuno/Solphine) + relic notes | |
| 345 | GUI.88 | **GUI.88 100/100** - island-8/9 story (Yuno/Solphine) + relic notes | |
| 346 | GUI.89 | **GUI.89 100/100** - island-9/10 story (Yuno/Solphine) + relic notes | |
| 347 | GUI.90 | **GUI.90 100/100** - island-10/11 story (Volhier/Labrau) + relic notes | |
| 348 | GUI.91 | **GUI.91 100/100** - island-11 story (Isilruta/Urus) + relic notes | |
| 349 | GUI.91 | **Retroactive width fix** - same dialogue, every line re-wrapped to ≤48 cells (was up to 75), ≤3 lines | 16f6050f |
| 350 | GUI.92 | **GUI.92 100/100** - island-12 story (Sebekuru/observation deck) + 60 relic-note files, all auto-wrapped ≤48 / ≤3 lines | 933aa9cb |
| 351 | GUI.93 | **GUI.93 100/100** - Gagateto Island arc (Great Apippos, Nef·Galmud named) + Tabradin Island (giant crystal, seal stones) + 60 relic notes, auto-wrapped ≤48 / ≤3 lines | ba67666c |
| 352 | GUI.94 | **GUI.94 9/9** - resolution: the crystal-generator device, the dummy seal stone, the crystal's collapse, and the epilogue (Kailasa's farewell, the trip to Shambal) | 35272c45 |
| 353 | GUI.80 | **GUI.80 56/56** - event/collab dialogue (Elder Dragons, clash battles, Felyne/festival events, Academy/Valentine/etc.). **All dialogue packs GUI.78-94 now done** | f61ac844 |
| 354 | resident | Partner (mercenary) skill names + descriptions (`rsdnt_player.arc` → `partner/partnerSkillParam`) | |
| 355 | resident | Same dictionary, partner skill descriptions shortened to fit the ~44-cell field | |
| 356 | GUI.00 | Rebuilt texture pack from the clean Heroic baseline (19 textures, excludes the `GUI_otomo_detail`/`GUI_otomo_menu` arcs that crashed Palico House) | |
| 357 | resident | **Item/material names**: 2,400 monster-part names (incl. every `Proof`) rewritten from literal epithets to the official monster name (`item_material` in `rsdnt_property.arc`) | 7bef25a7 |
| 358 | resident | ~~Martial-Art names wrapped~~ - **superseded by 359** (the art-name layout does *not* support newlines) | be6c5a5b |
| 359 | resident | **Rollback of 358** - art names restored to a single line | 03cc7c8e |
| 360 | resident | **Long art names shortened** - 865 `kariwazaParam` English names rewritten to fit ≤32 cells (the box clips, no wrapping) | cd90daab |
| 361 | resident | **Hunter skill text** - 486 remaining JP martial-art names (`rsdnt_player.arc → kariwazaParam`), 1,455 skill-list labels (`equipSkillParam.mSkillListTextList`, `mListText` + `mFilterFindName`), 20 bullet types (`playerBulletParam`) and 220 melody strings (`pipeMelodyParam`) all in `rsdnt_player.arc`; 324 secret arts (`rsdnt_equip.arc → higi_param`). Names/labels single-line ≤32 cells | ff914ddf |
| 362 | GUI.00 | **Art descriptions readable** - 1,568 English `SkillText` GMD strings (art-card descriptions) re-wrapped with `\n` to ≤52 cells/line, matching the Japanese originals; without line breaks the box shrank the text to unreadable. Also fixes an 8-byte alignment bug in `build-msg-arc.cjs` that corrupted the last byte of `GUI_msg.arc` whenever its length wasn't a multiple of 4 | 27d8720e |
| 363 | resident | **Charm (omamori/talisman) names** - all **2,465** Japanese `mOmamoriName` strings in `rsdnt_equip.arc → omamori/omamori_series` translated (e.g. `卯月暴征の火宝石【壱】` → `Uzuki Conquest Fire Jewel [I]`), plus the 5 `omamori_trigger` condition strings. Single line, ≤46 cells | a22fda10 |
| 364 | resident | **Crash fix attempt #1** - the rewriter recomputed each XFS classref `size` as `8 + object bytes`; correct for some tables but **wrong for others** (e.g. `weapon/series`), so the crash merely moved (`rHigiParam` → `rWeaponSeries`) | e96d784f |
| 365 | resident | **Crash fix #2 (stabilise)** - `ricostruisci-resident.cjs` recomputes sizes only where the rewriter is provably faithful, and **reverts the other 30 tables to the pristine baseline** so the game boots. Side effect: those tables (art names, skill labels, item names, partner/Palico skills) reverted to the baseline text | dbf94eb6 |
| 366 | resident | **All translations restored, correctly** - `unisci-traduzione.cjs` merges the **pristine** table (structure + original sizes) with the **translated** table (English strings): `size = pristineSize + (string byte delta)`. This is byte-identical when nothing changes (faithful on *every* table, incl. `weapon/series`), and correct when translated. Brings back martial-art names (486), skill labels, item/material names, partner/Palico skills, Secret Arts, charm names - no trimming | 5bbac680 |
| 367 | resident | **Event-quest text** - `rsdnt_quest.arc`: 778 remaining JP quest names in `questData/event` (594) and `questData/ticket` (184) translated (two lines, tag + name; the box wraps), plus 362 `technicalQuestInfo` restriction texts, `field_skill_param`, `equip_hint`, `karidamaPowerUp`, `subTargetList`. **0 JP strings left in the whole arc.** Dict: `quest_all_en.json` | 31bb79de |
| 368 | GUI.00 | **The 7 dropped textures re-applied** (event_parts04, nyanken_parts00 BM+LP4, town_koukan_parts / parts02 / koukanjyo, town_trainingRangeBG) - 20 entries across 13 archives. Root cause of the old crashes was the FPK `+0x48` size field not being recomputed when an archive grew; fixed in `fpk-align`/`fpk-pull`/`fpk-replace`, gate in `fpk-check`. **Confirmed on device: result, Palico House and training screens no longer crash.** See `docs/TEXTURE-CRASH-FPK-SIZE.md` | 8bb60b50 |
| 369 | GUI.00 | Last two textures excluded: `menu_Town01` (equip_detail, home_event_quest, home_town) and `menu_hunterinfo` (GUI_otomo_detail, GUI_otomo_menu, the Palico House). Same FPK `+0x48` fix as 368 | 9edf78c3 |
| 370 | GUI.00 | Retouched textures (14) + 3 new (`map_01`, `map_seaarea_01`, `menu05`) from `feat/english-translation`. Same `+0x48` fix | ae3f3d48 |
| 371 | resident | Shorter **material names** + controlled wrap (`rsdnt_property.arc` :: `item_material`). Canadian style: `Award` not `Proof`, `Fire Silk`, variant/tier abbreviations (`C.Qurupeco`, `S.Rajang`). First test whether `\r\n` really breaks the line. See docs/MATERIAL-NAMES-WRAP.md | ebf99d09 |
| 372 | resident | **CALIBRATION** for the material-name wrap. 8 low-rarity items renamed to test strings (alphabet rulers + `\n` / `\r` / `\r\n` / `<BR>` / VT / spaces) to pin the name-box pixel width and which break codes are honored. Temporary; superseded by 373 | 01c19f51 |
| 373 | resident | The real wrap. The box uses a proportional font and breaks at a fixed pixel width with no word preference, but it **does** honor `\r\n` (372: LF and CRLF break, CR eats a char, `<BR>` and VT do nothing). Every material name wrapped at word boundaries so each line fits ~300 px, lines joined with `\r\n`; 3+ line names left unwrapped. Tool: `lavoro-traduzione/materiali/retranslate-materiali.py`, widths from `GUI_font.arc` | beee8e27 |
| 374 | resident | Wrap the renamed items too (`Thunder Silk++` -> `Thunder\r\nSilk++`); 373 left them unwrapped and the box cut `Thunder Silk+` / `+` | 1d8e2234 |
| 375 | resident | Shorten the rest so nothing needs 3 lines. Monster names drop the tier initial (and, if still too wide, the variant adjectives) so the part stays on line two; other names use template/lexicon abbreviations (`Subj.`, `Rwd.`, `Rgnt.`, `Elxr`, ...), keep the month on moon items and the bracketed variant on collab items. 2 lines is a hard rule; some tier/variant items now share a name and a few exotic event items are heavily abbreviated (known trade-offs) | df83d3f8 |
| 376 | resident | **Palico (otomo) names**: all 53 `mOtomoName` strings in `rsdnt_otomo.arc` :: `OtomoParam` translated (Cacao, Souffle, Waffle, Macarona, Financier, ...). The game has no official English list, so these are romanizations; single line, no textures. Same build also ships the random Palico encounter at the end of island quests (`services/otomoEncounter.ts`, `OTOMO_ENCOUNTER_CHANCE`, default 20 percent). See docs/OTOMO-PALICO.md | 9d50f100 |
