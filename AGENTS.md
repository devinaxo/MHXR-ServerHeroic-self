# AGENTS.md: how we work in this repo

This file is for AI agents (and humans) working on **MHXR-ServerHeroic-self**, a
self-host fork of the Apypos MHXR server with an English translation on top.
`CLAUDE.md` describes the upstream server architecture; this file describes **our
working agreement**.

## Golden rules

1. **Never commit, push, or publish without explicit sign-off.** Do the work,
   leave it in the working tree, and show it. `git commit`, `git push`,
   `pubblica-risorse.sh`, `RES_VER` bumps and Docker rebuilds all count.
2. **Always work on `private/live`.** No feature branches, no PR flow. The owner
   runs a single server and needs changes testable immediately. (Branches were
   tried and abandoned, do not recreate `feat/*`.)
3. **Everything lives in the repo.** No `/tmp`, `/var/tmp`, or other scratch
   dirs. Generated artifacts, scripts, dictionaries and reports go under the
   appropriate repo folder so they are reviewable, committed and reusable.
4. **Read the docs first.** Most tasks here already have a documented procedure
   and prior art. Check `docs/` (index below) and `TRANSLATION.md` before
   inventing a new approach. If you do something new, write it down.
5. **Keep the translation separated and self-contained**, so any other server
   owner can apply it to their own packs. The canonical tutorial is
   **`TRANSLATION.md`**; keep it current at all times. It is a deliverable, not
   an afterthought.
6. **Never rebuild/publish carelessly.** A publish changes what every client
   downloads. Back up the packs first; remember the client only moves *forward*
   in `RES_VER`.
7. **Document every publish in `src/constants/protocol.ts`, in English.** Each
   `RES_VER` gets a comment saying what changed (pack, arc, field, tool, and any
   gotcha). The block is the authoritative resource-version log; keep it up to
   date with every publish, and keep the wording in English.
8. **No em dashes, ever.** Do not use em dashes or en dashes (the long dash
   characters, U+2014 and U+2013). Use a comma, colon, parentheses, or " - "
   instead. This applies to docs, comments and commit messages.

## Writing style

- English, plain and direct.
- No em dashes or en dashes (see rule 8).
- Keep the version log in `src/constants/protocol.ts` accurate and in English.

## Working directory / where things go

| What | Where |
| --- | --- |
| Server code | `src/` |
| Game data tables (JSON the server reads) | `src/json/` |
| Client packs (untracked, served) | `src/public/res/download/android/v0282/stdDL/` |
| Maintenance + translation tooling | `tools-js/` |
| Translation workspace (dictionaries, generators, workers) | `lavoro-traduzione/` |
| Documentation | `docs/` |
| Per-version pack backups | `backups/res-<ver>/` |

The `server` container bind-mounts `./src/public` to `/app/src/public` and
`./tools-js` to `/app/tools`, so editing those on the host takes effect
immediately (the runtime read of `/app/dist/public` is a symlink to
`/app/src/public`).

## Translation work

The English translation is applied to the **client packs** (`resident.00.fpk`,
`GUI.00.fpk`); the game reads names/text from those, not from the server. The
pipeline is: pull the arc, rewrite strings with a `{jp -> en}` or `{old -> new}`
dictionary (`tools-js/traduci-rsdnt-arc.cjs`), put it back (`fpk-replace.cjs`),
regenerate manifests, publish a new `RES_VER`.

- **Tutorial / how a user applies it to their own server: `TRANSLATION.md`.**
- Dictionaries and generators live in `tools-js/` and `lavoro-traduzione/`.
- Apply/verify/rollback conventions: `docs/RESOURCE-PUSHES.md`,
  `docs/RESOURCES-ROLLBACK.md`, `docs/STRING-EDITS.md`.

### Documentation index

| Doc | Subject |
| --- | --- |
| `TRANSLATION.md` | **How to apply the whole translation** (the tutorial) |
| `docs/HANDOFF-QUEST-TRANSLATION.md` | quest-name translation + the rsdnt pipeline |
| `docs/ITEM-NAME-FIX.md` | official monster names for material/part items |
| `docs/MATERIAL-NAMES-WRAP.md` | shorter material names + controlled line wrap |
| `docs/PARTNER-SKILLS-TRANSLATION.md` | partner skill names/descriptions |
| `docs/OTOMO-PALICO.md` | Palico random encounters, subskill slots and English names |
| `docs/SKILL-TRANSLATION.md` | hunter arts / skills / melodies |
| `docs/DIALOGUE-TRANSLATION.md` | story/event dialogue (GMD in GUI.78 to GUI.94) |
| `docs/STRING-EDITS.md` | editing strings inside XFS/ARC/FPK safely |
| `docs/RESOURCE-PUSHES.md` | the publish + `RES_VER` history convention |
| `docs/RESOURCES-ROLLBACK.md` | rolling resource packs back |
| `docs/SELFHOST-HANDOFF.md` | running the fork / deployment |
| `docs/EVENT-QUESTS-BLOCKS.md` | event/ticket quest blocks |
| `docs/QUEST-EQUIP-PREVIEW.md` | quest reward "equipment" panel |
| `docs/OMAMORI.md`, `docs/ARTS-UPGRADE.md`, `docs/UPGRADE-COSTS.md` | server systems |

### Conventions

- Material/item names follow the Canadian release where known (short forms,
  `Award` not `Proof`, `C.Qurupeco`/`S.Rajang` abbreviations, `Fire Silk`, ...).
  See `docs/MATERIAL-NAMES-WRAP.md`.
- Printed `%` must stay full-width (`％`) so the game's text engine does not eat it.
- Text fields are narrow; names must fit their box (materials about two 12-cell
  lines). Prefer short names over mid-word auto-wrap.

## Publishing resources (only with sign-off)

1. Back up the pack(s) you are about to change.
2. Apply the edit, `find src/public/res/download/android -name download.list -delete`.
3. Rebuild the server so the manifests regenerate.
4. Add the new `<ver> <pack>` line to `tools-js/aggiornamenti-risorse.txt`, add an
   English comment to `src/constants/protocol.ts`, bump `RES_VER`, then
   `sh tools-js/pubblica-risorse.sh <ver>`.
5. `node tools-js/verify-bump.cjs http://127.0.0.1:8081 <old> <new>`.

The client advances one version at a time; never publish a lower `RES_VER`.

## Commits (after sign-off)

Conventional-commit style (`i18n(materials): ...`, `feat(quests): ...`). Keep
server changes and translation-content changes in separate commits where
practical. No em dashes in messages.
