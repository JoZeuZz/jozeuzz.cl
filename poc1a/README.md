# POC-1a — candidata A (Next.js + Payload + PostgreSQL)

## POC-1b — reglas de negocio (2026-10-16)

H0A-02/03/04 se validan en servidor. El intake sintético interno de esta fase (R-1) se retiró en POC-3 U9; hoy la batería usa el intake real. Rama: `poc/candidata-a-1b`.

```sh
# desde poc1a/; nunca usar base poc, ./poc.sh up/e2e/migrate heredados
# antes de nada: init, init-volumes, deps y probe-mounts (ver «POC-3 — aislamiento de escritura Docker»)
./poc.sh db-up
./poc.sh psql -c 'CREATE DATABASE poc1b_migraciones' # sólo si no existe
./poc.sh up-en poc1b_migraciones
./poc.sh comprobar-en poc1b_migraciones
./poc.sh exec-en poc1b_migraciones npx vitest run --configLoader runner
./poc.sh exec-en poc1b_migraciones npx tsc --noEmit --tsBuildInfoFile /tmp/tsconfig.tsbuildinfo
node --test ../contrato/test/
POC_TARGET_DATABASE=poc1b_migraciones POC_BASE_URL=https://127.0.0.1:3443 NODE_EXTRA_CA_CERTS="$PWD/.tls/ca.crt" node ../contrato/run.mjs --driver contrato-driver.mjs --alcance poc-1a
./poc.sh up-fallos-en poc1b_migraciones
# la batería de 44 ya no usa intake sintético: ver «POC-3 U9» (intake real por el proxy)
./poc.sh e2e-en poc1b_migraciones # último: apaga gate EV-04
# una vez, sólo si no existe; base aditiva, nunca borrar
./poc.sh psql -c 'CREATE DATABASE poc1b_migraciones_revision'
./poc.sh migrate-en poc1b_migraciones_revision
./poc.sh build-en poc1b_migraciones_revision
./poc.sh up-prod-en poc1b_migraciones_revision
./poc.sh psql-en poc1b_migraciones_revision -Atqc 'SELECT current_database()'
```

Sin escrituras de prueba en `poc_prod` (POC-1b). El `down` de migración no se ejecuta por prohibición de borrado; rollback requerido es EV-04, transacción fallida.

POC desechable en rama `poc/candidata-a-1b`. No es el scaffold del producto. La aplicación, la base y las pruebas de vitest/Playwright corren en Docker a través de
`./poc.sh` (proyecto Compose `jozeuzz-poc-a`, imágenes fijadas por digest, puertos sólo en 127.0.0.1).

## Requisitos
Docker con Compose v2 y Node ≥ 20 en el host (el host de la POC tiene 20.19.2; **no** tiene Node 24). El driver de contrato,
`node --test` y los scripts de `scripts/` corren con el Node del host, sin dependencias. Node 24.22.0 solo existe en la imagen
Docker (lo exige `engines` de `package.json`, que aplica dentro del contenedor). Acceso a Internet únicamente para `deps` y para descargar la imagen de Playwright (fijada por digest).

## POC-3 — aislamiento de escritura Docker

`poc1a/` se monta en `/app` como bind **de sólo lectura** en `deps`, `app`, `app-prod` y `e2e`; los cuatro tienen raíz `read_only: true`, `/tmp` en `tmpfs` y `HOME=/tmp`. Sólo escriben en volúmenes nombrados: `node_modules` (RW únicamente en `deps`, RO en los demás) y `npm_cache` (sólo `deps`); `next_dev`, `media_dev`, `media_test` y `media_prod` en `app`; `next_prod` y `media_prod` en `app-prod`; `test_results`, `playwright_report` y `blob_report` en `e2e`. Docker crea esos volúmenes como root, y por eso existe `volumes-init`: un servicio one-shot root, sin red, sin bind y sin socket, que sólo deja los volúmenes en `1000:1000`.

Next reescribe `next-env.d.ts` si su contenido difiere, y `/app` es de sólo lectura: `contenedor/next-env.dev.txt` (`app`) y `contenedor/next-env.prod.txt` (`app-prod`) se montan como binds de archivo RO sobre `/app/next-env.d.ts`. `test/estatico/next-env-contenedor.test.ts` los compara byte a byte con la salida de la función real de Next. `./poc.sh init` prepara los puntos de montaje en el host (directorios y un `next-env.d.ts` vacío si falta; rechaza enlaces simbólicos): es prerrequisito de todo lo demás. `poc1a/node_modules` del host **no** es prerrequisito: lo enmascara el volumen nombrado.

Orden previo obligatorio, desde `poc1a/` (operaciones Docker, ejecución humana; no se han ejecutado):

```sh
./poc.sh init
./poc.sh init-volumes
./poc.sh deps
./poc.sh probe-mounts
```

`./poc.sh destroy` (`down -v`) borra los once volúmenes (los diez de aplicación y `db`): después hay que repetir `./poc.sh init-volumes`, `./poc.sh deps` y `./poc.sh probe-mounts` antes de levantar nada. Toda invocación de vitest en contenedor lleva `--configLoader runner`: Vite carga `vitest.config.ts` con el cargador bundle y escribe `node_modules/.vite-temp`, y con `node_modules` RO eso falla.

`./poc.sh probe-mounts` comprueba como uid 1000 que `/app` y los manifiestos son RO, que `node_modules` es RO en los consumidores y que cada servicio escribe exactamente su lista permitida; el `find` del host (A3d del gate) es sólo diagnóstico no vinculante.

Consecuencias operativas: `./poc.sh migrate-create` está deshabilitada (migrate-create deshabilitada: `/app` es sólo lectura, así que las migraciones se crean fuera de los contenedores con revisión humana); `./poc.sh migrate` y `migrate-en` no cambian. El typecheck en contenedor usa `npx tsc --noEmit --tsBuildInfoFile /tmp/tsconfig.tsbuildinfo` (`tsconfig.json` también fija esa ruta). La instalación de axe ya no escribe el repositorio: ver «POC-3 U8».

## POC-3 U5a — proxy TLS y aislamiento

`proxy` es única entrada: `https://127.0.0.1:3443` para `app` y `https://127.0.0.1:3444` para `app-prod`. `app`, `app-prod` y `e2e` no publican puertos. `./poc.sh init` genera `INTAKE_SECRETO` si falta; `.env.example` permanece sin ese placeholder por restricción de política local. Cada orden que recrea proxy genera CA efímera en `.tls/`; nunca confirmar esa carpeta.

`test/docker/ip-produccion.test.mjs` usa la IP real del gateway: ejecútelo sólo con la base recién reseteada (cupo de 10 min).

Comandos Docker pendientes de ejecución humana, desde `poc1a/`:

```sh
./poc.sh init
./poc.sh init-volumes
./poc.sh deps
./poc.sh probe-mounts
./poc.sh up-en poc3_intake
./poc.sh sonda-red
./poc.sh up-fallos-en poc3_intake
# la batería de 44 contra el intake real: gate «POC-3 U9»
./poc.sh exec-en poc3_intake npx vitest run --configLoader runner
./poc.sh e2e-en poc3_intake
```

## POC-3 U7 — logs sin PII

Payload usa `pino` con `src/lib/intake/log.ts` (sin `pino-pretty`); `db` arranca con `log_min_messages=fatal`, `log_min_error_statement=panic` y `log_error_verbosity=terse`. `src/lib/intake/fallos.ts` inyecta fallos reales sólo con `NODE_ENV!=='production'` y `POC_FALLOS_INYECTABLES=1` (`up-fallos-en`) y la cabecera `x-poc-fallo`. Comandos Docker pendientes de ejecución humana, desde `poc1a/` (`export NODE_EXTRA_CA_CERTS="$PWD/.tls/ca.crt"` tras cada `up-*`, que recrea la CA):

`up-prod-pruebas-en` usa `compose.pruebas.yaml`, que da `POC_FALLOS_INYECTABLES=1` sólo a `app-prod` (nunca `compose.yaml`) para que la prueba de no inyección en producción no sea vacua. Orden obligatorio: el build antes de levantar `app-prod`, y la prueba de build sólo después de un build reciente.

```sh
./poc.sh build-en poc3_intake
./poc.sh up-prod-pruebas-en poc3_intake
export NODE_EXTRA_CA_CERTS="$PWD/.tls/ca.crt"
POC_BASE_URL=https://127.0.0.1:3444 node --test test/docker/logs-intake.test.mjs
./poc.sh run-prod-en poc3_intake node --test test/build/sin-inyeccion.test.mjs   # D21a: dentro de app-prod; exige .next-prod actual (volumen next_prod; BUILD_ID posterior a las fuentes de intake)
./poc.sh up-fallos-en poc3_intake
export NODE_EXTRA_CA_CERTS="$PWD/.tls/ca.crt"
node --test test/docker/logs-intake-fallos.test.mjs
```

La lógica de la prueba de build (`test/build/comprobar-build.mjs`) tiene su propia prueba sin Docker (D21b, 10 tests: `# pass 10`), en el host como uid 1000 y sin grupo Docker: `setpriv --reuid=1000 --regid=1000 --clear-groups node --test test/build/comprobar-build.test.mjs`. D13/D16/D17/D26/D27 son Docker root-equivalente (el driver llama `poc.sh exec-en`); D30 puede usar `setpriv` mientras el script no invoque `poc.sh`.

## POC-3 U8 — accesibilidad, sin JavaScript y E2E

`/solicitar` usa HTML semántico sin scripts (`html.ts`; CSP sin `script-src`). `e2e/intake.spec.ts` cubre teclado, envío vacío y válido, el mismo flujo con `javaScriptEnabled: false`, dos pestañas (mensaje de csrf) y los atributos de la cookie `__Host-intake`. `e2e/intake-axe.spec.ts` audita con axe (`wcag2a`, `wcag2aa`) pero requiere `@axe-core/playwright@4.13.0`, que aún no está instalado: el spec se omite si falta el paquete y está excluido en `tsconfig.json` (`exclude`) para que `tsc` no falle por el import ausente. Pasos humanos, desde `poc1a/`:

```sh
# Con /app en sólo lectura, deps no puede editar los manifiestos: el contenedor emite un JSON base64 y el host genera el parche.
./poc.sh manifest-patch-axe > "$S/A4-manifiestos.json"   # $S = carpeta de salidas del gate (A0); no escribir directamente en /root/jz-gate-poc3/
# después: decodificar, generar y revisar el parche con diff en el host, y aplicarlo (aplicación humana revisada; ver A4 del gate);
# quitar "e2e/intake-axe.spec.ts" de "exclude" en tsconfig.json, confirmar package.json y package-lock.json, y ./poc.sh deps (npm ci)
./poc.sh e2e-en poc3_intake
./poc.sh e2e-prod-en poc3_intake
```

## POC-3 U9 — gate: regresión contra el intake real, mediciones y antiabuso en papel

Procedimiento canónico del gate Docker: [`docs/GATE-DOCKER-POC-3.md`](../docs/GATE-DOCKER-POC-3.md). Lo que sigue es un resumen.

R-1 (el intake sintético de POC-1b) ya no existe: `scripts/` no lo contiene y el driver sólo habla con `GET /solicitar` y `POST /api/intake` por el proxy, con una IP sintética distinta por origen (`driver/ip-sintetica.mjs`; `x-poc-ip-sintetica` sólo lo acepta el proxy de pruebas). `intake.limite.max` es 5. `POC_INTAKE_TIEMPO_MINIMO_MS` (por defecto 200) debe coincidir con `INTAKE_TIEMPO_MINIMO_MS` de Compose. `logs()` lanza si el driver ya envió al intake y ningún log trae `"evento":"intake"`, de modo que IN-12 no pasa en vacío.

Casos de los 44 que pasan por el intake real (23): ES-03 a ES-11, EV-01 a EV-06, MO-01 a MO-05, PR-01, PR-05 y PR-06. PR-02 sólo lee logs. Los IN-* (12) son el alcance `poc-3`.

**P-U1-01 — pendiente de confirmación del responsable.** EV-04 necesita la cabecera `x-poc-fallo`, que `src/collections/Solicitudes.ts` sólo honra con `NODE_ENV !== 'production'` y `POC_FALLOS_INYECTABLES=1`. El override `compose.pruebas.yaml` da la variable a `app-prod`, pero `app-prod` sigue en `NODE_ENV=production`: EV-04 no puede pasar ahí sin debilitar producción. Propuesta implementada como modo explícito: en `app` (3443) la regresión corre los 44; en `app-prod` (3444) corre los 43 restantes, sin EV-04. Si el responsable decide otra cosa, sólo cambia la lista de la segunda orden.

Comandos Docker pendientes de ejecución humana, desde `poc1a/` (Docker no se ejecutó en esta unidad). `up-*` recrea la CA efímera: reexporte `NODE_EXTRA_CA_CERTS` después de cada uno.

```sh
./poc.sh init
./poc.sh init-volumes
./poc.sh deps
./poc.sh probe-mounts
./poc.sh db-up
./poc.sh psql -c 'CREATE DATABASE poc3_intake' # sólo si no existe
# 1) app (3443): 44 casos y 12 IN-*
./poc.sh up-fallos-en poc3_intake
export NODE_EXTRA_CA_CERTS="$PWD/.tls/ca.crt"
POC_TARGET_DATABASE=poc3_intake POC_BASE_URL=https://127.0.0.1:3443 node ../contrato/run.mjs --driver contrato-driver.mjs --solo AU-05,AU-06,AU-07,PR-04,PR-07,CO-01,CO-02,CO-03,CO-04,CO-05,CO-06,CO-07,CA-02,ES-01,ES-02,ES-03,ES-04,ES-05,ES-06,ES-07,ES-08,ES-09,ES-10,ES-11,MO-01,MO-02,MO-03,MO-04,MO-05,AU-01,AU-02,AU-03,AU-04,PR-01,PR-02,PR-03,PR-05,PR-06,EV-01,EV-02,EV-03,EV-04,EV-05,EV-06
POC_TARGET_DATABASE=poc3_intake POC_BASE_URL=https://127.0.0.1:3443 node ../contrato/run.mjs --driver contrato-driver.mjs --solo IN-01,IN-02,IN-03,IN-04,IN-05,IN-06,IN-07,IN-08,IN-09,IN-10,IN-11,IN-12 --alcance poc-3
./poc.sh e2e-en poc3_intake
# 2) app-prod (3444): 43 casos (sin EV-04, P-U1-01) y 12 IN-*
./poc.sh build-en poc3_intake
./poc.sh migrate-en poc3_intake # sólo si el schema poc_prod de la base no está migrado
./poc.sh up-prod-pruebas-en poc3_intake
export NODE_EXTRA_CA_CERTS="$PWD/.tls/ca.crt"
POC_TARGET_DATABASE=poc3_intake POC_BASE_URL=https://127.0.0.1:3444 POC_RESET_ENV='POC_DB_SCHEMA=poc_prod POC_MEDIA_DIR=/app/media-store-prod' node ../contrato/run.mjs --driver contrato-driver.mjs --solo AU-05,AU-06,AU-07,PR-04,PR-07,CO-01,CO-02,CO-03,CO-04,CO-05,CO-06,CO-07,CA-02,ES-01,ES-02,ES-03,ES-04,ES-05,ES-06,ES-07,ES-08,ES-09,ES-10,ES-11,MO-01,MO-02,MO-03,MO-04,MO-05,AU-01,AU-02,AU-03,AU-04,PR-01,PR-02,PR-03,PR-05,PR-06,EV-01,EV-02,EV-03,EV-05,EV-06
POC_TARGET_DATABASE=poc3_intake POC_BASE_URL=https://127.0.0.1:3444 POC_RESET_ENV='POC_DB_SCHEMA=poc_prod POC_MEDIA_DIR=/app/media-store-prod' node ../contrato/run.mjs --driver contrato-driver.mjs --solo IN-01,IN-02,IN-03,IN-04,IN-05,IN-06,IN-07,IN-08,IN-09,IN-10,IN-11,IN-12 --alcance poc-3
./poc.sh e2e-prod-en poc3_intake
# 3) medición (al final: crea 150 solicitudes en poc_prod). e2e-prod-en recrea el proxy SIN el override de pruebas:
#    repita up-prod-pruebas-en antes de medir (si no, el proxy no acepta la IP sintética) y reexporte la CA.
./poc.sh up-prod-pruebas-en poc3_intake
export NODE_EXTRA_CA_CERTS="$PWD/.tls/ca.crt"
POC_BASE_URL=https://127.0.0.1:3444 node medicion/intake-latencia.mjs
```

Anote en `EVIDENCIA.md` (sección «POC-3 · Intake seguro»): cada resultado, la propagación de CO-05 en `app-prod` (ahora incluye el proxy y TLS) y la salida JSON de la medición. El script sale con código distinto de 0 si hay falsos positivos o errores. Prueba sin Docker de sus funciones puras: `node --test medicion/`.

## Comandos históricos POC-1a

La reproducción histórica de POC-1a quedó en `4b4b806`; resultados y mediciones permanecen en `EVIDENCIA.md`. No use esos comandos contra esta POC-1b.
