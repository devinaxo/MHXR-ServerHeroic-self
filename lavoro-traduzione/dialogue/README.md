# Dialogue name coherence (GUI.78-94)

The story/camp/relic dialogue lives in the `GUI.78`-`GUI.94` packs, one GMD per
scene (see `docs/DIALOGUE-TRANSLATION.md`). The translations were applied
straight into those packs, so there is no dictionary in the repo to re-edit;
this folder holds the reusable normalizer instead.

## Files

| File | What |
| --- | --- |
| `normalizza-nomi.json` | The `{ "old": "new" }` proper-noun replacements. |
| `normalizza.cjs` | Extracts a pack's GMD strings, applies the replacements and rewrites only the changed strings. |

## Usage

```bash
node lavoro-traduzione/dialogue/normalizza.cjs <in.fpk> <out.fpk>
```

It reuses `tools-js/gmd-arc.cjs`: entries whose text did not change stay
byte-identical, so the output pack differs from the input only where a
replacement landed. Run it for each `GUI.NN.fpk` and install only the packs
that actually changed.

## Replacements

| from | to | why |
| --- | --- | --- |
| `Devilu` | `Deviloo` | the Dronneko Gang leader and flagship; `Deviloo` is the form used elsewhere |
| `Melynx Gang` | `Dronneko Gang` | the gang's name; `Melynx` alone stays a creature |
| `Dronneko gang` | `Dronneko Gang` | capitalisation |
| `Amenoma` | `Amemona` | the character アメモナ; docs use Amemona |
| `Andora` | `Andra` | Dr. Andra |
| `Vald` | `Valt` | Valt (partner-skill dictionary) |
| `Solfin` | `Solphine` | the shrine maiden |
| `Elisa` | `Eliza` | the protagonist |
| `Apippos`, `Apipos` | `Apypos` | the `Monster.json` / quest-data spelling |

These cover the speakers' names (the `Story_Character_Name` table in GUI.78)
and the text. Add a new pair to `normalizza-nomi.json` and re-run to fix more;
keep the list small and reviewed so it does not damage intentional wordplay.

## Jaggi family

`Jaggi` / `Jaggia` / `Great Jaggi` is the hierarchy. There is no `Jagginos`;
the dialogue already used `Jaggia`, and `Monster.json` plus the encyclopedia
were aligned to it in res 380.
