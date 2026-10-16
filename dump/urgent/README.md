# Urgent — the home-screen art

The four atlases holding the main-screen elements you asked about.
`tex/` is the pristine texture (never edit), `png/` is what you paint.

| file | format | size | contains |
|---|---|---|---|
| `menu_home_parts01_BM_NOMIP_jpn` | PVRTC4 | 1024×1024 | **the old ship wheels** — bare, `クエストへ`, `イベント`, plus the `ショップ` banner, `抜刀`/`納刀` badges, `狩猣銀 カ monopole` logo |
| `menu_HeaderFooter_BM_NOMIP_jpn` | PVRTC4 | 1024×1024 | **bottom bar artwork** — MENU button, girls, 4-way nav pad, and the green `あなたの評価をお待ちしています♪` |
| `event_parts04_LP4_NOMIP_jpn` | RGBA4 | 1024×1024 | **the compass** `探検ナビ` (top-right) + the **hunting-party banner** `豪華な報酬を手に入れるために狩猟団に加入しよう！ をタップして加入` (top-centre) + an empty green banner (mid-left) |
| `menu_EquipMenu03_LP4_NOMIP_jpn` | RGBA4 | 512×512 | the compass again, in the equip-screen copy |

## Status

**RGBA4 files can be edited and shipped today.** They use the same loop as
everything else in `dump/restore-now`:

```bash
OUT=dump/urgent
python3 tools-js/tex_clean_remainders.py $OUT/tex/<name>.tex $OUT/png/<name>.png
python3 tools-js/tex_android.py encode $OUT/tex/<name>.tex $OUT/png/<name>.png $OUT/png/<name>.new.tex
```

**The two PVRTC4 files are blocked.** They decode correctly (verified byte-identical
against RevilToolset) but cannot be re-encoded yet — see below.

## PVRTC4 status

Block layout is now confirmed: 8 bytes per 4×4 block, 16 texels × 2-bit weights
in bytes 0–3, `colour0` in bytes 4–5, `colour1` in bytes 6–7.

Still unresolved, and the reason this is not finished:

- `colour0` is not symmetric with `colour1`. Bit-sweeping a synthetic block shows
  `colour1` bit0→16, bit1→33, bit2→66, bit3→140, while `colour0` shifts by one bit
  (bit0→no change, bit1→33, bit2→74, bit3→148). That asymmetry is PVRTC's
  punch-through-alpha flag, and getting it wrong means the game renders garbage.
- The 4-bit→8-bit channel expansion is non-linear (1→16, 2→33, 4→66, 8→140) and
  does not match the usual `(v<<4)|(v>>1)` rule.

Writing an encoder on guesses here risks shipping a texture the client cannot
render. The reference-grade fix is PowerVR's own `pvrtxcompress`
(https://developer.imaginationtech.com → Downloads → Texture ToolKit, free after
an account signup):

```bash
pvrtxcompress -f pvrtex4 -i edited.dds -o out.pvr
# then splice out.pvr into the .tex at pvrVariantOffset (see targets.json)
```

Decoding for the DDS round trip is already working — RevilToolset is installed at
`~/.local/share/revil-toolset`:

```bash
~/.local/share/revil-toolset/revil_toolset mtf_tex_to_dds dump/urgent/tex/<name>.tex
```