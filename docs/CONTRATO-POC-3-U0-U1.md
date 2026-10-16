# Contrato de tarea · POC-3, unidades 0, 0b y 1

Estado: **autorizado** (H0A-16c y P3-01 a P3-10 aprobadas el 2026-10-16). Rama `poc/candidata-a-3`. Plan: `docs/PLAN-POC-3.md`. Hallazgos y requisitos: `docs/TRAZABILIDAD-POC-3.md` (T-01 a T-14). Protocolo: `docs/AUTONOMIA-JZ.md`.

## Reglas comunes

- **Rama y worktree:** los que fije H0A-16c (P3-01). Sólo hay un escritor por worktree. Antes de empezar, `.jz/bin/jz-state` tiene que dar `REANUDABLE`: sin procesos `claude` ni `opencode` ajenos en el worktree, sin bloqueo y sin cuarentena.
- **Datos:** sólo sintéticos (T-09). No se hacen escrituras de prueba en la base `poc` ni en el schema `poc_prod` de esa base (las pruebas de `app-prod` usan bases `poc1b_*`/`poc3_*`), ni se usa ningún dato real.
- **Sin autorización expresa no se hace:** push, merge, reset, checkout, stash ni clean; instalaciones ni red; cambios en el plano de control (`.claude/`, `.opencode/`, `.jz/`, `AGENTS.md`, `CLAUDE.md`).
- **Columna «Ejecución»:**
  - `jz-run`: un agente la lanza de forma autónoma, sin red ni Docker.
  - `Docker`: la lanza el humano con `poc1a/poc.sh` mientras no exista el ejecutor aislado (`docs/ESPEC-VM-PRUEBAS.md`, sin crear).
- **Al terminar o al interrumpirse:** `.jz/bin/jz-checkpoint --unit "…" --state …` y un informe `INFORME-JZ`.

## Unidad 0 · Línea base (no cambia código)

| Campo | Contenido |
|---|---|
| Objetivo | Demostrar que el punto de partida está en verde antes de tocar nada |
| Requiere | H0A-16c aprobada (P3-01) |
| Responsables | Humano (pruebas con Docker) y jz-orchestrator (verifica la evidencia); jz-qa revisa en lectura |
| Archivos permitidos | Ninguno. Si algo no está en verde, se detiene y se informa |
| Ejecución con `jz-run` | `.jz/bin/jz-run node --test .jz/tests/*.test.mjs` · `.jz/bin/jz-run node --test contrato/test/` (43/43, `EVIDENCIA.md:16`) · `.jz/bin/jz-run --cwd poc1a node node_modules/typescript/bin/tsc --noEmit` (rc=0) · `.jz/bin/jz-run --cwd poc1a node node_modules/vitest/vitest.mjs run --configLoader runner src test/estatico` (15/15, respaldado por `.jz-state/runs/20261016T150413Z-774239.log`, rc=0, `976f091`). Además, `node --test .jz/tests/sandbox.test.mjs` en el host (9/9). Como no pasa por `jz-run`, su salida se registra en `.jz-state/notes/poc3-u0-docker.md`, igual que las de Docker. `integration.mjs` no forma parte de la línea base (consume cuota de los motores) |
| Ejecución con Docker (humano, desde `poc1a/`, según `poc1a/README.md:9-19`) | `./poc.sh db-up` · `./poc.sh psql -c 'CREATE DATABASE poc1b_migraciones'` (sólo si no existe) · `./poc.sh up-en poc1b_migraciones` · `./poc.sh comprobar-en poc1b_migraciones` · `./poc.sh exec-en poc1b_migraciones npx vitest run` (72/72) · `./poc.sh exec-en poc1b_migraciones npx tsc --noEmit` · `POC_TARGET_DATABASE=poc1b_migraciones node ../contrato/run.mjs --driver contrato-driver.mjs --alcance poc-1a` (21 ok / 0 fail / 35 pendientes, `EVIDENCIA.md:144`) · `./poc.sh up-fallos-en poc1b_migraciones` · batería de 44 con `POC_INTAKE_SINTETICO=1 … --solo <44 casos>` (44/44) · `./poc.sh e2e-en poc1b_migraciones` (3/3) |
| Aceptación | rc=0 y estos recuentos exactos: vitest 72/72, contrato 43/43, batería 44/44, E2E 3/3, `--alcance poc-1a` 21 ok / 0 fail / 35 pendientes (`EVIDENCIA.md:16,144,145,152`). Los 12 IN-* siguen como `NoImplementado`. Las ejecuciones con `jz-run` quedan en `.jz-state/runs.jsonl`. Las de Docker, que no pasan por `jz-run`, se registran en `.jz-state/notes/poc3-u0-docker.md` con el comando, la salida, `git rev-parse HEAD` y `.jz/bin/jz-run --fingerprint` del árbol probado |
| Unidad TDD | No aplica: es una verificación |

## Unidad 0b · Guardas de base `poc(1b|3)_` (T-11, T-09)

| Campo | Contenido |
|---|---|
| Objetivo | Permitir bases `poc3_*` sin relajar la protección de `poc` y `poc_prod` |
| Requiere | La unidad 0 en verde y H0A-16c (no requiere otras decisiones P3) |
| Responsable | jz-implementer (único escritor); jz-qa revisa |
| Archivos permitidos | `poc1a/poc.sh` (sólo `nombre_poc1b`/la guarda), `poc1a/contrato-driver.mjs:12-15`, `poc1a/scripts/verificar-db.ts`, `poc1a/scripts/solicitud-sintetica.ts` y una prueba nueva `poc1a/test/estatico/guardas-base.test.ts` |
| Rojo previo | `guardas-base.test.ts` falla porque los 4 archivos aceptan sólo `^poc1b_`. Casos: aceptar `poc1b_x` y `poc3_x`; rechazar `poc`, `poc_prod`, `poc3_`, `poc3_X`, `poc3_x;rm` y `poc4_x`. El test comprueba además (T-09 (i)) que los **datos de cliente y de payload** de `contrato/fixture.mjs`, `contrato/casos/util.mjs` y `poc1a/contrato-driver.mjs` sólo usan el prefijo `SNT-`, el dominio `example.invalid` y los rangos `203.0.113.0/24` y `2001:db8::/32`. Se excluye la URL de loopback del servidor (`POC_BASE_URL`, `127.0.0.1:3101`). Si el fixture actual no cumple, el rojo lo demuestra y se corrige sólo el dato, nunca la regla |
| Verde | `.jz/bin/jz-run --cwd poc1a node node_modules/vitest/vitest.mjs run --configLoader runner test/estatico` y `tsc` en verde, más un commit |
| Ejecución | `jz-run` (autónoma). Comprobación opcional con Docker: `./poc.sh comprobar-en poc1b_migraciones` sigue funcionando |
| Fuera de alcance | Crear la base `poc3_*` (se hace en la unidad 4, con Docker) |

## Unidad 1 · Diseño fino `docs/POC-3-DISENO.md`

| Campo | Contenido |
|---|---|
| Objetivo | Convertir el plan y T-01 a T-13 en un diseño cerrado, del que la unidad 2 pueda partir sin decisiones abiertas |
| Requiere | H0A-16c, más las decisiones P3-02 (proxy e imagen), P3-03, P3-04, P3-08, P3-09 y **P3-10**. P3-10 es una decisión nueva propuesta en `TRAZABILIDAD-POC-3.md` T-07 (TLS en el proxy con una CA efímera, o `__Host-` sobre http sólo si se demuestra que Chromium la acepta) y hay que añadirla al §7 del plan. Sin estas decisiones, el documento puede redactarse con alternativas, pero no se acepta |
| Responsable | jz-architect (único escritor, sólo `docs/`); jz-security y jz-qa revisan en lectura |
| Archivos permitidos | `docs/POC-3-DISENO.md` y notas en `.jz-state/notes/` |
| Contenido obligatorio | (1) Topología Compose: el proxy como única entrada (sólo en `127.0.0.1:`), `app` y `app-prod` sin `ports` y `e2e` en su propia red. La configuración de producción del proxy y el override de pruebas van en archivos separados, y un cliente con acceso a la red interna sólo existe en el override (T-01, T-02, T-08, T-13). (2) Rutas, métodos, códigos y cuerpos de error del endpoint y de `GET /solicitar` (T-07, T-08). (3) Esquema SQL de `intake_envio` e `intake_limite`, la purga ≥ TTL y la transacción única de Payload (T-03, T-04). (4) Derivación de claves (HKDF, `kid`) y arranque fallido si falta el secreto. (5) Serializador de errores en **lista blanca** (sin `message`, `stack`, `params`, `query`, `cause` ni `detail`), mecanismo de fallo real de PostgreSQL sólo para pruebas y configuración de logs de `db` (T-05, T-06). (6) Driver: `preparar`, `enviar`, el mapeo de origen a IPv6 sintética y `limite.max` (T-04). (7) Una tabla de los 12 IN-* y de los controles del §5 del plan, cada uno con su prueba roja, su unidad y su tipo de ejecución (`jz-run` o Docker). (8) La regresión de 44 casos sobre `app` y `app-prod` a través del proxy (T-10) |
| Aceptación | El documento incluye una **matriz de cobertura** con una fila por elemento (los 12 IN-*, los controles del §5 del plan, T-01 a T-13 y los puntos 1 a 10 del §9 del plan). Cada fila indica la sección del diseño, la prueba roja, la unidad y el tipo de ejecución (`jz-run` o Docker). (a) Nota de jz-security en `.jz-state/notes/poc3-u1-security.md`: sin hallazgos críticos ni importantes abiertos. (b) Nota de jz-qa en `.jz-state/notes/poc3-u1-qa.md` que marca **cada fila** de la matriz como cubierta; cualquier «parcial» impide aceptar (T-12). Como los revisores no escriben, las notas las transcribe literalmente el orquestador o el implementador, citando la sesión de la revisión. (c) jz-implementer ejecuta `.jz/bin/jz-run node --test .jz/tests/*.test.mjs contrato/test/` sobre el árbol con el documento, para que `jz-checkpoint --state validado` sea posible. (d) Un commit `docs(poc-3): …` |
| Ejecución | Ninguna prueba nueva; sólo la regresión con `jz-run` del punto (c) |
| Fuera de alcance | Código, migraciones, Compose, dependencias |

## Qué podrá ser autónomo y qué no en POC-3

| Tipo de prueba | Ejecución | Unidades |
|---|---|---|
| Vitest unitario y estático (validador, token, IP, guardas, logger aislado, migración estática), `tsc`, `node --test contrato/test/` y `node --test .jz/tests/*.test.mjs` | `jz-run`, autónoma | 0, 0b, 2 (validador), 3, 4 (estática), 7 (serializador) |
| Vitest de integración y HTTP, la batería del contrato contra la app, migraciones desde cero, Playwright y E2E, logs de los contenedores y mediciones | Docker: el humano con `poc.sh`, o la VM aislada si se aprueba y se crea | 0, 2 (hook con Local API), 4 (desde cero), 5, 6, 7, 8, 9 |
