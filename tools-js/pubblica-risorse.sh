#!/bin/sh
# Create the diff folders a client actually asks for when RES_VER rises.
#
# The game walks ONE version at a time: a client sitting at 282 whose server
# reports 286 does not request d0282_0286, it requests d0282_0283, applies it,
# saves 283, then asks for d0283_0284, and so on until it reaches the server's
# version. Verified from the server logs on 2026-10-07, where a 404 showed the
# client asking for /res/download/android/d0282_0283/stdDL/download.list.
#
# That is why the original pubblica-risorse.sh is the wrong shape: it builds
# d<old>_<new> for the whole span at once (d0282_0286, d0283_0286, ...), which
# the client never requests.
#
# For each step V -> V+1 the folder lists the packs that changed at V+1, taken
# from tools-js/aggiornamenti-risorse.txt, and symlinks them into the real store
# in v0282/stdDL/. The crcjam in each line is copied from v0282/stdDL/download.list,
# so that manifest must be regenerated (delete it, restart the server) after any
# pack edit, BEFORE running this.
#
#   sh tools-js/pubblica-risorse.sh <NUOVA>     (from the project root)
#
# <NUOVA> is the new RES_VER. Steps are generated for every version between the
# oldest recorded version and <NUOVA>, so raising it by several versions at once
# works.
#
# It ALSO snapshots the packs changed in <NUOVA> into backups/res-<NUOVA>/, so
# every published version can be rolled back with tools-js/rollback-res.sh.
# An existing backup is never overwritten. See docs/RESOURCES-ROLLBACK.md.
set -e
NUOVA=$1
[ -n "$NUOVA" ] || { echo "uso: pubblica-risorse.sh <versione nuova>"; exit 1; }

STORICO="$(pwd)/tools-js/aggiornamenti-risorse.txt"
REPO="$(pwd)"
BASE=src/public/res/download/android
cd "$BASE"

MANIFEST=v0282/stdDL/download.list
[ -f "$MANIFEST" ] || { echo "manca $MANIFEST: riavvia il server dopo averlo cancellato"; exit 1; }

# v<NUOVA> -> v0282, so the full-install path resolves too.
P=$(printf '%04d' "$NUOVA")
[ -e "v$P" ] || ln -s v0282 "v$P"
echo "v$P -> $(readlink "v$P")"

# A client sitting at any version below the lowest recorded one needs that first
# step too: a client at 282 (our original RES_VER) asks for d0282_0283, which the
# history's lowest entry (283) would otherwise never generate. PRIMA-1 is the
# floor.
PRIMA=$(($(grep -v '^#' "$STORICO" | awk 'NF{print $1}' | sort -n | head -1) - 1))
echo "passi da $PRIMA a $NUOVA"

V=$PRIMA
while [ "$V" -lt "$NUOVA" ]; do
  NEXT=$((V + 1))
  DIR="d$(printf '%04d' "$V")_$(printf '%04d' "$NEXT")/stdDL"
  # packs changed exactly at version NEXT
  FILE=$(grep -v '^#' "$STORICO" | awk -v n="$NEXT" '$1==n {for(i=2;i<=NF;i++) print $i}' | sort -u)

  rm -rf "d$(printf '%04d' "$V")_$(printf '%04d' "$NEXT")"
  mkdir -p "$DIR"
  : > "$DIR/download.list"

  for F in $FILE; do
    # The link lands at d<V>_<N>/stdDL/<subdir>/<file>, and the target lives in
    # android/v0282/stdDL/<subdir>/. From the link's own directory that is one
    # ".." per component of <subdir>, plus one to leave stdDL and one to leave
    # d<V>_<N>: DEPTH + 1. cmn/GUI.00.fpk has DEPTH 2, so three "..".
    DEPTH=$(awk -F/ '{print NF}' <<EOF
$F
EOF
)
    UP=""
    i=0
    while [ "$i" -le "$DEPTH" ]; do
      UP="../$UP"
      i=$((i + 1))
    done
    mkdir -p "$DIR/$(dirname "$F")"
    ln -sf "${UP}v0282/stdDL/$F" "$DIR/$F"
    grep "^/stdDL/$F," "$MANIFEST" >> "$DIR/download.list"
  done

  echo "  $DIR: $(grep -c . "$DIR/download.list") pacchetti"
  V=$NEXT
done

# ---------------------------------------------------------------------------
# Backup automatico della versione appena pubblicata.
#
# v0282 e' l'unico posto reale: ogni v0NNN e dXXXX_YYYY e' un symlink a v0282,
# quindi sovrascrivere un pack cambia cio' che TUTTE le versioni servono. Senza
# una copia dei byte vecchi un publish non si torna indietro (git non li ha: i
# .fpk sono ignorati, e la copia dietro il symlink non si recupera).
#
# Qui si fotografano i pack cambiati in NUOVA, presi da v0282 (che ora contiene
# i byte nuovi) dentro backups/res-<NUOVA>/. Per tornare a una versione N basta
# ripristinare, dall'ultima in giu' fino a N+1, i pack di ogni backups/res-<V>:
# ogni backup contiene i pack cambiati PROPRIO in quella versione.
#
# Se il backup esiste gia' non lo si tocca: un backup buono non va mai
# sovrascritto da un publish successivo.
LABEL="res-$(printf '%04d' "$NUOVA")"
if [ ! -d "$REPO/backups/$LABEL" ]; then
  FILES_NUOVA=$(grep -v '^#' "$STORICO" | awk -v n="$NUOVA" '$1==n {for(i=2;i<=NF;i++) print $i}' | sort -u)
  if [ -n "$FILES_NUOVA" ]; then
    echo "backup -> backups/$LABEL"
    node "$REPO/tools-js/backup-packs.cjs" "$LABEL" $FILES_NUOVA
  fi
else
  echo "backup backups/$LABEL gia' presente, non toccato"
fi
