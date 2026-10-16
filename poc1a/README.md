# POC-1a — candidata A (Next.js + Payload + PostgreSQL)

## POC-1b — reglas de negocio (2026-10-16)

H0A-02/03/04 se validan en servidor: transiciones `recibida → en_gestion|cerrada` y
`en_gestion → cerrada`; cierre con motivo; observaciones sólo admin; eventos inmutables.
R-1 es `scripts/solicitud-sintetica.ts`, interno, sin ruta HTTP: exige
`POC_INTAKE_SINTETICO=1`, `POC_TEST_RUN=1`, target `poc1b_*`, DB coincidente y nunca
`poc_prod`/producción. Para batería POC-1b usar sólo la lista explícita de 44 casos:
`POC_TARGET_DATABASE=poc1b_migraciones POC_INTAKE_SINTETICO=1 node ../contrato/run.mjs --driver contrato-driver.mjs --solo <lista-handoff>`.
No ejecutar IN-* como evidencia: POC-3 sigue pendiente.

Orden seguro POC-1b: `./poc.sh up-fallos-en poc1b_migraciones`; `./poc.sh comprobar-en poc1b_migraciones`; exportar `POC_TARGET_DATABASE=poc1b_migraciones` y `POC_INTAKE_SINTETICO=1`; ejecutar `run.mjs --solo AU-05,AU-06,AU-07,PR-04,PR-07,CO-01,CO-02,CO-03,CO-04,CO-05,CO-06,CO-07,CA-02,ES-01,ES-02,ES-03,ES-04,ES-05,ES-06,ES-07,ES-08,ES-09,ES-10,ES-11,MO-01,MO-02,MO-03,MO-04,MO-05,AU-01,AU-02,AU-03,AU-04,PR-01,PR-02,PR-03,PR-05,PR-06,EV-01,EV-02,EV-03,EV-04,EV-05,EV-06`; finalmente `./poc.sh e2e-en poc1b_migraciones` (recrea app con gate apagado). Migraciones: `migrate-en`, `build-en` y `up-prod-en` sobre `poc1b_migraciones_revision`; comprobar con `psql-en ... -Atqc 'SELECT current_database()'`.

POC desechable en rama `poc/candidata-a`. No es el scaffold del producto. La aplicación, la base y las pruebas de vitest/Playwright corren en Docker a través de
`./poc.sh` (proyecto Compose `jozeuzz-poc-a`, imágenes fijadas por digest, puertos sólo en 127.0.0.1).

## Requisitos
Docker con Compose v2 y Node ≥ 20 en el host (el host de la POC tiene 20.19.2; **no** tiene Node 24). El driver de contrato,
`node --test` y los scripts de `scripts/` corren con el Node del host, sin dependencias. Node 24.22.0 solo existe en la imagen
Docker (lo exige `engines` de `package.json`, que aplica dentro del contenedor). Acceso a Internet únicamente para `deps` y para descargar la imagen de Playwright (fijada por digest).

## Reproducir
```sh
cd poc1a
./poc.sh init            # crea .env (0600) con secretos aleatorios; no se versiona
./poc.sh deps            # npm ci en un contenedor (ignore-scripts=true)
./poc.sh up              # db + app (next dev) en http://127.0.0.1:3101
```

## Pruebas
```sh
./poc.sh exec npx vitest run            # unitarias, integración, regla estática y seguridad HTTP (schema poc_test)
./poc.sh exec npx tsc --noEmit
node --test ../contrato/test/           # contrato: oráculo y mutantes
node ../contrato/run.mjs --driver contrato-driver.mjs --alcance poc-1a   # batería: 13 ok, 43 pendientes
./poc.sh e2e                            # reset + Playwright (chromium): F3, F1 sin JS, acciones de servidor
```

## Producción local
```sh
./poc.sh migrate-create inicial   # sólo si no hay src/migrations (ya versionada, con CREATE SCHEMA a mano)
./poc.sh migrate                  # aplica las migraciones al schema poc_prod (sin push)
./poc.sh build                    # next build en .next-prod; imprime build_ms
./poc.sh up-prod                  # next start en http://127.0.0.1:3102
# El reset de la batería usa `./poc.sh exec` (servicio `app`, dev): `app` y `db` deben estar arriba (`./poc.sh up`).
export POC_BASE_URL=http://127.0.0.1:3102 POC_LOG_SERVICE=app-prod \
  POC_RESET_ENV='POC_DB_SCHEMA=poc_prod POC_MEDIA_DIR=/app/media-store-prod'
node ../contrato/run.mjs --driver contrato-driver.mjs --alcance poc-1a
./poc.sh exec env POC_HTTP_BASE=http://app-prod:3000 POC_SERVER_URL=http://127.0.0.1:3102 \
  POC_HTTP_SCHEMA=poc_prod POC_DB_SCHEMA=poc_prod POC_MEDIA_DIR=/app/media-store-prod npx vitest run test/http
```

## Mediciones (sobre producción, con la semilla de la batería cargada)
```sh
node scripts/medir-js.mjs http://127.0.0.1:3102/proyectos http://127.0.0.1:3102/proyectos/snt-proyecto-publicado
./poc.sh medir-web     # LCP/CLS/TBT aproximados (no es Lighthouse)
./poc.sh stats         # RAM/CPU; repetir tras 60 s de reposo
node scripts/licencias.mjs
```
Propagación (CO-05): salida «medida CO-05» de la batería. Detalle, fechas y hallazgos en `EVIDENCIA.md`.

## Limpieza
`./poc.sh down-prod`, `./poc.sh down` (conserva datos) o `./poc.sh destroy` (borra volúmenes del proyecto).
Sólo se tocan recursos de `jozeuzz-poc-a`. `./poc.sh resetdb` recrea el schema `public` si `push` se cuelga.
