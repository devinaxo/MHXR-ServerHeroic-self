# Resources: backups and rollback

**Rule: never publish a resource pack without a backup of it first.** This is now
enforced automatically, but the reasoning matters because the setup is unusual
and a lost pack is genuinely unrecoverable.

## Why this is needed

All resource versions are the same bytes:

```
src/public/res/download/android/
├── v0282/stdDL/cmn/GUI.00.fpk        <- the ONLY real copy
├── v0287 -> v0282                     symlink
├── v0289 -> v0282                     symlink
├── d0287_0288/stdDL/cmn/GUI.00.fpk -> ../../../v0282/stdDL/cmn/GUI.00.fpk
└── ...
```

Every `v0NNN` tree and every `dXXXX_YYYY` diff folder is a **symlink** into
`v0282`. So overwriting `v0282/stdDL/cmn/GUI.00.fpk` changes what *every*
version serves. There is no per-version storage.

The packs are also **gitignored** (`git status` never lists them), so
`git checkout` cannot bring one back. For a long time the only copies that
existed were ad-hoc temp copies, which a reboot deletes.

Net effect: edit a pack, publish, and the previous bytes are simply gone. That
is how an earlier bad `GUI.00.fpk` was shipped twice with no way back except a
hand-made copy.

## The backup scheme

`tools-js/pubblica-risorse.sh` now snapshots, **automatically**, the packs that
changed in the version it just published:

```
backups/
├── res-0325-pristine-heroic/cmn/GUI.00.fpk
├── res-0326/cmn/GUI.00.fpk
├── res-0326/cmn/resident.00.fpk
├── res-0327/...
├── res-0328/...
├── res-0329/cmn/resident.00.fpk
└── <label>/backup.json     {label, createdAt, packs:[{path,size}]}
```

Each `backups/res-<V>/` holds the packs **changed at V**, as they were at V
(copied from `v0282` after the publish). Backups are made with
`tools-js/backup-packs.cjs`:

```bash
node tools-js/backup-packs.cjs res-0330 cmn/GUI.00.fpk   # manual, if ever needed
```

Two invariants:

1. **An existing backup is never overwritten.** `pubblica-risorse.sh` skips a
   label that already exists. A good backup must survive any later publish.
2. Backups are real byte copies, not symlinks or hardlinks. `cp` into `v0282`
   must not be able to edit a backup in place.

## Rolling back

Because a backup only holds the packs changed *at that version*, restoring works
from the top down. To return to the state of version `<N>`:

```bash
# 1. see what would be restored (no writes)
sh tools-js/rollback-res.sh <N> --check

# 2. do it: restores every pack changed in versions <N>+1 .. current
sh tools-js/rollback-res.sh <N>
```

`rollback-res.sh` reads the current version from `src/constants/protocol.ts`,
walks `backups/res-<V>/` from the newest down to `<N>+1`, and copies each pack
back over `v0282/stdDL/`. The last restore (`<N>+1`) fixes the `<N>` state.

Then republish:

```bash
find src/public/res/download/android -name download.list -delete
sg docker -c 'docker compose -f docker-compose.prod.yml up -d --build server'
sh tools-js/pubblica-risorse.sh <NUOVA>          # e.g. current + 1
# set RES_VER to <NUOVA> in src/constants/protocol.ts, then rebuild
node tools-js/verify-bump.cjs http://127.0.0.1:8081 <vecchia> <NUOVA>
```

**A client never goes backwards on its own.** It only downloads a version higher
than the one it saved. So a rollback is always published as a *new, higher*
version that re-serves the old bytes - which is exactly what version 328 was (a
rollback of 327, published as 328 so clients on 327 would fetch it).

## What a backup does *not* cover

- Versions before `res-0325` have no backup (the scheme started there). Old
  packs for those are not recoverable - only the pristine set is kept as
  `backups/res-0325-pristine-heroic`.
- The database is **not** part of this. Character data, quest `mBlocks`, etc. are
  backed up separately (`tools/Backup-Mhxr.ps1`). Never `docker compose down -v`.

## One-line summary

Publish through `pubblica-risorse.sh` and every version gets a permanent,
byte-exact backup; roll back with `rollback-res.sh <version>` and republish.
