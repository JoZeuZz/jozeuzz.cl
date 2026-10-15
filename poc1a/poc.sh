#!/bin/sh
# Única puerta de entrada a los recursos Docker de POC-1a (proyecto «jozeuzz-poc-a»).
# No toca otros proyectos, redes ni volúmenes.
set -eu
cd "$(dirname "$0")"
C="docker compose -p jozeuzz-poc-a -f compose.yaml"
cmd="${1:-}"; [ $# -gt 0 ] && shift
case "$cmd" in
  init)
    if [ ! -f .env ]; then
      umask 077
      printf 'POC_DB_PASSWORD=%s\nPAYLOAD_SECRET=%s\n' "$(openssl rand -hex 24)" "$(openssl rand -hex 32)" > .env
    fi ;;
  deps) $C --profile deps run --rm deps "$@" ;;
  up) $C up -d db app ;;
  down) $C down ;;
  ps) $C ps ;;
  logs) $C logs --no-color --tail "${1:-200}" app ;;
  logs-since) $C logs --no-color --since "${1:?uso: logs-since <instante>}" app ;;
  restart) $C restart app ;;
  psql) $C exec -T db psql -U poc -d poc "$@" ;;
  # Borra y recrea sólo el schema `public` de la base del proyecto (drizzle push pregunta por renombres
  # interactivamente si quedan tablas antiguas y el servidor de desarrollo se cuelga sin TTY).
  resetdb) $C exec -T db psql -U poc -d poc -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;' && $C restart app ;;
  exec) $C exec -T app "$@" ;;
  e2e) $C --profile e2e run --rm e2e npx playwright test "$@" ;;
  stats) docker stats --no-stream $($C ps -q) ;;
  destroy) $C down -v --remove-orphans ;;
  *) echo "uso: ./poc.sh init|deps [cmd]|up|down|ps|logs [n]|logs-since <t>|restart|psql [args]|resetdb|exec <cmd>|e2e [args]|stats|destroy" >&2; exit 2 ;;
esac
