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
  acepta 404, y `AU-06` apunta a `eventos-solicitud` (no existe aquí). Pendiente del contrato, no de la candidata.

## Auditoría de dependencias (heredada de la fase 1; `npm audit` no se volvió a ejecutar en la fase 2 ni en la ronda de correcciones: requiere red y no aporta)
- 10 hallazgos restantes, todos en herramientas de build/desarrollo (no en el runtime de producción).
- `overrides` en `package.json`: `undici` 7.29.1 y `dompurify` 3.4.17.
- Scripts de instalación desactivados (`ignore-scripts=true` en `.npmrc`); `save-exact` y `engine-strict` activos.
- No se instaló ni actualizó ningún paquete en la fase 2.
