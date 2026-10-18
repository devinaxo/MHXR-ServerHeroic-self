# Material names: shorter names + word wrapping

Two passes, both against `resident.00.fpk -> rsdnt_property.arc -> item_material`.

## 1. Shorter names (RES_VER 371, 374)

Canadian-release conventions:

- Silks: `Flame/Aqua/Earth/Thunder/Frost Spun Thread` -> `Fire/Water/Earth/Thunder/Ice Silk`
  (`+` -> `+`, the "mighty" tier -> `++`). `Pureblood Crystal` -> `Life Crystal`.
- `Proof` -> `Award` (`Rathalos Proof I` -> `Rathalos Award I`).
- Variant + material-tier abbreviation: `Crimson Qurupeco` -> `C.Qurupeco`,
  `Great Jaggi` -> `G.Jaggi`, `Steel Rajang` -> `S.Rajang`,
  `Twin Baleful Gigginox` -> `T.B.Gigginox`.

Dictionary: `tools-js/dizionario-materiali.json` (mirrored to `src/json/materiali.json`).

## 2. Word wrapping (RES_VER 373, 374)

The name box draws with the game's **system font** (`GUI_font.arc ->
GUI/font/font0_high`), which is **proportional** (`i`=9 px, space=17, `m`=41,
`W`=49), and breaks at a **fixed pixel width** with **no word preference**. So a
too-long name cuts a word (`Blue Mushroo` / `m`).

A calibration publish (RES_VER 372) settled the details:

| Test | Result |
| --- | --- |
| `Alpha\nBeta` (LF) | breaks into two lines |
| `Epsilon\r\nZeta` (CRLF) | breaks into two lines |
| `Gamma\rDelta` (CR) | breaks, but eats a character (`elta`) |
| `Eta<BR>Theta` | no break, `<BR>` is stripped |
| `Iota\x0bKappa` (VT) | no break, no break char shown |
| alphabet rulers | box is about **290 to 306 px** wide |

So the box **honors `\r\n`**: we can force clean breaks. Every material name is
now wrapped at **word boundaries** so each line fits about **300 px**, joined with
`\r\n`. Examples: `Blue Mushroom` -> `Blue\r\nMushroom`, `Monster Marrow` ->
`Monster\r\nMarrow`, `Flame Tree Sap` -> `Flame Tree\r\nSap`, `Thunder Silk++` ->
`Thunder\r\nSilk++`.

Names that would need 3 or more lines are left unwrapped, because forcing three
lines would clip (the box shows about two).

## Tools (all in the repo)

- `lavoro-traduzione/materiali/retranslate-materiali.py` (base is `HEAD`, so it
  is re-runnable) plus `build-rename-dict.py` (the `{old_en: new_en}` map the
  pack edit needs) and `build-calibration-dict.py`.
- `lavoro-traduzione/materiali/wrap-detector.py` predicts a name's wrap and
  flags mid-word breaks; `--calibrate` fits the box width.
- `lavoro-traduzione/materiali/build/font/font0_high` glyph advances (from
  `GUI_font.arc`).

## Shortening so nothing needs 3 lines (RES_VER 375)

2 lines is a hard rule, so the names that still did not fit are shortened:

- **Monster names:** drop the material-tier initial (`V.Kushala Daora ...` ->
  `Kushala Daora ...`); if still too wide, drop the variant adjectives so the
  part stays on line two (`Duramboros Carapace`).
- **Other names:** template + lexicon abbreviations (`Subjugation` -> `Subj.`,
  `Special` -> `Sp.`, `Reward` -> `Rwd.`, `Reagent` -> `Rgnt.`, `Elixir` ->
  `Elxr`, `Corroded` -> `Corr.`, `Thunder` -> `Thdr.`, ...), and a generic
  compressor that abbreviates the remaining long words (and bracket contents)
  until the two lines fit.
- **Moon items:** the month is kept, the template becomes `MnSbj Ref/Aug/Subl`.
- **Collab items:** the short series name is kept and the bracketed variant is
  kept on line two (`Supremacy` / `[Heavenly Conquest]`).

Result: all 4875 names are within 2 lines and no bracket is left open.

## Known trade-offs (RES_VER 375)

- 137 names are shared by more than one item, almost all from the tier/variant
  drops (e.g. the six tier variants of `Duramboros Carapace` share one name).
  The item icons distinguish them.
- A few exotic event items are heavily abbreviated (`He. As. Tmp` / `[Dr.]`);
  those want hand-authored names if they matter.

## Tools (all in the repo)

- `lavoro-traduzione/materiali/retranslate-materiali.py` (base is `HEAD`),
  `build-rename-dict.py`, `build-calibration-dict.py`, `wrap-detector.py`, and
  `build/font/font0_high`.

