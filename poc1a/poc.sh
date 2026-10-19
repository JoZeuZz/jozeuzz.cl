#!/bin/sh
# Única puerta de entrada a los recursos Docker de POC-1a (proyecto «jozeuzz-poc-a»).
# No toca otros proyectos, redes ni volúmenes.
set -eu
cd "$(dirname "$0")"
C="docker compose -p jozeuzz-poc-a -f compose.yaml"
CP="$C -f compose.pruebas.yaml"
cmd="${1:-}"; [ $# -gt 0 ] && shift
tls_efimera() {
  rm -rf .tls
  umask 077
  mkdir .tls
  openssl ecparam -name prime256v1 -genkey -noout -out .tls/ca.key
  openssl req -x509 -new -sha256 -days 1 -key .tls/ca.key -out .tls/ca.crt -subj '/CN=jozeuzz-poc-a CA efimera' -addext 'basicConstraints=critical,CA:TRUE'
  openssl ecparam -name prime256v1 -genkey -noout -out .tls/servidor.key
  openssl req -new -key .tls/servidor.key -out .tls/servidor.csr -subj '/CN=proxy'
  openssl x509 -req -in .tls/servidor.csr -CA .tls/ca.crt -CAkey .tls/ca.key -CAcreateserial -out .tls/servidor.crt -days 1 -sha256 -extfile /dev/stdin <<'EOF'
subjectAltName=IP:127.0.0.1,DNS:proxy
extendedKeyUsage=serverAuth
EOF
  cat .tls/servidor.crt .tls/ca.crt > .tls/cadena.crt
  servidor="$(openssl x509 -in .tls/servidor.crt -pubkey -noout | openssl pkey -pubin -outform DER | openssl dgst -sha256 -binary | openssl base64 -A)"
  ca="$(openssl x509 -in .tls/ca.crt -pubkey -noout | openssl pkey -pubin -outform DER | openssl dgst -sha256 -binary | openssl base64 -A)"
  printf '%s,%s\n' "$servidor" "$ca" > .tls/spki.txt
  rm -f .tls/ca.key .tls/servidor.csr .tls/ca.srl
  # Los contenedores node/playwright (uid 1000) leen ca.crt y spki.txt; nginx (root) lee la clave. ca.key ya no existe.
  chmod 644 .tls/ca.crt .tls/spki.txt
  chmod 755 .tls
  chmod 600 .tls/servidor.key
}
nombre_poc1b() {
  case "$1" in
    poc1b_?*|poc3_?*) ;;
    *) echo "base POC aislada inválida: $1" >&2; exit 2 ;;
  esac
  case "$1" in
    *[!a-z0-9_]*) echo "base POC aislada inválida: $1" >&2; exit 2 ;;
  esac
}
case "$cmd" in
  init)
    if [ ! -f .env ]; then
      umask 077
      printf 'POC_DB_PASSWORD=%s\nPAYLOAD_SECRET=%s\n' "$(openssl rand -hex 24)" "$(openssl rand -hex 32)" > .env
    fi
    grep -q '^INTAKE_SECRETO=' .env || printf 'INTAKE_SECRETO=%s\n' "$(openssl rand -hex 32)" >> .env ;;
  deps) $C --profile deps run --rm deps "$@" ;;
  up) tls_efimera; $C up -d db app; $C up -d --force-recreate proxy ;;
  db-up) $C up -d db ;;
  up-en)
    base="${1:?uso: up-en <base-poc1b>}"; nombre_poc1b "$base"
    tls_efimera
    POC_DATABASE_NAME="$base" $C up -d db app
    POC_DATABASE_NAME="$base" $C up -d --force-recreate proxy ;;
  up-pruebas-en)
    base="${1:?uso: up-pruebas-en <base-poc1b>}"; nombre_poc1b "$base"
    tls_efimera
    POC_DATABASE_NAME="$base" $CP up -d db app
    POC_DATABASE_NAME="$base" $CP up -d --force-recreate proxy ;;
  up-fallos-en)
    base="${1:?uso: up-fallos-en <base-poc1b>}"; nombre_poc1b "$base"
    tls_efimera
    POC_DATABASE_NAME="$base" POC_FALLOS_INYECTABLES=1 $CP up -d --force-recreate db app proxy ;;
  comprobar-en)
    base="${1:?uso: comprobar-en <base-poc1b>}"; nombre_poc1b "$base"
    POC_DATABASE_NAME="$base" $C exec -T app npx tsx scripts/verificar-db.ts "$base" ;;
  down) $C down ;;
  ps) $C ps ;;
  logs) $C logs --no-color --tail "${1:-200}" app ;;
  logs-since)
    t="${1:?uso: logs-since <instante>}"
    $C --profile prod logs --no-color --since "$t" proxy app app-prod db ;;
  restart) $C restart app ;;
  psql) $C exec -T db psql -U poc -d poc "$@" ;;
  # Borra y recrea sólo el schema `public` de la base del proyecto (drizzle push pregunta por renombres
  # interactivamente si quedan tablas antiguas y el servidor de desarrollo se cuelga sin TTY).
  resetdb) $C exec -T db psql -U poc -d poc -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;' && $C restart app ;;
  exec) $C exec -T app "$@" ;;
  exec-en)
    base="${1:?uso: exec-en <base-poc1b> [comando]}"; nombre_poc1b "$base"
    shift
    # `exec` no cambia el entorno del contenedor: sólo se ejecuta si app ya está conectado a $base.
    POC_DATABASE_NAME="$base" $C exec -T app npx tsx scripts/verificar-db.ts "$base" >&2
    POC_DATABASE_NAME="$base" $C exec -T app "$@" ;;
  # Orden heredada retirada: el driver exige base aislada, URL y CA, que sólo proveen e2e-en y e2e-prod-en.
  # El resultado del reset (incluida la contraseña aleatoria del admin sintético) viaja sólo por entorno.
  e2e)
    echo "e2e está retirada: usa './poc.sh e2e-en <base>' o './poc.sh e2e-prod-en <base>'" >&2; exit 2 ;;
  e2e-en)
    base="${1:?uso: e2e-en <base-poc1b>}"; nombre_poc1b "$base"
    shift
    tls_efimera
    POC_DATABASE_NAME="$base" $C up -d db app
    POC_DATABASE_NAME="$base" $C up -d --force-recreate proxy
    POC_DATABASE_NAME="$base" $C exec -T app npx tsx scripts/verificar-db.ts "$base"
    E2E_RESET="$(POC_TARGET_DATABASE="$base" POC_BASE_URL=https://127.0.0.1:3443 NODE_EXTRA_CA_CERTS="$PWD/.tls/ca.crt" node scripts/reset-e2e.mjs)"; export E2E_RESET
    POC_DATABASE_NAME="$base" $C --profile e2e run --rm -e POC_DATABASE_NAME -e E2E_RESET e2e sh -c 'POC_E2E_DESTINO="$(getent hosts proxy | cut -d" " -f1):3443"; export POC_E2E_DESTINO; npx playwright test "$@"' sh "$@" ;;
  e2e-prod-en)
    base="${1:?uso: e2e-prod-en <base-poc1b>}"; nombre_poc1b "$base"
    shift
    tls_efimera
    POC_DATABASE_NAME="$base" POC_DB_SCHEMA=poc_prod POC_NO_PUSH=1 $C --profile prod up -d db app-prod
    POC_DATABASE_NAME="$base" $C --profile prod up -d --force-recreate proxy
    # El reset corre en el servicio app (dev, exec-en): debe existir y estar conectado a $base.
    POC_DATABASE_NAME="$base" $C up -d db app
    POC_DATABASE_NAME="$base" $C exec -T app npx tsx scripts/verificar-db.ts "$base"
    E2E_RESET="$(POC_TARGET_DATABASE="$base" POC_BASE_URL=https://127.0.0.1:3444 NODE_EXTRA_CA_CERTS="$PWD/.tls/ca.crt" POC_RESET_ENV='POC_DB_SCHEMA=poc_prod POC_MEDIA_DIR=/app/media-store-prod' node scripts/reset-e2e.mjs)"; export E2E_RESET
    POC_DATABASE_NAME="$base" POC_E2E_ORIGEN=https://127.0.0.1:3444 $C --profile e2e run --rm -e POC_DATABASE_NAME -e E2E_RESET -e POC_E2E_ORIGEN e2e sh -c 'POC_E2E_DESTINO="$(getent hosts proxy | cut -d" " -f1):3444"; export POC_E2E_DESTINO; npx playwright test "$@"' sh "$@" ;;
  sonda-red) $C --profile e2e run --rm e2e node scripts/sonda-red.mjs ;;
  # Medición aproximada de LCP/CLS/TBT contra app-prod (debe estar levantado con up-prod).
  medir-web)
    base="${1:?uso: medir-web <base-poc1b>}"; nombre_poc1b "$base"
    shift
    tls_efimera
    POC_DATABASE_NAME="$base" POC_DB_SCHEMA=poc_prod POC_NO_PUSH=1 $C --profile prod up -d db app-prod
    POC_DATABASE_NAME="$base" $C --profile prod up -d --force-recreate proxy
    POC_DATABASE_NAME="$base" POC_E2E_ORIGEN=https://127.0.0.1:3444 $C --profile e2e run --rm -e POC_DATABASE_NAME -e POC_E2E_ORIGEN e2e sh -c 'POC_E2E_DESTINO="$(getent hosts proxy | cut -d" " -f1):3444"; export POC_E2E_DESTINO; npx playwright test -c playwright.medicion.config.ts "$@"' sh "$@" ;;
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
  up-prod) tls_efimera; $C --profile prod up -d db app-prod; $C --profile prod up -d --force-recreate proxy ;;
  up-prod-en)
    base="${1:?uso: up-prod-en <base-poc1b>}"; nombre_poc1b "$base"
    tls_efimera
    POC_DATABASE_NAME="$base" POC_DB_SCHEMA=poc_prod POC_NO_PUSH=1 $C --profile prod up -d db app-prod
    POC_DATABASE_NAME="$base" $C --profile prod up -d --force-recreate proxy ;;
  up-prod-pruebas-en)
    base="${1:?uso: up-prod-pruebas-en <base-poc1b>}"; nombre_poc1b "$base"
    tls_efimera
    POC_DATABASE_NAME="$base" POC_DB_SCHEMA=poc_prod POC_NO_PUSH=1 $CP --profile prod up -d db app-prod
    POC_DATABASE_NAME="$base" $CP --profile prod up -d --force-recreate proxy ;;
  down-prod) $C --profile prod stop app-prod && $C --profile prod rm -f app-prod ;;
  stats)
    ids="$($C ps -q)"
    if [ -z "$ids" ]; then echo "sin contenedores del proyecto jozeuzz-poc-a; nada que medir" >&2; exit 1; fi
    docker stats --no-stream $ids ;;
  destroy) $C down -v --remove-orphans ;;
  *) echo "uso: ./poc.sh init|deps [cmd]|up|db-up|up-en <base>|up-pruebas-en <base>|up-fallos-en <base>|up-prod-en <base>|up-prod-pruebas-en <base>|e2e-en <base> [args]|e2e-prod-en <base> [args]|sonda-red|medir-web <base> [args]|comprobar-en <base>|down|build|build-en <base>|migrate-create|migrate|migrate-en <base>|psql-en <base> [args]|up-prod|down-prod|ps|logs [n]|logs-since <t>|restart|psql [args]|resetdb|exec <cmd>|exec-en <base> <cmd>|stats|destroy" >&2; exit 2 ;;
esac
