# Self-hosting MHXR (Monster Hunter Explore) - handoff brief

Written for an agent picking this up cold. Everything below is verified against the
live server on 2026-10-07, except where marked as untested.

---

## 0a. THIS INSTALLATION - verified working 2026-10-08

Read this section first; it records what was actually done on this machine and the
deviations from the general instructions below.

| | |
|---|---|
| Install path | `/home/nacho/Documents/mhxr/MHXR-ServerHeroic-self` |
| Branch / tip | `fix/multiplayer-gacha-hr` @ `071a851` |
| Reachable at | `http://100.115.13.121:8081` (Tailscale IP, tailnet only) |
| Packs on disk | 262 files, 1.97 GB - all four groups |
| Database | seeded: 4175 questsheets, 597 ticket, 176 assault events |
| Patched APK | `scripts/patcher/out/monster-hunter-explore-09-03-06-patched-aligned-debugSigned.apk` |

Verified end to end: dispatch JSON correct, all four `download.list` manifests
regenerated and well-formed, all 232 stdDL packs reachable with `Content-Length`
matching the advertised size, and a real Blowfish round-trip to
`/api/welcome/safety/flag/get` returning `{"flag":1,"error_code":0,...,"res_ver":282}`.

### Deviations from the instructions below, and why

1. **`tools/Download-Packs.cjs` replaces the PowerShell script.** `pwsh` is not
   installed here and sudo needs a password. Same manifest parsing, same crcJam,
   same resumable `.part`, plus a `-CrcPolicy` flag (see gotcha 9).

2. **Port 8081, not 80.** 80 and 443 are already taken by your Caddy reverse proxy
   and 8080/8096 by Jellyfin. `version.controller.ts` appends the port to the
   client URLs for anything other than 80/443, so this is handled automatically.
   The APK points at `http://100.115.13.121:8081/` (27 bytes, fits the 54-byte slot).

3. **`DB_IP=mongo`, not `127.0.0.1`.** The server is in its own container, so
   loopback means itself. `127.0.0.1` gives
   `MongooseServerSelectionError: connect ECONNREFUSED 127.0.0.1:27017` and the
   process stays up but serves nothing.

4. **`group_add: ['1000']` added to the server service.** The bind-mounted packs
   belong to your host uid 1000; the container runs as uid 999 and could read them
   but got `EACCES` writing `download.list`. Adding your group as a supplementary
   group fixes write access without touching file ownership. `HOST_GID=1000` is in
   `.env` - change it if your uid differs.

5. **Two upstream bugs fixed in the source.** Both were real blockers, not
   cosmetic - see section 9.

### Operating it

```bash
# every docker command needs `sg docker -c` in this session, because the shell
# was started before you joined the docker group
sg docker -c 'docker compose -f docker-compose.prod.yml logs -f server'
sg docker -c 'docker compose -f docker-compose.prod.yml restart server'

# crypto round-trip check (runs where node_modules lives)
sg docker -c 'docker exec mhxr-serverheroic-self-server-1 node /app/tools/api_test.cjs'
```

`tools-js/api_test.cjs` Blowfish-encrypts a request the way the client does,
POSTs it, decrypts the reply and asserts the response envelope. That is the only
test here that exercises the crypto path for real.

**Restarting after changing packs:** delete the manifests, then restart, or the
server keeps serving the old ones (`initResourceDownloadList.ts:27` only writes a
missing file):

```bash
find src/public/res/download/android -name download.list -delete
sg docker -c 'docker compose -f docker-compose.prod.yml restart server'
```

---

## 0. What this is

A private server emulator for Monster Hunter Explore, a mobile-only Monster Hunter
title Capcom shut down in 2020. TypeScript + Node 22, Express 5, Mongoose/MongoDB,
Socket.IO 4 for multiplayer. AGPL-3.0, non-commercial preservation project.

The client talks HTTP with Blowfish-encrypted bodies (`application/octet-stream`)
plus a Socket.IO binary channel. It has exactly **one** hardcoded server address,
the dispatch URL in `libMHS.so`; everything else (api, res, web, socket) is handed
to it at runtime from the server's own `.env`.

## 1. Get the code - branch matters

```bash
git clone https://github.com/Heroic853/MHXR-ServerHeroic
cd MHXR-ServerHeroic
git checkout fix/multiplayer-gacha-hr
```

**Use `fix/multiplayer-gacha-hr`, not `main`.** `main` is stale by four days and
does not contain the English translation work at all. The live server runs the
other branch. Current tip: `071a851` (2026-09-30).

Do not run `yarn setup --import-resources` if you use the fetcher below - it creates
symlinks that fight with a plain directory tree.

## 2. Get the game assets

The FPK resource packs are **not** in the APK and **not** in git. They are ~1.8 GB
across 262 packs, downloaded by the game on first login.

Ready-made script: `tools/Download-Packs.ps1`

```bash
pwsh tools/Download-Packs.ps1                    # everything (~1.8 GB)
pwsh tools/Download-Packs.ps1 -Sets Std          # just the main set
pwsh tools/Download-Packs.ps1 -Only 'cmn/GUI'    # one pack
pwsh tools/Download-Packs.ps1 -Delay 3           # gentler on the origin
pwsh tools/Download-Packs.ps1 -Force             # re-fetch existing
```

Needs PowerShell 7 (`pwsh`) for `Add-Type`; works on Linux and Windows. It is
resumable - intact packs are skipped, so re-running after an interruption only
fetches what's missing. Default output is `src/public/res/download/android/`.

### If writing your own downloader instead

Server: `http://57.131.193.244/`

That address is Base64-encoded in `Indirizzo.cs` / `Indirizzo.java` of
`Heroic853/MHXR_Patcher_Heroic853` (`aHR0cDovLzU3LjEzMS4xOTMuMjQ0Lw==`).

Manifests (plain text, one line per pack: `path,crcjam,size`):

```
http://57.131.193.244/res/download/android/v0285/stdDL/download.list     232 packs, 1.76 GB
http://57.131.193.244/res/download/android/openingDL/download.list        4 packs
http://57.131.193.244/res/download/android/tutorialDL/download.list      14 packs
http://57.131.193.244/res/download/android/trainingDL/download.list      12 packs
```

Each manifest path begins with its own group name (`/stdDL/...`, `/openingDL/...`).
**Strip that first segment**, then append to the group's base URL:

```
fileUrl = "{base}/{group}/{path with first segment removed}"
```

| group | base suffix |
|---|---|
| stdDL | `v0285/stdDL` |
| openingDL | `openingDL` |
| tutorialDL | `tutorialDL` |
| trainingDL | `trainingDL` |

Verified examples:

```
/stdDL/cmn/resident.00.fpk     -> .../android/v0285/stdDL/cmn/resident.00.fpk      4307152
/openingDL/cmn/GUI.00.fpk      -> .../android/openingDL/cmn/GUI.00.fpk              536288
/tutorialDL/cmn/eft.00.fpk    -> .../android/tutorialDL/cmn/eft.00.fpk             4517912
/trainingDL/cmn/quest.00.fpk  -> .../android/trainingDL/cmn/quest.00.fpk          5593176
```

Note the group name appears **once** in the final URL. Appending the path verbatim
gives a doubled group name and a 404 - that is the easy mistake here.

### Use the full manifest, NOT the `d*_*` diff manifests

The server also serves `d0282_0285/`, `d0283_0285/`, `d0284_0285/`. **Do not use
them.** Measured on 2026-10-07:

| pack | full manifest `v0285` | diff manifest `d*` | file actually served |
|---|---|---|---|
| `cmn/resident.00.fpk` | 4307152 / `5b5cbd6e` | 4322032 / `c8de24a7` | 4307152 / `5b5cbd6e` |
| `cmn/GUI.00.fpk` | 142334672 / `bc25ed17` | 142535088 / `fcc82edd` | 142334672 / `bc25ed17` |

The `d*` folders are symlinks to `v0282` (`tools-js/pubblica-risorse.sh`), so every
path serves identical bytes - the diff manifests simply advertise files that are
larger than what exists. Verifying against them produces false corruption reports.

### crcJam, not CRC-32 - this will bite you

The manifest CRC is `crc/crcjam` (npm), used by
`src/services/initResourceDownloadList.ts`. It is table-driven CRC-32
(poly `0xEDB88320`, init `0xFFFFFFFF`) **without the final XOR**. Adding the
inversion gives you the bitwise complement of the right answer, i.e. every pack
reports as corrupt.

```
crcJam("123456789") = 340bc6d9     (zlib CRC-32 = cbf43926, the complement)
crcJam("")         = ffffffff     (not 00000000)
```

Easiest path is to just `npm i crc` and use `require('crc/crcjam')` - that's what
the server does, so it can't drift.

### Resulting layout

```
src/public/res/download/android/
├── v0282/stdDL/{cmn,adrd}/*.fpk      <- the real store; server regenerates download.list from this
├── openingDL/{cmn,adrd}/*.fpk
├── tutorialDL/{cmn,adrd}/*.fpk
└── trainingDL/{cmn,adrd}/*.fpk
```

**Delete every `download.list` you downloaded.** The server only writes one if it
doesn't already exist (`initResourceDownloadList.ts:27`), so a leftover manifest
describing someone else's files will be served verbatim and the client will reject
every pack. Deleting them lets the server compute correct CRCs from your own files
on first boot.

### Everything is in English - with two known exceptions

The target is a fully English game. Almost all of it arrives with the packs
described above, so there is no translation work to do. Two things are worth
knowing up front so they don't look like bugs:

1. **Island/ocean quest titles are still Japanese.** This is the one piece of
   display text the server genuinely sends. `src/services/oceanService.ts:291`
   reads `mQuestName` out of `src/csv/questData.csv` and returns it as
   `quest_name`. In practice most quest names the player sees still come from
   the client, so the visible impact is small - but island node titles can show
   Japanese. Fixing it means translating that CSV (Japanese source text) and
   re-seeding; the seed only runs on an empty `questsheets` collection, so
   existing installs need the rows updated directly.

2. **`.env.example` comments, tool output and some doc files are Italian.**
   That's the upstream author's language and has no effect on the game. Ignore
   it.

Everything else - menus, monsters, skills, equipment and weapon names, battle
messages, network/API error text, the in-hunt pause menu - is English, because
it all lives in the client resource packs.

### The packs are the English build

Verified: `GUI_font.arc` extracted from the served `cmn/GUI.00.fpk` is
SHA-256 identical to the translated `lavoro-traduzione/GUI_font.arc` in the repo
(`27197AF930E1805CEE80E6CF3F7690BB...590327DBC`). No translation work needed.

## 3. Configure

```bash
cp .env.example .env
```

**`.env` is UTF-8 without BOM.** With a BOM, Compose reads the first key as `?IP`
and nothing works. On Linux: `printf 'IP=...' > .env` (never a Windows editor).

Settings that matter:

| key | value | why |
|---|---|---|
| `IP` | your reachable hostname, **not** `0.0.0.0` | Despite the comment in `.env.example`, this is not a bind address. `src/routes/version/version.controller.ts` interpolates it into the URLs handed to the client: `api: http://${IP}/api`. `0.0.0.0` produces a client that cannot connect. |
| `WEB_URL` / `RES_URL` | `http://<host>/web`, `http://<host>/` | must be reachable by the client |
| `DB_PASSWORD` | **alphanumeric only** | interpolated into the Mongo URI with no URL-encoding; an `@` breaks it |
| `PORT` | `80` | if you change it, it gets appended to the client URLs too |

Use a domain (DuckDNS is fine) so you never repatch the APK when the IP moves.

## 4. Start

**First, fix the compose file.** `docker-compose.prod.yml` declares its Mongo
volumes `external: true` with hardcoded names `apypos-server-main_mongo_data` and
`apypos-server-main_mongo_config`. Those exist only on the original author's
machine and the stack will refuse to start. Either:

```bash
docker volume create apypos-server-main_mongo_data
docker volume create apypos-server-main_mongo_config
```

or delete the `external: true` lines under `volumes:` at the bottom of the file.

Then:

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f server
```

Look for `File created successfully` in the logs - that's the download.list
regeneration.

**Never `docker compose down -v`.** The `-v` deletes the database and your character.

Maintenance scripts are mounted at `/app/tools` and run with `node`:

```bash
docker compose -f docker-compose.prod.yml exec -T server node /app/tools/verifica-totale.cjs
```

They are `.cjs` on purpose - `package.json` declares `"type": "module"`, so any
`.js` under `/app` would be parsed as ESM and every `require()` would fail.

## 5. Patch the client

Untested by me - read `docs/APK_PATCHING_GUIDE.md` for the full seven-patch
procedure with byte offsets.

The one that matters is the dispatch URL in `libMHS.so` (arm64-v8a **and**
armeabi-v7a - a mismatch gives a client that works in an emulator and fails on a
real phone). Original string: `https://mhxr-dispatch.s3-ap-northeast-1.amazonaws.com/`

`tools/Patch-MhxrUrl.ps1` automates it and validates both architectures before
writing either, but it's **PowerShell/Windows**. On Linux use
`scripts/patcher/patcher.py` (Python 3, needs `apktool.jar` - present in the repo)
or hex-edit both `.so` files directly.

**The slot is fixed-width and cannot grow: 55 bytes on arm64-v8a, 48 on
armeabi-v7a.** 48 is the real limit. On arm64 a pointer table sits immediately
after, so overrunning corrupts the library. Short domain only.

SafetyNet must also be patched or the client hangs forever on 通信中です…

Prereqs: JDK 17+, `apktool` 2.9.3 (in `scripts/patcher/`), Android SDK
build-tools for `zipalign`/`apksigner`, Python 3.

## 6. Resource versioning - ignore it for self-hosting

`src/constants/protocol.ts` has `RES_VER: 285` on the fork. The client compares it
to a saved version: gap < 10 → asks for a `d<old>_<new>/` diff folder; gap ≥ 10 or
first install → asks for `v<new>/`, everything.

That machinery exists so Heroic can ship translation updates without making every
player re-download 1.8 GB. **For your own server, set `RES_VER: 282`** and skip the
`v0NNN` symlinks and `tools-js/pubblica-risorse.sh` entirely. A first-time client
installs the full set regardless.

When you later translate something and want to push it to existing players, that's
when the version bump and `pubblica-risorse.sh` matter - bump `RES_VER`, add a line
to `tools-js/aggiornamenti-risorse.txt`, run the script on the server host.

## 7. Gotchas, collected

- `yarn build` runs `ln -sfn ../src/public dist/public`, and the runtime Docker
  stage copies only `/app/dist`. The prod compose therefore mounts assets at
  `/app/src/public`, not `/app/dist/public`. Already correct there - don't "fix" it.
- Only resource version **282** is supported by the server code.
- If the client hangs on first boot, reboot the emulator. This is normal per
  upstream docs.
- When you change FPKs: delete `download.list`, restart the server, and on the
  client wipe app data/cache so it re-fetches.
- `tools-js/` needs the `crc`, `egoroof-blowfish`, `mongoose` modules - run those
  scripts inside the container where they're installed. `.cjs` on purpose: `package.json`
  declares `"type": "module"`, so any `.js` under `/app` is parsed as ESM and every
  `require()` fails.
- Pack URLs are `/res/download/android/v0282/` **+** the manifest path, because the
  manifest path already carries its group prefix. `/res/download/android/stdDL/...`
  (omitting the version dir) is a 404.
- `/web` is a 404 and that is correct. `webRouter` mounts at `/web/` and only defines
  sub-paths; `/web/notice/index` and `/web/download` return 302 to the upstream site.
  A smoke test that follows redirects will report a bogus 404 from GitHub Pages.
- In a Docker group session: `sg docker -c 'docker compose ...'` works around the fact
  that the shell was started before the group membership was added.

## 9. Two bugs in the upstream server, both fixed here

Neither is cosmetic. Both silently produce a server that boots and looks healthy.

### 9a. `download.list` CRCs were written in decimal, not hex

`initResourceDownloadList.ts` interpolated the value returned by `crc/crcjam` -
a JS number - with a bare `${item.crc}`, so it printed base 10. The origin's
manifests are hexadecimal (`/openingDL/adrd/eft.00.fpk,2e853644,1478595`), so
`0x2e853644` went out as `780482116`. The client parses the field as hex, gets a
completely different number, and rejects **every pack** as corrupt.

Fixed to `item.crc.toString(16).padStart(8, '0')`. The `padStart` is deliberate:
the origin itself is inconsistent and writes 19 of its 232 stdDL entries unpadded
(e.g. `899dfad`), but padding matches the documented 8-digit form and a hex parser
accepts both. After the fix, all 232 generated stdDL entries are numerically
identical to the origin's - same paths, same CRC values, same sizes.

### 9b. Every tutorialDL and trainingDL manifest on the origin is stale

All 26 of those packs have a **size that matches exactly** but a CRC that
disagrees with the bytes actually served. Proof the bytes are good and the
manifests are the stale artifact: `tutorialDL/cmn/shell.00.fpk` and
`cmn/movie.00.fpk` are byte-identical to their stdDL counterparts and carry the
CRC the **std** manifest gives them, not their own.

A strict CRC check rejects all 26 and drops 0.2 GB of valid content. Since the
server regenerates `download.list` from your own files, the right move is to
accept size-verified packs. Hence `-CrcPolicy size-only` in
`tools/Download-Packs.cjs`, which records the CRC actually computed:

```bash
node tools/Download-Packs.cjs -Sets Tutorial,Training -CrcPolicy size-only
```

The regenerated manifests then describe those exact bytes, which is all the
client ever compares against.

## 8. Licensing

Server code is AGPL-3.0: if you run a modified version and let other people
connect, you must offer them the source. The **game assets are separate** - they're
Capcom's, and the project treats them as personal-use only. Don't build a public
service on them.
---

## Zenny and equipment upgrades (2026-10-09)

### Symptom
Upgrading a piece appeared to cost nothing, and the balance jumped to
`999,999,999`. Quests paid out no zenny either.

### Cause
Three separate things, all confirmed against the live server and the client
binary:

1. `equipLevelup` raised `elv` and returned no zenny and no materials. The
   comment in the code said so outright.
2. The client reads the remaining zenny out of the response. Omitting it makes
   the client render `0x3B9AC9FF` (999,999,999), its "not set" sentinel. Any
   request that re-read the real box made it snap back.
3. `islandEnd` credited the zenny its reward slots *advertised* (`zeny: 1` per
   slot) but never added it to `box.zeny`, so quest payouts were display-only.

The route was also never reached for `/equipment/potentialup/auto/set`: the
router pointed at `blankResponseEncrypted`, so the `potentialupAutoSet`
controller (fixed earlier) was dead code. Now routed.

### Data
Costs come from the game's own master data, not from guesswork:

- `tools-js/build-upgrade-costs.cjs` -> `src/json/upgrade-costs.json`
  (15,541 pieces, 5,608 material sets, 10 rarity rows)
- Sources: `bugiStrengthenNeedZenyTable`, `strengthenNeedMaterialTable`,
  `weapon_*_series`, `equip_*_series` in `tools-js/rsdnt_{equip,weapon}.arc`
- Zenny per level: `floor((rarity * 1000 - 10) * fromLevel / 16)`, summed over
  the levels gained
- Materials: one set per level, from the piece's own row

### Caveat worth repeating
The zenny formula is fitted to **three data points from one rarity 8 lance**.
It reproduces the client's displayed 14,981 / 30,461 / 46,441 exactly, but if
prices look wrong on another piece this is the first suspect. Full derivation
and limits in `docs/UPGRADE-COSTS.md`.

### Verification
- 605/605 unit tests pass (4 stale expectations from the earlier error-code
  work were corrected: `GENERIC_ERROR` -> `KARIDAMA_NOT_ENOUGH`, and a
  hardcoded `res_ver` now reads `PROTOCOL.RES_VER`)
- `tools-js/levelup_test.cjs` drives the live endpoint with the player's real
  session and checks both the reply and what landed in Mongo
- 24/24 smoke tests, API round-trip clean

### Also fixed while here
`materialSell`'s test still expected `GENERIC_ERROR` where fix 3 had
deliberately introduced code 94.

---

## Broken 288 pack: the FPK +0x40 entry field (2026-10-09)

### Symptom
Version 288 shipped, the client downloaded the 136 MB update, and the game then
crashed on startup every time, never getting past the intro screen.

### Cause
`buildFpk()` writes `0xCDCDCDCD` into the word at offset +0x40 of every FPK
entry, described in `src/tools/fpk/formats/fpk.ts` as padding. In the real packs
that word is **zero**, and the client reads it.

`tools-js/build-msg-arc.cjs` repacks through `tools-js/fpk-fmt.cjs`, a plain-JS
copy of the TypeScript, so all 100 entries of the published `GUI.00.fpk` got
that value. Everything else about the pack was correct: header identical,
`GUI_msg.arc` rebuilt properly, all 2,351 strings intact.

It was not caught by the checks because they compared the *contents* of the
entries and the string counts, never the entry table itself.

### Fix
Version 289. `fpk-fmt.cjs` now copies `entry.padding` across, and
`build-msg-arc.cjs` passes it and the header fields through. Verified against
the pre-288 pack: header identical, 0 padding mismatches, 0 `sizeAndFlags`
mismatches, and `GUI_msg.arc` the only entry whose data differs.

### Still a live hazard
`src/tools/fpk/formats/fpk.ts` - the packer the project itself uses - **still
writes `0xCDCDCDCD`**. Anything built through that path can reproduce this crash.
Worth fixing there too; see docs/STRING-EDITS.md.

`tools-js/fpk-replace.cjs` is unaffected: it copies each entry's raw bytes and
rewrites only +0x44/+0x48/+0x4c, so +0x40 survives. That is why the earlier
texture work never hit this.

### Backup
A local backup of the last known-good pack (md5 `56762eb4f726cb8cb2bc2a7d0e09532d`)
was taken before 288 (not shipped).

---

## 288 / 289 / 290: the two missing archive fields (2026-10-09)

### Symptom
Version 288 shipped a rebuilt `GUI.00.fpk`. The client downloaded it and the game
crashed on every start, before the title screen. Version 289, which I believed
had fixed it, crashed identically. 290 works.

### Cause
Two separate fields, both in the same family of structures, both required by the
client and neither written by my builder.

**FPK entry +0x40.** A word after the 64-byte path. `buildFpk()` in
`src/tools/fpk/formats/fpk.ts` calls it padding and writes `0xCDCDCDCD`. Real
packs have zero there. This is what 289 fixed.

**ARCC entry +0x40 and +0x48.** Inside `GUI_msg.arc`, each of the 49 entries is
80 bytes: 64-byte name, then `0x242BB29A` (tag), compressed size,
`0x40000000 | uncompressed size`, and offset. `build-msg-arc.cjs` wrote only the
compressed size and the offset. With the length field missing, the client cannot
size the entries and refuses to boot.

The tag and the flag were **copied from the source pack**, so once 288 had lost
them the loss propagated forward. Both are now written as constants.

### What made this expensive
Both crashes looked identical, and I diagnosed the second one from the first
without re-deriving it. The check that would have caught either - re-inflate
every entry and compare against the stored length - did not exist. It does now,
and `publish-msg-arc.cjs` refuses to publish without it:

```
verifica arc: 49/49 voci coerenti
```

### Method note
The decisive evidence came from dumping the raw 80-byte entry records and
noticing that `+0x48` held exactly the uncompressed sizes: `0x3F01` = 16,129
bytes, `0x8D63` = 36,195, `0x269EE` = 158,190. Three values matching three
different payload sizes was not going to be coincidence.

### Verified
Rebuilding the pre-edit dictionary now yields 48 of 49 GMD payloads
byte-identical to the known-good pack; the 49th is MenuCmn, which is the intended
edit. FPK header identical, all padding zero, all 49 arc entries coherent.

### Still unfixed
`src/tools/fpk/formats/fpk.ts` still writes `0xCDCDCDCD` at FPK entry +0x40.
Left alone deliberately: unknown what depends on it, and I had already broken the
game twice. `tools-js/fpk-replace.cjs` avoids the problem by copying raw entry
bytes.

---

## Trade Points and the Trading Post (2026-10-10)

### Symptom
Every material in the Trading Post read "sold out", and Trade Points could not
be earned at all.

### Cause
Two separate things, both in `shop.controller.ts`:

1. `shop_limit: 0` on every row. Those are the shop's "Exchanged" and
   "Remaining" columns (the game's own strings 2119/2120 are literally those two
   headings), so zero remaining stock rendered the whole post as sold out. The
   comment above the field said *"Limiti mai a 0"* - the intent was there, the
   code was not.
2. The currency did not exist server-side. `box.points` was empty and
   `account/login` hardcoded `points: [{ amount: 0 }]`. Prices were in zenny at a
   flat 1, even though the game has a real Trade Points currency: its own
   strings say "Trade Points", "Trade Points Owned: ", "1 Time: %dP", and
   "Exchange at the Trading Post".

### What it is now
`src/services/tradePointsService.ts` owns the currency:

- `TRADE_POINT_ID` 3190222199, the id every shop row already carried.
- Prices by material rarity, taken from the game's own item sheet
  (1/2/3/5/10/20/35/50 P for rarity 1-8) rather than a flat rate.
- A daily allowance of 1000 P, sent as a gift to the **present box** on login
  and on opening the post (see `services/presenteGiornalieroService.ts`). Each
  game day creates one `Present` holding the three point currencies; the player
  claims it from the present screen, which shows the points with an icon. The
  old invisible delivery (mutating `box.points` directly) and the pictureless
  "Day 1 Login Bonus" popup are gone. `DAILY_PRESENT=0` disables the gift.
- The game day rolls at **05:00**, matching the game's own daily counters
  (its login-bonus text says the count resets at 5). 04:59 is still yesterday.
- **Won by playing.** `island/end` (and everything routed to it: island, eternal,
  and all event ends) pays `QUEST_TRADE_POINTS` P -- default 100 -- and shows
  them in the first reward slot, so what the player sees is what is credited.
  The original game never put points in `mRewardItemList` (checked over all 2635
  quests: zero point ids), so the payout is ours, not extracted data.
- `/quest/reward/exchange` is implemented (it used to be commented out, i.e. a
  404). Read out of the client: request is `{ idx }`, response is
  `{ exchange_list: [{ amount, mst_exchange_id }] }`. What `idx` selects and the
  exchange master are unknown, so the route always logs the request and only pays
  `QUEST_EXCHANGE_POINTS` (default 0 = log-only) once per game day. Flip the env
  on after watching a live call to see the real semantics.

Tunable from the environment without a rebuild: `TRADE_POINTS_DAILY`,
`TRADE_POINTS_RESET_HOUR`, `QUEST_TRADE_POINTS`, `QUEST_EXCHANGE_POINTS`.

### Two bugs worth remembering

**A save is not enough for a nested array.** `doc.save()` used to persist
`punti_ultimo_giorno` while leaving the balance at 0: assigning `amount` on an
element of `box.points` does not mark the array dirty. That direct-credit writer
is gone; the present receiver now merges point rows with a whole-array write.

**Login must never depend on a write.** The gift on the login path is
fire-and-forget and the service swallows its own errors: a write that throws
would otherwise have become "Login failed". The post path awaits it, since it is
not in the way of getting into the game.

### Verified
`tools-js/shop_test.cjs` drove the live endpoints with the player's session
(stock, prices across all eight rarities, the allowance granted once, a purchase
moving points). With the gift now going to the present box, `shop/list` no longer
credits `box.points` directly, so that script needs to claim today's present
first before its balance checks will pass again.

623/623 unit tests, 24/24 smoke, zero errors.

### Correction: the limit flags are inverted

The first attempt guessed the field meanings from the UI column headers and got
it half wrong. Reading the client settled it:

```
uGUIMenuExchange::isItemExchanged(i)
    item = getLineupDispItem(i);
    return item[28] == 0;              // <- ZERO means "already exchanged"

uGUIMenuExchange::isEnableExchange(i)
    if (item[28] == 0)        return false;   // not exchangeable
    if (item[80] <= now)      return false;   // expired, absolute time
    return item[68] <= parent[588];           // price <= points owned
```

`item[28]` is `item_limit`, and it is inverted from its name: zero puts the
EXCHANGED badge over the row and blocks the click. It shipped at 0, which is the
whole reason nothing could be exchanged. `shop_limit` is the stock that produced
the "sold out" wording; setting it fixed one symptom and hid the other.

Both are positive now (99). `parent[588]` is the player's Trade Point balance,
which confirms the price is compared against points -- that is what made the
currency necessary in the first place.

### Card names are English

The shop rows sent `name`/`detail` from the Japanese `nome` column, so the post
showed 【換金用】腐食した銅貨 next to every English material elsewhere in the game.
All 4,878 rows in `materiali.json` carry an `en` name from the same item sheet,
so the card now uses it (falling back to Japanese if a row ever lacks one).

### What a Trading Post card shows

From `uGUIMenuExchange`'s `updateDisp*` family:

| card field | source | confirmed |
| --- | --- | --- |
| item name | row `name` | yes |
| price in P | `item[68]`, MenuCmn 2101 `"1 Time: %dP"` | yes |
| "Owned: N" | `uMenuExchange::getBoxItemNum()` - how many you hold | yes |
| exchanged / spent | `item[28]`, inverted: 0 means exchanged | yes |
| lineup expiry | `item[80]`, absolute time; MenuCmn 188 is "Indefinite" | yes |
| remaining stock | `shop_limit` | the "sold out" wording |

The post's own header strings sit together at MenuCmn 2098-2111:
`"%s Owned: "`, `"Trade Points Owned: "`, `"Trade Points Used: %dP"`,
`"<COL FFF0BC>%dP</COL>"` / `"<COL 00FF00>%dP</COL>"` (affordable vs not),
`"There are currently no matching items available"`, `"New"`.

MenuCmn 2119/2120 ("Exchanged"/"Remaining") are headers of a different view, not
this card - reading them as field meanings is what produced the earlier guess.

### Stock is tracked per player, and refills at 05:00

`negozi_acquistati` on the user document is `{ 'YYYYMMDD': { '<mst_shop_item_id>': qty } }`.
Keying by game day means the reset needs no scheduler: yesterday's counts stop
being read, and the next purchase starts a fresh map.

- `shop_limit` = stock left (default 99)
- `item_limit` = what this player may still take (default 99), floored at 1 so
  the inverted "exchanged" flag never trips while stock remains
- `buy` enforces the per-player cap server-side, not just visually

Env-tunable: `TRADE_SHOP_STOCK`, `TRADE_SHOP_PER_PLAYER`.

### The post has three point currencies, not one

Google Lens on the three tabs gave the names: Trade Point (yellow), Superior
Transaction P (blue), Special Deal P (silver). `event_point_define` in
`tools-js/rsdnt_property.arc` has them:

```
EVENTPOINT9001001 -> 3190222199   Trade Point
EVENTPOINT9002001 -> 2895331993   Superior Transaction P
EVENTPOINT9003001 -> 338634236    Special Deal P
```

The numbering lines up with `mst_shop_id` 1 / 2 / 3. All three tabs were hardcoded
to the first id, which is why they displayed the same number and why spending in
one moved all three -- the "all discounted" symptom.

`box.points` now holds a row per currency; `/api/shop/info` names each tab's
currency and `buy` spends the one the request's `mst_shop_id` selects.

Writes the whole `box.points` array rather than using `arrayFilters`: a filtered
update can only touch rows that already exist, so the two currencies added later
would never have been created.

### item_limit may reach 0

An earlier revision floored it at 1 to avoid the EXCHANGED badge. That was
backwards: `item[28] == 0` IS the greyed-out state. Flooring meant an exhausted
item still looked buyable and the purchase failed at the server. Now 0 is allowed
and the cap is refused with code 55 (`ITEMS_NOT_ENOUGH`) rather than 1.

### Why the point balance does not refresh after a purchase

Traced in `libMHS.so` rather than guessed.

`uGUIMenuExchange::updateDispExchangePoint` (0x1c2dfa8) is exported, so it is
called through the PLT, not a direct `bl` -- which is why grepping for
`bl 1c2dfa8` finds nothing. The stub is at 0x10d76d0. It has exactly three
callers:

```
uGUIMenuExchange::receiveMessage    @ 0x1c2dadc
uGUIMenuExchange::appear            @ 0x1c2dc04
uGUIMenuExchange::updateTabChangeDisp @ 0x1c2fa54
```

So the header refreshes on: opening the post, switching tab, and one specific
incoming message. Nothing else.

`receiveMessage` dispatches on the message id at `[x19, #856]` through a 5-entry
jump table at 0x29223d0. Decoding it (target = 0x29223d0 + int32 LE):

```
case 0 -> 0x1c2d94c   returns, no refresh
case 1 -> 0x1c2d990   returns, no refresh
case 2 -> 0x1c2d9b4   setCollisionEnable, no refresh
case 3 -> 0x1c2d9c0   setCollisionEnable, no refresh
case 4 -> 0x1c2d9d8   runs on to the updateDispExchangePoint call
```

Only **message id 4** refreshes the balances. Case 4 walks into the same tail
that reads the selected tab, resolves its `mst_event_point_id` via
`sServer::getShopInfo()`, and calls `updateDispExchangePoint`.

Still open: which server response the client turns into message id 4. That is
the single remaining unknown, and it is a lookup, not an investigation.

#### Resolved 2026-10-11: it was never about message id 4

The stale counter was a *response-shape* bug, not a missing refresh trigger.

`updateDispExchangePoint` gets each tab's number from `uMenuExchange`'s cached
fields (+0x24c/+0x250/+0x254/+0x258), which `uMenuExchange::setTradePointAll`
(0x1c33b14) fills from `sServer::getItemPointNum(id)`. That is a hash lookup into
the client's local `cMHiMap<nServer::cItemPoint>` (sServer+0x3318) -- the same
map the login box populates. The header therefore prints the *cache*, never the
response body directly.

The only thing that updates that cache after a purchase is
`sServer::setupShopBuyResponse` (0x1937b40), which runs on every `/shop/buy`
response:

```
addBoxData(&response->[0x60]);                 // item_contents, additive
// then: cItemPoint[point.mst_event_point_id].mNum = point.amount
```

`cAPIShopBuy::Response::setup` (0x169bc28) parses exactly three things:

| JSON | offset |
| --- | --- |
| `item_contents` (materials/…, additive) | +0x60 |
| `point.amount` | +0x2e0 |
| `point.mst_event_point_id` | +0x2e8 |

There is **no** top-level `points` array and no `payments` in this response. The
old body (`points: [{…}], payments: []` in `shop.controller.ts`) was silently
ignored: the materials landed and the server debited, but the cached balance
never moved -- so every later refresh (tab switch, re-opening the post) printed
the old number until the box was fetched again, i.e. a game restart. The reply
must carry a single `point` object, the same shape `equip_sell.point` already
uses (`box.controller.ts`), whose parser
(`cAPIBoxEquipmentSale::Response::setup`, 0x12fc490) reads those same two
fields.

Do **not** move the new balance into `item_contents.points`: `addBoxDataPoint`
*adds*, so it would be summed on top of the old value.

Fixed and deployed 2026-10-11 (buy success + both refusal branches now send
`point`, and the daily-limit branch reports the tab's own currency instead of
always the base Trade Point). Verified live: the response carries
`point:{amount,mst_event_point_id}`, the DB balance and the response agree.
Message id 4 is still an open lookup, but it no longer explains the bug.

## Round of small fixes (2026-10-13)

### Extra Treasure Bun / PowerUp (マシマシ宝まん)

The pre-quest PowerUp menu offers the Extra Treasure Bun (MenuCmn 1092/1106/
1107). It was greyed out on every quest. `uGUIMapQuestPowerUp::
updateRewardExtensionButton` reads the free count out of `cGameUserInfo`:

| cGameUserInfo | from notice `increase_info` |
| --- | --- |
| +0x60 `mFreeRewardExtensionCount` | `now_num` |
| +0x64 (allowance) | `max_num` |
| +0x68 | `remain_time` |
| +0x6c (absolute deadline) | `now + remain_time` |

`sResponse::setupNoticeGet` (libMHS.so) copies those four fields verbatim; the
menu only offers the bun when `max_num - now_num >= 1`. The notice route sent
`increase_info:{0,0,3600}`, so the count was always zero. It now sends
`{max_num:2, now_num:1, remain_time:86400}` (env `POWERUP_FREE_BUNS_USED/_MAX/
_REMAIN`). `free_auto` (+0x3c) is the sibling free-auto count and was left at 0
because the auto potion already works without it.

The quest-start responses also now echo the request's `power_up` instead of a
hard zero (`instance_data.power_up`), for island/event/training/eternal.

### Quest best time showed 99:59

The client sends the clear time in **milliseconds** in the "end" request (its
in-quest timer is a float of seconds x1000), but the quest list renders
`clear_time` as **seconds** (mm:ss, minutes capped at 99). Handing back the raw
value overflowed the display, so every cleared quest read 99:59. `tempoPerLista`
in `services/questTime.ts` converts ms -> s for the island, eternal and event
lists (`QUEST_TIME_ALREADY_SECONDS=1` disables the conversion).

### Trading Post growth items and enhancement grouping

- Partner growth orbs now cost 100 Special Deal Points (shards stay 50) and
  every growth item stocks 50/day (`limite`/`scorta` on `RigaVetrina`), resetting
  at 5:00 with the rest of the post.
- All enhancement materials are grouped on the Special Deal tab (with the rare
  materials and growth items) instead of being split across the common and mid
  tabs, so they can be found in one place.

### Palico (otomo) levelling (2026-10-13)

Palicos are the opposite of partners. The client derives everything from `exp`:

- `box/otomo/get` returns `{ created, exp, mst_otomo_id, otomo_id, subskill }`
  -- **no level and no stats**. The client calls `sOtomo::getLevelFromExp`
  against the master table (`rsdnt_otomo.arc`).
- Extracted to `src/json/otomo-grow.json` (per `mst_otomo_id`: `maxLevel` and
  the cumulative `expByLevel`) and `src/json/otomo-skills.json` (the 256-entry
  subskill pool). `mOtomoCharId` in the master *is* the `mst_otomo_id` the box
  uses (498951865 = カカオ, 1790596655 = スフレ, 2092467563 = ワッフル).
- Curves differ wildly per palico: カカオ needs 755 exp for level 2 (4,712,000
  for level 80), ワッフル 387 / 589,000 for level 40. Regenerate with
  `node tools-js/build-otomo-tables.cjs` (source `tools-js/rsdnt_otomo.arc`).

Exp comes from quest results. The end response carries

```
otomo_result[] = { get_exp, mst_otomo_subskill_id, otomo_id }
```

(`nResponse::Otomo_result`); the client applies it and shows `uGUIResultOtomoExp`.
The quest **end** request has no otomo, so the start request's `otomo[]` is
remembered in `doc.otomo_avviati` (`services/otomoQuest.ts`) and used at the end.
Note the field is a bare **array of `otomo_id` strings**
(`cMHiParser::getArrayString("otomo")`), not objects -- parsing it as objects is
why the first cut granted nothing. `otomoQuest.otomoIdsDaRichiesta` accepts both
shapes, and `islandEnd` falls back to the selected `otomoteam` if the start list
came back empty.

Implemented:

- `services/otomoGrow.ts` -- level/exp lookups, `applicaExpOtomo`, and the
  subskill-slot rule read out of `cOtomoWSData`: 0 slots below level 10, then 1 /
  2 / 3 opening at levels 10, 25 and 75.
- `services/otomoQuest.ts` -- grants `OTOMO_QUEST_EXP` (default
  **10000-100000**) to the
  palicos that set off, persists `box.otomos[].exp` (and `level`), teaches a
  subskill when a level-up opens a slot, and returns the `otomo_result` rows.
  `OTOMO_SKILL_ON_LEVELUP=0` disables the subskill teaching.
- `box/otomo/skill/remove` (was commented out): forget one subskill. It drops
  the hash from `subskill[]` **without** leaving the "No Skill" placeholder
  (2006012238) behind -- that leftover is what makes the next learned skill show
  up as "No Skill".
- Wired through `islandStart`/`islandEnd` plus the eternal and event starts
  (their ends all route to `islandEnd`). Training is **not** wired: its end
  response has no `otomo_result` field.

The exp amount is a server choice -- the original formula is not in the client
and the client derives the level from whatever we store, so the env knob simply
sets the pace. 1000 is roughly one early level per quest (カカオ: 755 to level 2)
and slows down as the curve steepens.

Random encounters were added later (services/otomoEncounter.ts): an island clear
can leave a Palico the box does not own yet, written to `box.otomos` in the same
update and announced with `get_mst_otomo_id`. Event/eternal ends share
`islandEnd` but have no island, so they never drop one. `OTOMO_ENCOUNTER_CHANCE`
(default 20, percent) sets the frequency, `0` disables it. See
[docs/OTOMO-PALICO.md](OTOMO-PALICO.md), which also explains why a level 69
Palico has exactly 2 subskills (slots open at 10/25/75) and lists the English
name dictionary (`lavoro-traduzione/otomo/otomo-nomi.json`).


### Partner level-up ended on a 404

Feeding a partner succeeded (`/api/box/partner/levelup` 200) but the client then
refreshes the list through `/api/box/growthitem/get`, which had never been
registered -- so every level-up (colorless orbs included) finished on a 404.
Added `boxRouter.post('/growthitem/get')`; the reply is the single
`growth_items[]` of `{ amount, mst_growth_item_id }` that
`cAPIBoxGrowthItemGet::Response::setup` reads (the same shape `partnerLevelup`
already returns).

### Growth-item counts went stale after a level-up

Once the 404 was gone, fully spending an item (e.g. the last orbs) left the
partner menu still showing the old number: the client refreshes only the rows it
is told about, and the reply *omitted* any row that had reached zero, so the menu
kept the previous count. The player could then "select" orbs that were already
spent, and the next level-up failed with `MATERIALS_NOT_ENOUGH` (the client
drops back to the menu).

Two changes in `box.controller.ts`:

- `partnerLevelup` no longer deletes a row when its count reaches zero; it keeps
  it at `0` so the client's cache stays in step.
- Both `partnerLevelup` and `growthitemGet` now answer with the **whole**
  growth-item catalogue (`services/partnerGrow.ts`) using the box amounts
  (`0` when the player has none), via `elencoCrescita()`. The menu always
  receives a row for every item, so a spent one can never keep a stale count.

### Node → story mapping was shifted one scene on every island after the first

Each island's `part_info.mChartStoryList` had the **previous** island's departure
scene prepended, and `full_enabled_state.json` assigned the list to the nodes
position-by-position. So every island-2+ node got the scene one step too early -
island 2's port played island 1's "we need Argo's permission to sail" send-off
instead of island 2's real arrival, `Story_00002_001_01` (*"We've arrived! This
is the second island, Lumbai Island! …"*).

Fixed by regenerating every node's `mst_story_id`: keep only the island's own
chart scenes (drop the foreign leading ones), assign them to the nodes in order,
and put the island's exit scene (`mStoryType 3`) on the exit node. Island 1 comes
out byte-identical (it was already correct), which is the sanity check that the
rule is right.

That first remap still assigned the scenes to the nodes in raw file order, which
soaked them onto the leading nodes and left the *later* `t3` passage nodes with
`mst_story_id 0` (silent). A later pass assigns each island's blocks to its story
nodes (`t1`/`t3`/`t4`) positionally instead - see "The blocks live on the story
nodes" below. The scene files themselves are complete in `GUI.81`-`GUI.94`.

### Next island stayed locked after finishing the exit coast

`statoStoria` opened the next island when a `type 4` (exit coast) node was
reached - but the exit is **not** the last node of its island in the progression
list (island 2 has three nodes after it). The walk kept going through those,
found one whose last two quests weren't cleared, and `break`-ed **before** ever
reaching the next island, so finishing island 2 never unlocked island 3.

Fixed: once an island's exit is reached it's marked "conclusa", and its remaining
nodes stay listed without ending the walk, so the next island (opened by the
exit) is reached. Regression test added.

### Subjugation-request story nodes never advanced

A story scene can hand the player a **Subjugation Request** through the markup
`<POP1 8,PART00002_NODE00103>` - the name after the comma is a node, resolved
via `tuning/xml/define/node_define` (`PART00002_NODE00103` → `1760759807`,
Tambaqui Coast). The client then shows "Subjugation Request: <monster> …
sighted at <island>", and the scene has follow-up parts (`Story_00002_003_01`
request → `_02` still-outstanding → `_03` completion).

Our map always sent node `state: 1`, so even after the flagged quest was cleared
the node still read as pending and the scene never moved on. `enrichOceanData`
now sets a node's `state` to `3` when it has a cleared **Subjugation**
(`QuestType`) quest - the node-side signal the scene needs. (Request binding is
per-node, so this covers every subjugation-request scene, not just one.)

The story node itself needed a second lever: it kept reporting the request part
(`Story_00002_003_01`) as its `mst_story_id`, and the client never moved to the
completion part. `src/json/story-requests.json` (built from the game's GMD story
scenes, `tools-js`-style extraction) records, for every scene carrying a
`<POP1 type, node>` markup, the scene's story hash, its block
(`Story_00002_003`) and the target node; plus every block's parts in order.
`enrichOceanData` now, for a node whose story is such a request and whose target
node is in the "fulfilled" set, reports the block's **final part** (the first
part after the last POP part) instead - so Abigail's request finally plays its
completion ("We slew it!").

**Proper progression (watch-driven).** A block is multi-part (`_01` request →
`_02` outstanding → `_03` completion → `_04` epilogue) and the client marks each
part it plays as watched in `storie_viste`. `islandMapAll` passes `storie_viste`
into `enrichOceanData`, and `parteDaMostrare()` hands back the block's **first
part after the highest watched one**, staying on the last part once the block is
done (never rewinding to `_01`, which had put the request in a loop). With
nothing watched it starts at `_01`.

**Do NOT advance across blocks.** An earlier revision walked the whole island
sequence (`002 → 003 → 004 → 099`) so a node would show the next unwatched scene
of *any* block - which made each story node play every event in turn, including
not-yet-unlocked ones (the departure, and a Gobul request for a node the player
didn't have). Each block must stay on its own node; the advance is block-scoped.

**The blocks live on the story nodes (t1/t3/t4), one each, in order.** A node's
scene is entirely server-driven: `sQuestWorkspace::requestDramaStory` plays the
node's `mst_story_id` (resolved through `story_info`→`drama_info`, where the story
drama carries `getDefineType == 0x21`), and the client remembers what it watched
in its **own** cache (`sDramaManager::reqSaveCache`, `sdcard://AppHome/Cache`,
`drama\cache`) - the protocol carries no watched flag and there is no server
endpoint for it. So the map has to hand each node the right story.

Island 2 had two passage (`t3`) nodes the earlier remap left with `mst_story_id = 0`
(pressable, click sound, no camp - identical symptom to the un-patched port). The
raw-order remap had soaked the scenes onto the first nodes in file order, leaving
the *later* `t3` nodes empty. `full_enabled_state.json` now assigns each island's
main-line blocks (001, 002, …) to its `t1`/`t3` nodes **positionally**, and the
`t4` exit carries `099`; the quest zones (`t2`) carry no story. Island 2 comes out
`t1→001, t3→002, t3→003, t3→004, t4→099`. This is behavior-neutral for island 1:
its `t3` nodes used to store `_92`/`_03` bases, but `parteDaMostrare` normalises to
the block's first unwatched part anyway.






### Key Quests / Special Requests

- **Key Quest** (キークエスト) = the story-gate quest of each zone (the last
  day/night pair, `x-7`/`x-8`). Finishing it opens the next map node; it has no
  cutscene of its own.
- **Special Request** (特別依頼) = a subjugation quest. Its reward is not put in
  the box at the end of the hunt; the game *sends* it to the present box
  ("依頼達成の報酬が送られてきました"). `islandEnd` now does that: for a quest in
  `src/json/special-requests.json` (the `node_info.mSubjugationQuestList` ids)
  it creates a `Present` with the won items instead of crediting them directly,
  so the player receives them from the present screen.

### Island 2's port story would not start (client-data patch)

The チミミュリ集落 port scene (story `282500997`) never played, while the second
island-2 node did. Both stories and their dramas exist in the client, but the
port drama (`3441885821`, content `Story_00001_006_01`) is tagged with
`mParentHash = 3815380063` (island 1) in `drama_info`, while every other island-2
scene is tagged `2053326309` (island 2); the client's play list keys off that
tag. Fixed by patching the **served** client pack (this is client data, not a
server response):

- `rsdnt_scenario.arc :: tuning/xml/drama/drama_info` - drama `3441885821`'s
  parent changed to `2053326309`.
- Repacked with `tools-js/arc-repack.cjs` semantics and swapped into
  `src/public/res/download/android/v0282/stdDL/cmn/resident.00.fpk` with
  `tools-js/fpk-replace.cjs` (17/17 other entries byte-identical).
- `src/public/res/download/android/v0282/stdDL/download.list` deleted so the
  server regenerates it with the new pack CRC; that is what makes clients
  re-download the pack. If a resource pack is ever rebuilt from the game files,
  this patch must be re-applied.

### Trading Post growth items refused with error 55

Error 55 is `ITEMS_NOT_ENOUGH`. The shelf advertised the per-item daily limit
(`item_limit`, 50 for growth items via `RigaVetrina.limite`) but the purchase
check still compared against the global `PER_GIOCOATORE` (10), so the 11th
growth item of the day was rejected even with points to spare. `buy` now checks
`articolo.limite`, the same number the shelf shows; materials keep their own
(catalog) limit and still refuse correctly.

### Story scenes replayed on every visit

The island's story scenes (the camp dialogues, the passages, the exit-coast
"we found the relic" scene) are played by the client from its own translated
scripts and then reported to `POST /api/story/end`. That route never recorded
anything, and the map is rebuilt from `full_island` (which always carries the
node's `mst_story_id`), so every scene replayed on the next visit -- e.g. Eliza
repeating the "Argo has to give us landing permission" line on any camp node.

Now `story/end` stores the watched `mst_story_id` in `user.storie_viste`
(`$addToSet`) and echoes the request's `mst_part_id` back (its own reply used to
carry `mst_part_id: 0` for any scene it does not special-case, which leaves the
client without a current island).

**Do not try to stop the replay by zeroing `mst_story_id` in the map.** That was
tried and reverted: the scene *starts* only when the node still carries its story
hash (`sQuestWorkspace::requestDramaStory` plays it whenever `[node+0x10]` is
non-zero), so clearing it makes every camp/passage node inert -- pressable, a
click, then nothing, exactly like the one island-2 port node that never plays.
The client keeps its own watched-drama cache (`sDramaManager`, `reqSaveCache`)
and nothing in the protocol carries a "watched" flag; the replay of the Elizan
"Argo permission" line is still open.


### Finishing a hunt on island 2 dropped you back on island 1

`islandEnd` hard-coded the reply's `mst_part_id` to 3815380063 (the first
island), so the client always placed the player back there after any hunt. It
now uses the island the quest belongs to, falling back to island 1 only for
quests that are not on the story map. The lookup is `ISOLA_PER_QUEST` built from
`full_enabled_state.json` (which lists **every** quest, including the Special
Request / subjugation ones like 3-9/3-10), then
`isolaDiQuest` (`services/progressioneStoria.ts`) as a second source - that file
only lists a node's main quests, so a Special Request hunt used to fall back to
island 1 and dump the player there.






