# Evidencia POC-1a (candidata A) — fase 2

Fecha de las ejecuciones: 2026-10-15. Stack: Next.js 16.4.1, Payload 3.90.2, PostgreSQL 18.6, Node 24.22.0
(imágenes por digest en `compose.yaml`), Playwright 1.64.1 (imagen por digest). Todo se ejecutó con `./poc.sh`.

## Hardware y entorno
Host: Intel Xeon E5-2697 v4 @ 2,30 GHz (VM de 6 vCPU visibles, `nproc` = 6), 8 GiB de RAM (`free -m`: 8192 total),
Linux 7.0.14-23-pve, Docker 29.9.0. Otros servicios no relacionados corrían en el mismo host: las mediciones son
indicativas, no de laboratorio.

## Pruebas y códigos de salida
| Comando | Resultado | Salida |
|---|---|---|
| `node --test contrato/test/` | 43 pruebas, 43 ok | 0 |
| `./poc.sh exec npx vitest run` (dev, schema `poc_test`) | 5 archivos, 49 pruebas ok (6 unit., 14 integración, 4 regla estática, 14 seguridad, 11 canales) | 0 |
| `./poc.sh exec npx tsc --noEmit` | sin errores | 0 |
| `run.mjs --alcance poc-1a` contra `next dev` | `casos 56 · ok 13 · fail 0 · pendiente 43` | 0 |
| `run.mjs --alcance poc-1a` contra producción, 3 ejecuciones seguidas (232 s, 232 s, 231 s) | `casos 56 · ok 13 · fail 0 · pendiente 43` ×3 | 0, 0, 0 |
| `vitest run test/http` contra producción (`app-prod:3000`, schema `poc_prod`) | 25 pruebas ok | 0 |
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
- `maxLoginAttempts` bloquea por cuenta, no por IP: permite denegar el acceso al único admin (10 min de `lockTime`).
- `first-register` queda abierto mientras no exista ningún usuario.
- Cookies `Secure`: sólo funcionan por HTTPS o en loopback; el despliegue real exige TLS.
- Medios `text/plain` permitidos sólo para los centinelas de la POC (R-3).
- ~172 KB gzip de JS público por página aunque no haya componentes de cliente (runtime de Next/React).
- `allowedDevOrigins` y `POC_*` son de la POC; no son configuración de producto.

## Auditoría de dependencias (heredada de la fase 1; no se volvió a ejecutar `npm audit` en la fase 2)
- 10 hallazgos restantes, todos en herramientas de build/desarrollo (no en el runtime de producción).
- `overrides` en `package.json`: `undici` 7.29.1 y `dompurify` 3.4.17.
- Scripts de instalación desactivados (`ignore-scripts=true` en `.npmrc`); `save-exact` y `engine-strict` activos.
- No se instaló ni actualizó ningún paquete en la fase 2.
