# Evidencia POC-1a (candidata A) — fase 2

Fecha de las ejecuciones: 2026-10-15. Stack: Next.js 16.4.1, Payload 3.90.2, PostgreSQL 18.6, Node 24.22.0
(imágenes por digest en `compose.yaml`), Playwright 1.64.1 (imagen por digest). Corren en Docker vía `./poc.sh`: la app, la base, vitest, `tsc`
y Playwright. Corren **en el host con Node 20.19.2** (no Node 24): `node --test contrato/test/`, `contrato/run.mjs` (driver y batería),
`scripts/reset-e2e.mjs`, `scripts/medir-js.mjs` y `scripts/licencias.mjs`.

## Hardware y entorno
Host: Intel Xeon E5-2697 v4 @ 2,30 GHz (VM de 6 vCPU visibles, `nproc` = 6), 8 GiB de RAM (`free -m`: 8192 total),
Linux 7.0.14-23-pve, Docker 29.9.0. Otros servicios no relacionados corrían en el mismo host: las mediciones son
indicativas, no de laboratorio.

## Pruebas y códigos de salida
| Comando | Resultado | Salida |
|---|---|---|
| `node --test contrato/test/` | 43 pruebas, 43 ok | 0 |
| `./poc.sh exec npx vitest run` (dev, schema `poc_test`) | 7 archivos, 64 pruebas ok (6 unit., 15 integración, 4 regla estática, 14 seguridad, 11 canales, 14 privacidad); ronda de correcciones. Fase 2 original: 5 archivos, 49 | 0 |
| `./poc.sh exec npx tsc --noEmit` | sin errores | 0 |
| `run.mjs --alcance poc-1a` contra `next dev` | `casos 56 · ok 13 · fail 0 · pendiente 43` | 0 |
| `run.mjs --alcance poc-1a` contra producción, 3 ejecuciones seguidas (232 s, 232 s, 231 s) | `casos 56 · ok 13 · fail 0 · pendiente 43` ×3 | 0, 0, 0 |
| `vitest run test/http` contra producción (`app-prod:3000`, schema `poc_prod`) | 25 pruebas ok en la fase 2; 39 ok tras añadir `privacidad.test.ts` | 0 |
| `./poc.sh e2e` (3 specs, chromium) | 3 ok: F3, F1 sin JS, acciones de servidor | 0 |

Las 43 pendientes son `NoImplementado` de POC-1b (31) y POC-3 (12, IN-*): no son verdes.

### Seguridad HTTP (`test/http/seguridad.test.ts`, `canales.test.ts`)
- `Set-Cookie` de `payload-token`: `HttpOnly`, `Secure`, `SameSite=Strict`.
- CSRF: con cookie, `Origin` propio muta (control positivo); `Origin` ajeno y **sin `Origin`** dan 401/403 y no tienen efecto.
- Bloqueo: 6 logins erróneos de un usuario sintético propio de la prueba; la contraseña correcta deja de valer y `lockUntil` queda fijado.
- `first-register` con admin existente: error ≥ 400 y el número de usuarios no cambia.
- Anónimo: `/api/payload-migrations`, `/api/payload-locked-documents`, `/api/payload-preferences`, `/api/users`, `/api/solicitudes` sin datos; `/api/access` sin usuario ni escrituras concedidas.
- `?draft=true&where[_status][equals]=draft` (y variantes) sin borradores; `findByID` del borrador con `draft=true` da 404.
- GraphQL (`POST/GET /api/graphql`, `/api/graphql-playground`, `/graphql`): todo ≥ 400, sin `__schema`, sin centinelas. Igual en producción.
- Las pruebas discriminan: con `cookies: { secure: false, sameSite: 'Lax' }` el test de cookies falla (`expected … to match /;\s*Secure/i`); con
  `maxLoginAttempts: 0` el de bloqueo no termina (ver hallazgo 2). Ambas mutaciones se revirtieron.

### E2E
- F3: crear borrador (UI) → anónimo 404 en detalle, lista y vista previa; admin ve la vista previa (`?preview=1`) y no el borrador en la ruta pública;
  publicar → anónimo 200, en lista y en `sitemap.xml`; retirar con «Unpublish» nativo → anónimo 404 y fuera del sitemap; el admin sigue viendo el documento.
- F1 con `javaScriptEnabled: false`: lista y detalle muestran centinelas públicos, no los privados; los enlaces navegan; el borrador da 404.
- Acciones de servidor: el admin dispara 2 acciones `Next-Action` (`form-state`); 1 devuelve datos protegidos (control positivo: correo y sesiones del admin
  en `lockedState`). Reenviada sin cookies y con los centinelas del cuerpo neutralizados, responde 200 con
  `{"errors":[{"message":"Unauthorized, you must be logged in to make this request."}]}`; sin fuga.
- Red: el servicio `e2e` usa `network_mode: "service:app"`; Chromium pide `127.0.0.1:3101` (origen de `serverURL`/`csrf`) y
  `--host-resolver-rules` lo redirige a `127.0.0.1:3000`, de modo que cookies `Secure` y `Origin` se ejercen tal como en uso real.

## Ronda de correcciones tras la revisión de cierre
### Pruebas nuevas (`test/http/privacidad.test.ts`, dev y producción, 14 pruebas ok en ambos)
- **M1**: anónimo en `/admin/collections/{proyectos,solicitudes,medios-privados}[/<id>]` (HTML y RSC): sin centinelas privados en cuerpo ni `Location`,
  sin el id de la solicitud en el cuerpo. Observado: HTML responde 200 (vista de login, sin datos) y RSC 307. Que haya o no ids en claro en la URL de
  redirección no se considera fuga (es la URL pedida por el propio cliente).
- **B1**: `where[notas_internas][equals|like|contains]` (con y sin `draft=true`), `sort=±notas_internas`, `select[notas_internas]` y `depth` 0/1/2/5: sin valor
  ni coincidencias; el publicado es legible sin el campo.
- **B2**: `/api/proyectos/versions`, `/api/proyectos/versions/:id` y `/api/solicitudes/count` sin datos para el anónimo.
  **Registro** `/api/users/init` (anónimo): `200 {"initialized":true}`; revela si ya existe un admin (ventana de first-register). Sin cambios.
- **B7**: proyecto **publicado** que referencia un medio **privado**, `depth` 0/1/2 anónimo: no sale `alt`, contenido, nombre de archivo ni URL del medio.
  **Sí sale la referencia**: `medios: [{"relationTo":"medios-privados","value":<id>}]` en los tres depth (el id numérico y el nombre de colección).
  Clasificación: **riesgo aceptado / defecto de configuración de la candidata** (revela existencia e id, no contenido). No se corrige: `access.read` de campo
  en `medios` ocultaría también los medios públicos y `filterOptions` solo restringe la selección en el admin, así que no hay control nativo trivial.
  Opciones de producto: separar `medios` en dos campos (uno solo público) o validar en `beforeChange` que un publicado no referencie privados.
- Las pruebas nuevas pasaron a la primera: son cobertura, no corrección de código; su capacidad de discriminar se demuestra con las mutaciones siguientes.

### Mutaciones manuales de `src/access/index.ts` (no commiteadas; revertidas; dev)
| Mutación | vitest (63 pruebas) | Batería poc-1a (13 ok esperados) |
|---|---|---|
| `publicadoOAdmin` devuelve `true` | 9 fallan: 6 de integración (borrador/versiones), 1 unit., 2 de `seguridad` (borradores) | 6 FAIL, 7 ok: AU-05, PR-07, CO-02, CO-04, CO-05, CO-06 |
| `soloAdmin` devuelve `true` | 14 fallan: CSRF (2), `/api/users`, `/api/solicitudes`, versiones, Forbidden en solicitudes, unit., y 5 de `privacidad` (B2/B7/depth) y `/api/access/../users` | 5 FAIL, 8 ok: AU-05, AU-06, PR-04, PR-07, CO-07 |
| `soloAdminCampo` devuelve `true` | 6 fallan: 4 de `privacidad` (B1), 1 de integración (`notas_internas`), 1 unit. | **0 FAIL, 13 ok**: la batería poc-1a no discrimina el acceso por campo |
Conclusión: las reglas de colección están vigiladas por batería y vitest; el acceso por campo (`notas_internas`, `observaciones_internas`) solo lo vigila
vitest (la batería no lee ese campo en 1a porque la colección ya es solo admin). Tras la mutación 2, AU-06 dejó proyectos anónimos en la base; el reset de
la siguiente ejecución los limpia.

### Adaptador y script
- `vaciarBase` (`src/lib/base.ts`) truncaba `payload_migrations`; tras la batería contra `poc_prod` el registro de migraciones quedaba vacío y un `./poc.sh migrate`
  posterior intentaría repetir `inicial`. Prueba roja primero (`expected +0 to be 1`), luego verde: ahora la excluye. **La base `poc_prod` de la fase 2 ya había
  perdido ese registro**; no se repara (la POC es desechable).
- `./poc.sh stats` sin contenedores del proyecto sale con mensaje (antes listaba contenedores ajenos del host). Verificado con el proyecto detenido (exit 1).

## Mediciones (mediana de 3, producción)
| Métrica | Valor | Comando / nota |
|---|---|---|
| Propagación CO-05 (publicar → visible en html) | 53 ms (66, 52, 53) | batería prod; objetivo provisional 60 s. En dev: 118/131/124 ms |
| JS público `/proyectos` | 174,7 KB gzip (564,9 KB crudo, 8 scripts) | `scripts/medir-js.mjs`; idéntico en 3 ejecuciones |
| JS público detalle | 171,5 KB gzip (557,2 KB crudo, 7 scripts) | ídem; es el runtime de Next/React (sin `use client` propio) |
| LCP aprox. `/proyectos` / detalle | 376 ms / 376 ms | Playwright + PerformanceObserver |
| CLS aprox. | 0 / 0 | ídem |
| TBT aprox. | 140 ms / 188 ms | Σ(duración−50) de long tasks tras FCP |
| Build (`next build`, en frío, `.next-prod` borrado) | 26,0 s (26,0; 24,0; 26,7) | `./poc.sh build`, incluye el arranque del contenedor |
| Arranque hasta el primer 200 en `/proyectos` | 2,55 s (2,46; 2,55; 2,56) | `up-prod` + sondeo; incluye `docker compose up` |
| RAM `app-prod` en reposo (60 s) | 99,8 MiB, CPU 0,00 % (3 muestras iguales) | `./poc.sh stats` |
| RAM `db` en reposo | 73,7 MiB; CPU 0,67–10,5 % (mediana 9,8 %) | actividad en segundo plano de Postgres |
| Dependencias | 10 directas + 8 de desarrollo; 429 paquetes instalados | `scripts/licencias.mjs` |
| Licencias | MIT 380, Apache-2.0 13, BSD-3-Clause 13, ISC 11, MPL-2.0 2, LGPL-3.0-or-later 1 (libvips de `sharp`), resto 1 c/u (Python-2.0, CC-BY-4.0, BSD-2, BlueOak, 0BSD, WTFPL y combinaciones) | revisar LGPL/WTFPL antes de adoptar |

**LCP/CLS/TBT son una aproximación, no Lighthouse.** Pixel 5 emulado, CPU ×4 y «Slow 4G» (1,6 Mbit/s, 150 ms) por CDP. Un LCP igual al FCP y
tan bajo (376 ms) sugiere que el estrangulado de red tiene efecto limitado sobre un HTML tan pequeño servido por el bucle local;
no debe compararse con cifras de Lighthouse.

## Producción y migraciones
- `app-prod` (perfil `prod`, misma imagen Node, `127.0.0.1:3102`) usa `npm run build` y `npm start`, con `distDir` `.next-prod` para no pisar `next dev`.
- Schema propio `poc_prod` (Drizzle no admite `public` como `schemaName`); migración `src/migrations/*_inicial.ts` generada con
  `payload migrate:create` y aplicada con `payload migrate`, con `push` desactivado (`POC_NO_PUSH=1`).
  Edición manual: se añadió `CREATE SCHEMA IF NOT EXISTS "poc_prod"` (el generador no lo crea).
- Las migraciones quedan acopladas al nombre del schema; en un producto real habría que decidir el schema antes de generarlas.

## `fetch failed` intermitente de la fase 1
Tres ejecuciones completas seguidas contra producción (y una más contra `next dev` tras los cambios): 0 `fetch failed`, 0 fallos.
No se reprodujo. No queda explicado: sigue siendo una sola ocurrencia, coincidente con otras pruebas sobre la misma base (hipótesis de la fase 1).
El driver mantiene `connection: close`.

## Hallazgos
1. **`next dev` bloquea recursos cross-origin** (`/_next/hmr`, JS de cliente): con el navegador en `127.0.0.1:3101` y el servidor en `:3000` el login del admin
   no se hidrataba. Se añadió `allowedDevOrigins: ['127.0.0.1']` (sólo desarrollo, sin efecto en producción).
2. **Cambiar el schema en caliente cuelga `next dev`**: la mutación de `maxLoginAttempts` provocó una pregunta interactiva de `drizzle push`
   («delete login_attempts column… DATA LOSS WARNING») y el servidor dejó de responder hasta reiniciarlo. Operativo, no de seguridad; refuerza usar migraciones.
3. **El generador de migraciones no crea el schema personalizado** (edición manual descrita arriba).
4. **La acción de servidor `form-state` devuelve al admin datos de su sesión** (`lockedState.user`: correo, ids de sesión). Anónimo: `Unauthorized`. Sin fuga, pero
   conviene no registrar esas respuestas en logs.
5. Resuelto: con cookie y **sin** `Origin` la mutación se rechaza (riesgo marcado en el plan, no se materializa).
6. Sin defectos reales de Payload/Next frente al contrato; ningún criterio de parada activado.

## Riesgos aceptados
- **Incidente POC-1b (2026-10-16):** el `e2e` heredado recreó `app` sin `POC_DATABASE_NAME` y lo conectó a `poc`. Dos logins sintéticos fallidos incrementaron `public.users.login_attempts` a 2 y actualizaron su marca temporal; no hubo truncado en esa ejecución. Decisión humana: no reparar ni volver a escribir `poc`; queda contaminada y fuera de uso. Corrección `79ea54f`: variantes `*-en` exigen `^poc1b_[a-z0-9_]+$`, verifican `current_database()` dentro de app y propagan el target a Compose, reset y runner E2E. `./poc.sh e2e-en poc1b_migraciones` pasó 3/3.
- `maxLoginAttempts` bloquea por cuenta, no por IP: permite denegar el acceso al único admin (10 min de `lockTime`).
- `first-register` queda abierto mientras no exista ningún usuario.
- Cookies `Secure`: sólo funcionan por HTTPS o en loopback; el despliegue real exige TLS.
- Medios `text/plain` permitidos sólo para los centinelas de la POC (R-3).
- ~172 KB gzip de JS público por página aunque no haya componentes de cliente (runtime de Next/React).
- `allowedDevOrigins` y `POC_*` son de la POC; no son configuración de producto.
- **M3**: `/api/users/forgot-password` está abierto al anónimo y no hay adaptador de correo: Payload usa el de consola. Con el correo del admin, un anónimo deja
  `To: '<correo>'` en los logs (PII en registros) y se escribe `resetPasswordToken` en la base. Lo mitiga el intervalo mínimo por usuario de Payload. Producto:
  adaptador de correo real o cerrar el endpoint. Resultado de lectura de código, no se probó por HTTP (es una mutación).
- **B3**: `app`, `app-prod` y `e2e` (que comparte la red de `app`) tienen salida a Internet por la red `externa`, necesaria para publicar puertos.
  No es solo `deps`; el comentario de `compose.yaml` se corrigió.
- **B4**: sin `cap_drop`, `no-new-privileges` ni `read_only`; `./` se monta con escritura.
- **B6**: la contraseña sintética del admin viaja por entorno (`E2E_RESET`, visible con `docker inspect` mientras corre `e2e`) y, si el reset falla tras imprimir
  `RESULTADO:`, el error del driver incluye los últimos 400 caracteres de stdout. Es un dato sintético aleatorio.
- **B7**: referencia (id y colección) a un medio privado visible en un proyecto publicado (ver la ronda de correcciones).
- Cabeceras CSP, HSTS y X-Frame-Options: fuera de alcance de la POC (despliegue); `SameSite=Strict` mitiga en parte.
- `GET /api/users/init` informa a un anónimo si ya existe un admin. En el producto, crear el admin por CLI antes de exponer el puerto.

## POC-1b — cierre local (2026-10-16)
- H0A-16b autorizada en `87c9fb1`. R-1 sólo crea datos sintéticos internos y no es endpoint; no cubre POC-3 ni IN-*.
- Batería explícita: 44/44 ok, 0 fail (13 POC-1a + 31 POC-1b), exit 0. Regresión `--alcance poc-1a`: 21 ok/0 fail/35 pendientes: 13 originales más 8 POC-1b sin intake. El handoff decía 7 sin intake/24 con; contratos reales dieron 8/23.
- Vitest 72/72, `tsc --noEmit`, contrato 43/43 y E2E 3/3: exit 0. Integración `solicitudes-eventos.int.test.ts` prueba persistencia de evento y EV-04 rollback PostgreSQL real.
- Atomicidad: evento anidado recibe mismo `req`; header interno `x-poc-fallo` sólo activa con admin, app dev aislada `POC_FALLOS_INYECTABLES=1` y nunca producción. Auth/IDOR: REST anónimo solicitudes/eventos 403; GraphQL 404; update/delete eventos denegados.
- Migración incremental `20261016_055416_poc1b`: `poc1b_migraciones_limpia` fue artefacto previo. Verificación definitiva desde cero en `poc1b_migraciones_revision`: segunda ejecución sin pendientes, 2 filas, tabla/FK/índices; FK final `RESTRICT`. Build app-prod exit 0 (16.173 s), REST anónimo solicitudes/eventos 403 y GraphQL 404. No R-1 ni escrituras de prueba en schema `poc_prod`.
- LOC método `wc -l`: Solicitudes 69, Eventos 17, reglas 25, R-1 17, driver 330; total 458. Puntos de extensión: 5 (access colección Solicitudes, access campos observaciones, colección Eventos, hooks Solicitudes, guardas driver/R-1).
- Riesgos mantenidos: M3 forgot-password/log email, B7 referencias a medios privados, avisos de dependencias y límites access de Payload. Incidente `poc` documentado arriba: no se reutiliza.
- RED adicional QA: allowlist R-1 falló `solicitudPublica is not a function` (exit 1), luego 3/3 verde; migración estática falló por `SET NULL`/orden down (exit 1), luego 1/1 verde. IDOR HTTP es caracterización: acceso existente ya denegó IDs reales de solicitud/evento; 15/15 verde.
- La migración revisada usa `ON DELETE RESTRICT`; su down sólo se validó estáticamente, nunca se ejecutó. Base nueva requerida para aplicarla desde cero: `poc1b_migraciones_revision`.
- Verificación final revisión: Vitest 72/72, contrato 43/43, batería explícita 44/44 y E2E 3/3, todos exit 0. `build-en poc1b_migraciones_revision`: 16.173 s; app-prod en esa base: solicitudes/eventos 403 anónimo y GraphQL 404.

## Matices de las mediciones y de la cobertura
- La «propagación» de CO-05 mide un PATCH más un GET con `force-dynamic` (sin capa de caché): no es extrapolable a ISR o caché.
- E2E (F3, F1 sin JS, acciones de servidor) solo se ejecutaron contra `next dev`, no contra el build de producción.
- n=3 sin dispersión (no se reporta rango); la VM es compartida.
- El JS público cuenta solo gzip de scripts externos referenciados en el HTML (sin brotli, scripts inline de RSC, CSS ni imágenes).
- RAM/CPU: tres instantáneas en reposo; sin pico bajo carga ni p95.
- 23 casos POC-1b usan R-1 sintético; los 31/31 sólo son verdes en batería explícita. Esto no valida intake POC-3 ni IN-*.
- Los mutantes del contrato se aplican al driver oráculo, no a la candidata, y `mutantes.test.mjs` acepta cualquier excepción como detección; `denegado()`
  acepta 404. Pendiente del contrato, no de la candidata.

## Auditoría de dependencias (heredada de la fase 1; `npm audit` no se volvió a ejecutar en la fase 2 ni en la ronda de correcciones: requiere red y no aporta)
- 10 hallazgos restantes, todos en herramientas de build/desarrollo (no en el runtime de producción).
- `overrides` en `package.json`: `undici` 7.29.1 y `dompurify` 3.4.17.
- Scripts de instalación desactivados (`ignore-scripts=true` en `.npmrc`); `save-exact` y `engine-strict` activos.
- No se instaló ni actualizó ningún paquete en la fase 2.

## POC-3 · Intake seguro

Estado de esta sección (unidad 9, 2026-10-17): **todo lo que requiere Docker figura como `PENDIENTE (no ejecutado)`**. Ninguna prueba de esta tabla se da por aprobada si no tiene su resultado y su log. Lo ejecutado con `jz-run` (sin red ni Docker) anota la ruta del log en `.jz-state/runs/` y el resultado real. Las filas pendientes las completa el humano tras el gate del README («POC-3 U9»).

### Retirada de R-1 y regresión de los 44 (unidad 9)
- `scripts/solicitud-sintetica.ts` se borró (`git rm`); la variable `POC_INTAKE_SINTETICO` ya no existe en `contrato-driver.mjs`, README, `poc.sh`, Compose, `scripts/` ni tests. Quedan menciones sólo en documentos históricos (este archivo, `HANDOFF-POC-1B.md`, `docs/`): describen lo que se hizo en POC-1b y no se reescriben. La prueba `test/estatico/retirada-r1.test.ts` exige lo anterior sobre los archivos vivos.
- El driver usa sólo `GET /solicitar` + `POST /api/intake` por el proxy, con IP sintética por origen. R-1 no aportaba semántica que el driver deba conservar: `limite.max` ya era 5, el resultado (201 / 4xx) lo decide el servidor real, `listoEn` respeta `POC_INTAKE_TIEMPO_MINIMO_MS` (200 por defecto) y cada `origen` se convierte en una IP distinta.
- `logs()` del driver lanza si el driver envió al intake desde el último `reset` y ningún log contiene `"evento":"intake"` (`driver/logs-intake.mjs`). IN-12 deja de poder pasar por vacuidad. `contrato/casos/*` no se modificó: PR-02, que sólo lee logs, no ha enviado nada y no se ve afectado.
- Casos de los 44 que pasan por el intake real (23): ES-03 a ES-11, EV-01 a EV-06, MO-01 a MO-05, PR-01, PR-05, PR-06 (`crearSolicitud` / `solicitudEn`). Los IN-* (12) ejercen el intake directamente.
- **P-U1-01 (pendiente de confirmación del responsable).** EV-04 necesita `x-poc-fallo`; `Solicitudes.ts` sólo la honra con `NODE_ENV !== 'production'` y `POC_FALLOS_INYECTABLES=1`. El override `compose.pruebas.yaml` da la variable a `app-prod`, pero `app-prod` corre con `NODE_ENV=production`, así que EV-04 no puede funcionar ahí sin debilitar producción. Modo implementado: 44 casos en `app` (3443), 43 en `app-prod` (3444) sin EV-04. T-10 «44/44 en `app-prod`» **no se cumple literalmente** hasta que el responsable decida; no se declara cumplido.

### Evidencia por unidad (U2–U9)
Rutas de log relativas a la raíz del repositorio. «Suite agregada» = `.jz/bin/jz-run --cwd poc1a node node_modules/vitest/vitest.mjs run --configLoader runner src/lib test/estatico` sobre `95db8f4`: 23 archivos, 178 pruebas, rc=0 (`.jz-state/runs/20261017T062748Z-1704275.log`); incluye los unitarios y estáticos de U2 a U9. No se re-ejecutó cada unidad por separado en esta unidad.

| Unidad | Comando exacto | Resultado |
|---|---|---|
| U2 validador, slug, hook `intake` | Suite agregada (unitarios `src/lib/intake/*.test.ts`) | ok, rc=0, log arriba |
| U2 hook con la Local API | `./poc.sh exec-en poc3_intake npx vitest run` | PENDIENTE (no ejecutado) |
| U3 token, Origin/Referer, IP | Suite agregada (`token`, `origen`, `ip`, `ip-sintetica`, `config`, `claves`) | ok, rc=0, log arriba |
| U4 migración | Suite agregada (`migracion-poc3.test.ts`, estático) | ok, rc=0, log arriba |
| U4 desde cero | `./poc.sh migrate-en poc3_intake` y `./poc.sh comprobar-en poc3_intake` | PENDIENTE (no ejecutado) |
| U5/U5a proxy, `/solicitar`, `/api/intake` | `./poc.sh init` · `./poc.sh up-en poc3_intake` · `./poc.sh sonda-red` · `./poc.sh up-fallos-en poc3_intake` · `./poc.sh exec-en poc3_intake npx vitest run` (HTTP) · `node --test test/docker/ip-produccion.test.mjs` | PENDIENTE (no ejecutado) |
| U5a estático de Compose y proxy | Suite agregada (`compose-proxy.test.ts`, `poc-sh-aislamiento.test.ts`) | ok, rc=0, log arriba |
| U6 límites | Suite agregada (`limites.test.ts`) | ok, rc=0, log arriba |
| U6 IN-11, concurrencia, reenvío | Batería `--alcance poc-3` (README «POC-3 U9», 1) | PENDIENTE (no ejecutado) |
| U7 logs sin PII, unitario | Suite agregada (`log.test.ts`, `fallos.test.ts`) | ok, rc=0, log arriba |
| U7 logs de los servicios | `POC_BASE_URL=https://127.0.0.1:3444 node --test test/docker/logs-intake.test.mjs` · `node --test test/build/sin-inyeccion.test.mjs` · `node --test test/docker/logs-intake-fallos.test.mjs` | PENDIENTE (no ejecutado) |
| U8 accesibilidad y E2E | `./poc.sh e2e-en poc3_intake` · `./poc.sh e2e-prod-en poc3_intake` | PENDIENTE (no ejecutado) |
| U8 axe | requiere instalar `@axe-core/playwright@4.13.0` (paso humano del README, U8) | PENDIENTE (no ejecutado) |
| U9 rojo de la retirada | `.jz/bin/jz-run --cwd poc1a node node_modules/vitest/vitest.mjs run --configLoader runner test/estatico/retirada-r1.test.ts` antes de implementar | rc=1, 7 de 7 fallan por la razón esperada (script existente, referencias a R-1, driver sin `logs-intake.mjs`): `.jz-state/runs/20261017T062353Z-1693736.log` |
| U9 rojo del README del gate | misma orden tras añadir la prueba del gate | rc=1, 1 de 8 falla (sección ausente): `.jz-state/runs/20261017T062656Z-1702051.log` |
| U9 rojo de la medición | `.jz/bin/jz-run --cwd poc1a node --test medicion/` antes de crear el script | rc=1 (módulo ausente): `.jz-state/runs/20261017T062554Z-1699377.log` |
| U9 verde de la retirada y el gate | suite agregada | rc=0, 178/178: `.jz-state/runs/20261017T062748Z-1704275.log` |
| U9 `tsc` | `.jz/bin/jz-run --cwd poc1a node node_modules/typescript/bin/tsc --noEmit --incremental false` | rc=0: `.jz-state/runs/20261017T062808Z-1705326.log` |
| U9 contrato (mutantes) | `.jz/bin/jz-run node --test contrato/test/` | 43/43 ok, rc=0: `.jz-state/runs/20261017T062817Z-1705793.log` |
| U9 funciones puras de la medición | `.jz/bin/jz-run --cwd poc1a node --test medicion/` | 8/8 ok, rc=0: `.jz-state/runs/20261017T062820Z-1706269.log` |
| U9 sintaxis | `.jz/bin/jz-run --cwd poc1a node --check contrato-driver.mjs` · `... node --check medicion/intake-latencia.mjs` | rc=0: `.jz-state/runs/20261017T062822Z-1706597.log`, `.jz-state/runs/20261017T062823Z-1706884.log` |
| U9 batería de 44 en `app` (3443) | README «POC-3 U9», 1, orden `--solo` de 44 | PENDIENTE (no ejecutado) |
| U9 batería de 43 en `app-prod` (3444), sin EV-04 (P-U1-01) | README «POC-3 U9», 2, orden `--solo` de 43 | PENDIENTE (no ejecutado) |
| U9 `--alcance poc-3` (12/12 IN-*) en `app` y en `app-prod` | README «POC-3 U9», órdenes `--alcance` | PENDIENTE (no ejecutado) |
| U9 CO-05 en `app-prod` (incluye proxy y TLS) | salida de la batería de 43 | PENDIENTE (no ejecutado) |
| U9 latencia y falsos positivos | `POC_BASE_URL=https://127.0.0.1:3444 node medicion/intake-latencia.mjs` | PENDIENTE (no ejecutado) |

Guarda de entorno de la medición, sin Docker: sin `NODE_EXTRA_CA_CERTS` el script termina con rc=1 y el mensaje `NODE_EXTRA_CA_CERTS debe terminar en /.tls/ca.crt`, sin hacer ninguna petición (`.jz-state/runs/20261017T062629Z-1700866.log`).

### Latencia del `POST /api/intake` (a completar tras ejecutar el script)
Método: 3 series de 50 envíos legítimos distintos contra `app-prod` por el proxy de pruebas (3444). Una IP sintética (un /64) por envío; el `GET /solicitar` y la espera del tiempo mínimo (200 ms + 50) quedan fuera de la medición; se mide sólo el `POST`, con una conexión nueva por petición (incluye el saludo TLS y la lectura del cuerpo). Mediana de las medianas y p95 (rango más cercano) sobre las 150 muestras. Entorno: el de la sección «Hardware y entorno».

| Serie | n | Mediana (ms) | p95 (ms) | Creados (201) | Falsos positivos | Errores |
|---|---|---|---|---|---|---|
| 1 | 50 | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE |
| 2 | 50 | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE |
| 3 | 50 | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE |
| Total / mediana de medianas / p95 global | 150 | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE |

### Falsos positivos del antiabuso
| Envíos legítimos distintos | Creados (201) | Rechazos de envíos legítimos (falsos positivos) | Errores | Criterio |
|---|---|---|---|---|
| 150 | PENDIENTE | PENDIENTE | PENDIENTE | 150 creados y 0 falsos positivos; el script sale con código ≠ 0 si no |

Nota de método: los envíos salen de IP sintéticas distintas, de modo que el cupo por IP no se ejerce. La medición prueba que los controles no rechazan envíos legítimos independientes; no prueba el comportamiento de usuarios reales detrás de una IP compartida (oficina, NAT de operador) que lleguen a 5 creaciones en 10 minutos.

### D-08 · Antiabuso en papel
Comparación entre lo que **está implementado** en el intake y un **desafío externo** tipo CAPTCHA o Turnstile. No se elige proveedor y no se probó ningún tercero: es análisis de diseño, sin cifras de coste inventadas.

| Criterio | Implementado en la POC | Desafío externo (sin proveedor elegido) |
|---|---|---|
| Qué es | Límite de intentos 30 / 10 min y de creaciones 5 / 10 min por IP o /64 (la clave es un HMAC de la IP, nunca la IP en claro); campo trampa; tiempo mínimo entre `GET /solicitar` y `POST` de 3 s en producción (200 ms en las pruebas, por Compose; 0 prohibido en producción) | Un script o iframe del proveedor en el formulario y verificación del token en el servidor contra la API del proveedor |
| Datos que recibe un tercero | Ninguno: todo se resuelve en el servidor propio; en la base sólo quedan contadores con la clave HMAC | El proveedor recibe, como mínimo, la IP del visitante, la URL de la página, el user-agent y señales del navegador (huella: pantalla, plugins, fuentes, comportamiento del ratón o del teclado según el producto) y puede fijar o leer cookies o almacenamiento propio. El alcance exacto depende del proveedor y hay que verificarlo en su documentación al elegirlo |
| Coste | Cero adicional; una tabla y un `UPSERT` por envío | Depende del proveedor y del volumen (varios ofrecen un nivel gratuito con límites y un plan de pago); a decidir con la política vigente al elegirlo. Más: tiempo de integración y de CSP |
| Accesibilidad | Sin interacción del usuario: no añade pasos ni desafíos visuales o auditivos. Teclado y auditoría axe en U8 (pendiente de ejecución) | Un desafío visual o auditivo choca con WCAG 1.1.1 (un CAPTCHA debe ofrecer alternativas en otras modalidades) y, si exige una prueba cognitiva, con 3.3.8 «Autenticación accesible» de WCAG 2.2 (AA). Las variantes invisibles o «gestionadas» reducen el problema pero no lo eliminan (cuando fallan, piden un reto) |
| Funciona sin JavaScript | Sí (la página no usa scripts; CSP sin `script-src`) | No, salvo respaldo sin script; exige abrir la CSP al dominio del proveedor |
| Dependencia y disponibilidad | Ninguna externa | Si el proveedor cae o bloquea, el formulario puede quedar inutilizable o hay que decidir entre fallar abierto (sin protección) o cerrado (sin servicio). Cambios de términos o de precio fuera de control |
| Privacidad y transferencia internacional | Sin transferencia; la IP sólo se usa como HMAC | La IP y las señales del navegador salen hacia el proveedor (normalmente fuera de Chile): requiere base legal, información al usuario en la política de privacidad y evaluar la ley vigente de protección de datos y la Ley 21.719 (verificar su fecha de entrada en vigor) |
| Eficacia frente a bots | Frena ráfagas desde una IP o /64 y bots simples (campo trampa, envío instantáneo). No frena una botnet distribuida ni la rotación de /64 | Mejor frente a bots automáticos conocidos y distribuidos; no detiene el abuso humano ni los servicios de resolución de CAPTCHA |
| Falsos positivos | Medidos con el script de arriba (0 esperados); riesgo conocido: varios usuarios legítimos tras la misma IP o /64 | Un reto fallido bloquea a un usuario legítimo, sobre todo con tecnologías de apoyo, VPN o navegadores con anti-rastreo |

**Recomendación para el MVP (del implementador; la decide el humano con jz-architect).** Arrancar con los controles propios: no envían datos a terceros, no añaden fricción ni dependen de un proveedor, y sus falsos positivos se miden (tablas de arriba). Dejar el desafío externo como mitigación bajo demanda, con un disparador explícito (por ejemplo, abuso observado en los logs de `evento: intake` que supere el límite propio, o más spam del que el equipo pueda atender) y, si llega ese momento, elegir un proveedor que (a) no exija cookies ni huella invasiva, (b) tenga alternativa accesible conforme a WCAG y (c) permita decidir qué hacer si cae. Antes de cerrar la decisión: ejecutar la medición de falsos positivos y confirmar cómo se comporta el límite por /64 detrás de NAT con el cliente real.
