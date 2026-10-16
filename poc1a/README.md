# POC-1a — candidata A (Next.js + Payload + PostgreSQL)

## POC-1b — reglas de negocio (2026-10-16)

H0A-02/03/04 se validan en servidor. R-1 es interno, sin endpoint; no ejecutar IN-* como evidencia. Rama: `poc/candidata-a-1b`.

```sh
# desde poc1a/; nunca usar base poc, ./poc.sh up/e2e/migrate heredados
./poc.sh db-up
./poc.sh psql -c 'CREATE DATABASE poc1b_migraciones' # sólo si no existe
./poc.sh up-en poc1b_migraciones
./poc.sh comprobar-en poc1b_migraciones
./poc.sh exec-en poc1b_migraciones npx vitest run
./poc.sh exec-en poc1b_migraciones npx tsc --noEmit
node --test ../contrato/test/
POC_TARGET_DATABASE=poc1b_migraciones node ../contrato/run.mjs --driver contrato-driver.mjs --alcance poc-1a
./poc.sh up-fallos-en poc1b_migraciones
POC_TARGET_DATABASE=poc1b_migraciones POC_INTAKE_SINTETICO=1 node ../contrato/run.mjs --driver contrato-driver.mjs --solo AU-05,AU-06,AU-07,PR-04,PR-07,CO-01,CO-02,CO-03,CO-04,CO-05,CO-06,CO-07,CA-02,ES-01,ES-02,ES-03,ES-04,ES-05,ES-06,ES-07,ES-08,ES-09,ES-10,ES-11,MO-01,MO-02,MO-03,MO-04,MO-05,AU-01,AU-02,AU-03,AU-04,PR-01,PR-02,PR-03,PR-05,PR-06,EV-01,EV-02,EV-03,EV-04,EV-05,EV-06
./poc.sh e2e-en poc1b_migraciones # último: apaga gate EV-04
# una vez, sólo si no existe; base aditiva, nunca borrar
./poc.sh psql -c 'CREATE DATABASE poc1b_migraciones_revision'
./poc.sh migrate-en poc1b_migraciones_revision
./poc.sh build-en poc1b_migraciones_revision
./poc.sh up-prod-en poc1b_migraciones_revision
./poc.sh psql-en poc1b_migraciones_revision -Atqc 'SELECT current_database()'
```

No R-1 ni escrituras de prueba en `poc_prod`. El `down` de migración no se ejecuta por prohibición de borrado; rollback requerido es EV-04, transacción fallida.

POC desechable en rama `poc/candidata-a-1b`. No es el scaffold del producto. La aplicación, la base y las pruebas de vitest/Playwright corren en Docker a través de
`./poc.sh` (proyecto Compose `jozeuzz-poc-a`, imágenes fijadas por digest, puertos sólo en 127.0.0.1).

## Requisitos
Docker con Compose v2 y Node ≥ 20 en el host (el host de la POC tiene 20.19.2; **no** tiene Node 24). El driver de contrato,
`node --test` y los scripts de `scripts/` corren con el Node del host, sin dependencias. Node 24.22.0 solo existe en la imagen
Docker (lo exige `engines` de `package.json`, que aplica dentro del contenedor). Acceso a Internet únicamente para `deps` y para descargar la imagen de Playwright (fijada por digest).

## Comandos históricos POC-1a

La reproducción histórica de POC-1a quedó en `4b4b806`; resultados y mediciones permanecen en `EVIDENCIA.md`. No use esos comandos contra esta POC-1b.
