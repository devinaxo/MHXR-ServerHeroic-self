# Story / camp / relic dialogue translation

The dialogue the player reads on story, camp and relic screens.

## Where it lives

Not in the packs we translated first. It is **GMD text inside ARCs inside the
`GUI.78–94.fpk` packs**:

```
GUI.NN.fpk
└─ /arc_cmn/GUI/font/story/PART00001/Story_00001_004_03_jpn.arc   (ARCC)
   └─ Story_00001_004_03_jpn                                      (GMD: the lines)
```

Two other GMD homes carry text too, both already handled separately:
- `GUI.00.fpk → GUI_msg.arc` — menus, monsters, skills, quests (done earlier;
  see `docs/STRING-EDITS.md`). `GUI.78/79` are already 0 JP.
- relic **names + short lore** are in `resident.00.fpk → item_collection`
  (done in res 331).

## Tools

`tools-js/gmd-arc.cjs`:

```bash
node tools-js/gmd-arc.cjs list    <pack.fpk>
node tools-js/gmd-arc.cjs extract <pack.fpk> <outdir>     # <entry>.json = [{i,jp,en}]
node tools-js/gmd-arc.cjs apply   <pack.fpk> <dictdir> <out.fpk>
```

`apply` rewrites only entries whose `<dictdir>/<entry>.json` has a non-empty
`en`; everything else is copied from the input pack. Then `fpk-replace`-style
install, manifest regen, `pubblica-risorse.sh`, bump `RES_VER`.

Gotchas already hit (do not regress):
- ARC entry offsets come from the **decrypted** body, not the raw bytes.
- Rebuilt ARC bodies are **padded to 8** before Blowfish, or the tail corrupts.
- `en` must preserve all leading markup (`<STBG>`, `<BGM>`, `<TALK>`, `<NAME>`,
  `<CHAR>`, `<CV>`, `<ITEM>`, `<POP1>`, `<CLS>`, `<MWT>`, `<SLCT>/<CHC>`…).
  A line that is only markup gets an empty `en` and is left untouched.

## The dialogue box (hard constraint)

Measured from the originals: the box is **~47 cells wide and max 3 lines**.
Japanese is full-width (2 cells); English is 1 cell. My translations must keep
**every line ≤ 44 cells and ≤ 3 lines**, or the game wraps and the fixed-height
box cuts the overflow. The translation scripts validate this and print
`LARGO` / `RIGHE` for any violation.

## Conventions

- Character names come from the markup, no need to translate them.
- `≪…≫` are emphasis brackets in-game — keep them.
- Keep the author's tone: Eliza (brash, teasing), Argo (`ニャ/nya` verbal tic),
  Dr. Hawk (warm), Dr. Andra (old-fashioned `…のう`), Sage (rough workman),
  Selene/Ciel (earnest).

## Progress

| Pack | JP strings (orig) | Status |
|---|---|---|
| GUI.78 | 0 | done (already English) |
| GUI.79 | 0 | done |
| GUI.81 | ~1029 | **76/100 files** — only `test_*` stubs left (not player-facing) |
| GUI.82 | 551 | **100/100 files — done** (island-2 story/camp + 62 relic notes) |
| GUI.83 | 564 | **100/100 files — done** (island-3/4 story + 58 relic notes) |
| GUI.84 | 525 | **100/100 files — done** (island-4/5 story + 58 relic notes) |
| GUI.85 | 522 | **100/100 files — done** (island-5/6 story + 54 relic notes) |
| GUI.86 | 604 | **100/100 files — done** (island-6/7 story + 52 relic notes) |
| GUI.87 | 547 | **100/100 files — done** (island-7/8 story + 83 relic notes) |
| GUI.88 | 660 | **100/100 files — done** (island-8/9 story + 64 relic notes) |
| GUI.89 | 584 | **100/100 files — done** (island-9/10 story + 82 relic notes) |
| GUI.90 | 819 | **100/100 files — done** (island-10/11 story + 69 relic notes) |
| GUI.91 | 956 | **100/100 files — done** (island-11 story + 77 relic notes); re-wrapped at res 349 |
| GUI.92 | 1357 | **100/100 files — done** (island-12 story + 60 relic notes) |
| GUI.93 | 1512 | **100/100 files — done** (Gagateto/Tabradin island story + 60 relic notes) |
| GUI.94 | 210 | **9/9 files — done** (resolution: device, crystal collapse, Kailasa's farewell) |
| GUI.80 | 1003 | **56/56 files — done** (event/collab dialogue; 44 files already English) |
| GUI.00 (tutorial GMD) | ~166* | *false positives (`・` bullets), effectively done |

Progress in `GUI.81`: island-1 story/camp (`Story_00001_*`, `Story_move_013`) and
all relic notes (`note_00001_*`, `note_00002_*`) are translated. Remaining:
`event_9001…9024`, `event_deep_*`, and the `test_*` stubs (not player-facing).

## Per-file log

Translated so far, all in `GUI.81.fpk` (published in res 335–339):

- Story/camp: `Story_00001_001_01`, `001_02`, `002_01..04`, `003_01..03`,
  `003_12`, `003_92`, `004_01..04`, `006_01`, `006_02`, `081_01..04`,
  `082_01..04`, `083_01..04`, `084_01..04`, `085_01..04`, `099_01`,
  `Story_move_013_01`
- Relic notes: `note_00001_001..005_*` and `note_00002_001..006_*` (33 files)
- Events: **all** `event_9001xxx`–`event_9024xxx` and `event_deep_*`,
  including `event_9012001` (yoga) and `event_9015001` (court). Only the
  non-player `test_*` stubs remain.

### `GUI.82` — complete (res 339)

Island-2 (`PART00002`) content, 100 files / 551 JP strings:

- Story: `Story_00002_001`, `002`, `003`, `004`, `006`, `081`–`085`, `099`
  (Lumbai Island arrival, the Gobul investigation, the Dronneko Gang and
  Abigail, Dr. Hawk's wildfires, and Berg the dragon-servant's arc).
- Relic notes: `note_00002_007`–`016` (ten field discoveries) and
  `note_00003_001`–`011` (Feijoa treasure, the court of Boromia, and the
  island-3 discovery set).

Choice-screen lines (`<SLCT>/<CHC>` with embedded labels) were written as full
strings so their on-screen options translate too.

### `GUI.83` — complete (res 340)

Island-3/4 (`PART00003/00004`) content, 100 files / 564 JP strings:

- Story: `Story_00003_001`–`004`, `006`, `010`, `081`–`085`, `099` — arrival
  at Feijoa Island, the Dronneko Gang's fish-rain and stolen emblem stone,
  Argo's acorn sommelier, the trickster Lacolis, and the hot-spring segment.
- Relic notes: `note_00003_011`–`017` (Knight Crab, Warpstone, Waking Mask,
  the deep-forest ruin, giant-lake stars, Naughty Bulldrome, Dendenka) and
  `note_00004_001`–`013` (Kupuas treasure, the horned sword, and the island-4
  discovery set).
- Material goals (`Jaggi Bone`, `Gobul Hide`, `Lagiacrus Scale`) rendered so
  they match the source monsters named in the same scene.

### `GUI.84` — complete (res 341)

Island-4/5 (`PART00004/00005`) content, 100 files / 525 JP strings:

- Story: `Story_00004_001`–`004`, `006`, `010`, `081`–`085`, `099` — arrival
  at Kupuas Island, Argo's salmon-fishing caper, the landslide/tornado
  puzzles, and the **Valt** arc (the self-declared disciple, the eating
  championship, the elements lesson), ending with Argo's master-salmon.
- Relic notes: `note_00004_013`–`018` (Primeval Drum, Ice Wall Ruin,
  People-Chasing Spirit, Sea Icicles, Burnt Snowfield, Cold-Shy Baggi) and
  `note_00005_001`–`014` (Canistel treasure, the dragon-eye trial, and the
  island-5 discovery set).
- Monster/material names kept consistent with the quest dictionary
  (`Lagombi`, `Ludroth`, `Jaggi`, `Zwaropos`, `Duramboros`, `Gigginox`).

### `GUI.85` — complete (res 342)

Island-5/6 (`PART00005/00006`) content, 100 files / 522 JP strings:

- Story: `Story_00005_001`–`005`, `007`, `010`, `081`–`085`, `099` — Canistel
  Island, the Delex nest, Hawk's Duramboros flood, the bridge/waterfall
  puzzles, the **Sky-Racing Blaze** wildfire (with Argo's misremembered
  "fireworks"), and the **Eremia** arc (the "mysterious beauty" who joins the
  team as a self-styled big sister and the Mysterious Big-Sister Mask gag).
- Relic notes: `note_00005_015`–`017` (Moonbow, Bnahabra Colony, Toxic Frog)
  and `note_00006_001`–`015` (Pitanga treasure, and the island-6 set:
  Lone Jaggi, Offering Vessel, Wisp-Quelling Figure, Dream Butterfly,
  Ore Shroom, Venom Flower, and the Sky-Racing Blaze itself).

### `GUI.92` — complete (res 350)

Island-12 (`PART00016/00017`) content, 100 files / 1357 JP strings — the
largest pack:

- Story: `Story_00015_002`–`006`, `099` and `Story_00016_001`–`006`, `099` —
  the Urus mountain arc (Gore Magala, native-settlement ruins, Lagiacrus), the
  poisonous-plant mural dig (Nargacuga), the **muddy-village** and
  **observation-deck** arc (Dr. Hawk, Kailasa's 50-year watch, the blue light),
  and the Sebekuru Island crossing (Diablos, Kailasa's collapse, her joining,
  the Eviljho rescue).
- Relic notes: `note_00016_001`–`013` and `note_00017_001`–`007` (60 files) —
  Dr. Hawk / Sharon discoveries (Magnet Beetle, Cactus Stone, Crab Catapult,
  Fairy Grave Mushroom, Wriggle Berry, Mellow Agate, Dye Flower, Luminar River,
  Stinging Stone, Micro-Ripple Mound, Flower-Knot Shackles, Echo Spirit Mask,
  Salt Torso, Flame Lizard, Vacant Shell Mimic, Up-Down Slope) plus the
  Crimson Six-Sided Seal Stone and the explorers' interludes.
- Every line auto-wrapped to ≤48 cells, ≤3 lines (23 entries shortened to fit).

### `GUI.93` — complete (res 351)

Gagateto / Tabradin Island content, 100 files / 1512 JP strings:

- Story: `Story_00017_001`–`007`, `099` and `Story_00018_001`–`005` — the
  Gagateto arrival, the Great Apippos research twist (it follows an unknown
  large monster), Dr. Andra's disappearance and the Brachydios rescue, the
  **naming of the winged monster as Nef·Galmud**, the valley mural/defence-line
  and seal-stone remnant revelations, then Tabradin Island (Eviljho, the giant
  crystal at Tabragara Crater, Nef·Galmud's tail-made crystal masses, Sage's
  supply unit, the cave-ruin device).
- Relic notes: `note_00017_008`–`013` and `note_00018_001`–`014` (60 files) —
  Blob Frog, Jewel Code, Hazard Lizard, Ready-to-Eat Pot, Puff-Puff Drum,
  Wilderness Hellfire Cauldron, Fluff White Mist, Dead-Leaf Swallowtail,
  Healthbringer Stone Powder, Moonlight Gecko, Ruby Puzzle Ring, Signboard
  Fish, Nesting Shell, Spring Stone, Great Spiral Staircase Spring,
  Broken-Fang Beetle, plus the Dark Six-Sided Seal Stone aftermath.
- Auto-wrapped ≤48 / ≤3 lines (18 entries shortened to fit).

### `GUI.94` — complete (res 352)

The story **resolution**, 9 files / 210 JP strings:

- `Story_00018_005`–`006` and `006_12`/`006_92`, `099` — the cave-ruin device
  revealed as a **resonance-crystal *generator*** (built as a 100-arena-wide
  imitation of Nef·Galmud's tail), the **dummy seal stone** made from an empty
  frame + Sea Wyvern Claws, the overdriven device shattering the giant crystal,
  and the **epilogue**: Nef·Galmud slain, Amemona/Ethan assigned to the cave-ruin
  cleanup, and Kailasa's farewell — agreeing to leave a marker at the Sebekuru
  observation deck and inviting Eliza to Shambal to buy it together.

This closes the main story. Only `GUI.80` (event/collab dialogue) remains.

### `GUI.80` — complete (res 353)

The **event / collab dialogue** pack, 56 files / 1003 JP strings (the other 44
files are `Story_Block_88xxxx` menu strings, already English):

- `event_1601xxx` (32 files) — the endgame event series: Elder Dragon
  showdowns (Tempest-Winged Kushala Daora, Sky-Thunder Rider Kirin), the
  Frenzy-Virus Gore Magala and Roaring-Tempest Tigrex guild attacks, the
  sixteen-hunter slayings, the **Sixteen-Hunter Clash Battle** festivals
  (including Tanabata and Summer Love), the Apippos-chieftain gag, and the
  goofy Dr. Hawk "loincloth" event.
- `event_7001xxx`, `event_8001xxx`–`event_8023xxx` (24 files) — the Hunting
  Carnival, the Christmas Rangurotora Holy-Night event, Felyne prank events
  (pumpkin, socks, Daruma), Valentine heart chocolate and Sharon's "lover",
  the hishimochi gag, the Explore Academy arcs (Buncho, Beach School,
  club recruitment), the Madoushi black-dragon teaser, the zombie-serum
  event, and the east-vs-west showdown.

This completes **every dialogue pack in `GUI.78–94`**.

## Continuing

1. `node tools-js/gmd-arc.cjs extract <GUI.NN.fpk> <workdir>`
2. translate the `{i,jp,en}` files; a post-pass **auto-wraps every line at word
   boundaries to ≤48 cells and caps the entry at 3 lines** (entries too long to
   fit are shortened). Earlier packs were hand-kept ≤44; `GUI.91` was
   retroactively re-wrapped at v349.
3. `node tools-js/gmd-arc.cjs apply <GUI.NN.fpk> <workdir> <out.fpk>`
4. install → delete `download.list` → rebuild → `pubblica-risorse.sh <ver>` →
   bump `RES_VER` → rebuild → `verify-bump.cjs`
5. append the pack to `tools-js/aggiornamenti-risorse.txt` and to
   `docs/RESOURCE-PUSHES.md`
