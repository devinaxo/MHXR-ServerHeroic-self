# Why the English textures crashed the game (FPK `+0x48` size field)

Found 2026-10-15 by diffing the pristine packs (`heroic-packs-pristine/`) and
the per-version backups (`backups/res-XXXX/`) with
`tools-js/confronta-pack.cjs` and `tools-js/fpk-check.cjs`.

## Short version

The crash was **not** in the texture pixels. It was one FPK entry field that the
repackers updated in one place and forgot in another.

Every FPK entry stores its size **twice**:

```
entry, 80 bytes
  0x00  path[64]
  0x40  u32   (padding)
  0x44  u32   size
  0x48  u32   sizeAndFlags = (size & 0x1fffffff) | (flags << 29)   <- also the size
  0x4c  u32   offset
```

The client sizes/parses an entry from `+0x48`. When a rebuild changed an
archive's length it wrote the new size to `+0x44` but **copied the old size into
`+0x48`**. The two fields then disagreed and the client crashed on the screen
that loaded that archive: black screen, then a native crash.

## Why only some textures broke

A texture edit only triggers the bug when its re-encoded payload
**compresses larger than the original**, because that is the only case where the
host archive grows (and the stale `+0x48` then under-reports the size).

- The 17 good RGBA4 edits re-encoded to *smaller* deflate output → every host
  archive stayed the same length → `+0x48` never drifted.
- The **5 PVRTC4** edits (`town_koukanjyo`, `town_koukan_parts`,
  `town_koukan_parts02`, `town_trainingRangeBG`, `nyanken_parts00_BM`)
  re-encoded *larger*, so `GUI_exchange`, `GUI_result`, `GUI_training`,
  `GUI_home_nyanken`, `GUI_home_treasure`, `GUI_quest_sekihi` grew → mismatch →
  crash. Those are exactly the screens the community hit.

The manifest's "rebuilding an archive breaks the screen" rule was a symptom of
this, not a law: `res-0356` and the live pack (`res 367`) rebuild many archives
and work, because none of them grew.

## Evidence

`+0x44` vs `+0x48 & 0x1fffffff` per pack (100 entries each):

| pack | mismatches | what |
|---|---|---|
| pristine (`heroic-packs-pristine`) | 0 | reference |
| `res-0326` (19 textures) | 1 | only `GUI_otomo_menu.arc` |
| `res-0327` (26 textures, **crashed**) | **7** | `GUI_exchange`, `GUI_home_nyanken`, `GUI_home_treasure`, `GUI_otomo_menu`, `GUI_quest_sekihi`, `GUI_result`, `GUI_training` |
| `res-0328` (rollback) | 1 | `GUI_otomo_menu` |
| `res-0356` | 0 | |
| live `res 367` | 0 | |

The single mismatch in 326/328 is `GUI_otomo_menu.arc`, which is on the
`excludedTargets` list ("Palico House: black screen then crash") - the same bug,
on an archive that had grown earlier. Every crashing screen is an arc that grew.

The alignment theory from the older notes was a red herring: `res-0327` is fully
8-byte aligned on every ARC entry and still crashed, while the live pack ships
8-byte-misaligned entries in `GUI_msg.arc` and boots. Alignment is reported as a
warning, not the cause.

## Fix

Three writers rebuild the FPK entry table and all three copied `sizeAndFlags`
verbatim. They now recompute it as `sizeAndFlags(newLength, old)`:

- `tools-js/fpk-pull.cjs` (the pull/push used by `translations/textures/apply.cjs`)
- `tools-js/fpk-align.cjs`
- `tools-js/fpk-replace.cjs`

`tools-js/fpk-fmt.cjs` and `src/tools/fpk/formats/fpk.ts` already wrote
`(size & 0x1fffffff) | (mFlags << 29)` and were correct.

New gate: `tools-js/fpk-check.cjs <pack.fpk>` fails on any `+0x44`/`+0x48`
mismatch (and non-inflating ARC entries). Run it before publishing.

Repairing an already-published bad pack is enough to fix the crash:

```bash
node tools-js/fpk-align.cjs bad.fpk fixed.fpk   # rewrites +0x44/+0x48 coherently
node tools-js/fpk-check.cjs fixed.fpk
```

Tested: `res-0327` (7 mismatches) normalises to a coherent pack with the ARC
bodies untouched (`arcs normalised: 0`).

## Consequences

With the writer fixed and the checker in place, the textures that were dropped
can be shipped. Growing an archive is fine once `+0x48` tracks it. The
`excludedTargets` / `png-broken` lists can be revisited, one screen at a time,
against a backup.

## Confirmed on device (res 368)

The 7 dropped textures were re-applied and published as `res 368`
(`GUI.00.fpk`, crcjam `8bb60b50`) across 20 entries / 13 archives. Tested on a
real client:

- **quest result screen** - no longer crashes
- **Palico House** - no longer crashes
- **training hall** - no longer crashes

So the crash really was the stale `+0x48`, not the texture data. The old
`excludedTargets` entry for `GUI_otomo_menu` (Palico House) is also resolved by
the same fix. Town / exchange / nyan were not individually re-confirmed yet.
