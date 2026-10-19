# Gate Docker de POC-3 (U2–U9): procedimiento para ejecución humana

- **Estado:** procedimiento para ejecución humana. **No se ha ejecutado.** Lo redactó jz-architect el 2026-10-19 leyendo el código. Ningún resultado esperado de este documento está verificado en ejecución: son deducciones del código, con su cita.
- **HEAD de referencia:** `c8bbf0f` (rama `poc/candidata-a-3`), último commit de código y pruebas del ciclo de corrección 1. Los commits posteriores sólo tocan `docs/` (compruébelo en A1). Si se hace el paso A4 (instalación de axe), la referencia pasa a ser el commit que deja A4. Ese HEAD se anota en cada fila de evidencia.
- **Quién lo ejecuta:** el responsable del proyecto, como root en el host de la POC, con Docker y Compose v2 y con Node ≥ 20 en el host (`poc1a/README.md:34-36`). Los agentes no tienen Docker (`docs/PLAN-POC-3.md:157`, P3-07 `:199`). Mientras dure el gate, ningún agente escribe en este worktree.
- **Duración:** no está medida. Una estimación orientativa es de 1,5 a 3 h, sin contar descargas de imágenes. Referencias: una batería de 56 casos tardó 232 s en POC-1a (`poc1a/EVIDENCIA.md:20`), aunque sólo tenía 13 activos; el build tardó 16 s (`poc1a/EVIDENCIA.md:152`). Este gate ejecuta unos 167 casos activos en cinco baterías, dos tandas E2E y 150 envíos de medición.
- **Desbloquea:** U10, la revisión del hito por jz-security y jz-qa (`docs/PLAN-POC-3.md:172`).

## Advertencia de seguridad (leer antes de nada)

1. `poc1a/poc.sh` y los scripts Node del host (driver, batería, pruebas `test/docker`, `test/build` y `medicion`) se ejecutan **como root con acceso a `docker.sock`**. Su contenido lo editaron agentes. **Antes de ejecutar nada**, el humano revisa el diff del paso A2.
2. Sólo se usan bases `poc3_*`: `poc3_intake` y `poc3_migraciones` (`docs/POC-3-DISENO.md:8`). La guarda de `poc.sh:31-39` y la del driver (`poc1a/contrato-driver.mjs:15`) rechazan cualquier otra base.
3. **No usar la base `poc` (contaminada).** Quedan prohibidas las órdenes heredadas que la usan: `up`, `up-prod`, `migrate`, `migrate-create`, `build`, `exec`, `resetdb` (hace `DROP SCHEMA` de `poc`, `poc.sh:77`), `e2e` y `destroy` (`poc1a/README.md:8`). `./poc.sh psql` se conecta a `poc` (`poc.sh:74`); aquí sólo se usa para listar y crear bases (`poc1a/README.md:10,99`).
4. No tocar otros servicios del host. Todas las órdenes Docker pasan por `./poc.sh`, que fija el proyecto Compose `jozeuzz-poc-a` (`poc.sh:2-6`). Hay una única excepción documentada, de sólo lectura: `docker image inspect` en D05 (`docs/POC-3-DISENO.md:264`). Prohibidos: `docker system prune`, `docker volume rm`, `./poc.sh destroy` (borra el volumen `db` con todas las bases, `poc.sh:144`) y cualquier `docker stop` fuera del proyecto.
5. No exportar `POC_BASE_URL`, `POC_TARGET_DATABASE`, `POC_RESET_ENV`, `INTAKE_SECRETO` ni `E2E_RESET`: se pasan siempre en línea. La única variable exportada es `NODE_EXTRA_CA_CERTS`.
6. No imprimir `.env`, no usar `sh -x` con `poc.sh` (expondría `E2E_RESET`, que lleva la contraseña del admin sintético, `poc.sh:94,102`) y no usar `NODE_TLS_REJECT_UNAUTHORIZED=0` (`docs/POC-3-DISENO.md:64`).

## Tipos de parada

- **Parada dura:** se detiene el procedimiento, se dejan los servicios como están, se registra lo ocurrido y se avisa al orquestador. Aplica a fallos de infraestructura (`init`, `db-up`, `up-*`, base equivocada) y de seguridad (aislamiento de red, IP forjada, fugas en logs, inyección en el build, NV-8).
- **Fallo registrable:** se registra la salida completa y se sigue con el paso siguiente, que es independiente. El gate no se cierra mientras quede un fallo registrable. Aplica a vitest, a las baterías y a E2E.
- Si se repite un paso, se registran **todos** los intentos (`D11`, `D11-r2`, …). No se elige el intento verde.

---

## A. Antes de empezar (sin Docker)

### A1 · Estado del repositorio

```sh
cd /home/proyectos/jozeuzz-poc-candidata-a
git branch --show-current   # poc/candidata-a-3
git rev-parse --short HEAD  # c8bbf0f o un commit posterior
git diff --name-only c8bbf0f..HEAD  # vacío o sólo rutas bajo docs/
git status --short          # vacío
```

Parada dura si la rama no coincide, si entre `c8bbf0f` y HEAD cambia algo fuera de `docs/` o si el árbol no está limpio.

### A2 · Revisión del contenido editado por agentes

`<REV>` es el último commit que el humano revisó. **PENDIENTE:** lo fija el humano, porque este documento no lo conoce.

```sh
REV=<último commit revisado por el humano>
git log --format='%h %an %ad %s' --date=short "$REV"..HEAD -- poc1a contrato
git diff "$REV"..HEAD -- poc1a/poc.sh 'poc1a/compose*.yaml' poc1a/proxy poc1a/scripts poc1a/package.json poc1a/test/docker poc1a/medicion
# Recomendado además: también corre en el host como root (driver, batería, prueba de build) o afecta a la instalación.
git diff "$REV"..HEAD -- contrato poc1a/contrato-driver.mjs poc1a/driver poc1a/test/build poc1a/.npmrc poc1a/playwright.config.ts poc1a/playwright.medicion.config.ts
grep -nE 'docker\.sock|privileged|network_mode|cap_add|pid:|ipc:|ports:|127\.0\.0\.1:' poc1a/compose.yaml poc1a/compose.pruebas.yaml
grep -n 'docker' poc1a/poc.sh
```

Qué hay que ver:

- **`grep` de Compose:** sólo `ports:` y los dos `127.0.0.1:3443/3444` del proxy (`compose.yaml:82-84`). Nada de `docker.sock`, `privileged` ni `network_mode`.
- **`grep` de `poc.sh`:** sólo `poc.sh:6` (`C="docker compose -p jozeuzz-poc-a …"`) y la orden `stats` (`docker stats`).
- **En el diff:** ninguna escritura fuera de `poc1a/`, ninguna descarga ejecutada (`curl | sh`), ningún `rm` fuera de `.tls` y ningún otro proyecto Compose.

Parada dura ante cualquier cosa no explicada.

### A3 · Sesión de shell, carpeta de salidas y listas de casos

El procedimiento asume `bash`, por `pipefail`. Las salidas se guardan **fuera del repositorio** y en modo 077, para que ningún agente pueda alterarlas. Alternativa: `.jz-state/` está ignorada (`.gitignore:1`) y la leen los revisores, pero es zona de escritura de agentes. Si se usa para la revisión de U10, debe ser una copia con su `SHA256SUMS`.

```sh
bash
cd /home/proyectos/jozeuzz-poc-candidata-a/poc1a
set -o pipefail
umask 077
S="/root/jz-gate-poc3/$(date -u +%Y%m%dT%H%M%SZ)"; mkdir -p "$S"
r() {
  id="$1"; shift
  { echo "# $(date -u +%Y-%m-%dT%H:%M:%SZ) HEAD=$(git rev-parse --short HEAD) :: $*"; "$@"; } 2>&1 | tee "$S/$id.log"
  rc=$?; echo "rc=$rc" | tee -a "$S/$id.log"; return "$rc"
}
L44='AU-05,AU-06,AU-07,PR-04,PR-07,CO-01,CO-02,CO-03,CO-04,CO-05,CO-06,CO-07,CA-02,ES-01,ES-02,ES-03,ES-04,ES-05,ES-06,ES-07,ES-08,ES-09,ES-10,ES-11,MO-01,MO-02,MO-03,MO-04,MO-05,AU-01,AU-02,AU-03,AU-04,PR-01,PR-02,PR-03,PR-05,PR-06,EV-01,EV-02,EV-03,EV-04,EV-05,EV-06'
L43="$(printf %s "$L44" | tr ',' '\n' | grep -vx 'EV-04' | paste -sd, -)"
LIN='IN-01,IN-02,IN-03,IN-04,IN-05,IN-06,IN-07,IN-08,IN-09,IN-10,IN-11,IN-12'
for l in "$L44" "$L43" "$LIN"; do printf %s "$l" | tr ',' '\n' | wc -l; done   # 44, 43, 12
env | cut -d= -f1 | grep -E '^(POC_|E2E_|INTAKE_|NODE_TLS)'                     # vacío
node --version                                                                # ≥ v20
test -d node_modules && echo node_modules-ok
```

- `L44` es la lista literal de `poc1a/README.md:103`. `L43` es la misma sin EV-04, igual que `README.md:111`.
- **Parada dura** si los conteos no son 44, 43 y 12, o si hay variables `POC_*`, `E2E_*`, `INTAKE_*` o `NODE_TLS*` en el entorno.
- Si falta `node_modules`: `./poc.sh deps` (`npm ci`, con red, `poc.sh:47`). Requiere la decisión del humano.

**`NODE_EXTRA_CA_CERTS`.** Toda orden que recrea el proxy ejecuta `tls_efimera` y regenera la CA (`poc.sh:9-30`): `up-en`, `up-pruebas-en`, `up-fallos-en`, `up-prod-en`, `up-prod-pruebas-en`, `e2e-en` y `e2e-prod-en`. El valor de la variable no cambia (`$PWD/.tls/ca.crt`). Cada proceso Node lee el archivo al arrancar, así que lo que importa es lanzarlo después de la orden. Aun así se reexporta tras cada una, como pide `poc1a/README.md:94`, y siempre desde `poc1a/`.

### A4 · P3-05: instalación de `@axe-core/playwright@4.13.0`

**Requiere autorización explícita del humano en el momento de ejecutarla.** Sin este paso, los 3 tests de `e2e/intake-axe.spec.ts` se omiten (`intake-axe.spec.ts:22`), U8-axe queda PENDIENTE y el criterio de cierre «E2E con auditoría» no se cumple (`docs/PLAN-POC-3.md:179`).

- La opción está aprobada: P3-05 es `@axe-core/playwright` 4.13.0 (`docs/PLAN-POC-3.md:186`; `docs/POC-3-DISENO.md:7,286`).
- La versión aparece igual en `poc1a/README.md:77,80`. Que exista en el registro y que sea compatible con `@playwright/test` 1.64.1 (`package.json:28`) **no está verificado**: lo comprueba la propia instalación.
- Conviene hacerlo **antes** de D01, para que toda la evidencia corresponda a un único HEAD.

```sh
cd /home/proyectos/jozeuzz-poc-candidata-a/poc1a
cat .npmrc                                     # debe contener ignore-scripts=true (EVIDENCIA.md:167)
r A4a ./poc.sh deps npm install --save-dev --save-exact @axe-core/playwright@4.13.0
# Editar tsconfig.json: quitar "e2e/intake-axe.spec.ts" de "exclude" (tsconfig.json:46; README.md:81)
git status --short                             # sólo package.json, package-lock.json, tsconfig.json
git diff package.json                          # una línea nueva: "@axe-core/playwright": "4.13.0"
r A4b ./poc.sh deps npm ls @axe-core/playwright @playwright/test
git add package.json package-lock.json tsconfig.json
git commit -m "chore(poc-3): add @axe-core/playwright 4.13.0 (P3-05)"
git rev-parse --short HEAD                     # nuevo HEAD de referencia
```

- **Parada dura** si `npm install` falla (`E404` o `ETARGET`), si cambian otros paquetes de `package.json` o si `npm ls` informa `invalid` o `UNMET PEER`.
- El diff de `package-lock.json` entra en la revisión A2.

## B. Prerrequisitos Docker

Todos desde `poc1a/`, con el entorno de A3.

| Paso | Orden | Esperado | Parada |
|---|---|---|---|
| B1 | `r B1 ./poc.sh init` | rc=0; sin salida. Crea `.env` si falta y añade `INTAKE_SECRETO` si no está (`poc.sh:41-46`). No abrir `.env` | dura |
| B2 | `r B2 ./poc.sh db-up` | rc=0 (`poc.sh:49`) | dura |
| B3 | `r B3 ./poc.sh psql -Atc "SELECT datname FROM pg_database WHERE datname LIKE 'poc3%' ORDER BY 1"` | rc=0; lista las `poc3*` existentes | dura si rc≠0 |
| B4 | `r B4a ./poc.sh psql -c 'CREATE DATABASE poc3_intake'` y `r B4b ./poc.sh psql -c 'CREATE DATABASE poc3_migraciones'`, cada una **sólo si no aparece en B3** (`README.md:99`; `POC-3-DISENO.md:276`) | rc=0, `CREATE DATABASE` | dura |

Si `poc3_migraciones` ya existe, la prueba «desde cero» de U4 no vale con ella, y borrarla está prohibido (`poc1a/README.md:20,28`). **PENDIENTE (decisión humana):** usar una base nueva con otro nombre válido para la guarda (por ejemplo `poc3_migraciones_r2`) y anotarla. D01–D03 se ejecutan sobre esa base.

## C. U4 · Migración desde cero (`poc3_migraciones`)

**D01 · Primera migración** (U4; `docs/POC-3-DISENO.md:276`)

```sh
r D01 ./poc.sh migrate-en poc3_migraciones
```

- Esperado: rc=0. Payload aplica `20261015_174323_inicial`, `20261016_055416_poc1b` y `20261017_120000_poc3_intake` (`src/migrations/`). El texto exacto de Payload 3.90.2 no está verificado.
- Parada: dura.
- Registrar: rc y los nombres de las migraciones aplicadas.

**D02 · Segunda migración, sin pendientes** (U4)

```sh
r D02 ./poc.sh migrate-en poc3_migraciones
```

- Esperado: rc=0, sin migraciones aplicadas.
- Parada: fallo registrable si aplica algo.

**D03 · Tablas y restricciones en `poc_prod`** (U4; diseño §3.1)

```sh
r D03a ./poc.sh psql-en poc3_migraciones -Atc "SELECT tablename FROM pg_tables WHERE schemaname='poc_prod' AND tablename LIKE 'intake_%' ORDER BY 1"
r D03b ./poc.sh psql-en poc3_migraciones -Atc "SELECT conrelid::regclass, contype, count(*) FROM pg_constraint WHERE conrelid IN ('poc_prod.intake_envio'::regclass,'poc_prod.intake_limite'::regclass) AND contype IN ('c','p') GROUP BY 1,2 ORDER BY 1,2"
```

- **D03a, esperado:** `intake_envio` e `intake_limite`.
- **D03b, esperado:** `poc_prod.intake_envio|c|1`, `poc_prod.intake_envio|p|1`, `poc_prod.intake_limite|c|3` y `poc_prod.intake_limite|p|1`, según `src/migrations/20261017_120000_poc3_intake.ts:5-16`.
- D03b es un complemento a la consulta del diseño.
- Parada: fallo registrable.

## D. `app` (3443) con el proxy de producción: U5a, NV-15, NV-17 y T-01

**D04 · Levantar `app` en `poc3_intake`** (U5a)

```sh
r D04 ./poc.sh up-en poc3_intake && export NODE_EXTRA_CA_CERTS="$PWD/.tls/ca.crt"
```

- Esperado: rc=0 (`poc.sh:50-54`).
- La primera vez descarga imágenes fijadas por digest, lo que requiere red.
- `next dev` tarda en estar listo: `./poc.sh logs 50` debe mostrar `Ready` (HUECO H-8).
- Parada: dura.

**D05 · Digest del proxy** (NV-15; `docs/POC-3-DISENO.md:264`)

```sh
r D05 docker image inspect --format '{{json .RepoDigests}}' nginx:1.30.6-alpine@sha256:970364228b1e4f932abc22d321932816782cca8a20b85a77552a7cfe9acfb3b5
```

- Esperado: rc=0 y la lista contiene `nginx@sha256:970364228b1e4f932abc22d321932816782cca8a20b85a77552a7cfe9acfb3b5`.
- Parada: dura si no coincide.

**D06 · Base correcta**

```sh
r D06 ./poc.sh comprobar-en poc3_intake
```

- Esperado: rc=0 y `DATABASE_OK:poc3_intake` (`scripts/verificar-db.ts:16`).
- Parada: dura.

**D07 · Sonda de red** (U5a; T-02, NV-3)

```sh
r D07 ./poc.sh sonda-red
```

- Esperado: rc=0 y tres líneas (`scripts/sonda-red.mjs:4-21`):
  - `OK: inaccesible http://app:3000/`
  - `OK: inaccesible http://app-prod:3000/`
  - `OK: proxy TLS /solicitar 200`
- Parada: dura ante cualquier `FALLO:`.
- `app-prod` todavía no existe, así que su línea es débil: D24 la repite con `app-prod` levantado.

**D08 · `push` crea las tablas con sus CHECK** (U4, NV-17; `docs/POC-3-DISENO.md:266,276`)

```sh
r D08a ./poc.sh psql-en poc3_intake -Atc "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'intake_%' ORDER BY 1"
r D08b ./poc.sh psql-en poc3_intake -Atc "SELECT conname, contype FROM pg_constraint WHERE conrelid='public.intake_limite'::regclass ORDER BY 1"
r D08c ./poc.sh psql-en poc3_intake -Atc "SELECT conname, contype FROM pg_constraint WHERE conrelid='public.intake_envio'::regclass ORDER BY 1"
```

- **D08a:** `intake_envio` e `intake_limite`.
- **D08b:** incluye `intake_limite_clave_hmac_hex_check|c`, `intake_limite_n_positivo_check|c`, `intake_limite_tipo_check|c` y una fila `|p` (`src/lib/intake/esquema.ts:37-40`).
- **D08c:** incluye `intake_envio_clave_hex_check|c` y una fila `|p` (`esquema.ts:24`).
- PostgreSQL 18 también registra los `NOT NULL` en `pg_constraint`, así que pueden aparecer filas `|n`.
- Si D08a sale vacía: `push` no corrió o se colgó con la pregunta interactiva (`docs/POC-3-DISENO.md:142`). Hay que revisar `./poc.sh logs 200` y aplicar parada dura.

**D09 · El proxy de producción reemplaza las IP forjadas** (T-01 (ii), NV-4, NV-1)

```sh
r D09 node --test test/docker/ip-produccion.test.mjs
```

- Esperado: rc=0, `# pass 2`, `# fail 0`. La sexta creación da 429 `limite_creaciones` (`ip-produccion.test.mjs:28-30`).
- **Precondición: proxy de producción.** Hay que lanzarlo justo después de D04. Con el proxy de pruebas, `x-poc-ip-sintetica` se respeta, cada envío sale de una IP distinta y la prueba falla.
- La prueba gasta el cupo de la IP real del gateway (`ip-produccion.test.mjs:6-7`). Para repetirla hay que esperar ≥ 10 min, porque la ventana es fija de 10 min (`docs/POC-3-DISENO.md:165`; HUECO H-9).
- Parada: dura (seguridad).

## E. `app` (3443) con el proxy de pruebas: U2, U5b y U6

**D10 · Modo pruebas**

```sh
r D10 ./poc.sh up-pruebas-en poc3_intake && export NODE_EXTRA_CA_CERTS="$PWD/.tls/ca.crt"
```

- Esperado: rc=0 (`poc.sh:55-59`). Recrea `app` con el override (`compose.pruebas.yaml:5-10`).
- Esperar a `Ready` en `./poc.sh logs 50`.
- Parada: dura.

**D11 · vitest completo dentro de `app`** (U2 hook y NV-12, U5b T-03 (i)/(ii), U6 T-03 (iii), HTTP U5b/U6, NV-7, POC-1b)

```sh
r D11 ./poc.sh exec-en poc3_intake npx vitest run
```

- Incluye `src/**/*.test.ts` y `test/**/*.test.ts` (`vitest.config.ts:9`), y entre ellos:
  - `test/integracion/intake-hook.int.test.ts`
  - `test/integracion/intake-persistir.int.test.ts`
  - `test/integracion/intake-limites.int.test.ts`
  - `test/http/intake.test.ts`
- Esperado: rc=0 y `Tests N passed (N)`. N no se puede deducir: hay que anotarlo.
- **Previsión de fallo (estática, no ejecutada):**
  - **H-1:** `test/http/intake.test.ts` apunta por defecto a `https://127.0.0.1:3443` (`intake.test.ts:3`), que **dentro** del contenedor `app` no escucha (`poc.sh:79-82`; `compose.yaml:52`). Se espera `fetch failed` / `ECONNREFUSED`.
  - **H-2:** el caso «honeypot» envía `cookie: otra-cookie` (`intake.test.ts:41,44`). El manejador comprueba el CSRF antes que la trampa (`src/lib/intake/manejador.ts:91-93`), así que responde 403 `csrf_invalido` en lugar del 400 esperado.
- Parada: fallo registrable. Hay que anotar qué archivos y qué tests fallan.
- **Variante diagnóstica no validada.** Sólo si H-1 se confirma; su resultado no sustituye la corrección de jz-implementer: `r D11-diag ./poc.sh exec-en poc3_intake env POC_HTTP_BASE=https://proxy:3443 npx vitest run test/http/intake.test.ts`. Usa el nombre `proxy`, que está en el SAN del certificado (`poc.sh:18`), y la CA del contenedor (`compose.yaml:50`).

**D12 · `tsc` dentro de `app`** (criterio «vitest y tsc», `docs/PLAN-POC-3.md:178`)

```sh
r D12 ./poc.sh exec-en poc3_intake npx tsc --noEmit
```

- Esperado: rc=0, sin salida (`poc1a/README.md:14`). Con A4 hecho, cubre también `intake-axe.spec.ts`.
- Parada: fallo registrable.

**D13 · IN-01..IN-12 con el proxy de pruebas** (U5b IN-01..IN-10, U6 IN-11, IN-12; NV-1, NV-3)

```sh
r D13 env POC_TARGET_DATABASE=poc3_intake POC_BASE_URL=https://127.0.0.1:3443 node ../contrato/run.mjs --driver contrato-driver.mjs --solo "$LIN" --alcance poc-3
```

- Esperado: rc=0 y `casos 12 · ok 12 · fail 0 · pendiente 0` (`contrato/run.mjs:95-96,101`).
- **Corrección C-2:** se usa `--solo "$LIN"` porque `--alcance poc-3` sin `--solo` ejecuta los 56 casos (`run.mjs:65-72`). En este modo `POC_FALLOS_INYECTABLES=0` (`compose.pruebas.yaml:10`), así que EV-04 fallaría (`contrato/casos/eventos.mjs:65-68`).
- Parada: fallo registrable.

## F. `app` (3443) con fallos inyectables: U7 y gate U9, parte 1

**D14 · Modo fallos**

```sh
r D14 ./poc.sh up-fallos-en poc3_intake && export NODE_EXTRA_CA_CERTS="$PWD/.tls/ca.crt"
```

- Esperado: rc=0 (`poc.sh:60-63`). Recrea `db`, `app` y `proxy`.
- Esperar a `Ready`.
- Parada: dura.

**D15 · Logs sin PII con fallos reales** (U7; IN-12, T-05 (ii)/(iii), T-06, T-09 (ii), NV-9, NV-10)

```sh
r D15 node --test test/docker/logs-intake-fallos.test.mjs
```

- Esperado: rc=0, `# pass 9`, `# fail 0`: 4 fallos inyectados con 500, JSON roto, 413, logs sin fugas, `pg_code` por correlación y error crudo saneado (`logs-intake-fallos.test.mjs:27-80`).
- Si sale «la inyección no está activa», no se levantó con `up-fallos-en`.
- Parada: dura si aparece cualquier fuga (`buscarFugas`).

**D16 · Batería de 44 en `app`** (U9; T-10 en `app`; NV-14)

```sh
r D16 env POC_TARGET_DATABASE=poc3_intake POC_BASE_URL=https://127.0.0.1:3443 node ../contrato/run.mjs --driver contrato-driver.mjs --solo "$L44"
```

- Esperado: rc=0 y `casos 44 · ok 44 · fail 0` (`README.md:103`).
- NV-14 sólo queda cubierto si `app-prod` no se ha creado antes: las órdenes de C usan `run --rm`. Hay que anotar si existía de una sesión anterior.
- Parada: fallo registrable.

**D17 · `--alcance poc-3` en `app`** (U9; IN-11 y concurrencia de U6, 12/12 IN-*)

```sh
r D17 env POC_TARGET_DATABASE=poc3_intake POC_BASE_URL=https://127.0.0.1:3443 node ../contrato/run.mjs --driver contrato-driver.mjs --alcance poc-3
```

- Esperado: rc=0 y `casos 56 · ok 56 · fail 0 · pendiente 0` (`README.md:104`). Ejecuta los 56 casos, y aquí EV-04 sí tiene inyección.
- Parada: fallo registrable.

## G. U8 · E2E en `app`

**D18 · E2E contra `next dev` por el proxy** (U8; NV-2, NV-13, NV-16)

```sh
r D18 ./poc.sh e2e-en poc3_intake && export NODE_EXTRA_CA_CERTS="$PWD/.tls/ca.crt"
```

- Esperado: rc=0.
  - Con A4: `13 passed`, que son f1, f3, acciones, 7 de `intake.spec.ts` y 3 de axe.
  - Sin A4: `10 passed` y `3 skipped`.
- Recrea `app` y `proxy` **sin** el override (`poc.sh:87-95`).
- El log no debe contener la contraseña del admin: `E2E_RESET` viaja por entorno (`poc.sh:84,94`). Si el reset falla, el mensaje del driver puede incluir el final de la salida del reset (`contrato-driver.mjs:292-293`). Hay que revisarlo con J1 antes de compartirlo.
- Parada: fallo registrable.

## H. `app-prod` (3444): U7 producción, NV-8, gate U9 parte 2 y U8 en producción

**D19 · Migrar `poc_prod` de `poc3_intake`**

```sh
r D19 ./poc.sh migrate-en poc3_intake
```

- Esperado: rc=0. Es idempotente, así que se ejecuta siempre (`README.md:108` lo condiciona, pero no hay orden para consultarlo).
- El orden migrar → build → levantar es el de `poc1a/README.md:22-24`.
- Parada: dura.

**D20 · Build de producción** (U7)

```sh
r D20 ./poc.sh build-en poc3_intake
```

- Esperado: rc=0 y la línea `build_ms=<n> codigo=0` (`poc.sh:116-118`).
- Parada: dura.

**D21 · El build no contiene la inyección** (T-05 (iv), NV-11)

```sh
r D21a node --test test/build/sin-inyeccion.test.mjs
r D21b node --test test/build/comprobar-build.test.mjs
```

- **D21a:** rc=0, `# pass 1`. Exige un `.next-prod` posterior a las fuentes (`test/build/comprobar-build.mjs:40-48`).
- **D21b:** rc=0. No usa Docker (`README.md:73`).
- Parada: dura si D21a falla por un marcador.

**D22 · NV-8: un `INTAKE_SECRETO` débil impide servir** (`docs/POC-3-DISENO.md:175,257`)

```sh
T22="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
r D22a env INTAKE_SECRETO=abcd ./poc.sh up-prod-en poc3_intake && export NODE_EXTRA_CA_CERTS="$PWD/.tls/ca.crt"
sleep 30
r D22b ./poc.sh logs-since "$T22"
grep 'app-prod' "$S/D22b.log" | grep -c 'config_intake_invalida'
```

- **D22a:** rc=0, porque `up -d` no espera a que el contenedor salga.
- **D22b:** rc=0, y el `grep` final cuenta ≥ 1 línea `{"evento":"arranque","codigo":"config_intake_invalida"}` de `app-prod`.
- **Debe ir después de D20.** Sin build, `next start` también saldría con 1 por otro motivo y la prueba sería vacua (corrección C-3).
- No hay orden de `poc.sh` que muestre el código de salida del contenedor (HUECO H-7).
- `abcd` es un valor falso deliberado. Se pasa en línea y no se exporta.
- Parada: dura si no aparece la línea.

**D23 · `app-prod` con el proxy de pruebas** (U7)

```sh
r D23 ./poc.sh up-prod-pruebas-en poc3_intake && export NODE_EXTRA_CA_CERTS="$PWD/.tls/ca.crt"
```

- Esperado: rc=0 (`poc.sh:134-138`). Recrea `app-prod` con el secreto real de `.env`, porque cambia su configuración.
- `app` sigue levantado desde D18, y debe seguir así: el reset del driver y de E2E se ejecuta dentro de `app` (`contrato-driver.mjs:286`; `poc.sh:79-82`).
- Esperar a `Ready` de `app-prod` en `./poc.sh logs-since <instante>`.
- Parada: dura.

**D24 · Sonda de red con `app-prod` levantado** (T-02, NV-3)

```sh
r D24 ./poc.sh sonda-red
```

- Esperado: igual que D07.
- Parada: dura.

**D25 · Logs sin PII en producción** (U7; IN-12, T-05, T-09; no inyección con `POC_FALLOS_INYECTABLES=1`)

```sh
r D25 env POC_BASE_URL=https://127.0.0.1:3444 node --test test/docker/logs-intake.test.mjs
```

- Esperado: rc=0, `# pass 8`, `# fail 0` (`logs-intake.test.mjs:25-86`).
- Parada: dura si hay fugas o si `x-poc-fallo` inyecta algo.

**D26 · Batería de 43 en `app-prod`, sin EV-04** (U9; T-10 según P-U1-01, T-13, CO-05)

```sh
r D26 env POC_TARGET_DATABASE=poc3_intake POC_BASE_URL=https://127.0.0.1:3444 POC_RESET_ENV='POC_DB_SCHEMA=poc_prod POC_MEDIA_DIR=/app/media-store-prod' node ../contrato/run.mjs --driver contrato-driver.mjs --solo "$L43"
```

- Esperado: rc=0 y `casos 43 · ok 43 · fail 0` (`README.md:111`).
- Hay que anotar `medida CO-05 propagacion_ms = <n> ms` y `supera_objetivo_provisional = 0|1` (`contrato/casos/contenido.mjs:69-71`). Ahora el valor incluye el proxy y TLS (`README.md:119`).
- Parada: fallo registrable.

**D27 · IN-* en `app-prod`** (U9; 12/12 IN-* en 3444)

```sh
r D27 env POC_TARGET_DATABASE=poc3_intake POC_BASE_URL=https://127.0.0.1:3444 POC_RESET_ENV='POC_DB_SCHEMA=poc_prod POC_MEDIA_DIR=/app/media-store-prod' node ../contrato/run.mjs --driver contrato-driver.mjs --solo "$LIN" --alcance poc-3
```

- Esperado: rc=0 y `casos 12 · ok 12 · fail 0 · pendiente 0`.
- **Corrección C-2:** la orden literal de `README.md:112` no lleva `--solo`, así que ejecuta los 56 casos, entre ellos EV-04. Su resultado previsible es `casos 56 · ok 55 · fail 1 · pendiente 0` con rc=1 y EV-04 como único FAIL (P-U1-01).
- Si el humano prefiere ejecutar la literal, debe registrarla como `D27-lit` con esa interpretación.
- Parada: fallo registrable.

**D28 · E2E contra el build de producción** (U8 en producción)

```sh
r D28 ./poc.sh e2e-prod-en poc3_intake && export NODE_EXTRA_CA_CERTS="$PWD/.tls/ca.crt"
```

- Esperado: rc=0, con los mismos conteos que D18.
- **Precondición de `app`:** *corregida en `b09d7ea`, pendiente de verificación Docker.* `e2e-prod-en` ahora levanta `app` en `poc3_intake` y la verifica con `verificar-db.ts` antes del reset, y `exec-en` repite esa verificación. Antes sólo levantaba `db` y `app-prod`, y el reset (`exec-en` en `app`) podía caer en otra base.
- Recrea `app-prod` y `proxy` **sin** el override (`poc.sh:100-101`).
- Parada: fallo registrable.

## I. U9 · Medición de latencia y falsos positivos

**D29 · Volver a poner el proxy de pruebas: corrección C-1**

`poc1a/README.md:114` afirma que, tras `e2e-prod-en`, «app-prod sigue arriba con el proxy de pruebas». **Es falso.** `e2e-prod-en` recrea el proxy con `$C`, sin `compose.pruebas.yaml` (`poc.sh:7,101`). Lo mismo hacen `up-en` y `e2e-en` (`poc.sh:54,92`). La medición envía `x-poc-ip-sintetica` (`medicion/intake-latencia.mjs:140`), y sólo el proxy de pruebas la respeta (`intake-latencia.mjs:2-4`). Con el de producción, los 150 envíos saldrían de una sola IP y desde el sexto darían 429, que el script contaría como falsos positivos.

```sh
r D29 ./poc.sh up-prod-pruebas-en poc3_intake && export NODE_EXTRA_CA_CERTS="$PWD/.tls/ca.crt"
```

- Esperado: rc=0.
- Esperar a `Ready` de `app-prod`.
- Parada: dura.

**D30 · Medición** (U9; IN-10 a escala, D-08, D-09)

```sh
r D30 env POC_BASE_URL=https://127.0.0.1:3444 node medicion/intake-latencia.mjs
```

- Esperado: rc=0 y un JSON con:
  - `enviados: 150`, `creados: 150`, `falsos_positivos: 0`, `errores: 0`, `ok: true`;
  - `series[0..2]` con `mediana_ms` y `p95_ms`;
  - `mediana_de_medianas_ms` y `p95_ms` (`intake-latencia.mjs:103-110,149-150`).
- Crea 150 solicitudes en `poc_prod` (`README.md:114`).
- Parada: fallo registrable si rc=1. No se repite sin registrar el primer intento.

## J. Cierre de la evidencia

```sh
grep -nE '"password"|PAYLOAD_SECRET|INTAKE_SECRETO=|POC_DB_PASSWORD|PRIVATE KEY|E2E_RESET=' "$S"/*.log
sha256sum "$S"/*.log > "$S/SHA256SUMS"
```

- J1: la única coincidencia admisible es la cabecera de `D22a.log` con el valor falso `INTAKE_SECRETO=abcd`. Cualquier otra coincidencia se elimina del material compartido y se avisa.
- J2: se guardan los hashes.

Las filas de evidencia se pegan en `poc1a/EVIDENCIA.md`, sección «POC-3 · Intake seguro» (`EVIDENCIA.md:170-230`). Hay que sustituir los `PENDIENTE` de `EVIDENCIA.md:187-211` y rellenar las tablas de latencia y de falsos positivos (`EVIDENCIA.md:218-228`) con los campos del JSON de D30. Si quien edita `EVIDENCIA.md` es un agente, el humano le pasa los logs o la copia con su `SHA256SUMS`.

### Plantilla de registro

Qué no se copia nunca:

- PII (aquí sólo hay valores `SNT-` sintéticos, que tampoco hace falta copiar);
- `.env`, `INTAKE_SECRETO`, `PAYLOAD_SECRET` ni `POC_DB_PASSWORD`;
- `E2E_RESET` ni la contraseña del admin sintético;
- claves de `.tls/` ni IPs del gateway del host.

Basta con los conteos, las líneas de resumen y la ruta y el hash del log.

```markdown
#### Gate Docker POC-3 (ejecución humana, docs/GATE-DOCKER-POC-3.md)
Ejecutado por: <responsable> · Salidas: <ruta fuera del repo> · SHA256SUMS: <hash del archivo>

| Paso | Unidad / criterio | Fecha (UTC) | HEAD | rc | Conteo / resultado | Observación | Log (sha256) |
|---|---|---|---|---|---|---|---|
| A2 | revisión de seguridad | | | — | REV=<…> | sin hallazgos / hallazgos | — |
| A4 | P3-05 axe | | | | versión instalada | autorizado sí/no | A4a.log |
| D01–D03 | U4 desde cero | | | | 3 migraciones; 2.ª sin pendientes; tablas y CHECK | | |
| D05 | NV-15 | | | | digest coincide sí/no | | |
| D07 / D24 | U5a T-02 NV-3 | | | | 3 OK / 3 OK | | |
| D08 | NV-17 | | | | tablas y CHECK en public | | |
| D09 | T-01 (ii) NV-4 | | | | pass 2 / fail 0 | | |
| D11 | U2 U5b U6 vitest | | | | Tests N passed (N) | H-1/H-2 confirmados sí/no | |
| D12 | tsc | | | | sin errores | | |
| D13 | IN-* modo pruebas | | | | casos 12 · ok 12 · fail 0 · pendiente 0 | | |
| D15 | U7 fallos | | | | pass 9 / fail 0 | | |
| D16 | U9 44 en app | | | | casos 44 · ok 44 · fail 0 | NV-14: app-prod existía sí/no | |
| D17 | U9 alcance en app | | | | casos 56 · ok 56 · fail 0 · pendiente 0 | | |
| D18 | U8 E2E app | | | | N passed, M skipped | | |
| D20 | build | | | | build_ms=<n> | | |
| D21 | NV-11 | | | | pass 1 | | |
| D22 | NV-8 | | | | config_intake_invalida ×n | | |
| D25 | U7 producción | | | | pass 8 / fail 0 | | |
| D26 | U9 43 en app-prod (P-U1-01) | | | | casos 43 · ok 43 · fail 0 | CO-05 propagacion_ms=<n> | |
| D27 | IN-* app-prod | | | | casos 12 · ok 12 · fail 0 · pendiente 0 | | |
| D28 | U8 E2E prod | | | | N passed, M skipped | | |
| D30 | U9 medición | | | | 150/150, FP 0, errores 0 | mediana de medianas, p95 | |
```

## Correcciones y huecos detectados al redactar

**Correcciones** (este procedimiento ya las aplica; `README.md` y los arreglos de código se corrigieron en el ciclo 1, pendientes de verificación Docker):

- **C-1.** *Corregido en `b09d7ea`, pendiente de verificación Docker.* `README.md:114` decía que tras `e2e-prod-en` el proxy de pruebas sigue arriba. No es así: hay que repetir `up-prod-pruebas-en` antes de medir (D29).
- **C-2.** *Corregido en `b09d7ea`, pendiente de verificación Docker.* `README.md:112` y el diseño (`POC-3-DISENO.md:280`) usan `--alcance poc-3` sin `--solo`. Eso ejecuta los 56 casos, y EV-04 falla donde no hay inyección (D13 y D27).
- **C-3.** NV-8 sólo es significativo después de un build (D22 va detrás de D20).

**Huecos:**

- **H-1.** *Corregido en `c8bbf0f` (la base por defecto pasa a `https://proxy:3443`), pendiente de verificación Docker.* `test/http/intake.test.ts:3` no podía llegar al proxy desde dentro de `app` (D11).
- **H-2.** *Corregido en `c8bbf0f` (el honeypot usa token y cookie válidos), pendiente de verificación Docker.* El caso honeypot estaba mal construido (`intake.test.ts:41,44` frente a `manejador.ts:91-93`).
- **H-3.** T-08, NV-5 y NV-6 no tienen prueba Docker ni HTTP. Son el 413 chunked y el `Content-Length` falso directos a `app:3000` y `app-prod:3000` (`POC-3-DISENO.md:325`). En `test/http/` no hay `chunked` ni `app-prod:3000` para intake; sólo existe el unitario `src/lib/intake/cuerpo.test.ts`.
- **H-4.** La matriz CSRF/origen del diseño (`POC-3-DISENO.md:308`) sólo está cubierta en parte por HTTP:
  - `intake.test.ts:37-40` cubre Origin ajeno, `null`, Referer engañoso y cookie distinta;
  - faltan sin token, token alterado, caducado, sin Origin ni Referer y urlencoded con token malo;
  - ninguna prueba HTTP comprueba «sin registro», que es el criterio de `PLAN-POC-3.md:180`.
- **H-5.** No hay orden documentada para ejecutar `test/http/intake.test.ts` contra `app-prod` (T-07 en 3444). Lo cubre en parte el test de cookie de E2E en D28 (`e2e/intake.spec.ts:91`).
- **H-6.** El criterio de D-08 «confirmar cómo se comporta el límite por /64 detrás de NAT con el cliente real» (`EVIDENCIA.md:247`) no tiene procedimiento en la POC.
- **H-7.** `poc.sh` no tiene orden que muestre el código de salida de `app-prod` (D22).
- **H-8.** `poc.sh` no tiene orden de espera de disponibilidad: se usan los logs.
- **H-9.** No hay orden que libere el cupo del gateway para repetir D09: hay que esperar a la ventana siguiente.

Los arreglos de H-1 a H-5 son trabajo de jz-implementer, y su priorización corresponde a jz-qa en U10.

## Decisiones humanas que bloquean el cierre

| ID | Qué decide | Opción que recomienda la documentación | Cita |
|---|---|---|---|
| P-U1-01 | Si T-10 («44/44 en `app` y en `app-prod`», `TRAZABILIDAD-POC-3.md:58`) se da por cumplido con 44 en `app` y 43 en `app-prod`, sin EV-04 | Aceptar la propuesta implementada. EV-04 necesita `x-poc-fallo`, que sólo existe con `NODE_ENV!=='production'`, y habilitarlo en `app-prod` debilitaría producción. Tras la decisión, jz-architect enmienda el texto de T-10. Mientras tanto, T-10 «no se cumple literalmente» | `poc1a/README.md:92`; `poc1a/EVIDENCIA.md:179`; `docs/POC-3-DISENO.md:10` |
| D-08 | Mecanismo antiabuso del MVP | Controles propios: límites 30 intentos y 5 creaciones / 10 min por IP o /64 con clave HMAC, trampa y tiempo mínimo. El desafío externo queda como mitigación bajo demanda, con un disparador explícito. Antes de cerrar: medición de falsos positivos (D30) y comportamiento tras NAT (H-6) | `poc1a/EVIDENCIA.md:232-247`; `docs/ROADMAP-MVP.md:427` |
| D-09 | Mecanismo antiduplicados | **PENDIENTE: la documentación no registra una recomendación explícita.** El único mecanismo diseñado e implementado es la clave HMAC del nonce del formulario en `intake_envio`, con `ON CONFLICT DO NOTHING` en la misma transacción. Los criterios de `ROADMAP-MVP.md:428` se evidencian con IN-09 (D13, D17, D27), el duplicado concurrente HTTP (D11), IN-10 y la medición (D30). Hay que tener en cuenta que cada GET emite un nonce nuevo (`POC-3-DISENO.md:94`): un reintento con el mismo formulario no duplica, pero recargar la página y reenviar crea un registro nuevo | `docs/PLAN-POC-3.md:94-96`; `docs/POC-3-DISENO.md:138,153,159`; `docs/ROADMAP-MVP.md:188,428` |
| P3-05 | Autorizar ahora la instalación (A4) | La opción está aprobada (`@axe-core/playwright` 4.13.0); falta autorizar el acto de instalar. La alternativa, una lista manual con lector de pantalla, es «más débil» | `docs/PLAN-POC-3.md:186,197`; `poc1a/README.md:77-81` |

## Criterio de cierre de U10 (`docs/PLAN-POC-3.md:176-182`)

- [ ] **`--alcance poc-3` 12/12 IN-*:** D13, D17 y D27.
- [ ] **Regresión de 44/44 contra el intake real:** D16 (44 en `app`) y D26 (43 en `app-prod`), y además la decisión **P-U1-01**.
- [ ] **vitest y `tsc` en verde:**
  - D11 y D12;
  - la suite `jz-run` de los agentes repetida sobre el HEAD final, porque la de `EVIDENCIA.md:182` es de `95db8f4`;
  - H-1 y H-2 resueltos.
- [ ] **E2E en verde, con teclado y auditoría:** D18 y D28 con los 3 tests de axe ejecutados. Requiere A4 y P3-05.
- [ ] **CSRF y origen con 403 sin registro:** D11 (`intake.test.ts:33-48`) y D25 (CSRF 403 en producción). Para cumplirlo tal como está escrito hace falta cerrar H-4.
- [ ] **Mediciones registradas:**
  - D30 en las tablas de `EVIDENCIA.md:218-228`;
  - CO-05 de D26;
  - `build_ms` de D20;
  - las decisiones **D-08** y **D-09**.
- [ ] **jz-security y jz-qa sin defectos importantes abiertos:** es la propia U10, sobre los logs de este gate, H-3 y H-5.

## K. Limpieza (sólo servicios del POC)

```sh
r K1 ./poc.sh down-prod
r K2 ./poc.sh down
r K3 ./poc.sh stats
```

- **K1:** rc=0. Para y borra `app-prod` (`poc.sh:139`).
- **K2:** rc=0. Ejecuta `docker compose -p jozeuzz-poc-a down` (`poc.sh:67`): baja contenedores y redes del proyecto y **conserva** el volumen `db` con las bases `poc3_*` y `poc1b_*`.
- **K3:** rc=1, con el mensaje `sin contenedores del proyecto jozeuzz-poc-a; nada que medir` (`poc.sh:140-143`). Ese rc=1 es el esperado.
- **No usar** `./poc.sh destroy` (`down -v`, `poc.sh:144`) ni `docker system prune`.
- `.tls/` se queda en el disco: está ignorada (`.gitignore:2`), su CA dura 1 día y su `ca.key` ya se borró (`poc.sh:25`).
- `.next-prod/` y `media-store-prod/` están ignorados (`poc1a/.gitignore:13-14`).
