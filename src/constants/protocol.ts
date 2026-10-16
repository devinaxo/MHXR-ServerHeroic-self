export const PROTOCOL = {
  // Versione delle risorse. Il gioco la confronta con quella salvata: se e' diversa
  // (meno di 10 di distanza) rilegge download.list e scarica SOLO i pacchetti cambiati,
  // poi salva questa, quindi non riscarica piu'. L'indirizzo usa il numero:
  // /res/download/android/v0283/stdDL/... (v0283 e' un collegamento alla cartella v0282).
  // Storico in tools-js/aggiornamenti-risorse.txt; le cartelle le crea tools-js/pubblica-risorse.sh.
  // 283: menu inglesi (GUI.00.fpk) e resident allineato. 284: nomi delle armi in inglese.
  //
  // 286: GUI.00.fpk rebuilt locally (crcjam bd6f0090) -- see sprites/REPACK.md.
  // Kept at 286 so an existing client at 282 sees a gap of 4 and pulls only the
  // changed pack instead of the whole 2 GB.
  //
  // To ship another change: regenerate download.list (delete it, restart the
  // server), add the version and changed packs to
  // tools-js/aggiornamenti-risorse.txt, run pubblica-risorse.sh <version>, then
  // bump this number and rebuild.
  //
  // 301: prime quest tradotte in inglese. resident.00.fpk -> rsdnt_quest.arc,
  // 13 nomi (tutorial, 2-1..2-8, 2 sonde evento/ticket).
  // 302: sonde accorciate. Il campo del titolo e' largo ~26 mezzi-caratteri (il
  // giapponese 【上級・被ダメ減少】氷砕竜 = 13 glifi interi): il titolo inglese
  // deve stare entro 25 caratteri o il client taglia la coda.
  // 303: sonda a DUE RIGHE per il modificatore. Il prefisso porta difficolta'
  // E modificatore (被ダメ減少 = danni subiti ridotti), che non compare altrove:
  // "[Adv. - DMG Taken]\nJade Barroth". L'evento usa gia' \n. In prova anche la
  // forma compatta a una riga "[Extreme DMG-] Jade Barroth".
  // 304: inizio della traduzione vera delle quest. Isola 1 (マラクジャ島), 33 nomi
  // oltre alle sonde. Tabella mostri in lavoro-traduzione/quest/mostri.json
  // (168 voci, verificate sulla wiki MH). Titoli inglesi entro 25 caratteri.
  // 305: traduzione completa del set storia (1999 nomi) + addestramento, score,
  // eterno, evento e ticket. lavoro-traduzione/quest/quest-nomi.json = 3686 voci.
  // Le voci troppo lunghe per il campo da 25 caratteri restano in giapponese.
  // 306: tutti i 4173 nomi distinti hanno una voce (4182). Le righe oltre 25
  // caratteri ora vengono comunque servite in inglese (possono tagliarsi): meglio
  // inglese tagliato che giapponese illeggibile. Restano ~780 nomi evento con
  // qualche parola giapponese non traducibile con certezza.
  // 307: ripulite le stringhe dai caratteri che il motore testo del gioco
  // interpreta: '%' (formato printf) rimosso, ★☆ -> *, numeri romani -> ASCII,
  // Ⅰ-Ⅶ, ×. Inoltre il DB e' stato riparato: le quest evento/ticket avevano
  // mBlocks vuoto (errore 10001), popolate con tools-js/fix-blocks.cjs e
  // restore-real-blocks.cjs.
  // 308: RIPRISTINO. Il pacchetto resident torna ai NOMI ORIGINALI (crcjam
  // 5b5cbd6e) per capire se il blocco dopo la quest storia dipende dalla
  // traduzione. Il DB e' tornato com'era prima delle riparazioni mBlocks. Le
  // traduzioni restano in lavoro-traduzione/quest/ (quest-nomi.json, mostri.json)
  // e si riapplicano con traduci-rsdnt-arc.cjs + fpk-replace.cjs.
  // 329: rimettono i NOMI QUEST IN INGLESE sul set corrente (329), applicati
  // sopra il resident.00.fpk vivo invece che sul vecchio backup. Dizionario
  // lavoro-traduzione/quest/quest-nomi.json (4182 voci). Il pacchetto originale
  // era 05e4c98b, questo e' 6b9f58b6.
  // 330: tradotti anche i SOTTO-OBIETTIVI delle quest (subTargetList.mContent,
  // 106 voci: armi, elementi, rottura parti, tempo, vita). Stesso dizionario,
  // +121 voci.
  // 331: tradotti i NOMI DI OGGETTI/PARTI fuori dalla tabella quest:
  // rsdnt_enemy.arc -> enemy_breakName (47 nomi di parte, es. 喉袋 = Throat Sac)
  // e rsdnt_property.arc -> item_event_point/item_pcoin/item_payment/... (es.
  // 交易ポイント = Trade Points, 狩玉 = Hunter Gems). Dizionario
  // lavoro-traduzione/quest/oggetti-e-parti.json. item_material era gia' inglese.
  // 332: prima ondata del "resto": biglietti (item_limit), nomi spedizioni gatto
  // (nyankenQuest), note tecniche (technicalQuestInfo: HR/armi/elementi), abilita'
  // di campo (field_skill_*) e suggerimenti equipaggiamento (equip_hint). 858
  // voci pulite applicate; le ~592 troppo ambigue restano in giapponese.
  // 333: DIALOGHI storia/camp/note-reperto, che stanno in GUI.78-94.fpk (GMD
  // dentro ARC). Primo lotto: la scena campo di PART00001 con il Dr. Hawk
  // (Story_00001_004_01..04) in GUI.81.fpk. Nuovo strumento tools-js/gmd-arc.cjs.
  // 334: stesse scene, righe riavvolte. Il riquadro del dialogo e' ~47 celle per
  // ~3 righe: tenere ogni riga <=40 celle e <=3 righe, o il testo viene tagliato.
  // 335: dialogo isola 1 (PART00001): 19 scene storia/camp (Story_00001_001..006,
  // 099, Story_move_013). Le note-reperto, gli eventi e le altre isole seguono.
  // 336: le 33 note-reperto (isole 1 e 2, note_00001_* e note_00002_*). GUI.81:
  // 52 voci su 100 tradotte.
  // 337: i 7 eventi iniziali (event_9001001..9006002). GUI.81: 59/100.
  // 338: il resto degli eventi (9007..9024, deep): GUI.81 a 74/100. Restano il
  // 9012 (yoga) e il 9015 (tribunale), poi si passa a GUI.82.
  // 339: GUI.82 completo (100/100) + i due eventi finali di GUI.81 (76/100).
  // 340: GUI.83 completo (100/100) — storia/dialoghi + note dell'isola 3 e 4.
  // 341: GUI.84 completo (100/100) — isola 4/5, Valt e le note.
  // 342: GUI.85 completo (100/100) — isola 5/6, Eremia e le note.
  // 343: GUI.86 completo (100/100) — isola 6/7, Yuno e le note.
  // 344: GUI.87 completo (100/100) — isola 7/8, Yuno/Solphine e le note.
  // 345: GUI.88 completo (100/100) — isola 8/9/10, Yuno/Solphine e le note.
  // 346: GUI.89 completo (100/100) — isola 9/10, Yuno/Solphine e le note.
  // 347: GUI.90 completo (100/100) — isola 10/11, Labrau e le note.
  // 348: GUI.91 completo (100/100) — isola 11, Isilruta/Urus e le note.
  // 354: testi delle ABILITA' DEI PARTNER (resident.00.fpk :: rsdnt_player.arc
  // -> tuning/xml/partner/partnerSkillParam). 90 voci (mName + mText), 157
  // stringhe tradotte con lavoro-traduzione/partner/partner-skill.json (es.
  // "シエルの初期パラメータがUP" -> "Ciel's base parameters increase",
  // "会心率が2％UPする" -> "Affinity increases by 2％"). Terminologia coerente
  // con SkillStatusName/quest-nomi. Solo stringhe, nessuna texture.
  // 355: le descrizioni venivano TAGLIATE (il campo regge ~44 celle) e lettura
  // piu' "da gioco": ATK/DEF/HP/DMG. Es. "Light Bowgun: DMG up" (era "Damage
  // dealt increases while a Light Bowgun is equipped"), "Fire weapon: ATK up",
  // "HP, ATK, DEF +15 each". Stesso dizionario, testi piu' corti (max 31 char).
  // 361: testi delle ABILITA' DEL CACCATORE (resident.00.fpk). In rsdnt_player.arc:
  // kariwazaParam (nomi arti marziali), equipSkillParam.mSkillListTextList
  // (etichette abilita', mListText + mFilterFindName), playerBulletParam (tipi
  // di proiettile) e pipeMelodyParam (melodie). In rsdnt_equip.arc: higi_param
  // (arti segrete). Nomi/etichette su UNA riga (<=32 celle: il box taglia).
  // 362: descrizioni delle ABILITA' (GUI.00.fpk :: GUI_msg.arc, GMD SkillText).
  // 1568 testi inglesi rimandati a capo (<=52 celle/riga) come gli originali
  // giapponesi: senza ritorni a capo il box rimpiccioliva il testo fino a
  // renderlo illeggibile. Fix anche in build-msg-arc.cjs: l'archivio va
  // allineato a 8 byte prima della cifratura, altrimenti l'ultimo byte si
  // corrompeva quando la lunghezza non era multipla di 4.
  // 363: nomi degli OMANORI (talismani) - rsdnt_equip.arc :: omamori_series
  // (mOmamoriName, 2.465 nomi) + omamori_trigger (mTriggerText). Erano tutti
  // in giapponese. Nomi su una riga (max 46 celle).
  // 367: testi delle quest evento (collab).
  // 368: rimesse le 7 texture "rotte" dopo il fix del campo FPK +0x48; vedi
  // docs/TEXTURE-CRASH-FPK-SIZE.md.
  // 369: ultime due texture escluse (menu_Town01, menu_hunterinfo sugli archivi
  // otomo / casa dei Palico).
  RES_VER: 369,
  BANNER_VER: 91, // If set to 0 /api/banner/dllist/get is not called; incremental update trigger
  APP_VER: '09.03.06',
  BLOCK_SEQ: 0, // Possibly need to increment for cycling encryption (client ignores if 0)
} as const;
