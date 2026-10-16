# Repacking client resource packs — VERIFIED WORKING

Established 2026-10-07 by round-tripping `GUI.00.fpk`. Every claim below was
tested, not inferred.

## The short version

Both container formats are fully decoded and the write path is proven. You can
modify a file inside a pack, rebuild, and the server will serve it with a
correct CRC.

**Not yet proven:** that the *client* accepts a modified pack. That is a
gameplay question, answered only by installing the APK and playing. The bytes
are correct and self-consistent; whether the client notices anything else is
untested.

## ARC container

```
0x00 "ARCC"   0x04 u16 version (7)   0x06 u16 entry count
0x08 encrypted body (Blowfish-ECB, key "kaseoa nkaeka;eawf3", NULL padding,
     every 4-byte group byte-reversed both before and after the cipher)

entry table, 80 bytes each:
  0x00  char path[64]      backslash separated, NUL padded
  0x40  u32 tag            0x241f5deb on most entries, NOT constant
  0x44  u32 compressed size
  0x48  u32 uncompressed size | 0x40000000
  0x4c  u32 body offset + 8

bodies: zlib deflate
```

**The body region does not start after the table.** With 41 entries the table
ends at 3,280 but the first body is at 32,760; the 29,480 bytes between are all
zero. Rebuilding at the original offsets preserves this. *Why* the padding exists
is unknown.

### Proof

```bash
node arc-repack.cjs in.arc out.arc --raw     # -> byte-for-byte identical
```

`--raw` reuses stored compressed bytes, which isolates the container from
compression settings. Byte-identical, 4,612,968 bytes.

### Writing a modified entry

```bash
node arc-edit.cjs in.arc out.arc <entry-substring> <replacement-file>
```

Modifies one entry and verifies by re-reading: **41/41 entries came back with the
expected bytes**, and the replacement matched its input SHA-256 exactly.

If the replacement compresses to the original size the layout is patched in
place; otherwise the body region is repacked and all offsets are rewritten. Both
produce a valid container.

## FPK container

```
0x00 "FPK\0"   0x0c u16 compression (2 in these packs)   0x0e u16 entry count
entry, 80 bytes:
  0x00  char path[64]
  0x44  u32 size
  0x48  u32 sizeAndFlags
  0x4c  u32 offset
```

Bodies are stored verbatim — each is already-compressed content (an ARC, a TEX)
that handles its own compression. Replacing an entry shifts every later offset,
so the whole body region is rebuilt.

```bash
node fpk-replace.cjs GUI.00.fpk out.fpk <entry-substring> <replacement>
```

Result: 100/100 entries byte-identical to intent, **exactly one entry changed**
(`/arc_cmn/GUI/GUI_home_top.arc`), no overlaps, nothing out of bounds.

## Manifests

The pack CRC changes, so `download.list` must be regenerated or the client
rejects it:

```bash
find src/public/res/download/android -name download.list -delete
docker compose -f docker-compose.prod.yml restart server
```

Verified: before `bc25ed17`, after `bd6f0090`, and `crcjam.py` on the file on
disk matches what the server advertises.

## crcJam

The manifest checksum is table-driven CRC-32 without the final inversion, not
zlib's. `crcjam.py`:

```
crcJam("123456789") = 340bc6d9   (zlib: cbf43926, the complement)
crcJam("")         = ffffffff
```

## Still unknown

**The texture format.** `TEX ` files are *not* BC/DXT compressed — `LP4` means
4 bits per pixel, palettized. Header: width at `0x0c`, height at `0x08` (in that
order), header size 40. But `menu_home_parts00` declares 512×113, which at 4bpp
is 28,928 bytes, while its payload is 524,288. That 18× gap is unexplained, so
**do not trust the header dimensions when editing pixels.**

A previous BC1-based decoder was wrong and has been deleted rather than left
around to mislead.

**The `GUI\0` layout trees.** Widget tree with float rects and named nodes
(`a_s_IslandName`, `a_banner_text`, …) in `menu_home_000`. Record stride never
determined. This is what a proper text-overflow fix would need.

**Adding a new ARC entry.** The 0x40 tag is not constant, so new entries can only
be copied from an existing one's tag. Replacing is proven; adding is not.

## Tools

All in `tools-js/`, run in the container where `egoroof-blowfish` lives:

```bash
sg docker -c 'docker exec mhxr-serverheroic-self-server-1 node /app/tools/arc-ls.cjs <f.arc>'
sg docker -c 'docker exec mhxr-serverheroic-self-server-1 node /app/tools/arc-extract.cjs <f.arc> <outdir>'
sg docker -c 'docker exec mhxr-serverheroic-self-server-1 node /app/tools/arc-repack.cjs <in> <out> --raw'
sg docker -c 'docker exec mhxr-serverheroic-self-server-1 node /app/tools/arc-edit.cjs <in> <out> <match> <repl>'
sg docker -c 'docker exec mhxr-serverheroic-self-server-1 node /app/tools/fpk-replace.cjs <in.fpk> <out.fpk> <match> <repl>'
sg docker -c 'docker exec mhxr-serverheroic-self-server-1 node /app/tools/arc-probe-layout.cjs <f.arc>'
sg docker -c 'docker exec mhxr-serverheroic-self-server-1 node /app/tools/fwgs-probe.cjs <f.bin>'
python3 tools-js/crcjam.py <file>
```

`arc-probe-layout.cjs` exists because guessing the record layout wasted time; it
searches field/offset combinations against known-inflatable entries.

## Current state of the live server

`cmn/GUI.00.fpk` on disk carries a **test build**: `GUI_home_top.arc` was
replaced with a byte-identical-in-layout copy whose `menu_home_SimaMulti` entry
has three bytes flipped at ~50% offset. Nothing visual changed — it was a
write-path test, not a content change.

Original backed up at `/tmp/opencode/GUI.00_backup.fpk`. To revert:

```bash
cp /tmp/opencode/GUI.00_backup.fpk src/public/res/download/android/v0282/stdDL/cmn/GUI.00.fpk
find src/public/res/download/android -name download.list -delete
sg docker -c 'docker compose -f docker-compose.prod.yml restart server'
```

## For an actual sprite edit

1. Decode the target `TEX` — **blocked**, see above
2. Edit pixels
3. `arc-edit.cjs` to put it back in the `.arc`
4. `fpk-replace.cjs` to put the `.arc` back in the `.fpk`
5. Delete `download.list`, restart, reinstall the APK

Steps 3–5 are proven. Step 1 is not.
