# Handoff - quest name translation (and resource backups)

From: the quest-translation work. To: whoever owns the server/texture work next.
Everything here is on top of the current tree; nothing under `translations/` was
touched by me.

## State right now (2026-10-12)

| Thing | Value |
|---|---|
| `RES_VER` | **329** |
| `cmn/resident.00.fpk` | `6b9f58b6` - **English quest names** |
| `cmn/GUI.00.fpk` | `476e66ec` - your texture set (unchanged by me) |
| `backups/` | res-0325-pristine-heroic, 0326, 0327, 0328, **0329** |
| Quest DB `mBlocks` | back to the pristine baseline: 2014 quests with blocks, **2161 without** |

Container is up and serving 329; `verify-bump 328→329` passed.

## What I did

### 1. Quest names → English, in the client resource pack

Quest titles are read by the client from `resident.00.fpk` → `rsdnt_quest.arc`
(the server sends quest **ids**, not names). So translation is a pack edit, not a
server change.

- Dictionary: **`lavoro-traduzione/quest/quest-nomi.json`** - 4,182 entries,
  `{ "japanese": "English" }`.
- Monster table: **`lavoro-traduzione/quest/mostri.json`** - 168 JP→EN monster
  names (epithet + katakana), verified against monsterhunterwiki.org. Built from
  a wiki scrape; `mostri-da-completare.csv` is the input the owner filled in.
- Pipeline (verified): `traduci-rsdnt-arc.cjs` → `fpk-replace.cjs` →
  install into `v0282/stdDL/cmn/resident.00.fpk` → manifest regen →
  `pubblica-risorse.sh <ver>` → bump `RES_VER` → rebuild → `verify-bump.cjs`.

Coverage: all 4,173 distinct quest names have an English entry, but **778 still
contain a Japanese word or two** - unique event flavor text I couldn't translate
with confidence. They are left as-is rather than guessed. The rest, including the
entire story set, is English.

Titles must fit **≤25 half-width chars per line** (measured: the display field is
~26 columns; longer clips). Long bracket titles use a two-line form
(`[Difficulty]\nName`). Strings were also scrubbed of characters the game's text
engine interprets - `%` (printf), plus `★ ☆ Ⅰ-Ⅶ ×` → ASCII. Keep that rule if
you add entries.

### 2. Fixed a real bug in `traduci-rsdnt-arc.cjs`

It wrote ARC entries with raw deflate sizes (not 8-byte aligned) and dropped the
`0x40000000` flag on `+0x48`. Capcom pads every body to 8 and sets that flag, and
`fpk-align.cjs`'s own header says off-grid entries make the client read garbage.
Patched `scriviArc` to pad to 8 and set the flag. **If you use this tool, keep
that fix.**

### 3. Resource backup + rollback (your `backup-packs.cjs` convention, enforced)

- `tools-js/pubblica-risorse.sh` now **auto-snapshots the packs changed in the
  version it publishes** into `backups/res-<V>/` (never overwrites an existing
  backup).
- `tools-js/rollback-res.sh <target>` *(new)* restores the packs to any prior
  version from those backups.
- `docs/RESOURCES-ROLLBACK.md` *(new)* explains why (all `v0NNN`/`dXXXX` are
  symlinks to the single real `v0282` store, and the packs are gitignored, so an
  overwrite is otherwise unrecoverable).

## Open issues

### A. Event / ticket / eternal quests error 10001 - needs a block decision

`eventTicketStart` / `eventNormalStart` answer `QUEST_INFO_FAILED` when
`blocchiPerAvvio(quest)` is empty. The seeder loads event quests from
`event.extended.blank.json` (no blocks), and the DB has 2,161 quests with empty
`mBlocks` - all of event, ticket and eternal.

I tried the obvious fix and it backfired: `fix-blocks.cjs` reconstructs blocks
for the unmatched quests but falls back to the **tutorial island** (`l00_m01`)
for 1,668 of them, and the owner reported an event quest then played the
**prologue**. So I reverted all `mBlocks` changes (`fix-blocks.cjs --undo` + a
manual clear of the `autentico` rows) to leave a clean baseline.

**Recommended:** apply only the authentic blocks - `restore-real-blocks.cjs`
covers 967 event quests from `event.extended.json`. Do **not** run the
`l00_m01` fallback path. The rest of the event quests need a better
quest→block reconstruction (by block-name suffix, per the note in
`restore-real-blocks.cjs`) or they stay on 10001.

### B. Post-quest client hang - owner says it was texture-side

Story quests completed server-side fine (all 200, rewards credited), then the
client hung ~1-2 min and crashed. I isolated it first as not-the-text (strings
never exceed the original byte lengths; the pack round-trips 29/29). The owner
**worked out the texture errors**, which fits: the post-quest screen loads
`GUI.00.fpk` assets, and `event_parts04` / `town_*` / `nyanken_*` were the
problem textures. Nothing more for me there, but if it recurs, capture logcat -
`adb` is not installed on this host (phone `poco-x8-pro-max` is on the tailnet).

## How to re-apply / extend the quest translation

```bash
# re-apply to whatever pack is live (works on any res_ver):
node tools-js/fpk-pull.cjs fpk-pull src/public/res/download/android/v0282/stdDL/cmn/resident.00.fpk build/q.arc rsdnt_quest.arc
node tools-js/traduci-rsdnt-arc.cjs build/q.arc lavoro-traduzione/quest/quest-nomi.json build/q_en.arc
node tools-js/fpk-replace.cjs src/public/res/download/android/v0282/stdDL/cmn/resident.00.fpk build/res.new.fpk rsdnt_quest.arc build/q_en.arc
cp build/res.new.fpk src/public/res/download/android/v0282/stdDL/cmn/resident.00.fpk
find src/public/res/download/android -name download.list -delete
sg docker -c 'docker compose -f docker-compose.prod.yml up -d --build server'
sh tools-js/pubblica-risorse.sh <NUOVA>
# set RES_VER to <NUOVA>, rebuild, verify-bump.cjs
```

To finish the 778 partial names, edit `quest-nomi.json` (add/correct entries),
re-run the steps above. Keep titles ≤25 chars/line and avoid `%`, `★`, roman
numerals.

## Files I added/changed

- **new** `lavoro-traduzione/quest/quest-nomi.json`, `mostri.json`,
  `mostri-da-completare.csv`
- **new** `tools-js/rollback-res.sh`, `docs/RESOURCES-ROLLBACK.md`
- **edited** `tools-js/pubblica-risorse.sh` (auto-backup),
  `tools-js/traduci-rsdnt-arc.cjs` (ARC alignment + flag),
  `src/constants/protocol.ts` (RES_VER 329), `tools-js/aggiornamenti-risorse.txt`
- **not mine** `tools-js/backup-packs.cjs`, everything under
  `translations/`, `.gitignore`, `tools-js/fpk-align.cjs`

## Do-not-break list

- Don't overwrite an existing `backups/res-*`.
- Don't run `fix-blocks.cjs` reconstruction (the `l00_m01` fallback).
- Don't strip the `traduci-rsdnt-arc.cjs` alignment/flag fix.
- Client only moves **forward** a version; any revert is published as a new,
  higher version.
