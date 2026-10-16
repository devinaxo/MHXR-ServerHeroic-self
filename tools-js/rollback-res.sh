#!/bin/sh
# Riporta i pack delle risorse allo stato di una versione precedente, usando i
# backup in backups/res-<versione>/.
#
#   sh tools-js/rollback-res.sh <versione_target>          # ripristina i byte
#   sh tools-js/rollback-res.sh <versione_target> --check  # dice solo cosa farebbe
#
# Come funziona: v0282/stdDL e' l'unica copia reale, tutte le v0NNN e le
# dXXXX_YYYY sono symlink ad essa. Ogni publish lascia in backups/res-<V>/ i pack
# cambiati PROPRIO in V. Per tornare allo stato di <target> si ripristinano,
# dall'ultima versione in giu' fino a target+1, i pack di ogni backup: l'ultimo
# ripristino (target+1) e' quello che fissa lo stato voluto.
#
# ATTENZIONE: questo cambia i byte serviti ma NON la versione. Il client non
# torna mai indietro da solo: un client gia' alla versione alta vede ancora i
# byte nuovi finche' non ri-scarica. Dopo il ripristino va quindi pubblicato
# come NUOVA versione (RES_VER + 1) per far riscaricare ai client. Lo script
# stampa i passi esatti alla fine.
set -e
TARGET=$1
[ -n "$TARGET" ] || { echo "uso: rollback-res.sh <versione_target> [--check]"; exit 1; }
CHECK=$2
REPO="$(pwd)"
[ -d "$REPO/backups" ] || { echo "manca la cartella backups/"; exit 1; }

CUR=$(grep -oE 'RES_VER:[[:space:]]*[0-9]+' src/constants/protocol.ts | grep -oE '[0-9]+')
[ -n "$CUR" ] || { echo "RES_VER non trovato in src/constants/protocol.ts"; exit 1; }
echo "versione corrente: $CUR   target: $TARGET"

if [ "$TARGET" -ge "$CUR" ]; then
  echo "il target non e' piu' vecchio della versione corrente: niente da fare."
  exit 0
fi

V=$CUR
while [ "$V" -gt "$TARGET" ]; do
  LABEL="res-$(printf '%04d' "$V")"
  DIR="$REPO/backups/$LABEL"
  if [ -d "$DIR" ]; then
    find "$DIR" -name '*.fpk' -type f | sort | while read -r f; do
      rel=${f#"$DIR"/}
      dest="$REPO/src/public/res/download/android/v0282/stdDL/$rel"
      if [ "$CHECK" = "--check" ]; then
        echo "  [check] $LABEL/$rel -> v0282/stdDL/$rel"
      else
        cp "$f" "$dest"
        echo "  ripristinato $rel da $LABEL"
      fi
    done
  else
    echo "  ATTENZIONE: manca $LABEL; i pack cambiati nella $V non si possono ripristinare"
  fi
  V=$((V - 1))
done

if [ "$CHECK" = "--check" ]; then
  echo "(--check: nessuna scrittura)"
  exit 0
fi

echo ""
echo "Fatto. Ora rigenera i manifest e pubblica come NUOVA versione (il client"
echo "non torna indietro da solo), poi rimetti i nomi/pack con il flusso normale:"
echo "  find src/public/res/download/android -name download.list -delete"
echo "  sg docker -c 'docker compose -f docker-compose.prod.yml up -d --build server'"
echo "  sh tools-js/pubblica-risorse.sh <NUOVA>"
echo "  # aggiorna RES_VER a <NUOVA> in src/constants/protocol.ts e ricompila"
echo "  node tools-js/verify-bump.cjs http://127.0.0.1:8081 $CUR <NUOVA>"
