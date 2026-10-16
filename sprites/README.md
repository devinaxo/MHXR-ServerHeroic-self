# Sprite files extracted from the MHXR client

Extracted 2026-10-07 from the resource packs served by the origin server, so you
can inspect them with third-party tools.

## Layout

```
sprites/
├── GUI_home_top.arc                                  the container (4.6 MB)
└── extracted_GUI/                                    its 41 entries, unpacked
    ├── menu/                                         GUI layout trees
    │   ├── menu_home_000                             160 KB
    │   ├── menu_home_001                             141 KB
    │   └── menu_home_SimaMulti                        38 KB
    └── tex/menu/                                     the artwork
        ├── menu_home_parts00_LP4_NOMIP_jpn           524 KB  <- button labels
        ├── menu_home_parts03_LP4_NOMIP               131 KB  <- button labels
        ├── menu_home_bg00_BM_NOMIP_jpn              1.5 MB
        ├── menu_home_bg01_BM_NOMIP_jpn              1.5 MB
        ├── menu_home_bg02_BM_NOMIP                  1.5 MB
        ├── menu_home_bg07_BM_NOMIP_jpn              1.5 MB
        ├── menu_home_bg08_BM_NOMIP_jpn               393 KB
        ├── menu_home_sea_night_BM_NOMIP              393 KB
        └── menu_home_TankenTecho_BM_NOMIP             98 KB
```

`parts00` and `parts03` are where the Japanese button text lives — `クエストへ`
(To Quest), `交易所場` (Trading Post), and the bottom navigation tabs.

## File formats

Three distinct formats, none of them standard. This is why generic archive
tools will not open them.

### `.arc` — Capcom archive

```
0x00  "ARCC"       magic
0x06  u16          entry count
0x08               80-byte entry table
                    0x00  path, 64 bytes, backslash-separated
                    0x44  u32  compressed size
                    0x4c  u32  offset (minus 8)
                    each body: zlib inflate
```

The entry table is **Blowfish-ECB encrypted** with key `kaseoa nkaeka;eawf3`,
using `PADDING.NULL`, and the whole body has every 4-byte group byte-reversed
before decryption *and* after. That is why the bytes after `ARCC` look like noise.

A manager would need all of: Blowfish ECB, 4-byte word reversal, zlib. Unlikely
to find one.

### `TEX ` — the textures

```
0x00  "TEX "      magic
0x04  u16         always 9
0x06  u16         flags (0x1007 for LP4, 0x040d for BM)
0x08  u16         height
0x0c  u16         width          <- width is at 0x0c, height at 0x08
0x10  u32         header size (40)
0x28  payload
```

Height before width — reading `0x08` as width gives nonsense.

`LP4` and `BM` are **not** BC/DXT compression. `LP4` means 4 bits per pixel,
palettized. (I initially assumed BC1 and produced a plausible-looking but wrong
image; the magenta fringing was the giveaway.)

**Unresolved:** for `parts00` the header says 512×113, which at 4bpp is 28,928
bytes — but the payload is 524,288, an 18× gap. Whether that is padding, mips, or
packed sub-textures is unknown. Until that is resolved, do not trust the header
dimensions when editing.

### `GUI\0` — the layout trees

```
0x00  "GUI\0"
0x04  u32
0x08  u32         total size
0x10  "lhw\"      label widget marker
```

Widget tree with float rects and 53 named nodes in `menu_home_000`
(`a_s_IslandName`, `a_banner_text`, `a_s_present`, `a_present_num`, `a_s_new`...).
The record stride was never determined, so treat this as unexplored.

## Tools that do work

In `tools-js/`, all CommonJS or Python, run in the container where
`egoroof-blowfish` and Pillow live:

```bash
sg docker -c 'docker exec mhxr-serverheroic-self-server-1 node /app/tools/arc-ls.cjs <file.arc>'
sg docker -c 'docker exec mhxr-serverheroic-self-server-1 node /app/tools/arc-extract.cjs <file.arc> <outdir>'
sg docker -c 'docker exec mhxr-serverheroic-self-server-1 node /app/tools/fwgs-probe.cjs <file.bin>'
```

`tex_decode.py` decodes BC1/BC3 and **is the wrong path for these files** — kept
only because it is what produced the misleading render.

## Honest status

Extraction out of `.arc` works and is verified. Two things are not done:

1. **No correct TEX decoder.** `tools-js/tex_decode.py` handles BC1/BC3, which
   these files are not.
2. **The repack round-trip is untested.** Reading works; writing a modified
   texture back into `.arc`, then into `GUI.00.fpk` with a valid CRC, and having
   the client accept it, has never been tried. Until it is, pixel edits risk
   being silently discarded.

## Provenance

These are Capcom's files, extracted from a private server that serves them.
Personal use only; not redistributable.
