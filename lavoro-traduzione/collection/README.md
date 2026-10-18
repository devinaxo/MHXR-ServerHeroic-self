# Discovery Encyclopedia (item_collection)

The "Discovery Encyclopedia" (発見図鑑) is the collection screen. Each card is
one entry of `item_collection`:

```
resident.00.fpk
└─ /arc_cmn/resident/rsdnt_property.arc
   └─ tuning/xml/item/item_collection
      mDataList.mpArray[].mCollectionName   (card title)
      mDataList.mpArray[].mExplanation      (card body)
```

There are 275 entries, all Japanese on the pristine packs. The English names
follow the story/camp dialogue (`GUI.78`-`GUI.94`) and `lavoro-traduzione/trad/
Monster.json`: Jaggi, Jagginos, Great Jaggi, Baggi, Wroggi, Bnahabra, Bullfango,
Delex, Apypos, Rathian.

## Files

| File | What |
| --- | --- |
| `dati-1.cjs` ... `dati-5.cjs` | The translations, keyed by the Japanese `mCollectionName`, split into five reviewable chunks. |
| `genera-collezione.cjs` | Merges the chunks, checks every entry is covered and every line fits, and writes the flat dictionary. |
| `collezione.json` | The flat `{ "japanese": "english" }` dictionary (550 entries: 275 names + 275 bodies). |

The detail panel is about seven lines. `genera-collezione.cjs` refuses a line
over 44 characters, a body over seven lines, or a name over 30 characters, so a
translation cannot be clipped by the client.

## Regenerate the dictionary

```bash
# pull the property arc out of the live resident pack and extract item_collection
node tools-js/fpk-pull.cjs fpk-pull \
  src/public/res/download/android/v0282/stdDL/cmn/resident.00.fpk \
  build/collection/rsdnt_property.arc rsdnt_property.arc
node tools-js/arc-extract.cjs build/collection/rsdnt_property.arc \
  build/collection/ext --filter=item_collection
# build lavoro-traduzione/collection/collezione.json
node lavoro-traduzione/collection/genera-collezione.cjs
```

Edit the `dati-*.cjs` chunks, not `collezione.json`: they are the source of
truth and the checks run on every build.

## Apply to the pack

`traduci-rsdnt-arc.cjs` substitutes every dictionary key it finds and leaves the
rest byte-identical. Only `item_collection` changes.

```bash
node tools-js/traduci-rsdnt-arc.cjs \
  build/collection/rsdnt_property.arc lavoro-traduzione/collection/collezione.json \
  build/collection/rsdnt_property-en.arc
node tools-js/fpk-replace.cjs \
  src/public/res/download/android/v0282/stdDL/cmn/resident.00.fpk \
  build/collection/resident.00.fpk rsdnt_property.arc build/collection/rsdnt_property-en.arc
```

Expected: `sostituzioni applicate: 550 | chiavi del dizionario usate: 550/550`
and 46/46 XFS tables re-read clean. Install the pack as part of a publish, with
the usual `RES_VER` bump and a note in `src/constants/protocol.ts`.
