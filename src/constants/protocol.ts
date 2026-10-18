export const PROTOCOL = {
  /*
   * Resource version. The game compares it with the stored one: if it differs
   * (by less than 10) it re-reads download.list and downloads ONLY the changed
   * packs, then saves this one, so it does not download again. The path uses the
   * number: /res/download/android/v0283/stdDL/... (v0283 is a link to the v0282
   * folder). History in tools-js/aggiornamenti-risorse.txt; the folders are
   * created by tools-js/pubblica-risorse.sh.
   * 283: English menus (GUI.00.fpk) and resident aligned. 284: English weapon names.
   *
   * 286: GUI.00.fpk rebuilt locally (crcjam bd6f0090), see sprites/REPACK.md.
   * Kept at 286 so an existing client at 282 sees a gap of 4 and pulls only the
   * changed pack instead of the whole 2 GB.
   *
   * To ship another change: regenerate download.list (delete it, restart the
   * server), add the version and changed packs to
   * tools-js/aggiornamenti-risorse.txt, run pubblica-risorse.sh <version>, then
   * bump this number and rebuild.
   *
   * 301: first quest names translated to English. resident.00.fpk -> rsdnt_quest.arc,
   * 13 names (tutorial, 2-1..2-8, 2 event/ticket probes).
   * 302: shorter probes. The title field is about 26 half-width cells wide (the
   * Japanese 【上級・被ダメ減少】氷砕竜 = 13 full glyphs): the English title must
   * fit within 25 characters or the client clips the tail.
   * 303: TWO-LINE probe for the modifier. The prefix carries the difficulty
   * AND the modifier (被ダメ減少 = reduced damage taken), which does not appear
   * elsewhere: "[Adv. - DMG Taken]\nJade Barroth". The event already uses \n.
   * Also tested the compact one-line form "[Extreme DMG-] Jade Barroth".
   * 304: start of the real quest translation. Island 1 (マラクジャ島), 33 names
   * plus the probes. Monster table in lavoro-traduzione/quest/mostri.json
   * (168 entries, checked against the MH wiki). English titles within 25 chars.
   * 305: full story set translation (1999 names) + training, score, eternal,
   * event and ticket. lavoro-traduzione/quest/quest-nomi.json = 3686 entries.
   * Entries too long for the 25-character field stay in Japanese.
   * 306: all 4173 distinct names have an entry (4182). Lines over 25 characters
   * are now served in English anyway (they may clip): clipped English is better
   * than unreadable Japanese. About 780 event names remain with a few Japanese
   * words that could not be translated with confidence.
   * 307: cleaned the strings of characters the game text engine interprets:
   * '%' (printf format) removed, stars -> *, roman numerals -> ASCII, I-VII, x.
   * Also repaired the DB: event/ticket quests had empty mBlocks (error 10001),
   * filled with tools-js/fix-blocks.cjs and restore-real-blocks.cjs.
   * 308: REVERT. The resident pack goes back to the ORIGINAL NAMES (crcjam
   * 5b5cbd6e) to find out whether the post-story-quest hang depends on the
   * translation. The DB went back to how it was before the mBlocks repairs. The
   * translations stay in lavoro-traduzione/quest/ (quest-nomi.json, mostri.json)
   * and are reapplied with traduci-rsdnt-arc.cjs + fpk-replace.cjs.
   * 329: puts the QUEST NAMES BACK IN ENGLISH on the current set (329), applied
   * on the live resident.00.fpk instead of the old backup. Dictionary
   * lavoro-traduzione/quest/quest-nomi.json (4182 entries). The original pack
   * was 05e4c98b, this one is 6b9f58b6.
   * 330: also translated the quest SUB-TARGETS (subTargetList.mContent, 106
   * entries: weapons, elements, part breaks, time, health). Same dictionary,
   * +121 entries.
   * 331: translated the ITEM/PART NAMES outside the quest table:
   * rsdnt_enemy.arc -> enemy_breakName (47 part names, e.g. 喉袋 = Throat Sac)
   * and rsdnt_property.arc -> item_event_point/item_pcoin/item_payment/... (e.g.
   * 交易ポイント = Trade Points, 狩玉 = Hunter Gems). Dictionary
   * lavoro-traduzione/quest/oggetti-e-parti.json. item_material was already English.
   * 332: first wave of "the rest": tickets (item_limit), Palico expedition names
   * (nyankenQuest), technical notes (technicalQuestInfo: HR/weapons/elements),
   * field skills (field_skill_*) and equipment hints (equip_hint). 858 clean
   * entries applied; the ~592 too ambiguous stay in Japanese.
   * 333: STORY/camp dialogue and relic notes, which live in GUI.78-94.fpk (GMD
   * inside ARC). First batch: the camp scene of PART00001 with Dr. Hawk
   * (Story_00001_004_01..04) in GUI.81.fpk. New tool tools-js/gmd-arc.cjs.
   * 334: same scenes, rewrapped lines. The dialogue box is about 47 cells for
   * about 3 lines: keep each line <=40 cells and <=3 lines, or the text is clipped.
   * 335: island 1 dialogue (PART00001): 19 story/camp scenes (Story_00001_001..006,
   * 099, Story_move_013). The relic notes, the events and the other islands follow.
   * 336: the 33 relic notes (islands 1 and 2, note_00001_* and note_00002_*).
   * GUI.81: 52 of 100 entries translated.
   * 337: the first 7 events (event_9001001..9006002). GUI.81: 59/100.
   * 338: the rest of the events (9007..9024, deep): GUI.81 at 74/100. The 9012
   * (yoga) and 9015 (tribunal) remain, then we move to GUI.82.
   * 339: GUI.82 complete (100/100) + the two final events of GUI.81 (76/100).
   * 340: GUI.83 complete (100/100), story/dialogue + notes from islands 3 and 4.
   * 341: GUI.84 complete (100/100), islands 4/5, Valt and the notes.
   * 342: GUI.85 complete (100/100), islands 5/6, Eremia and the notes.
   * 343: GUI.86 complete (100/100), islands 6/7, Yuno and the notes.
   * 344: GUI.87 complete (100/100), islands 7/8, Yuno/Solphine and the notes.
   * 345: GUI.88 complete (100/100), islands 8/9/10, Yuno/Solphine and the notes.
   * 346: GUI.89 complete (100/100), islands 9/10, Yuno/Solphine and the notes.
   * 347: GUI.90 complete (100/100), islands 10/11, Labrau and the notes.
   * 348: GUI.91 complete (100/100), island 11, Isilruta/Urus and the notes.
   * 354: PARTNER SKILL texts (resident.00.fpk :: rsdnt_player.arc ->
   * tuning/xml/partner/partnerSkillParam). 90 entries (mName + mText), 157
   * strings translated with lavoro-traduzione/partner/partner-skill.json (e.g.
   * "シエルの初期パラメータがUP" -> "Ciel's base parameters increase",
   * "会心率が2％UPする" -> "Affinity increases by 2％"). Terminology consistent
   * with SkillStatusName/quest-nomi. Strings only, no textures.
   * 355: the descriptions were CLIPPED (the field holds about 44 cells) and read
   * more like a game: ATK/DEF/HP/DMG. E.g. "Light Bowgun: DMG up" (was "Damage
   * dealt increases while a Light Bowgun is equipped"), "Fire weapon: ATK up",
   * "HP, ATK, DEF +15 each". Same dictionary, shorter texts (max 31 chars).
   * 361: HUNTER SKILL texts (resident.00.fpk). In rsdnt_player.arc:
   * kariwazaParam (martial art names), equipSkillParam.mSkillListTextList
   * (skill labels, mListText + mFilterFindName), playerBulletParam (bullet
   * types) and pipeMelodyParam (melodies). In rsdnt_equip.arc: higi_param
   * (secret arts). Names/labels on ONE line (<=32 cells: the box clips).
   * 362: SKILL descriptions (GUI.00.fpk :: GUI_msg.arc, GMD SkillText). 1568
   * English texts rewrapped (<=52 cells/line) like the Japanese originals:
   * without line breaks the box shrank the text until it was unreadable. Also
   * fixed in build-msg-arc.cjs: the archive must be aligned to 8 bytes before
   * encryption, otherwise the last byte got corrupted when the length was not a
   * multiple of 4.
   * 363: OMANORI (charm) names, rsdnt_equip.arc :: omamori_series (mOmamoriName,
   * 2465 names) + omamori_trigger (mTriggerText). They were all in Japanese.
   * Names on one line (max 46 cells).
   * 367: event quest texts (collab).
   * 368: put back the 7 "broken" textures after the FPK +0x48 field fix, see
   * docs/TEXTURE-CRASH-FPK-SIZE.md.
   * 369: last two textures excluded (menu_Town01, menu_hunterinfo on the otomo
   * archives / Palico house).
   * 370: retouched textures (14) + new ones (map_01, map_seaarea_01, menu05) from
   * feat/english-translation. Same +0x48 fix.
   * 371: shorter material names + controlled wrap (resident.00.fpk ::
   * rsdnt_property.arc :: item_material). Canadian style: Award not Proof, Fire
   * Silk, variant/tier abbreviations (C.Qurupeco, S.Rajang). See
   * docs/MATERIAL-NAMES-WRAP.md. TEST: check whether \r\n really breaks the line.
   * 372: CALIBRATION for the material-name wrap. 8 low-rarity items renamed to
   * test strings (alphabet rulers + \n / \r / \r\n / <BR> / VT / spaces) to pin
   * the name box pixel width and see if any break code is honored. Temporary.
   * 373: the real wrap. The box draws with a proportional font and breaks at a
   * fixed pixel width with no word preference, but it DOES honor \r\n (calib
   * 372: LF and CRLF break, CR eats a char, <BR> and VT do nothing). So every
   * material name is wrapped at WORD boundaries so each line fits ~300 px, and
   * the lines are joined with \r\n. Names that would need 3+ lines are left
   * unwrapped (forcing 3 would clip). Tool: lavoro-traduzione/materiali/
   * retranslate-materiali.py, widths from GUI_font.arc. Fixes "Blue Mushroom"
   * -> "Blue\r\nMushroom", "Flame Tree Sap" -> "Flame Tree\r\nSap", etc.
   * 374: wrap the renamed items too (Thunder Silk++ -> "Thunder\r\nSilk++");
   * 373 left them unwrapped and the box cut "Thunder Silk+" / "+".
   * 375: shorten the rest so nothing needs 3 lines. Monster names drop the tier
   * initial (and, if still too wide, the variant adjectives) so the part stays on
   * line two. Other names use template/lexicon abbreviations (Subj., Rwd., Rgnt.,
   * Elxr, ...), keep the month on moon items, keep the bracketed variant on
   * collab items, and compress the last words until the two lines fit. 2 lines
   * is a hard rule. Some tier/variant items of a monster now share a name and a
   * few exotic event items are heavily abbreviated; known trade-offs.
   * 376: PALICO (otomo) names. resident.00.fpk :: rsdnt_otomo.arc ::
   * tuning/xml/otomo/OtomoParam, field mOtomoName: all 53 names translated with
   * lavoro-traduzione/otomo/otomo-nomi.json (Cacao, Souffle, Waffle, Macarona,
   * Financier, ...). The game has no official English list, so these are
   * romanizations. Single line, short names; no textures. The same build also
   * ships the server-side random Palico encounter at the end of island quests
   * (services/otomoEncounter.ts, OTOMO_ENCOUNTER_CHANCE, default 20 percent).
   * See docs/OTOMO-PALICO.md.
   * 377: menu label short forms (GUI.00.fpk :: GUI_msg.arc) + the island map
   * notes (resident.00.fpk :: rsdnt_map.arc :: part_info). GUI: 29 strings
   * shortened so narrow boxes stop clipping: Friends, Partner's Pub, Vault,
   * Training, Market, Upg. / Details, Equip.Encyc., Disc.Encyc., Exp.Log,
   * Status, Rate: Low/Medium/High, Unclaimed, Hunter G., Layered, "equip. icon",
   * "The meowxpedition is back!", "Please check the results!", and one nyan
   * button now reads "Receive". Full before/after list in docs/STRING-EDITS.md.
   * Map: all 18 islands (mPartName/mDescBefore/mDescAfter) translated with
   * lavoro-traduzione/map/isole.json, names matching the GUI.78-94 dialogue;
   * see lavoro-traduzione/map/README.md. No textures.
   * 378: corrections + the Discovery Encyclopedia. GUI.00.fpk: the nyan popup
   * button is the one now reading "Receive" (405); 409 stays "Receive Reward"
   * (it was the top-bar label). The Town tab label is MenuCmn 295 "Friends"
   * (the 149 count label stays "Hunting Friends"). resident.00.fpk ::
   * rsdnt_property.arc :: item_collection - all 275 Discovery Encyclopedia
   * entries translated (mCollectionName + mExplanation) with
   * lavoro-traduzione/collection/collezione.json (550 strings); names follow the
   * GUI.78-94 dialogue and Monster.json (Jaggi, Jagginos, Delex, Apypos, ...).
   * See docs/STRING-EDITS.md and lavoro-traduzione/collection/README.md.
   */
  RES_VER: 378,
  BANNER_VER: 91, // If set to 0 /api/banner/dllist/get is not called; incremental update trigger
  APP_VER: '09.03.06',
  BLOCK_SEQ: 0, // Possibly need to increment for cycling encryption (client ignores if 0)
} as const;
