# Island notes (map) translation

The note the client shows on an island (the title and the two paragraphs
before / after exploring it) is client data, not GUI text:

```
resident.00.fpk
└─ /arc_cmn/resident/rsdnt_map.arc
   └─ tuning/xml/ocean/part/part_info
      mDataList.mpArray[].mPartName
      mDataList.mpArray[].mDescBefore
      mDataList.mpArray[].mDescAfter
```

All 18 islands live there, still in Japanese on the pristine packs. The
English used here matches the names already chosen in the story/camp dialogue
(`GUI.78`-`GUI.94`), so the map and the story agree: Marakuja, Rambai, Feijoa,
Cupuacu, Canistel, Pitanga, Tripuu, Pupunha, Belen, Chiricheri, Sowaal,
Volhier, Labrau, Isilruta, Urus, Sebekuru, Gagateto, Tabradin.

## Files

| File | What |
| --- | --- |
| `genera-isole.cjs` | Pairs the Japanese `part_info` fields with the English translation and writes the flat dictionary. Also checks line width. |
| `isole.json` | The flat `{ "japanese": "english" }` dictionary (54 entries: 18 names + 36 descriptions). |

The note panel is about four lines high. `genera-isole.cjs` refuses a line
over 44 characters or a description over four lines, so a long translation can
not be clipped by the client.

## Regenerate the dictionary

From the repository root:

```bash
# pull the map arc out of the live resident pack and extract part_info
node tools-js/fpk-pull.cjs fpk-pull \
  src/public/res/download/android/v0282/stdDL/cmn/resident.00.fpk \
  build/map/rsdnt_map.arc rsdnt_map.arc
node tools-js/arc-extract.cjs build/map/rsdnt_map.arc build/map/ext --filter=part_info
# build lavoro-traduzione/map/isole.json
node lavoro-traduzione/map/genera-isole.cjs
```

Edit the `ISOLE` table in `genera-isole.cjs`, not `isole.json` directly: the
script is the source of truth and re-checks the widths on every run.

## Apply to the pack (not published here)

`traduci-rsdnt-arc.cjs` substitutes every dictionary key it finds and leaves
the rest byte-identical. Only `part_info` changes.

```bash
node tools-js/traduci-rsdnt-arc.cjs \
  build/map/rsdnt_map.arc lavoro-traduzione/map/isole.json build/map/rsdnt_map-en.arc
node tools-js/fpk-replace.cjs \
  src/public/res/download/android/v0282/stdDL/cmn/resident.00.fpk \
  build/map/resident.00.fpk rsdnt_map.arc build/map/rsdnt_map-en.arc
```

Expected: `sostituzioni applicate: 54 | chiavi del dizionario usate: 54/54`
and 9/9 XFS tables re-read clean. Install `build/map/resident.00.fpk` over the
live pack only as part of a publish, with the usual `RES_VER` bump and a note
in `src/constants/protocol.ts`.
