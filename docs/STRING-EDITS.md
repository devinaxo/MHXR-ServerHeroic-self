# Changing a translated string

Menu text never touches the server. It lives in `GUI_msg.arc` inside
`GUI.00.fpk`, the pack the client downloads as part of the resource update. So
editing a string means editing the pack, bumping the resource version, and
letting the client download the new one.

## The short version

```bash
# 1. edit lavoro-traduzione/trad/MenuCmn.json   (or whichever file the string is in)
# 2. see what would change, without writing anything:
node tools-js/publish-msg-arc.cjs --dry
# 3. when it looks right:
cp src/public/res/download/android/v0287/stdDL/cmn/GUI.00.fpk build/   # backup!
node tools-js/publish-msg-arc.cjs
sh tools-js/pubblica-risorse.sh $(grep -oP 'RES_VER: \K\d+' src/constants/protocol.ts)
docker compose -f docker-compose.prod.yml up -d --build server
# 4. verify the client's download path
node tools-js/verify-bump.cjs http://127.0.0.1:8081 <old> <new>
# then reinstall the APK with the new resources
```

Run from the project root as your own user — not inside the container, which
runs as `appuser` and cannot write the packs.

Step 2 prints every string that differs from what is being served now, plus the
new archive size. Read it before publishing: it should list **only** your edits.
If it lists anything else, something has drifted (see
[Known drift](#known-drift-fixed-at-288)).

`pubblica-risorse.sh` must run **after** the rebuild, because it copies each
pack's CRC out of the regenerated manifest.

## Where strings live

| Path | What it is |
| --- | --- |
| `lavoro-traduzione/msg/*_jpn` | the original Japanese GMD files, straight from the APK |
| `lavoro-traduzione/trad/*.json` | the dictionaries: `[{ i, jp, en }, ...]`, one entry per string |
| `lavoro-traduzione/msg-en/*_jpn` | a previous build, kept for reference |
| `src/public/res/download/android/v0287/stdDL/cmn/GUI.00.fpk` | what the server serves now |

Edit `trad/`. Never edit `msg/`: those are the originals, and everything is
rebuilt from them.

`i` is the index of the string inside its file, and `en` is what replaces it.
An empty `en` means "not translated yet" and leaves the Japanese in place, so
files can be half-finished. A file where **every** `en` is empty is skipped
entirely, and the bytes currently being served are kept.

## Finding a string

```bash
# which index holds this text?
node -e "require('./lavoro-traduzione/trad/MenuCmn.json')
  .filter(r => r.en.includes('Treasure Details'))
  .forEach(r => console.log(r.i, JSON.stringify(r.en)))"

# which file holds it?
grep -rl "Treasure Details" lavoro-traduzione/trad/
```

## How it works

Each of the 49 entries in `GUI_msg.arc` is a Capcom GMD file. Its strings sit in
one block at the very end, after a table of labels. Translating changes only
that block's size; the labels — and therefore every key the game uses to find a
message — are carried over untouched. `tools-js/testo-gmd.cjs` does that
rewrite, and it re-reads its own output afterwards to catch a malformed GMD
before it can crash the game at startup.

The archive stores its 49 entries back to back with no slack, so a string that
changes length **cannot** be patched in place. `build-msg-arc.cjs` lays every
entry out again from scratch and rewrites all the sizes and offsets.

`publish-msg-arc.cjs` refuses to go ahead if any file's string count changes,
because a wrong count means the client would read the wrong key and show
unrelated text.

## Why a version bump is needed

The client only ever downloads a resource update it has never seen, and it walks
versions **one at a time**: `d0282_0283`, then `d0283_0284`, and so on. So:

- the new pack goes into the existing `v0287` tree (clients on 287 diff against
  what they already have),
- a fresh `v0288` tree is created so there is somewhere to move to,
- `RES_VER` in `src/constants/protocol.ts` goes to 288,
- the `download.list` manifests are deleted, because they only regenerate when
  missing.

`tools-js/pubblica-risorse.sh` builds the `d<old>_<new>` directories. This was
the source of an early 404: the original script produced a single jump directory
that the client never requests.

## Verifying before publishing

`--dry` is the cheap check:

```
GMD ricostruiti: 16, ancora non tradotti: 3, senza dizionario: 30
stringhe identiche: 7682, diverse: 6
  MenuCmn_jpn[440] " time(s)" -> "Time(s)"
  ...
GUI_msg.arc: 336432 -> 307432 byte
pack verificato: 100 voci, 2 compressione
```

Run against the live pack with no edits at all, it reproduces **7,682 strings
identically** and reports 6 differences. Those 6 are stale dictionary entries,
listed under [Known drift](#known-drift) below.

## Known drift: fixed at 288

Six strings in `trad/MenuCmn.json` were behind what the server was serving. All
six were corrected on 2026-10-09 before publishing:

| i | was | now |
| --- | --- | --- |
| 440, 719 | `"Time(s)"` | `" time(s)"` |
| 720 | `"Min"` | `" min"` |
| 721 | `"Time"` | `" h"` |
| 722 | `"Day(s)"` | `" day(s)"` |
| 1091 | `"cannot"` | `": not available"` |

The live versions carry a deliberate leading space: they are suffixes appended
after a number, and the space is what stops them running into the digits. 721
was labelling a duration unit with the word "Time".

`--dry` now reports `diverse: 0` against the live pack, so a rebuild is a
no-op until something is actually edited. Keep it that way: if `--dry` ever
lists a difference you did not ask for, something has drifted again.

## Version 288: what changed

Published 2026-10-09. Four hand-edited strings plus the six drift fixes above.
`crcjam` of `cmn/GUI.00.fpk`: `f93dc921` -> `7f2f0c5b`.

| i | was | now |
| --- | --- | --- |
| 435 | `Check the expedition results, nya!` | `Check the meowxpedition!` |
| 1152 | `Treasure Details` | `Treasure Det.` |
| 1168 | `Check the Reward\r\nWhen Used` | `Check` |
| 1169 | `Multiply Reward by %d with Hunter Coins` | `x%d Reward with Hunter Gems` |

**1169 keeps the `%d` on purpose.** It is the button for the multiplier screen,
which offers x2 / x3 / x5, so a literal `x5` would have read `x5` on all three
buttons. If you specifically want the literal text, change it to `x5` — but
expect the wrong label on the x2 and x3 buttons.

## Still open: the quest time result row

`01:30 Or Less --- S` is **four separate strings** glued together by the client,
not one string:

| piece | index | value |
| --- | --- | --- |
| the time | 1863 | `%02d:%02d` |
| the condition | 24 / 25 | `Or More` / `Or Less` |
| the separator | 2231 | `---` |
| the rank | 1145–1148 | `S` `A` `B` `C` |

The overlap you see on the time is not a text problem you can fix by editing
one entry: 24 and 25 are shared with several other screens, so shortening them
or inserting markup changes all of them. Left untouched at 288 for that reason.

Ways to attack it, if it is still bothering you:

- shorten 24/25 (`"Or+"`, `"Or-"`) and accept the effect on every other screen
- give 24/25 a leading space (`" Or Less"`), which is the same trick the numeric
  suffixes at 440/719/720/721/722 already use
- change the rank letters 1145–1148, which are used elsewhere too

Worth saying plainly: this may be a layout problem rather than a string problem.
The client positions those pieces itself, and a spacing change to the text may
not move them. A screenshot of the row would settle it.

`<25`, `<SIZE n>` and `<COL ...>` are the game's own markup and work inside a
string, so `"Or<25%s"` renders as a gap. They are not HTML and the parser is
case-sensitive.

## The two arc fields that broke the game (288, 289, fixed in 290)

An ARCC entry is 80 bytes: a 64-byte name, then four fields.

```
+0x40  0x242BB29A                  tag
+0x44  compressed size
+0x48  0x40000000 | uncompressed size
+0x4C  offset, relative to the body
```

**All four must be written.** `build-msg-arc.cjs` originally wrote only +0x44
and +0x4C, leaving +0x40 zero and +0x48 without its `0x40000000` flag. The
client reads the length from +0x48; with it missing it misparses the archive and
the game dies on startup, before the title screen.

This shipped twice. Version 289 "fixed" a crash that was actually a *different*
field — the padding word at +0x40 of the **FPK** entry, which also had to be zero
and was being written as `0xCDCDCDCD`. Two fields, two broken releases.

Both are now written as constants rather than copied from the source pack, which
is what let the damage propagate: the broken input had lost the fields, so
copying them carried the loss forward.

`publish-msg-arc.cjs` refuses to publish unless every entry is self-consistent:

```
verifica arc: 49/49 voci coerenti
```

which re-inflates each payload and checks `+0x40` and `+0x48` against it. That
check is the thing that was missing twice.

### Checking a pack by hand

Save this as `chkpack.cjs` and run `node chkpack.cjs` from the project root. The
`.cjs` extension matters: package.json sets `"type": "module"`, so a `.js` file
cannot use `require`.

```js
const fs=require('fs'),zlib=require('zlib');
const {Blowfish}=require('egoroof-blowfish');
const {parseFpk}=require('./tools-js/fpk-fmt.cjs');
const K='kaseoa nkaeka;eawf3';
const inv=b=>{const o=Buffer.alloc(b.length);for(let i=0;i+3<b.length;i+=4){o[i]=b[i+3];o[i+1]=b[i+2];o[i+2]=b[i+1];o[i+3]=b[i];}const r=b.length%4;if(r>0)b.copy(o,b.length-r,b.length-r);return o;};
const dec=b=>{const bf=new Blowfish(K,Blowfish.MODE.ECB,Blowfish.PADDING.NULL);const g=inv(b);let c=Buffer.from(bf.decode(g,Blowfish.TYPE.UINT8_ARRAY));if(c.length<g.length)c=Buffer.concat([c,Buffer.alloc(g.length-c.length)]);return inv(c);};
const p=parseFpk(fs.readFileSync('src/public/res/download/android/v0290/stdDL/cmn/GUI.00.fpk'));
console.log('FPK padding zero:', p.entries.every(e=>e.padding===0));
const a=p.entries.find(e=>/GUI_msg[.]arc$/.test(e.filePath)).data;
const b=dec(a.subarray(8));
let ok=0;
for(let i=0;i<a.readUInt16LE(6);i++){const o=i*80;const c=b.readUInt32LE(o+68),f=b.readUInt32LE(o+72)>>>0,s=b.readUInt32LE(o+76)-8;
 if((b.readUInt32LE(o+64)>>>0)===0x242bb29a && (f&0x3fffffff)===zlib.inflateSync(b.subarray(s,s+c)).length && (f>>>30)===1) ok++;}
console.log('arc entries coherent:', ok, 'of', a.readUInt16LE(6));
```

Expected: `FPK padding zero: true` and `arc entries coherent: 49 of 49`.

### Still wrong in the project's own packer

`src/tools/fpk/formats/fpk.ts` writes `0xCDCDCDCD` at FPK entry +0x40. Real
packs have zero and the client reads it, so anything built through that path can
still produce a pack the game refuses to boot. It has not been touched, because
I don't know what else depends on the current behaviour.

`tools-js/fpk-replace.cjs` is safe: it copies each entry's raw bytes and
rewrites only +0x44/+0x48/+0x4c.

## Rollback

Every version tree is a symlink to one real store:

```
v0286 -> v0282
v0287 -> v0282
v0288 -> v0282
```

`publish-msg-arc.cjs` writes into `v0282/stdDL/cmn/GUI.00.fpk` through that
symlink, so publishing overwrites the bytes all of them serve, and `git
checkout` cannot bring them back (the path is behind a symlink, and the packs
are gitignored anyway). Take the copy first.

```bash
# before publishing
cp src/public/res/download/android/v0287/stdDL/cmn/GUI.00.fpk \
   build/GUI.00_backup_pre_strings.fpk

# to undo the 288 strings release
cp build/GUI.00_backup_pre_strings.fpk \
   src/public/res/download/android/v0282/stdDL/cmn/GUI.00.fpk
rm -rf src/public/res/download/android/d0287_0288 \
       src/public/res/download/android/d0288_0289 \
       src/public/res/download/android/v0288 \
       src/public/res/download/android/v0289
git checkout -- src/constants/protocol.ts
find src/public/res/download/android -name download.list -delete
docker compose -f docker-compose.prod.yml up -d --build server
```

`build/` is throwaway scratch, so keep a real backup — publishing auto-snapshots
into `backups/`. The backup from this release was
`build/GUI.00_backup_pre_strings.fpk` (md5 `56762eb4f726cb8cb2bc2a7d0e09532d`).
`GUI.00_backup.fpk` and `GUI.00_backup_pre_calib.fpk` are from the texture work.