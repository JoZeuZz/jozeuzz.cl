# POC-1a — candidata A (Next.js + Payload + PostgreSQL)

POC desechable en rama `poc/candidata-a`. No es el scaffold del producto. Todo corre en Docker a través de
`./poc.sh` (proyecto Compose `jozeuzz-poc-a`, imágenes fijadas por digest, puertos sólo en 127.0.0.1).

## Requisitos
Docker con Compose v2, Node 24 en el host (sólo para el driver y los scripts, sin dependencias) y acceso a
Internet únicamente para `deps` y para descargar la imagen de Playwright (fijada por digest).

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
