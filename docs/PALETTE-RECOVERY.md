# Recovering the LP4 palette by reading rendered pixels

## What this is for

The `LP4` textures (menu buttons, the bottom nav bar, `クエストへ`, `交易所場`,
and everything else that stays Japanese) are 4 bits per pixel: two pixels per
byte, each a **4-bit index into a 16-entry colour palette**.

The palette is **not stored in the texture file**. This was confirmed:

- the 40-byte header is identical for every LP4 file and is zero after `0x18`
  except the width at `0x0C`
- the payload is exactly `width * height / 2` bytes, leaving no room for a table
- the client's own bundled `sysfont_LP4_NOMIP.tex` has the same empty header

So the palette is supplied by the renderer. The way to recover it is to let the
game draw a known pattern and read the pixels back.

The decisive advantage: **we do not have to guess.** Paint each of the 16 indices
into a known screen position, screenshot the result, and read 16 colours off the
frame. Every one is measured, not inferred.

---

## Why not an emulator

I checked the host:

```
host arch      x86_64
KVM            present (/dev/kvm, vmx)
GPU            Intel TigerLake-H, /dev/dri/renderD128
RAM            23 GB, 18 available
ABIs in APK    arm64-v8a, armeabi-v7a
```

**There is no x86_64 code in the APK.** An x86_64 emulator cannot run it without
full ARM translation, which makes it slow and, more importantly, unreliable for
pixel-exact colour comparison — a translator plus a software GL stack is exactly
the setup where colours drift.

Your **`poco-x8-pro-max` is the right tool**: real ARM64 hardware, the real GPU
driver, and it's online on the tailnet right now. That is the only setup where a
sampled colour is trustworthy.

The patched APK already carries `android:debuggable="true"` (patch 6 in
`scripts/patcher/patcher.py`), so `adb` can drive it without any repatching.

---

## Step 0 — install adb on this machine

Only `adb` is needed; no SDK, no emulator.

```bash
sudo apt install adb
adb version
```

---

## Step 1 — enable wireless debugging on the phone

On the Poco: **Settings → About phone → tap "Build number" 7 times** to unlock
developer options. Then **Settings → Additional settings → Developer options →
USB debugging (Security settings) → ON**. This is the variant that works without
a USB cable; plain "USB debugging" alone will not.

Then **Developer options → Wireless debugging → ON**, and note the
`IP address & port` it shows.

Your phone's Tailscale IP is `100.85.187.91` (from `tailscale status`). Wireless
debugging hands out a *LAN* address, which will not be reachable across the
tailnet, so pair over USB once:

```bash
# plug the phone in with a USB cable, accept the debugging prompt, then:
adb devices
```

After pairing you can unplug and stay on wireless debugging. If you prefer to
stay cabled for the whole session, just keep using `adb shell` — nothing below
requires the network.

---

## Step 2 — install and launch

```bash
cd /home/nacho/Documents/mhxr/MHXR-ServerHeroic-self
adb install -r scripts/patcher/out/monster-hunter-explore-09-03-06-patched-aligned-debugSigned.apk
adb shell am start -n jp.co.capcom.android.explore/com.mtx.walker.MainActivity
```

If that activity name is wrong, find the launcher one:

```bash
adb shell cmd package resolve-activity --brief jp.co.capcom.android.explore
```

The client needs Tailscale running on the phone, since the APK points at
`http://100.115.13.121:8081/` (this machine).

---

## Step 3 — take a screenshot

```bash
adb exec-out screencap -p > build/shot.png
python3 -c "from PIL import Image; im=Image.open('build/shot.png'); print(im.size, im.mode)"
```

---

## Step 4 — capture a reference frame

This is the ground truth: what the game actually renders.

Navigate to a screen with a button whose art you know — the home screen is fine,
it has the nav bar and `クエストへ`. Then:

```bash
adb exec-out screencap -p > build/palette/ref_home.png
```

Do this on a **quiet screen** (no toast, no popup, no animation). Stop the
animation by holding still a second before capturing.

---

## Step 5 — the calibration texture

This is the part that replaces all the guessing so far.

Build a texture that is a **16-column swatch strip**: column `i` is entirely
index `i`, for `i` in 0..15. Paint it over some visible button in
`menu_home_parts00_LP4_NOMIP_jpn`, ship it, and the game will draw 16 solid
vertical bars. Screenshot that. Every bar's colour *is* palette entry `i`.

Generate the calibration PNG with the tool already in the repo:

```bash
python3 tools-js/tex_index_tool.py decode \
    sprites/extracted_GUI/tex/menu/menu_home_parts00_LP4_NOMIP_jpn \
    build/palette/parts00_index.png
```

then paint the swatches onto a copy:

```bash
python3 - <<'PY'
from PIL import Image
im = Image.open('build/palette/parts00_index.png').convert('RGB')
LEG = [(255,0,255),(255,0,0),(0,255,0),(0,0,255),(255,255,0),(255,128,0),
       (0,255,255),(255,0,128),(128,255,0),(0,128,255),(128,0,255),(255,255,128),
       (0,255,128),(128,0,128),(128,128,128),(255,255,255)]
# 16 columns x 113 rows in the top-left, one column per index
for i in range(16):
    for y in range(113):
        for x in range(i * 32, (i + 1) * 32):
            im.putpixel((x, y), LEG[i])
im.save('build/palette/parts00_calib.png')
print('calibration texture written: 16 columns, 32px wide each, rows 0..112')
PY
```

Encode it back:

```bash
python3 tools-js/tex_index_tool.py encode \
    sprites/extracted_GUI/tex/menu/menu_home_parts00_LP4_NOMIP_jpn \
    build/palette/parts00_calib.png \
    build/palette/parts00_calib.tex
```

`encode` refuses any colour that is not in the legend, so it cannot silently
corrupt anything.

---

## Step 6 — ship the calibration build

All commands below are **verified working** as written. The awkward part is that
the ARC tools need `GUI_home_top.arc` as a standalone file, but it lives inside
`GUI.00.fpk`, so it has to be pulled out and pushed back. `fpk-pull.cjs` does both
directions and self-verifies.

### 6a. Back up the served pack first

```bash
cd /home/nacho/Documents/mhxr/MHXR-ServerHeroic-self
cp src/public/res/download/android/v0282/stdDL/cmn/GUI.00.fpk \
   build/GUI.00_backup_pre_calib.fpk
ls -la build/GUI.00_backup_pre_calib.fpk
```

### 6b. Copy the calibration texture into the container

```bash
sg docker -c 'docker cp build/palette/parts00_calib.tex \
  mhxr-serverheroic-self-server-1:/app/tools/calib.tex'
```

### 6c. Pull the arc out of the pack

```bash
# work on a copy, never on the live pack
sg docker -c 'docker cp mhxr-serverheroic-self-server-1:/app/src/public/res/download/android/v0282/stdDL/cmn/GUI.00.fpk build/palette/GUI.00.fpk'
sg docker -c 'docker cp build/palette/GUI.00.fpk mhxr-serverheroic-self-server-1:/app/tools/GUI.00.fpk'

sg docker -c 'docker exec mhxr-serverheroic-self-server-1 node /app/tools/fpk-pull.cjs \
  fpk-pull /app/tools/GUI.00.fpk /app/tools/home_top.arc GUI_home_top.arc'
```

Expected:

```
/arc_cmn/GUI/GUI_home_top.arc
  4612968 bytes -> /app/tools/home_top.arc
  (pack had 100 entries, compression 2)
```

Note the leading mode argument, `fpk-pull`. The script is invoked by full path
inside the container, so the mode has to be explicit.

### 6d. Splice the calibration texture into the arc

```bash
sg docker -c 'docker exec mhxr-serverheroic-self-server-1 node /app/tools/arc-edit.cjs \
  /app/tools/home_top.arc /app/tools/home_top_calib.arc \
  menu_home_parts00_LP4_NOMIP_jpn /app/tools/calib.tex'
```

It prints `verify: 41/41 entries read back with the expected bytes`.

### 6e. Push the arc back into the pack

```bash
sg docker -c 'docker exec mhxr-serverheroic-self-server-1 node /app/tools/fpk-pull.cjs \
  fpk-push /app/tools/GUI.00.fpk /app/tools/GUI.00.new.fpk \
  GUI_home_top.arc /app/tools/home_top_calib.arc'
```

It prints `verify: 100/100 entries byte-identical to intent`. **If that line does
not appear, stop — do not copy the file over the live pack.**

### 6f. Install it and regenerate the manifest

```bash
sg docker -c 'docker cp mhxr-serverheroic-self-server-1:/app/tools/GUI.00.new.fpk build/palette/GUI.00.calib.fpk'

# sanity: the CRC must differ from the backup, proving the file really changed
python3 tools-js/crcjam.py build/GUI.00_backup_pre_calib.fpk \
                         build/palette/GUI.00.calib.fpk

cp build/palette/GUI.00.calib.fpk \
   src/public/res/download/android/v0282/stdDL/cmn/GUI.00.fpk

find src/public/res/download/android -name download.list -delete
sg docker -c 'docker compose -f docker-compose.prod.yml restart server'
```

### 6g. Bump the version so the client refetches

`RES_VER` currently sits at 286 and your client is already there. Go to 287:

```bash
# 1. history entry
printf '287 cmn/GUI.00.fpk\n' >> tools-js/aggiornamenti-risorse.txt

# 2. diff folders for every step from 286 to 287
sh tools-js/pubblica-risorse.sh 287

# 3. bump the constant
sed -i 's/  RES_VER: 286,/  RES_VER: 287,/' src/constants/protocol.ts
grep -n 'RES_VER' src/constants/protocol.ts

# 4. rebuild (the constant is compiled into dist, a restart is not enough)
sg docker -c 'docker compose -f docker-compose.prod.yml up -d --build server'
```

### 6h. Verify every step the client will walk

The client advances **one version at a time**. From 286 to 287 that is a single
step, and this confirms the whole chain end to end:

```bash
node tools-js/verify-bump.cjs http://100.115.13.121:8081 286 287
```

Expect `PASS: 1/1 packs verified`. Only then launch the game on the phone.

---

## Step 7 — read the palette off the screenshot

Launch the game, reach the screen with the swatches, and capture:

```bash
adb exec-out screencap -p > build/palette/calib_shot.png
```

Then sample each bar. Adjust `BAR_X0`/`BAR_W` to wherever the swatches actually
landed on screen:

```bash
python3 - <<'PY'
from PIL import Image
from collections import Counter
im = Image.open('build/palette/calib_shot.png').convert('RGB')
W, H = im.size
print('screenshot', W, H)
BAR_X0, BAR_W, BAR_H = 40, 20, 60      # <-- tune to match what you see
for i in range(16):
    x0 = BAR_X0 + i * BAR_W
    c = Counter()
    for y in range(BAR_H):
        for x in range(x0, min(x0 + BAR_W, W)):
            c[im.getpixel((x, y))] += 1
    r, g, b, n = c.most_common(1)[0]
    share = n / max(1, sum(c.values()))
    print(f'  index {i:2d} -> rgb({r:3d},{g:3d},{b:3d})  #{r:02x}{g:02x}{b:02x}   purity {share:.0%}')
PY
```

Purity near 100% means the sample is solid. Below ~80% you are reading an
antialiased edge or an overlapping element — widen the sample or pick a
different screen region.

---

## Step 8 — decode the art for real

Once you have 16 colours, `tex_index_tool.py decode` plus a lookup gives a
truecolour PNG:

```python
PALETTE = [(r0,g0,b0), (r1,g1,b1), ... ]   # from step 7, index 0 = transparent
```

```bash
python3 tools-js/tex_index_tool.py decode <file.tex> out.png     # index view
```

Then map each index to its measured colour to get the real image. At that point
the dither resolves and you can finally see the art as the player does — and,
more importantly, you can paint white text and know exactly which index means
white.

---

## Caveats worth knowing

**Screen colour ≠ palette colour.** The renderer may apply colour grading,
brightness curves, or blending. If a sampled value looks like pure white or pure
black it may be clipped. A palette entry that should be mid-grey coming back as
`#808080` is *correct for the screen* but not necessarily the stored value. Good
enough for choosing which index to paint; not good enough for byte-exact
colour matching.

**Anti-aliasing.** Text and button edges are blended against neighbours, so edge
texels are not palette colours. Sample the interior of large flat areas.

**Gamma.** Phone displays are usually sRGB and the emulator path may differ.
Compare against the reference frame from step 4, taken on the same device, and
ignore absolute values.

---

## Safety

Everything happens in `build/palette`. The only write to the served tree is
the `GUI.00.fpk` swap in step 6, and there is a backup command right above it.
If anything looks wrong, restore and restart:

```bash
cp build/GUI.00_backup_pre_calib.fpk \
   src/public/res/download/android/v0282/stdDL/cmn/GUI.00.fpk
find src/public/res/download/android -name download.list -delete
sg docker -c 'docker compose -f docker-compose.prod.yml restart server'
```

Never `docker compose down -v` — that deletes the database and your character.

### Verified already

This chain was run end to end while writing the guide, so you are not the first
to walk it:

- `fpk-pull` extracted `GUI_home_top.arc` (4,612,968 bytes) from the 100-entry pack
- `arc-extract` pulled `menu_home_parts00_LP4_NOMIP_jpn` (524,328 bytes) out of it
- `fpk-push` put it straight back: **100/100 entries byte-identical, crcjam
  `bd6f0090` before and after**

That last point matters most. Pull → push with an *unmodified* file returns the
identical CRC, so any CRC change you see afterwards is genuinely your edit and not
an artefact of the repack.

What has **not** been verified is the calibration texture itself — nothing has
been rendered with modified LP4 pixels in game yet. That is the point of step 7.

---

## What this does not tell us

Recovering the palette fixes **colours**. It does not by itself give a faithful
decompile: the earlier strip-layout guess (16 strips of 113 rows, stride 127)
scored well on a correlation test but still rendered as dither noise, so the true
row layout is still unconfirmed. Expect to revisit that once real colours are in
hand — a proper decode may make the strip structure obvious, or may show it was
wrong.

The most likely reason that guess looked wrong: if the palette is a luminance
ramp, adjacent indices differ mainly in brightness, and any correct stride would
still produce a plausible-looking ramp. Real colour should settle it.
