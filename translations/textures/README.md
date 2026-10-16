# MHXR English texture translations

English replacements for the Japanese text baked into Monster Hunter Explore's
UI artwork, plus the tooling to apply them to any server's resource packs.

Everything here was translated by hand for a private server and is shared so
other servers can use it rather than duplicate the work. They have not been reviewed by
anyone else besides me, so they're really open to interpretation that way. Corrections are welcome.

## What this is — and what it isn't

This folder contains **edited PNG artwork and a manifest**. It does **not**
contain any of Capcom's original resource packs, and it does not need them:
`apply.cjs` reads the pristine texture headers straight out of *your* packs and
writes the edits in.

That means the patch applies to any server regardless of its `res_ver` or how
its packs are laid out, as long as the texture names match. Nothing of Capcom's
is redistributed here — only the changed artwork, which you apply to your own
legally-obtained copy.

## Contents

```
translations/textures/
├── README.md        this file
├── manifest.json     png -> every pack/archive/entry it must be written into
├── png/              27 translated textures (the actual contribution)
└── apply.cjs         applies everything to a set of packs
```

`manifest.json` lists **every archive** each texture lives in. This matters:
the same texture often exists in several archives, the client caches textures
**by name**, and it may load any copy — so patching only one leaves some screens
in Japanese. For example `menu_EquipMenu03` (the "Exploration Navi" compass) is
in two archives, and the home screen loads the copy that *isn't* the obvious one.

## Prerequisites

- Node.js 20+
- Python 3 with `Pillow` and `texture2ddecoder`
  ```bash
  pip install Pillow texture2ddecoder
  ```
- **For the 7 PVRTC4 textures only:** Imagination's `PVRTexToolCLI`
  (free, needs an account: developer.imaginationtech.com → Downloads → Texture
  ToolKit). Point the environment at it:
  ```bash
  export PVRTEXTOOL=/path/to/PVRTexToolCLI
  ```
  Without it, `apply.cjs` will stop as soon as it hits a PVRTC4 texture and say
  so. The 20 RGBA4 textures apply without it.
- This folder must sit inside the repo so `apply.cjs` can find `tools-js/`.

## How to apply

```bash
# 1. point at the folder holding your packs (the one with GUI.00.fpk).
#    A parent folder is fine too -- it searches downward.
node translations/textures/apply.cjs /path/to/res/download/android/v0282/stdDL/cmn

# dry run first if you like (checks every pack is found, writes nothing)
node translations/textures/apply.cjs <dir> --dry-run
```

It writes rebuilt packs to `/tmp/mhxr-translate-out` (override with `--out`).
It never modifies your packs in place.

Each step is verified: every `arc-edit` confirms all entries read back
correctly, every `fpk-push` confirms all pack entries are byte-identical to
intent, and `fpk-align` proves no entry is left off the 8-byte block grid.

## Deploying

```bash
cp /tmp/mhxr-translate-out/GUI.00.fpk <your pack folder>/GUI.00.fpk
find <your res dir> -name download.list -delete      # regenerated on startup
# bump the resource version constant, then rebuild and restart the server
```

The version bump matters: the client only re-fetches packs whose version
increased. In this codebase that is `RES_VER` in `src/constants/protocol.ts`,
plus a line in `tools-js/aggiornamenti-risorse.txt` and
`sh tools-js/pubblica-risorse.sh <new-version>` to create the diff folders.

## What's translated

27 textures: 20 RGBA4, 7 PVRTC4. Roughly, by area:

- **Home / main menu** — the bottom navigation bar, both phone and tablet
  variants, the ship-wheel hub labels (`クエストへ`, `イベント`, `ショップ`), the
  menu popup, Presents / Messages / EVENT / Hunter ID Search
- **Equipment** — equip list, equip detail, equip menu, hunter info, the
  `探検ナビ` "Exploration Navi" compass, town and past-records labels
- **Quest / event** — event banners, the hunting-party banner, forest labels,
  the title screen
- **Areas and titles** — area names (`cmn_kaiikiName01`), title samples
- **Trade / town** — `交易市場` / `交換所` / `交易店` labels, the exchange hall
  and training range art
- **Nyan Expedition** (the cat/palico button) — the `ニャン検隊` label, its camp
  screen, and the palico exploration sign

Also included is one **server-side string**, in
`src/routes/api/activity/activity.controller.ts`: the home-screen activity
ticker's `狩猟団に入団しよう!` → `Join a Hunting Squad!`. That text is rendered
with the game's bitmap font, not baked into any texture, which is why it cannot
be found in an atlas. It is a hardcoded stub in the server — see "Improving the
ticker" below.

## Previously excluded — now included

**`menu_Town01_LP4_NOMIP_jpn`** was translated but dropped because applying it
made the **TOWN screen crash**. That crash was the FPK `+0x48` size field going
stale when an archive grew (see "Tooling notes" below), not the artwork, so it
is now in `png/` and the manifest like everything else. Same for the
`GUI_otomo_*` copies of `menu_hunterinfo` that used to crash the Palico House.


## Tooling notes worth knowing

These were found the hard way and are relevant to anyone doing the same.

**1. The crash was the FPK entry `+0x48` size field, not the pixels.** Every
FPK entry stores its size twice: `+0x44` and `+0x48`
(`(size & 0x1fffffff) | (flags << 29)`). The client sizes/parses the entry from
`+0x48`. A repacker that updates `+0x44` but copies the old `+0x48` leaves a
stale size **whenever an archive grows** (which happens when a re-encoded
texture — typically PVRTC4 — compresses larger than the original), and the
client then crashes on the screen that loads it. `tools-js/fpk-align.cjs`,
`fpk-pull.cjs` and `fpk-replace.cjs` in this repo now recompute `+0x48`;
`tools-js/fpk-check.cjs` fails a pack where the two disagree. Growing an archive
is fine once `+0x48` tracks it.

Capcom also keeps every compressed body on an 8-byte boundary, and `fpk-align.cjs`
normalises that, but 8-byte alignment turned out **not** to be the crash:
archives can ship misaligned entries and still boot. Treat alignment as hygiene,
not the bug.

**2. PVRTC4 has a colourspace trap.** `PVRTexToolCLI` defaults its input
colourspace to sRGB and bakes an sRGB→linear conversion into the compressed
values. The GPU then darkens it again, so the texture comes out roughly
`value^2.2` too dark. Pass `-ics lRGB` (already done in
`tools-js/tex_pvrtc4.py`). Symptom: everything looks uniformly darker rather
than noisier.

**3. TEX and container formats.** Documented in `sprites/REPACK.md` and
`dump/README.md` in the repo: FPK (`"FPK\0"`, 80-byte entries), ARC (`"ARCC"`,
Blowfish-ECB key `kaseoa nkaeka;eawf3`, bodies zlib), and the Android TEX header
(version 9 — a bitfield with width/height/type, formats RGBA4 / PVRTC4 / ETC1 /
RGBA8 / R5G6B5). PVRTC4 files carry a second non-PVRTC variant region; the
client renders the PVRTC one at `pvrVariantOffset`.

**4. RGBA4 packs the channels high-nibble first** (`0xRGBA`). Reading the
nibbles the other way mirrors every hue and puts alpha in the wrong nibble —
the art still looks *shaped* correctly, which makes it easy to mistake for a
colour-grading issue.

## Improving the ticker

`activity.controller.ts` currently returns a single hardcoded example. The real
game generates these from player actions — the constants at the top of the file
list the types (`LOGIN=1`, `CHAT=3`, `JOIN_QUEST=4`, `FIND_HUNTING_PARTY=5`) and
colours (`WHITE=1` … `GREEN=5`). Emitting a real activity when a player joins a
quest or a squad, substituting their name, would make the ticker work as
intended instead of repeating one line.

## Regenerating the manifest

If you add textures, the manifest can be rebuilt from a decoded dump. The repo
tools do this: `tools-js/gui-tex-dump.cjs` lists every texture in every archive,
and `tools-js/tex-tier-manifest.cjs` adds tiers and categories. The same
`<pack>_<arc>_<entry>` name matching used here is implemented in
`tools-js/tex-ship.cjs`, which is the in-repo equivalent of `apply.cjs` and can
read a full dump instead of a single pack.

## Credits

Texture translations, reverse-engineering and tooling by **devinaxo**
— GitHub [@devinaxo](https://github.com/devinaxo), Discord `devinacho`.

The ARC/FPK/TEX format work builds on PredatorCZ's
[RevilLib](https://github.com/PredatorCZ/RevilLib), whose `mhxr.ini` documents
this game's archive key, versions and class map, and whose decoder was used to
cross-check the PVRTC4 output here.

Capcom's original assets are not included in this folder and are not
redistributed by it.

Questions, corrections and further translations are welcome — reach out on
Discord (`devinacho`) or open an issue on GitHub.

## Archives that used to be excluded (`excludedTargets`)

The manifest used to list archives to **never rebuild** — `GUI_otomo_detail`,
`GUI_otomo_menu`, `GUI_result`, `GUI_training`, `GUI_exchange`,
`GUI_home_town`, `GUI_home_nyanken` — because rebuilding them produced a black
screen then a native crash even from pristine bytes.

That was the FPK `+0x48` size field going stale (see Tooling note 1), so the
list is now **empty**: with the fix, rebuilding any of them is safe. On the
server this project runs, the formerly-excluded textures were re-applied at
resource versions 368 and 369 and confirmed on a real client (quest result,
Palico House and training screens no longer crash).

`apply.cjs` still supports an `excludedTargets` list as a safety valve for any
archive you have not tested; it just no longer needs one.

