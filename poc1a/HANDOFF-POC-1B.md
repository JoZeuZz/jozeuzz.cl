# Relevo a OpenCode — POC-1b (candidata A, reglas de negocio)

Preparado el 2026-10-15 por Claude Code. Escritor siguiente: OpenCode. Verificar cada SHA antes de actuar; si algo no coincide, detenerse e informar.

## 0. Puerta previa (bloqueante)

POC-1b **no está autorizada todavía** en el registro. H0A-16 exige una entrada propia por POC; hoy sólo existe H0A-16a (POC-1a).
Antes de escribir código, el responsable debe aprobar una entrada H0A-16b. Propuesta de texto (no registrada):

> **H0A-16b — POC-1b autorizada** (candidata A, sólo local, mismo worktree y mismo proyecto Compose `jozeuzz-poc-a`). Alcance: H0A-02, H0A-03 y H0A-04 en el servidor, los 31 casos `poc-1b` del contrato y el intake sintético interno de R-1. Sin instalaciones nuevas de paquetes ni imágenes; sin cambios en `contrato/`; sin endpoint público de intake. La operación se detiene ante cualquier cambio de configuración global, acceso a recursos productivos o necesidad de eludir el control de acceso nativo.

El primer commit de OpenCode registra esa entrada en `docs/REGISTRO-DECISIONES-H0A.md` **sólo si** el responsable la aprobó, citando fecha y el commit revisado (no el propio).

## 1. Estado Git verificado (2026-10-15)

| Referencia | SHA | Nota |
|---|---|---|
| `main` (local = `origin/main`) | `4946aa4` | |
| PR #1 `docs/fase-0-definicion` | `e763b95` | abierta, borrador (leído con `gh`, sin cambios) |
| Issue #2 | — | abierta: «spike: validar Next.js + Payload + PostgreSQL» |
| `origin/feat/jz-ai-m0-recuperado` | `3efb114` | local `a3348cc` (M0 aprobado), 12 commits por delante, sin push |
| `producto/base` | `4302e2d` | base de las POC |
| `poc/candidata-a` | **`4b4b8068c060970bf6df46f6401f044dada5448a`** | **cierre de POC-1a**; no mover esta rama |
| `poc/candidata-a-1b` | parte de `4b4b806` | rama de POC-1b; el commit que añade este archivo es el punto de partida |
| `chore/jz-agents` | `188c570` | perfiles `jz-*` idénticos a los de este worktree |

Worktree: `/home/proyectos/jozeuzz-poc-candidata-a` (reutilizado; no se crearon directorios ni se movieron worktrees).
Contenedores en marcha al preparar el relevo: `jozeuzz-poc-a-app-1` (`next dev`, `127.0.0.1:3101`, monta `poc1a/` en `/app`) y `jozeuzz-poc-a-db-1`.
Volumen: `jozeuzz-poc-a_db`. El proyecto Compose `infra` (wealthfolio) no se toca nunca.

Comprobación hecha al preparar el relevo: `node --test contrato/test/` → 43/43 ok. El resto de la línea base (vitest 64/64, `tsc`,
batería 13 ok / 0 fail / 43 pendientes, E2E 3/3) está registrado en `poc1a/EVIDENCIA.md`; OpenCode debe repetirla en el paso 1 del plan.

## 2. Contratos y casos aplicables

Decisiones: H0A-02 (estados `recibida`/`en_gestion`/`cerrada`, 3 transiciones válidas, `cerrada` terminal, `motivo_cierre` ∈
{`atendida`, `descartada`, `duplicada`, `spam`} obligatorio al cerrar), H0A-03 (`observaciones_internas` sólo admin, nunca en canales
públicos, logs ni sitemap) y H0A-04 (`EventoSolicitud` sólo inserción, un evento por transición en la misma transacción, sin texto
libre, ni editable ni borrable por ningún canal). Criterios de aceptación y rechazo: `docs/REGISTRO-DECISIONES-H0A.md`, sección «POC-1b».

Casos `poc-1b` (31). «intake» = usan `crearSolicitud`/`solicitudEn` y no pueden pasar sin R-1:

| Grupo | Sin intake (7) | Requieren intake (24) |
|---|---|---|
| Estados | ES-01, ES-02 (solicitud de la semilla) | ES-03…ES-11 |
| Motivos | — | MO-01…MO-05 |
| Autorización | AU-01, AU-02, AU-03, AU-04 | — |
| Privacidad | PR-02, PR-03 | PR-01, PR-05, PR-06 |
| Eventos | — | EV-01…EV-06 |

Detalles del contrato que condicionan la implementación:
- El slug de la colección de eventos debe ser `eventos-solicitud` (lo usan AU-06 y `COLECCION.evento` del driver).
- `transicionar(ref, { a, motivo_cierre? }, { falla: 'tras-estado' })` (EV-04): el driver inyecta un fallo **después** de escribir el
  estado y **antes** de confirmar el evento; la respuesta no puede ser 2xx y no debe quedar ni estado ni evento.
- MO-04: `recibida → en_gestion` con motivo se rechaza, o se acepta guardando motivo nulo.
- Fuera de alcance: los 12 IN-* (POC-3) siguen `NoImplementado`.
- Pendientes conocidos del contrato (no de la candidata): los mutantes se aplican al oráculo, `mutantes.test.mjs` acepta cualquier
  excepción y `denegado()` acepta 404. No se corrigen en POC-1b.

## 3. Implementación existente que se amplía

| Archivo | Estado en `4b4b806` |
|---|---|
| `poc1a/src/collections/Solicitudes.ts` | campos `estado` (default `recibida`), `motivo_cierre`, `observaciones_internas` (acceso de campo `soloAdminCampo`); sin transiciones ni eventos |
| `poc1a/src/access/index.ts` | `publicadoOAdmin`, `soloAdmin`, `soloAdminCampo` (cubiertas por vitest y mutaciones registradas) |
| `poc1a/contrato-driver.mjs` | `transicionar`, `observaciones` y `listarEventos` lanzan `NoImplementado`; `intake.preparar/enviar` lanzan `NoImplementado('POC-3…')`; `listarSolicitudes`/`obtenerSolicitud` ya existen |
| `poc1a/scripts/reset-semilla.ts` | reset + semilla por Local API dentro del contenedor (ya crea `solicitud_sembrada`) |
| `poc1a/src/lib/base.ts` | `vaciarBase` trunca el schema indicado salvo `payload_migrations` |
| `poc1a/src/migrations/20261015_174323_inicial.ts` | migración inicial; fija `"poc_prod"` en el SQL (125 apariciones) y `CREATE SCHEMA` añadido a mano |
| `poc1a/test/{integracion,http,estatico}` | 7 archivos, 64 pruebas; `estatico/regla-local-api.test.ts` exige `overrideAccess: false` literal en la web pública |

## 4. R-1: solicitudes sintéticas sin endpoint público (propuesta)

24 de los 31 casos necesitan crear solicitudes. El formulario e intake público son de POC-3. Propuesta:

- Script interno `poc1a/scripts/solicitud-sintetica.ts`, mismo patrón que `reset-semilla.ts`: corre sólo dentro del contenedor con
  `./poc.sh exec`, crea la solicitud por Local API y no se importa desde `src/app`. Nunca es una ruta HTTP.
- Sólo acepta los campos públicos (`nombre`, `contacto`, `tipo_equipo`, `descripcion`, `servicio`). `estado`, `motivo_cierre` y
  `observaciones_internas` los fija o descarta un hook del servidor de la colección, no el script (así se prueba que el servidor
  asigna `recibida` aunque el llamante envíe otra cosa).
- Se niega a correr si `POC_DB_SCHEMA` es `poc_prod` o si `DATABASE_URL` apunta a la base `poc` con ese schema.
- En el driver, `intake.preparar/enviar` usan el script sólo con `POC_INTAKE_SINTETICO=1`; sin la variable siguen lanzando
  `NoImplementado`. La respuesta no repite datos enviados. `origen` se ignora (el límite por origen es IN-11, POC-3).
- Con la variable activa los IN-* dejarían de ser «pendiente» y se juzgarían contra un intake que no es el real. Por eso la ejecución
  sintética usa siempre `--solo` con los 44 casos de POC-1a y POC-1b (ver §7). Ningún resultado IN-* obtenido así cuenta como evidencia.
- Los campos administrativos enviados en una creación pública (criterio de seguridad de POC-1b) se prueban en vitest contra el hook;
  la prueba de caja negra queda para IN-08 (POC-3).

Alternativa no recomendada: añadir un gancho `sembrarSolicitud` al contrato. Cambia `contrato/` (aprobado en `20df49d`) y necesita autorización aparte.

## 5. Riesgos explícitos (no se corrigen en POC-1b sin decisión del responsable)

- **M3** — `/api/users/forgot-password` abierto al anónimo con el adaptador de correo de consola: un anónimo puede dejar el correo del
  admin en los logs y un `resetPasswordToken` en la base. Regla para POC-1b: ninguna prueba, semilla ni ejecución de la batería llama a
  `forgot-password` (PR-05 lee los logs y cualquier PII sería fallo). Cerrar el endpoint o poner un adaptador real es decisión de producto.
- **B7** — un proyecto publicado que referencia un medio privado expone `{"relationTo":"medios-privados","value":<id>}` (id y colección,
  no contenido). Sigue siendo riesgo aceptado de POC-1a. Regla para POC-1b: ninguna relación nueva (`solicitud`, `servicio`, actor,
  evento) puede aparecer en respuestas públicas, ni siquiera como id. PR-01, PR-03 y PR-06 lo vigilan; se añade una prueba HTTP en
  `test/http/privacidad.test.ts` para `eventos-solicitud` por REST con `depth` 0/1/2 y `draft=true`.
- No se acepta ninguna fuga nueva de datos privados: es criterio de parada (§8).

## 6. `poc_prod` y migraciones limpias

`poc_prod.payload_migrations` tiene **0 filas** (verificado 2026-10-15; lo vació `vaciarBase` en la fase 2 de POC-1a, antes de la
corrección `abf7661`). Ese schema no sirve para probar migraciones limpias y no se repara, se borra ni se reutiliza para ello.

Como la migración fija el nombre `"poc_prod"`, un schema nuevo en la base `poc` no basta: escribiría en `poc_prod`. Procedimiento no
destructivo con una **base nueva** en el mismo contenedor:

```sh
cd poc1a
./poc.sh psql -c 'CREATE DATABASE poc1b_migraciones'   # aditivo; no se borra después sin autorización
# Aplicar TODAS las migraciones desde cero contra la base nueva (app-prod, sin push):
#   requiere un subcomando nuevo de poc.sh, p. ej. «migrate-en <base>», que sustituya sólo el nombre de base en DATABASE_URL
#   leyendo POC_DB_PASSWORD de .env, y que rechace «poc» y todo nombre que no cumpla ^poc1b_[a-z0-9_]+$.
./poc.sh migrate-en poc1b_migraciones
./poc.sh psql -d poc1b_migraciones -c 'SELECT name, batch FROM poc_prod.payload_migrations ORDER BY id'   # = nº de migraciones
./poc.sh migrate-en poc1b_migraciones   # segunda vez: nada pendiente (idempotencia)
```

La validación en producción local de POC-1b (`up-prod` + batería + `vitest test/http`) se hace contra `poc1b_migraciones`, no contra
la base `poc`. La migración nueva de POC-1b se genera con `./poc.sh migrate-create poc1b` (difiere contra el snapshot JSON, no contra la base).

## 7. Comandos reproducibles

Todos desde `poc1a/`. Docker sólo a través de `./poc.sh` (proyecto `jozeuzz-poc-a`). Node del host 20.19.2 para contrato y scripts;
Node 24.22.0 sólo en la imagen.

```sh
./poc.sh ps                                   # app y db arriba; si no: ./poc.sh up
./poc.sh exec npx vitest run                  # schema poc_test
./poc.sh exec npx tsc --noEmit
node --test ../contrato/test/                 # 43/43
node ../contrato/run.mjs --driver contrato-driver.mjs --alcance poc-1a     # regresión POC-1a (sin intake sintético)
POC_INTAKE_SINTETICO=1 node ../contrato/run.mjs --driver contrato-driver.mjs --alcance poc-1b \
  --solo AU-05,AU-06,AU-07,PR-04,PR-07,CO-01,CO-02,CO-03,CO-04,CO-05,CO-06,CO-07,CA-02,ES-01,ES-02,ES-03,ES-04,ES-05,ES-06,ES-07,ES-08,ES-09,ES-10,ES-11,MO-01,MO-02,MO-03,MO-04,MO-05,AU-01,AU-02,AU-03,AU-04,PR-01,PR-02,PR-03,PR-05,PR-06,EV-01,EV-02,EV-03,EV-04,EV-05,EV-06
./poc.sh e2e                                  # 3/3 de POC-1a no deben romperse
./poc.sh logs-since <instante>                # lo usa logs() del driver
```

Resultados esperados al cerrar: vitest y `tsc` en verde; batería sintética **44 ok / 0 fail**; regresión `--alcance poc-1a`
**0 fail** (los 13 ok se mantienen y los 7 casos POC-1b sin intake pasan a ok; el resto queda pendiente); E2E 3/3; lo mismo en
producción local contra `poc1b_migraciones`.

## 8. Cambios autorizados y excluidos (sujeto a H0A-16b)

Autorizados, sólo en `poc/candidata-a-1b` y dentro de `poc1a/` salvo el registro:
- Colección `eventos-solicitud` sólo inserción; transiciones en el servidor (hooks o endpoint/servicio admin con transacción), sin depender de la UI de Payload.
- Cambios en `Solicitudes.ts`, `access/`, `contrato-driver.mjs`, `scripts/` (R-1 y fallo inyectado), pruebas vitest/E2E, una migración nueva generada.
- Inyección de fallo de EV-04 sólo con `POC_FALLOS_INYECTABLES=1`, sólo en `app` (dev) y nunca accesible al anónimo.
- Subcomando `migrate-en` en `poc.sh`; base nueva `poc1b_migraciones`.
- Actualizar `README.md` y añadir la sección POC-1b a `EVIDENCIA.md` con las mediciones del registro: líneas de código propio fuera
  del CMS y número de puntos de extensión del control de acceso.
- Commits locales por unidad coherente.

Excluidos:
- Push, merge, PR, issues u otro cambio en GitHub. Mover `poc/candidata-a` o reescribir historia.
- Instalar o actualizar paquetes, imágenes o lockfile (`./poc.sh deps` incluido). Si hiciera falta, parar y pedir autorización.
- Modificar `contrato/` (casos, oráculo, mutantes, driver normativo).
- Endpoint, formulario o ruta pública de intake (POC-3). Corregir M3 o B7.
- Usar, reparar, migrar o resetear `poc_prod` de la base `poc` para validar migraciones. `./poc.sh destroy` o `resetdb`.
- Borrar archivos, ramas, volúmenes, contenedores o bases. Tocar el proyecto Compose `infra`, otros worktrees o `docs/fase-0-definicion`.
- Cambiar configuración global de OpenCode/Claude o los perfiles `jz-*`. Adoptar `openai/gpt-6.1-sol`.

## 9. Equipo OpenCode y forma de trabajo

| Rol | Perfil | Modelo | Permisos |
|---|---|---|---|
| Orquestador | `jz-orchestrator` (primario) | `openai/gpt-5.6-sol` | edit/bash `ask`; sólo delega en `jz-*` |
| Exploración | `jz-explorer` | `openai/gpt-5.6-luna` | lectura |
| Implementación | `jz-implementer` | `openai/gpt-5.6-terra` | único escritor; ejecuta las pruebas |
| Seguridad | `jz-security` | `github-copilot/claude-sonnet-4.6` | lectura, sin shell |
| QA | `jz-qa` | `openai/gpt-5.6-terra` | lectura, sin shell; revisa evidencia, no ejecuta |

- Un solo escritor en el worktree. Revisión independiente de `jz-security` + `jz-qa` sólo al cierre funcional (no por commit).
- Superpowers: plan → TDD (prueba roja primero) → commits por unidad.
- **Al arrancar OpenCode por primera vez en este worktree, instala `@opencode-ai/plugin` en `.opencode/node_modules`** (hoy no
  existe). Es una instalación: requiere el visto bueno del responsable. Nunca borrar `.opencode/node_modules`.
- `opencode run` necesita `</dev/null`; en modo no interactivo un `ask` rechazado detiene la sesión.

Plan mínimo sugerido: (1) línea base de §7 sin cambios; (2) eventos + transición atómica + pruebas de integración; (3) R-1 y driver;
(4) observaciones y filtros; (5) privacidad HTTP y logs; (6) migración y producción contra `poc1b_migraciones`; (7) evidencia y revisión de cierre.

## Criterios de parada

Detenerse e informar si: aparece cualquier fuga de datos privados (incluidos ids de relaciones nuevas); la inmutabilidad o la
atomicidad sólo se logran en la interfaz o eludiendo el control nativo de Payload (criterio de rechazo de POC-1b); hace falta instalar
algo; un caso POC-1a pasa a fail; o un comando tocaría `poc_prod`, `infra` o recursos fuera de `jozeuzz-poc-a`.
