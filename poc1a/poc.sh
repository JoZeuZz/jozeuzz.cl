#!/bin/sh
# Única puerta de entrada a los recursos Docker de POC-1a (proyecto «jozeuzz-poc-a»).
# No toca otros proyectos, redes ni volúmenes.
set -eu
cd "$(dirname "$0")"
C="docker compose -p jozeuzz-poc-a -f compose.yaml"
cmd="${1:-}"; [ $# -gt 0 ] && shift
nombre_poc1b() {
  case "$1" in
    poc1b_?*) ;;
    *) echo "base POC-1b inválida: $1" >&2; exit 2 ;;
  esac
  case "$1" in
    *[!a-z0-9_]*) echo "base POC-1b inválida: $1" >&2; exit 2 ;;
  esac
}
case "$cmd" in
  init)
    if [ ! -f .env ]; then
      umask 077
      printf 'POC_DB_PASSWORD=%s\nPAYLOAD_SECRET=%s\n' "$(openssl rand -hex 24)" "$(openssl rand -hex 32)" > .env
    fi ;;
  deps) $C --profile deps run --rm deps "$@" ;;
  up) $C up -d db app ;;
  db-up) $C up -d db ;;
  up-en)
    base="${1:?uso: up-en <base-poc1b>}"; nombre_poc1b "$base"
    POC_DATABASE_NAME="$base" $C up -d db app ;;
  comprobar-en)
    base="${1:?uso: comprobar-en <base-poc1b>}"; nombre_poc1b "$base"
    POC_DATABASE_NAME="$base" $C exec -T app npx tsx scripts/verificar-db.ts "$base" ;;
  down) $C down ;;
  ps) $C ps ;;
  logs) $C logs --no-color --tail "${1:-200}" app ;;
  logs-since) $C --profile prod logs --no-color --since "${1:?uso: logs-since <instante>}" "${POC_LOG_SERVICE:-app}" ;;
  restart) $C restart app ;;
  psql) $C exec -T db psql -U poc -d poc "$@" ;;
  # Borra y recrea sólo el schema `public` de la base del proyecto (drizzle push pregunta por renombres
  # interactivamente si quedan tablas antiguas y el servidor de desarrollo se cuelga sin TTY).
  resetdb) $C exec -T db psql -U poc -d poc -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;' && $C restart app ;;
  exec) $C exec -T app "$@" ;;
  exec-en)
    base="${1:?uso: exec-en <base-poc1b> [comando]}"; nombre_poc1b "$base"
    shift
    POC_DATABASE_NAME="$base" $C exec -T app "$@" ;;
  # Reset + semilla en el host (poc.sh exec) y E2E en el contenedor con la red de `app`. El resultado del reset
  # (incluida la contraseña aleatoria del admin sintético) viaja sólo por entorno, no se escribe en disco.
  e2e)
    E2E_RESET="$(node scripts/reset-e2e.mjs)"; export E2E_RESET
    $C --profile e2e run --rm -e E2E_RESET e2e npx playwright test "$@" ;;
  e2e-en)
    base="${1:?uso: e2e-en <base-poc1b>}"; nombre_poc1b "$base"
    shift
    POC_DATABASE_NAME="$base" $C up -d db app
    POC_DATABASE_NAME="$base" $C exec -T app npx tsx scripts/verificar-db.ts "$base"
    E2E_RESET="$(POC_TARGET_DATABASE="$base" node scripts/reset-e2e.mjs)"; export E2E_RESET
    POC_DATABASE_NAME="$base" $C --profile e2e run --rm -e POC_DATABASE_NAME -e E2E_RESET e2e npx playwright test "$@" ;;
  # Medición aproximada de LCP/CLS/TBT contra app-prod (debe estar levantado con up-prod).
  medir-web) $C --profile e2e run --rm e2e npx playwright test -c playwright.medicion.config.ts "$@" ;;
  # Producción: build (con su duración), migraciones Payload y servicio app-prod. Ver README.md.
  build)
    $C --profile prod run --rm app-prod sh -c 's=$(date +%s%N); npm run build; c=$?; e=$(date +%s%N); echo "build_ms=$(( (e-s)/1000000 )) codigo=$c"; exit $c' ;;
  build-en)
    base="${1:?uso: build-en <base-poc1b>}"; nombre_poc1b "$base"
    POC_DATABASE_NAME="$base" POC_DB_SCHEMA=poc_prod POC_NO_PUSH=1 $C --profile prod run --rm app-prod sh -c 's=$(date +%s%N); npm run build; c=$?; e=$(date +%s%N); echo "build_ms=$(( (e-s)/1000000 )) codigo=$c"; exit $c' ;;
  migrate-create) $C --profile prod run --rm app-prod npm run payload -- migrate:create "${1:-inicial}" ;;
  migrate) $C --profile prod run --rm app-prod npm run payload -- migrate ;;
  migrate-en)
    base="${1:?uso: migrate-en <base-poc1b>}"; nombre_poc1b "$base"
    POC_DATABASE_NAME="$base" POC_DB_SCHEMA=poc_prod POC_NO_PUSH=1 $C --profile prod run --rm app-prod npm run payload -- migrate ;;
  psql-en)
    base="${1:?uso: psql-en <base-poc1b> [psql args]}"; nombre_poc1b "$base"
    shift
    $C exec -T db psql -U poc -d "$base" "$@" ;;
  up-prod) $C --profile prod up -d db app-prod ;;
  up-prod-en)
    base="${1:?uso: up-prod-en <base-poc1b>}"; nombre_poc1b "$base"
    POC_DATABASE_NAME="$base" POC_DB_SCHEMA=poc_prod POC_NO_PUSH=1 $C --profile prod up -d db app-prod ;;
  down-prod) $C --profile prod stop app-prod && $C --profile prod rm -f app-prod ;;
  stats)
    ids="$($C ps -q)"
    if [ -z "$ids" ]; then echo "sin contenedores del proyecto jozeuzz-poc-a; nada que medir" >&2; exit 1; fi
    docker stats --no-stream $ids ;;
  destroy) $C down -v --remove-orphans ;;
  *) echo "uso: ./poc.sh init|deps [cmd]|up|db-up|up-en <base-poc1b>|comprobar-en <base-poc1b>|down|build|build-en <base-poc1b>|migrate-create|migrate|migrate-en <base-poc1b>|psql-en <base-poc1b> [args]|up-prod|up-prod-en <base-poc1b>|down-prod|ps|logs [n]|logs-since <t>|restart|psql [args]|resetdb|exec <cmd>|exec-en <base-poc1b> <cmd>|e2e [args]|e2e-en <base-poc1b> [args]|medir-web|stats|destroy" >&2; exit 2 ;;
esac
