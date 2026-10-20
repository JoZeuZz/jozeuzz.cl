# POC-3 · Diseño fino del intake seguro (unidad 1)

Estado: **propuesto** (2026-10-16), pendiente de las notas de jz-security y jz-qa (`docs/CONTRATO-POC-3-U0-U1.md`, unidad 1, aceptación). Rama `poc/candidata-a-3`. Parte de `docs/PLAN-POC-3.md` (§7 aprobado: P3-01…P3-10) y de `docs/TRAZABILIDAD-POC-3.md` (T-01…T-13). Rutas de archivo relativas a `poc1a/` salvo que se indique otra cosa.

## 0. Decisiones aplicadas y valores que fija este diseño

- Aprobadas: proxy `nginx:1.30.6-alpine@sha256:970364228b1e4f932abc22d321932816782cca8a20b85a77552a7cfe9acfb3b5` (digest de índice, se confirma al descargar, §9 NV-15); P3-03 rechazar campos administrativos; P3-04 intentos 30/10 min, creaciones 5/10 min, longitudes 120/200/120/4000 code points, cuerpo 32 KiB, mínimo 3 s en producción; P3-05 `@axe-core/playwright` 4.13.0; P3-08 también `application/x-www-form-urlencoded` con el mismo CSRF; P3-09 retirar R-1 en la unidad 9; P3-10 TLS en el proxy con CA efímera por ejecución (no existe variante http ni flag de variante).
- Fijados aquí (técnicos, dentro del marco del plan): TTL del token 2 h; purga de `intake_envio` a las 4 h (2×TTL); purga de `intake_limite` a los 20 min (2× ventana); ventanas fijas de 10 min (`date_bin`); tiempo mínimo de batería 200 ms en `app` y `app-prod`; `client_max_body_size 1m` en el proxy; puertos 3443 (`app`) y 3444 (`app-prod`); bases `poc3_intake` y `poc3_migraciones`.
- Desviaciones justificadas del plan: (D1) claves en `text` hex de 64 caracteres, no `bytea`: drizzle-orm 0.45.2 no trae columna `bytea` (no existe `node_modules/drizzle-orm/pg-core/columns/bytea.js`). (D2) Orden del pipeline (§2.2): el CSRF va después de leer el cuerpo, porque el token del formulario viaja en el cuerpo; los intentos se cuentan antes de leerlo (T-04). (D3) La configuración de logs de `db` se aplica en la unidad 7, no en la 4, para que su prueba roja sea real (T-06). (D4) T-03 (iii), cupo tras rollback, se prueba en la unidad 6, donde nace el contador.
- **Pendiente del responsable (no bloquea las unidades 2–8):** P-U1-01. T-10 exige 44/44 en `app-prod`, pero EV-04 necesita la inyección `x-poc-fallo`, que nunca existe en producción (`Solicitudes.ts:45`, T-05). Propuesta: en `app-prod` se ejecutan los 43 restantes y EV-04 sólo en `app`. Hasta que se decida, la unidad 9 no puede cerrarse con T-10 literal.

## 1. Topología Compose y arnés (T-01, T-02, T-08, T-13; §9.1)

### 1.1 Servicios y redes (`compose.yaml`)

| Servicio | Redes | `ports` | Cambios |
|---|---|---|---|
| `db` | `db_app`, `db_prod` | no | `command` con flags de logs (§5.5, unidad 7) |
| `app` | `db_app`, `proxy_app` | **ninguno** (se quita `127.0.0.1:3101:3000`) | sale de `externa` |
| `app-prod` | `db_prod`, `proxy_prod` | **ninguno** (se quita `127.0.0.1:3102:3000`) | sale de `externa` |
| `proxy` (nuevo) | `entrada`, `proxy_app`, `proxy_prod`, `e2e` | `127.0.0.1:3443:3443`, `127.0.0.1:3444:3444` | única entrada |
| `e2e` | `e2e` | no | sin `network_mode: service:app` |
| `deps` | `externa` | no | sin cambios |

Redes: `db_app`, `db_prod`, `proxy_app`, `proxy_prod` y `e2e` con `internal: true`; `entrada` y `externa` normales (`entrada` existe sólo para publicar puertos del proxy). Con esto `app` no alcanza a `app-prod` ni al revés, y `e2e` sólo ve al proxy.

Entorno nuevo de `app` / `app-prod`: `POC_SERVER_URL` e `INTAKE_ORIGEN_PUBLICO` = `https://127.0.0.1:3443` / `https://127.0.0.1:3444`; `INTAKE_SECRETO: ${INTAKE_SECRETO:?ejecuta ./poc.sh init}`; `INTAKE_TIEMPO_MINIMO_MS: "200"`; `NODE_EXTRA_CA_CERTS: /app/.tls/ca.crt`. `e2e`: `POC_BASE_URL: https://127.0.0.1:3443`.

Proxy: `image` con el digest de §0; volúmenes `./proxy/nginx.conf:/etc/nginx/nginx.conf:ro`, `./proxy/ip-cliente.produccion.conf:/etc/nginx/poc/ip-cliente.conf:ro`, `./.tls:/etc/nginx/tls:ro`. Sin `depends_on` (resolución diferida, §1.2).

**Override de pruebas `compose.pruebas.yaml`** (único archivo que lo contiene; nunca lo usa un comando sin `pruebas`/`fallos` en el nombre):
- `proxy.volumes`: `./proxy/ip-cliente.pruebas.conf:/etc/nginx/poc/ip-cliente.conf:ro` (sustituye al de producción por destino, NV-3).
- `app.networks`: añade `proxy_prod`. Es el **único cliente interno** fuera del proxy y sólo existe aquí: lo usan los tests HTTP dentro de `app` para golpear `app-prod:3000` directamente (T-08).
- `app.environment`: `POC_FALLOS_INYECTABLES: ${POC_FALLOS_INYECTABLES:-0}` (`up-fallos-en` lo exporta como 1). `app-prod.environment`: `POC_FALLOS_INYECTABLES: "1"` (para que la prueba de no inyección en producción no sea vacua). La variable ya no está en `compose.yaml`.

### 1.2 Proxy (`proxy/nginx.conf`, `proxy/ip-cliente.*.conf`)

`nginx.conf` (todas las `proxy_set_header` en el bloque `http`; ninguna en `server`/`location`, porque nginx no hereda si el nivel inferior define alguna):
```
worker_processes 1; pid /tmp/nginx.pid; error_log stderr alert;
events { worker_connections 256; }
http {
  access_log off; server_tokens off; resolver 127.0.0.11 valid=10s ipv6=off;
  client_max_body_size 1m; client_body_buffer_size 1m;
  ssl_certificate /etc/nginx/tls/cadena.crt; ssl_certificate_key /etc/nginx/tls/servidor.key; ssl_protocols TLSv1.3;
  map $http_upgrade $conexion { default upgrade; '' ''; }
  proxy_http_version 1.1;
  proxy_set_header Host $http_host; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection $conexion;
  proxy_set_header X-Forwarded-Host ""; proxy_set_header X-Forwarded-Proto https;
  include /etc/nginx/poc/ip-cliente.conf;
  server { listen 3443 ssl; set $destino http://app:3000;      location / { proxy_pass $destino; } }
  server { listen 3444 ssl; set $destino http://app-prod:3000; location / { proxy_pass $destino; } }
}
```
`ip-cliente.produccion.conf`: `proxy_set_header X-Real-IP $remote_addr;` · `X-Forwarded-For ""` · `X-Poc-Ip-Sintetica ""` · `X-Poc-Fallo ""`. Sin `real_ip_header` ni `set_real_ip_from` en ningún archivo.

`ip-cliente.pruebas.conf`: un `map $http_x_poc_ip_sintetica $poc_ip_cliente` con `default $remote_addr;` y sólo dos patrones aceptados, `"~^203\.0\.113\.([1-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-4])$"` y `"~^2001:db8:[0-9a-f]{1,4}:[0-9a-f]{1,4}::1$"`, que copian la cabecera; después `proxy_set_header X-Real-IP $poc_ip_cliente;` · `X-Forwarded-For ""` · `X-Poc-Ip-Sintetica ""`. `X-Poc-Fallo` pasa (§5.4).

Sin log de acceso y `error_log` en `alert` (por encima de `crit`; antes `crit`): el proxy no escribe IPs (T-09). Motivo del cambio de `crit` a `alert`: no verificado en ejecución; los archivos de U7 (`logs-intake*.mjs`, `driver/logs-intake.mjs`) no lo documentan. Hipótesis sin confirmar: nginx registra en `crit` errores de handshake TLS con `client: <IP>`, que contaminarían las sondas de logs sin PII. El tope de 1 MiB es mayor que el de la app (32 KiB): el 413 de IN-07 y de T-08 lo produce la app con su cuerpo JSON.

### 1.3 CA efímera (P3-10)

`poc.sh` define `tls_efimera()` (openssl del host, como `init`): borra y recrea `.tls/` (modo 755; `ca.crt` y `spki.txt` 644 para los contenedores uid 1000, `servidor.key` 600 para nginx); genera una CA P-256 de 1 día (`CN=jozeuzz-poc-a CA efimera`, `basicConstraints=critical,CA:TRUE`), una clave de servidor P-256 y su certificado con `subjectAltName=IP:127.0.0.1,DNS:proxy` y `extendedKeyUsage=serverAuth`; escribe `ca.crt`, `servidor.key`, `cadena.crt` (servidor + CA) y `spki.txt` (hash SHA-256 base64 del SPKI del servidor y de la CA, separados por coma); **borra `ca.key`** al terminar (no se pueden emitir más certificados). `.tls/` se añade a `.gitignore`. Toda orden que crea o recrea el proxy llama antes a `tls_efimera` y recrea el proxy con `--force-recreate`.

Confianza: Node (driver en el host y vitest en `app`) con `NODE_EXTRA_CA_CERTS` (NV-1); Chromium con `--ignore-certificate-errors-spki-list=<spki.txt>` (NV-2). Prohibido `NODE_TLS_REJECT_UNAUTHORIZED=0` e `ignoreHTTPSErrors`.

### 1.4 `poc.sh`

`C="docker compose -p jozeuzz-poc-a -f compose.yaml"`; nuevo `CP="$C -f compose.pruebas.yaml"`. Todas las invocaciones `*-en` llevan `POC_DATABASE_NAME="$base"` (incidente POC-1b). Guarda `poc(1b|3)_` de la unidad 0b.

| Orden | Hace |
|---|---|
| `init` | además añade `INTAKE_SECRETO=$(openssl rand -hex 32)` a `.env` si falta |
| `up-en <b>` | `tls_efimera`; `$C up -d db app`; `$C up -d --force-recreate proxy` (modo producción) |
| `up-pruebas-en <b>` | igual con `$CP` |
| `up-fallos-en <b>` | `$CP`, `POC_FALLOS_INYECTABLES=1`, recrea `db app proxy` (`--force-recreate`) |
| `up-prod-en <b>` / `up-prod-pruebas-en <b>` | `$C`/`$CP --profile prod up -d db app-prod` + proxy (schema `poc_prod`, `POC_NO_PUSH=1`) |
| `e2e-en <b>` / `e2e-prod-en <b>` | levanta en modo producción (`e2e-prod-en` levanta además `app` dev: el reset corre con `exec-en` en `app`, que verifica antes la base con `verificar-db.ts`), reset (prod con `POC_RESET_ENV`, URL y CA por variables de entorno `POC_TARGET_DATABASE`, `POC_BASE_URL`, `NODE_EXTRA_CA_CERTS`; la orden heredada `e2e` se retiró y sólo avisa), y en `e2e`: `sh -c 'POC_E2E_DESTINO="$(getent hosts proxy \| cut -d" " -f1):<puerto>" npx playwright test'`; `e2e-prod-en` exporta `POC_E2E_ORIGEN=https://127.0.0.1:3444` |
| `sonda-red` | `$C --profile e2e run --rm e2e node scripts/sonda-red.mjs` |
| `logs-since <t>` | `$C --profile prod logs --no-color --since "$t" proxy app app-prod db` (todos, siempre) |
| `medir-web` | como `e2e-prod-en`, con `playwright.medicion.config.ts` |

`scripts/sonda-red.mjs` (en `e2e`): exige fallo de red hacia `http://app:3000/` y `http://app-prod:3000/`, y `200` en `https://proxy:3443/solicitar` con `NODE_EXTRA_CA_CERTS=/app/.tls/ca.crt`; imprime una línea por comprobación y sale ≠ 0 si alguna falla.

### 1.5 Playwright

`playwright.config.ts`: `ORIGEN = POC_E2E_ORIGEN ?? 'https://127.0.0.1:3443'`; `DESTINO = POC_E2E_DESTINO` obligatorio (lanza si falta); `launchOptions.args`: `--host-resolver-rules=MAP 127.0.0.1:<puerto> <DESTINO>` (mismo patrón IP:puerto ya probado, `EVIDENCIA.md:44-45`) y `--ignore-certificate-errors-spki-list=<contenido de .tls/spki.txt>` (lanza si falta). `playwright.medicion.config.ts` igual con `https://127.0.0.1:3444`.

## 2. Contratos HTTP (T-07, T-08)

Rutas en un grupo propio para no romper la regla estática de `(frontend)` (`test/estatico/regla-local-api.test.ts:18`): `src/app/(intake)/solicitar/route.ts` (`GET`) y `src/app/(intake)/api/intake/route.ts` (`POST`), ambos con `export const dynamic = 'force-dynamic'` y `runtime = 'nodejs'`, que sólo delegan en `@/lib/intake/formulario` y `@/lib/intake/manejador`. Sin `proxy.ts`/middleware.

### 2.1 `GET /solicitar`

`200 text/html; charset=utf-8` con `Cache-Control: no-store, private`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Content-Security-Policy: default-src 'none'; style-src-attr 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'` y `Set-Cookie: __Host-intake=<token>; Path=/; Max-Age=7200; Secure; HttpOnly; SameSite=Strict` (sin `Domain`). Cada GET emite un nonce nuevo. `?estado=recibida` añade el aviso de éxito; cualquier otro parámetro se ignora.

### 2.2 `POST /api/intake`: orden del pipeline

| # | Paso | Fallo |
|---|---|---|
| 1 | `X-Real-IP`: un único valor, `net.isIP`, sin `%`; IPv4-mapped → IPv4; IPv6 → prefijo /64. Siempre obligatoria | 400 `ip_invalida` |
| 2 | Intentos: `UPSERT` `tipo='intento'` fuera de transacción; `n > 30` | 429 `demasiados_intentos` + `Retry-After` |
| 3 | Content-Type: tipo de medio exacto `application/json` o `application/x-www-form-urlencoded` | 415 `tipo_no_soportado` |
| 4 | Origen: `Origin` == `INTAKE_ORIGEN_PUBLICO` (cadena exacta); `null` falla; sin `Origin`, `new URL(Referer).origin` == origen; sin ambos o URL inválida falla | 403 `origen_invalido` |
| 5 | Cuerpo: `Content-Length` > 32768 → sin leer; lectura del `ReadableStream` contando bytes y `cancel()` al pasar 32768 | 413 `cuerpo_demasiado_grande` |
| 6 | Parseo: `TextDecoder('utf-8',{fatal:true})`; JSON debe ser objeto plano; urlencoded con claves repetidas falla. El error nunca se registra | 400 `cuerpo_invalido` |
| 7 | CSRF: `token` del cuerpo (string) y cookie `__Host-intake` (exactamente una) de igual longitud y `timingSafeEqual`; firma, `kid`, caducidad (§4) | 403 `csrf_invalido` (único código para todas las causas) |
| 8 | Antiabuso: `sitio_web` ausente o `''`; `ahora − e ≥ tiempoMinimo` | 400 `envio_rechazado` |
| 9 | Validación (§2.3) y resolución del slug con `resolverServicioActivo` | 400 `campos_no_permitidos` / `datos_invalidos` |
| 10 | Transacción (§3.3) | 201, 201 idempotente, 429 `limite_creaciones` |
| 11 | Respuesta y log (§5) | 500 `interno` ante cualquier otra excepción |

Respuestas JSON: `application/json; charset=utf-8`, `Cache-Control: no-store`, cabecera `X-Correlacion: <uuid>`. Éxito `201 {"ok":true}` (también en el reenvío idempotente; sin eco ni id). Error `{"error":"<código>"}`; sólo `datos_invalidos` añade `"campos":[…]` con nombres de la lista fija (nunca claves del cliente). Otros métodos: 405 de Next.

Con `x-www-form-urlencoded`: éxito `303 Location: /solicitar?estado=recibida`; error con el mismo código HTTP y el formulario en HTML (§2.4), con un token nuevo y sin eco de valores.

### 2.3 Validación (`validarSolicitudPublica`, en `src/lib/solicitudes.ts`)

Claves permitidas: `nombre`, `contacto`, `tipo_equipo`, `descripcion`, `servicio`, `token`, `sitio_web`; cualquier otra (incluidas `estado`, `motivo_cierre`, `observaciones_internas`, `id`, `creada_en`, `__proto__`) → `campos_no_permitidos`. Los cuatro obligatorios: `string`, `trim()` no vacío, sin U+0000, longitud en code points (`[...s].length`) ≤ 120/200/120/4000; se guardan sin normalizar. `servicio`: ausente o `''` = sin servicio; si no, string `^[a-z0-9]+(-[a-z0-9]+)*$` ≤ 80; `null` u otro tipo → `datos_invalidos`. Reutiliza `solicitudPublica()` como copia de los cinco campos tras comprobar las claves. `resolverServicioActivo(slug): Promise<number | null>` se añade a `src/lib/publico.ts` con `overrideAccess: false`, `where` `slug` + `activo: true`, `depth: 0`, `limit: 1`; `null` → `datos_invalidos` `["servicio"]` (IN-03, IN-04).

### 2.4 Formulario (`src/lib/intake/html.ts`, sin JavaScript)

`<html lang="es">`, `<main>`, `<h1>`, `<form method="post" action="/api/intake" novalidate>`; `<label for>` explícito por campo; ayuda en `ayuda-<campo>` enlazada con `aria-describedby`; con error, `aria-invalid="true"`, mensaje `error-<campo>` añadido a `aria-describedby` y `autofocus` en el primer campo con error; resumen `<div role="alert">` con enlaces a los campos; éxito en `<p role="status">`. `servicio` es un `<select>` con los activos de `listarServiciosPublicos()` y opción vacía. Trampa `sitio_web` en un contenedor `aria-hidden="true"` fuera de pantalla con `tabindex="-1"` y `autocomplete="off"`. Todo texto dinámico pasa por `escaparHtml` (`& < > " '`). Limitación aceptada: tras un error no se rellenan los valores (no hay eco).

## 3. Datos y transacción (T-03, T-04; §9.3, §9.4)

### 3.1 Tablas (schema de Payload: `public` en `app`, `poc_prod` en `app-prod`)

```sql
CREATE TABLE intake_envio (clave text PRIMARY KEY CHECK (clave ~ '^[0-9a-f]{64}$'),
  creada_en timestamp(3) with time zone NOT NULL DEFAULT now());
CREATE INDEX intake_envio_creada_en_idx ON intake_envio (creada_en);
CREATE TABLE intake_limite (clave_hmac text NOT NULL CHECK (clave_hmac ~ '^[0-9a-f]{64}$'),
  tipo text NOT NULL CHECK (tipo IN ('intento','creacion')),
  ventana timestamp(3) with time zone NOT NULL, n integer NOT NULL CHECK (n >= 1),
  PRIMARY KEY (clave_hmac, tipo, ventana));
CREATE INDEX intake_limite_ventana_idx ON intake_limite (ventana);
```
Sin PII: `clave` = HMAC del nonce, `clave_hmac` = HMAC de la IP o /64 (§4). `vaciarBase` (`src/lib/base.ts:15-20`) las trunca en cada reset de la batería.

### 3.2 Esquema y migración

`src/lib/intake/esquema.ts` exporta `extenderEsquemaIntake: PostgresSchemaHook`, que devuelve el schema con `tables.intake_envio` e `tables.intake_limite` definidas con `adapter.pgSchema.table` (respeta `schemaName`) y las piezas de `@payloadcms/db-postgres/drizzle/pg-core`; se registra en `postgresAdapter({ afterSchemaInit: [extenderEsquemaIntake] })`. Así `push` las crea en `app` y no intenta borrarlas (lo haría con un aviso interactivo que cuelga `next dev`, `pushDevSchema.js:39-59`, `EVIDENCIA.md:114`). Para `app-prod`, migración escrita a mano `src/migrations/20261017_120000_poc3_intake.ts` (SQL de §3.1 con prefijo `"poc_prod".`, `down` con los dos `DROP TABLE`) registrada en `src/migrations/index.ts`; sin snapshot `.json` (riesgo aceptado: un `migrate:create` futuro las volvería a proponer).

### 3.3 Transacción única (`src/lib/intake/persistir.ts`)

```ts
export type DatosSolicitud = { nombre: string; contacto: string; tipo_equipo: string; descripcion: string; servicio?: number }
export type ResultadoPersistencia = { tipo: 'creada' } | { tipo: 'duplicada' } | { tipo: 'limite'; reintentarEnS: number }
export type SondaPersistencia = { trasReserva?: (tx: TxIntake) => Promise<void>; trasCupo?: (tx: TxIntake, d: DatosSolicitud) => Promise<void>; antesDeCrear?: (d: DatosSolicitud) => DatosSolicitud }
export async function persistirIntake(payload: Payload, e: { datos: DatosSolicitud; claveEnvio: string; claveIp: string }, sonda?: SondaPersistencia): Promise<ResultadoPersistencia>
```
1. `req = await createLocalReq({ context: { canal: 'intake' } }, payload)`; `await initTransaction(req)`; `tx = payload.db.sessions[req.transactionID].db`; si no existe, error (nunca el `drizzle` sin transacción, que es lo que haría `getTransaction`).
2. (9a) `tx.insert(intake_envio).values({ clave }).onConflictDoNothing().returning()`; sin fila → `killTransaction(req)` y `duplicada`. → `sonda.trasReserva`.
3. (9b, unidad 6) `contarCreacion(tx, claveIp)`; `n > 5` → `killTransaction` y `limite` (el rollback devuelve el incremento). → `sonda.trasCupo`.
4. (9c) `payload.create({ collection: 'solicitudes', data, req, overrideAccess: true, depth: 0, draft: false, select: { id: true } })`. Único `overrideAccess: true` del intake.
5. `commitTransaction(req)`; después, `SELECT` de la clave fuera de la transacción: si no está → error (el commit de Payload se traga sus fallos, §8).
6. Cualquier excepción: `killTransaction(req)` (idempotente) y se relanza. Tras el commit, purga (§3.5).

Concurrencia: el `INSERT … ON CONFLICT` del mismo nonce espera al otro; si éste confirma, devuelve `duplicada`; si revierte, crea. El `UPSERT` del contador bloquea la fila de esa IP y serializa. El manejador no pasa `sonda` (regla estática, §5.3) salvo vía `sondaDePrueba(request)` desde la unidad 7.

Hook (`src/collections/Solicitudes.ts`): en `create` con `req.context.canal === 'intake'`, además de `estado`/`motivo_cierre`, fija `observaciones_internas = ''` y borra `id`, `createdAt` y `updatedAt` de `data`.

### 3.4 Límites (`src/lib/intake/limites.ts`, unidad 6)

`LIMITES = { intentos: { max: 30, ventanaMs: 600_000 }, creaciones: { max: 5, ventanaMs: 600_000 } }`. `contarIntento(db, claveIp)` y `contarCreacion(tx, claveIp)` → `{ permitido: boolean; reintentarEnS: number }` con `INSERT … VALUES (clave, tipo, date_bin('10 minutes', now(), timestamptz '2000-01-01 00:00:00+00'), 1) ON CONFLICT (clave_hmac, tipo, ventana) DO UPDATE SET n = intake_limite.n + 1 RETURNING n`. `Retry-After` = segundos hasta el fin de la ventana. Ventana fija: permite hasta 2× en el borde (aceptado en el POC).

### 3.5 Purga (`src/lib/intake/purga.ts`)

`TOKEN_TTL_MS = 7_200_000`, `PURGA_ENVIO_MS = 14_400_000`, `PURGA_LIMITE_MS = 1_200_000`. `purgarIntake(db)` borra `intake_envio` con `creada_en < now() - interval '4 hours'` e `intake_limite` con `ventana < now() - interval '20 minutes'`; se llama tras un commit si pasó ≥ 60 s desde la última (por proceso); sus errores sólo se registran (`evento: 'intake_purga'`).

## 4. Claves, token y configuración

`src/lib/intake/config.ts`: `cargarConfigIntake(env): ConfigIntake` lanza `ErrorConfigIntake(codigo)` si: falta `INTAKE_SECRETO` o no es hex de ≥ 64 caracteres; es igual a `PAYLOAD_SECRET`; `INTAKE_ORIGEN_PUBLICO` falta, no es `https:` o no es igual a su `new URL(x).origin`; `INTAKE_TIEMPO_MINIMO_MS` no es entero 0–60000, o vale 0 con `NODE_ENV=production`. Por defecto el mínimo es 3000. La configuración se carga de forma perezosa (nunca al importar: `next build` y los scripts importan `payload.config`).

Arranque: `src/instrumentation.ts`, `register()`: si `NEXT_RUNTIME === 'nodejs'`, llama a `cargarConfigIntake(process.env)`; si falla, escribe `{"evento":"arranque","codigo":"config_intake_invalida"}` en stdout y `process.exit(1)` (NV-8).

`src/lib/intake/claves.ts`: `derivarClaves(secretoHex) → { kid: '1', token: Buffer, ip: Buffer }` con `hkdfSync('sha256', ikm, 'jozeuzz-poc3-intake', info, 32)`, `info` = `intake-token-v1` / `intake-ip-v1`. `claveEnvio(nonce)` = HMAC-SHA256(k_token, `intake-envio|<nonce>`) hex; `claveIp(normalizada)` = HMAC-SHA256(k_ip, `intake-ip|<ip>`) hex.

`src/lib/intake/token.ts`: `emitirToken(cfg, ahora) → string` y `verificarToken(cfg, token, ahora) → { n: string; e: number } | null`. Formato `b64url(JSON{v:1,k:'1',n:<16 bytes b64url>,e,x}) + '.' + b64url(HMAC(k_token, 'intake-token|' + parte1))`; ≤ 512 caracteres; válido si dos partes, firma con `timingSafeEqual`, `k` conocido, `x − e = TTL`, `e ≤ ahora + 5 s`, `ahora < x`.

`src/lib/intake/origen.ts`: `origenValido(headers, origenPublico): boolean`. `src/lib/intake/ip.ts`: `normalizarIp(texto): string | null` (IPv4 tal cual; IPv6 → `xxxx:xxxx:xxxx:xxxx::/64` expandido sin ceros a la izquierda).

## 5. Logs sin PII y fallos de prueba (T-05, T-06, T-09; §9.2)

### 5.1 Logger de Payload (`src/lib/intake/log.ts`)

`payload.config.ts`: `logger: { options: opcionesLogger() }` (forma `{options}` de `logger.js:23-31`: Payload crea el pino con nuestras opciones; salida JSON, sin `pino-pretty`). `opcionesLogger()` devuelve:
- `serializers: { err: serializarError, error: serializarError }`; `serializarError(e) → { name, code?, pg_code? }`: `name` = `e.constructor.name` si cumple `^[A-Za-z]{1,40}$` (un `DrizzleQueryError` no fija `name`, `errors.js:10-19`); `code` si `^[A-Z0-9_]{1,40}$`; `pg_code` = `e.cause?.code ?? e.code` si `^[0-9A-Z]{5}$`. Nada más: ni `message`, `stack`, `params`, `query`, `cause`, `detail` ni `where`.
- `hooks.logMethod(args, method)`: `sanearArgumentosLog(args)`; si algún argumento es un `Error` o un objeto con un valor `Error` de primer nivel, el `Error` se sustituye por `serializarError(…)`, se borra la propiedad `msg` y toda cadena se sustituye por `'mensaje omitido'`. Necesario porque pino copia `err.message` a `msg` (`proto.js:221-230`) y Payload construye `msg` con `err.message` (`beginTransaction.js:50-53`).

### 5.2 Log del manejador

Una línea por petición vía `payload.logger.info|error({ evento: 'intake', codigo, duracion_ms, correlacion, err_name?, pg_code? })`, con `codigo` = código de error, `creada` o `duplicada`; nivel `error` sólo para `interno`. El manejador captura todo; nada llega al registro de errores de Next. Nunca `console.*`.

### 5.3 Reglas estáticas (`test/estatico/intake-reglas.test.ts`)

(a) `overrideAccess: true` sólo en `src/lib/intake/persistir.ts` dentro de `src/lib/intake/**` y `src/app/(intake)/**`; (b) las rutas de `(intake)` sólo importan de `@/lib/intake/`; (c) sin `console.` en esas carpetas; (d) `manejador.ts` llama a `persistirIntake` con dos argumentos, o con el tercero exactamente `sondaDePrueba(request)`; (e) unidad 7: en `src/**` (salvo `fallos.ts`) toda llamada `*.logger.<nivel>(…)` lleva un literal de objeto como primer argumento, y en `src/lib/intake/**` sus claves ⊆ {`evento`,`codigo`,`duracion_ms`,`correlacion`,`err_name`,`pg_code`}; (f) unidad 7: `fallos.ts` contiene literalmente `process.env.NODE_ENV !== 'production'` y `process.env.POC_FALLOS_INYECTABLES === '1'`.

### 5.4 Inyección sólo de pruebas (`src/lib/intake/fallos.ts`, unidad 7)

`sondaDePrueba(request): SondaPersistencia | undefined` devuelve `undefined` salvo con las dos condiciones de (f) y la cabecera `x-poc-fallo` (el proxy de producción la borra, §1.2). Valores: `intake-pg-check` (en `trasCupo`, `INSERT` en `intake_limite` con `tipo = d.nombre` → violación real de `CHECK`, 23514, `DETAIL` con el valor); `intake-pg-tipo` (`SELECT ${d.nombre}::integer` → 22P02 con el valor en el mensaje); `intake-fuera` (`antesDeCrear` añade U+0000 a `nombre`: falla dentro de Payload/drizzle con los `params` en el mensaje); `intake-log-crudo` (además llama a `payload.logger.error(err)` con el error crudo: es la fuga deliberada que hace rojo el test de la unidad 7 antes del §5.1). Las pruebas de atomicidad (T-03) no usan esta vía: llaman a `persistirIntake` en proceso con `sonda`.

### 5.5 PostgreSQL (unidad 7)

`db.command`: `["postgres","-c","log_min_messages=fatal","-c","log_min_error_statement=panic","-c","log_error_verbosity=terse"]`. Con `fatal` no se escriben los `ERROR` (ni `DETAIL: Failing row contains …` ni `invalid input syntax …: "<valor>"`); se mantiene `db` en `logs()` (NV-10).

## 6. Driver (`contrato-driver.mjs`, T-04; §9.7)

- Carga: `POC_BASE_URL` obligatorio y con forma `https://127.0.0.1:<puerto>`; lanza si `NODE_EXTRA_CA_CERTS` no termina en `/.tls/ca.crt` o si `NODE_TLS_REJECT_UNAUTHORIZED === '0'`. Guarda de base `poc(1b|3)_` (0b).
- `intake.limite.max = 5`. `POC_INTAKE_TIEMPO_MINIMO_MS` (por defecto 200) debe coincidir con Compose.
- `preparar(payload)`: `GET /solicitar`; extrae el `value` de `input[name="token"]` y `__Host-intake=<v>` de `Set-Cookie`; devuelve `{ payload, token, cookie, listoEn: Date.now() + minimo + 50 }`; lanza si falta alguno.
- `enviar(envio, { origen })`: espera a `listoEn`; `POST /api/intake` con `content-type: application/json`, `origin: <origen de BASE>`, `cookie`, `x-poc-ip-sintetica: ipSintetica(origen)` y cuerpo `{ ...payload, token }`; devuelve `{ status, body }`.
- `driver/ip-sintetica.mjs`: `ipSintetica(origen)`: `origen-sintetico-N` → N (1 ≤ N < 0xffff0000; si no, lanza); otras cadenas → índice estable desde 0x80000000. Resultado `2001:db8:<N>>>16 en hex>:<N&0xffff en hex>::1`: N distinto ⇒ /64 distinto. El grupo `ffff` queda reservado a los tests HTTP.
- `aSolicitud`: `servicio` numérico → slug con el inverso de `idPorSlug` (IN-02 compara con el slug; hoy `depth=0` devuelve el id).
- `logs()`: `poc.sh logs-since` (todos los servicios); lanza si el código de salida ≠ 0.
- (Histórico: retirado en U9.) Hasta la unidad 9, `POC_INTAKE_SINTETICO=1` conservaba R-1 (`contrato-driver.mjs:311-322`); ni la variable ni esa rama existen ya: el driver usa sólo el intake real.

## 7. Servicio objetivo, tiempo mínimo y regresión (T-10, T-13; §9.9)

- IN-*, la batería de 44 y E2E corren por el proxy contra `app` (3443) y contra `app-prod` (3444). La batería y los tests HTTP, en modo pruebas (IP sintética); E2E en modo producción.
- Tiempo mínimo: 200 ms en ambos servicios (Compose); 3000 ms si falta la variable; 0 prohibido en producción.
- Unidades 5–8: 44/44 con R-1 en `app` (como en POC-1b) y E2E 3/3, ya por el proxy. Unidad 9: 44 sin R-1 en `app` y en `app-prod` (salvo P-U1-01), `--alcance poc-3` 12/12 en los dos y E2E en los dos. CO-05 se mide en la batería de `app-prod`; ahora incluye el salto del proxy y TLS, y `EVIDENCIA.md` lo anota.

## 8. APIs verificadas leyendo `poc1a/node_modules`

| Hecho | Cita |
|---|---|
| `initTransaction` crea la transacción y asigna `req.transactionID`; si ya existe, no la gestiona | `payload/dist/utilities/initTransaction.js:5-24` |
| `commitTransaction`/`killTransaction` y su idempotencia | `payload/dist/utilities/commitTransaction.js:4-6`, `killTransaction.js:4-12` |
| `createLocalReq`, `initTransaction`, `commitTransaction`, `killTransaction` exportados | `payload/dist/index.js:741,744,764,769` |
| `createLocalReq` conserva `req.context` y lo reutiliza el `create` local | `createLocalReq.js:65,86`; `collections/operations/local/create.js:7,12` |
| `create` no confirma si la transacción ya existía y la revierte si falla | `collections/operations/create.js:30,420-422,435` |
| La sesión drizzle de la transacción es `adapter.sessions[id].db` | `@payloadcms/drizzle/dist/transactions/beginTransaction.js:20-48` |
| El commit se traga el error del `COMMIT` | `transactions/commitTransaction.js:11-15` con `beginTransaction.js:34-37` |
| `getTransaction` cae en silencio al `drizzle` sin transacción | `utilities/getTransaction.js:11-17` |
| Ganchos de schema y tablas propias | `postgres/init.js:14-44`; `utilities/executeSchemaHooks.js:3-17`; `@payloadcms/db-postgres/dist/types.d.ts:15,29` |
| `pgSchema.table` con o sin `schemaName`; `sessions`; aislamiento por defecto | `@payloadcms/db-postgres/dist/index.js:22-30,90,94` |
| `push` pregunta si hay pérdida de datos | `@payloadcms/drizzle/dist/utilities/pushDevSchema.js:32-59` |
| `id` en `create` sólo con `allowIDOnCreate` | `@payloadcms/db-postgres/dist/types.d.ts:17-23` |
| `DrizzleQueryError`: `params` en `message`, sin `name` propio | `drizzle-orm/errors.js:10-19` (0.45.2) |
| Logger de Payload configurable con `{options}` o instancia | `payload/dist/utilities/logger.js:14-35`; `payload/dist/index.js:317` |
| pino 9.14.0 copia `err.message` a `msg`; `hooks.logMethod` | `pino/lib/proto.js:221-230`; `pino/lib/levels.js:88,95` |
| Route handlers: `Request`, cookies, GET dinámico desde v15 | `next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md:64,127-195,669` |
| `register()` de instrumentation antes de servir | `…/03-file-conventions/instrumentation.md:18` |

## 9. No verificado (cada uno con su prueba)

| ID | Afirmación | Prueba que lo comprueba (unidad) |
|---|---|---|
| NV-1 | `NODE_EXTRA_CA_CERTS` vale para `fetch` en Node 20 (host) y 24 (`app`) | driver contra el proxy y `test/http/intake.test.ts` (5) |
| NV-2 | Chromium acepta `--ignore-certificate-errors-spki-list` con el `user-data-dir` de Playwright y fija `__Host-intake` | E2E de cookie y envío (5) |
| NV-3 | El override sustituye el volumen por destino y añade la red a `app` | `poc.sh sonda-red` y tests HTTP de `app-prod` directo en los dos modos (5) |
| NV-4 | `proxy_set_header X ""` borra la cabecera y la de igual nombre del cliente se reemplaza | `test/docker/ip-produccion.test.mjs` (5) |
| NV-5 | Next entrega el cuerpo del route handler en streaming, sin tope propio | 413 chunked directo a la app (5) |
| NV-6 | Con `Content-Length` menor que el cuerpo, Node sólo entrega esos bytes → 400 `cuerpo_invalido` | caso (c) de T-08 (5) |
| NV-7 | `/api/intake` gana al catch-all `(payload)/api/[...slug]` | cualquier rojo de 5 que espere un código propio (415 `tipo_no_soportado`) |
| NV-8 | `process.exit(1)` en `register()` impide servir | `INTAKE_SECRETO=abcd ./poc.sh up-prod-en poc3_intake`: el contenedor sale con 1 (5) |
| NV-9 | Todas las llamadas de Payload pasan por el pino con nuestras opciones | `log.test.ts` y `logs-intake-fallos.test.mjs` (7) |
| NV-10 | Los flags de §5.5 suprimen esos textos en PostgreSQL 18.6 | `logs-intake-fallos.test.mjs` con `intake-pg-check` e `intake-pg-tipo` (7) |
| NV-11 | Next inlinea `NODE_ENV` y elimina `fallos.ts` de `.next-prod` | `./poc.sh run-prod-en poc3_intake node --test test/build/sin-inyeccion.test.mjs` tras `build-en` (dentro de `app-prod`: `.next-prod` vive en el volumen `next_prod`) (7) |
| NV-12 | Payload no guarda `createdAt` ni `id` recibidos tras borrarlos en el hook | `test/integracion/intake-hook.int.test.ts` (2) |
| NV-13 | HMR de `next dev` por el proxy (websocket) no rompe el admin en E2E | E2E 3/3 (5) |
| NV-14 | `docker compose logs` con `app-prod` sin crear sale con 0 | `logs()` estricto en la batería de `app` (5) |
| NV-15 | El digest de índice del proxy coincide al descargar | `docker image inspect --format '{{json .RepoDigests}}'` registrado en la nota de Docker (5) |
| NV-16 | Chromium envía `Origin` en el POST del formulario | E2E de envío sin JS (5) |
| NV-17 | `push` crea las tablas con sus `CHECK` sin preguntar | `up-en poc3_intake` y consulta `pg_constraint` (4) |

## 10. Unidades 2–9

Comandos `jz-run` desde la raíz del worktree; Docker, el humano desde `poc1a/`. «Base» = `poc3_intake` (`./poc.sh psql -c 'CREATE DATABASE poc3_intake'`, una vez). Host: `export NODE_EXTRA_CA_CERTS="$PWD/.tls/ca.crt"`. `V=".jz/bin/jz-run --cwd poc1a node node_modules/vitest/vitest.mjs run --configLoader runner"`; `TSC=".jz/bin/jz-run --cwd poc1a node node_modules/typescript/bin/tsc --noEmit"`. `BAT="POC_TARGET_DATABASE=poc3_intake node ../contrato/run.mjs --driver contrato-driver.mjs"`.

**U2 · Validador, slug y hook.** Archivos: `src/lib/solicitudes.ts`, `src/lib/solicitudes.test.ts`, `src/lib/publico.ts`, `src/collections/Solicitudes.ts`, `test/integracion/intake-hook.int.test.ts`. Rojo: vitest IN-05 (4 campos), IN-06 (4×3 tipos), longitudes en code points (`'😀'.repeat(121)` en `nombre` falla; 120 pasa), U+0000, `__proto__`, IN-08 (5 claves → `campos_no_permitidos`), `servicio` `null`/`''`/slug inválido; integración: `create` con `context.canal='intake'` y `estado`, `motivo_cierre`, `observaciones_internas`, `id: 999999`, `createdAt: '2000-01-01T00:00:00.000Z'` → `recibida`, `null`, `''`, id distinto, `createdAt` distinto; sin canal, el admin conserva sus observaciones; `resolverServicioActivo` → id del activo, `null` para inactivo e inexistente. Verde: `$V src/lib`, `$TSC`; Docker `./poc.sh up-en poc3_intake` (topología vieja aún) y `./poc.sh exec-en poc3_intake npx vitest run --configLoader runner test/integracion/intake-hook.int.test.ts`.

**U3 · Configuración, claves, token, origen e IP.** Archivos: `src/lib/intake/{config,claves,token,origen,ip}.ts` y sus `*.test.ts`, `driver/ip-sintetica.mjs`, `src/lib/intake/ip-sintetica.test.ts`. Rojo: config (cada causa de §4 lanza; producción con mínimo 0 lanza; ausente → 3000); HKDF (32 bytes, `token ≠ ip ≠ secreto`, determinista); token (válido, firma alterada, `n` alterado, caducado, `e` futuro, `kid` desconocido, 3 partes, > 512); comparación con `timingSafeEqual` (espía) y longitudes distintas → falso; origen (exacto, `https://evil.example`, `null`, sin cabeceras, Referer `https://127.0.0.1:3443.evil.example/`, Referer inválido); IP (`::ffff:203.0.113.7` → `203.0.113.7`, dos IPv6 del mismo /64 → igual, `fe80::1%eth0` → null, `1.2.3.4, 5.6.7.8` → null); §9.7: N = 1…20000 y 0xfffeffff → /64 distintos y dentro de `2001:db8::/32`; `PURGA_ENVIO_MS ≥ TOKEN_TTL_MS`. Verde: `$V src/lib/intake test/estatico`, `$TSC`.

**U4 · Esquema y migración.** Archivos: `src/lib/intake/esquema.ts`, `src/payload.config.ts` (`afterSchemaInit`), `src/migrations/20261017_120000_poc3_intake.ts`, `src/migrations/index.ts`, `test/estatico/migracion-poc3.test.ts`. Rojo estático: la migración contiene el SQL de §3.1 con `"poc_prod".`, está registrada, su `down` borra las dos tablas, y cada tabla y columna de `esquema.ts` aparece en ella. Verde: `$V test/estatico`, `$TSC`; Docker: `./poc.sh psql -c 'CREATE DATABASE poc3_migraciones'`, `./poc.sh migrate-en poc3_migraciones` dos veces (la segunda sin pendientes), `./poc.sh psql-en poc3_migraciones -Atc "SELECT tablename FROM pg_tables WHERE schemaname='poc_prod' AND tablename LIKE 'intake_%' ORDER BY 1"` → `intake_envio`, `intake_limite`; `./poc.sh up-en poc3_intake` y la misma consulta en `public` más `SELECT conname FROM pg_constraint WHERE conrelid='public.intake_limite'::regclass` (NV-17).

**U5a · Topología.** Archivos: `proxy/nginx.conf`, `proxy/ip-cliente.produccion.conf`, `proxy/ip-cliente.pruebas.conf`, `compose.yaml`, `compose.pruebas.yaml`, `poc.sh`, `.gitignore`, `.env.example`, `playwright.config.ts`, `playwright.medicion.config.ts`, `contrato-driver.mjs` (§6: carga, `logs()`), `scripts/sonda-red.mjs`, `test/estatico/compose-proxy.test.ts`, `test/estatico/poc-sh-aislamiento.test.ts`, `README.md`. Rojo estático (lee YAML con `js-yaml`, ya presente como dependencia transitiva 4.x): `app`/`app-prod` sin `ports` ni `network_mode` y con las redes de §1.1; redes internas; proxy con el digest exacto y sólo `127.0.0.1:`; `e2e` sólo en `e2e`; la configuración de producción con las cuatro `proxy_set_header` de §1.2 y ningún `real_ip_header`/`set_real_ip_from`; `access_log off`; `client_max_body_size 1m` > 32768; ninguna `proxy_set_header` dentro de `server`; `ip-cliente.pruebas.conf` sólo referenciado en `compose.pruebas.yaml`; `compose.pruebas.yaml` sólo usado por órdenes `*pruebas*` y `up-fallos-en`. Verde: `$V test/estatico`; Docker: `./poc.sh init`, `./poc.sh up-en poc3_intake`, `./poc.sh sonda-red`, `./poc.sh up-fallos-en poc3_intake`, `POC_INTAKE_SINTETICO=1 POC_BASE_URL=https://127.0.0.1:3443 $BAT --solo <los 44 de README.md:18>` (44/44; histórico: `POC_INTAKE_SINTETICO` se retiró en U9), `./poc.sh exec-en poc3_intake npx vitest run --configLoader runner`, `./poc.sh e2e-en poc3_intake` (3/3).

**U5b · Endpoint.** Archivos: `src/app/(intake)/solicitar/route.ts`, `src/app/(intake)/api/intake/route.ts`, `src/instrumentation.ts`, `src/lib/intake/{errores,cuerpo,html,formulario,manejador,persistir,purga}.ts` y sus `*.test.ts`, `contrato-driver.mjs` (`preparar`, `enviar`, `aSolicitud`), `test/estatico/intake-reglas.test.ts` (a–d), `test/http/intake.test.ts`, `test/integracion/intake-persistir.int.test.ts`, `test/docker/ip-produccion.test.mjs`. Rojo: batería `--alcance poc-3` con IN-01…IN-10 en `fail` (no `NoImplementado`); vitest de `cuerpo` (CL > tope, stream > tope, UTF-8 inválido, JSON no objeto, urlencoded repetido), `html` (escape; `label`/`aria-*`/`role`), `escaparHtml`; HTTP (§11, filas T-01, T-03 (i), T-07, T-08, Tamaño y tipo, Origen y CSRF, Antiabuso); integración T-03 (ii) y purga con filas viejas. Verde: `$V src/lib test/estatico`, `$TSC`; Docker: `./poc.sh up-pruebas-en poc3_intake`, `./poc.sh exec-en poc3_intake npx vitest run --configLoader runner`, `POC_BASE_URL=https://127.0.0.1:3443 $BAT --alcance poc-3` (IN-01…IN-10 ok), `./poc.sh up-en poc3_intake` + `node --test test/docker/ip-produccion.test.mjs`, NV-8, regresión de U5a.

**U6 · Límites.** Archivos: `src/lib/intake/limites.ts` y su test, `manejador.ts`, `persistir.ts`, `test/http/intake.test.ts`, `test/integracion/intake-persistir.int.test.ts`. Rojo: IN-11; 5 inválidos + 1 válido → 201; 10 en paralelo desde una IP → ≤ 5 registros y el resto 429 `limite_creaciones`; reenvío de IN-09 tras 5 creaciones → 201 sin registro nuevo; 31.º intento → 429 `demasiados_intentos` antes de leer el cuerpo (con un cuerpo de 40 KiB responde 429, no 413); T-03 (iii). Verde: como U5b, IN-01…IN-11 ok.

**U7 · Logs.** Archivos: `src/lib/intake/log.ts` y `log.test.ts`, `src/lib/intake/fallos.ts`, `src/payload.config.ts` (`logger`), `manejador.ts`, `compose.yaml` (`db.command`), `test/estatico/intake-reglas.test.ts` (e, f), `test/estatico/compose-proxy.test.ts` (flags de `db`), `test/docker/logs-intake.test.mjs`, `test/docker/logs-intake-fallos.test.mjs`, `test/build/sin-inyeccion.test.mjs`. Rojo: `log.test.ts` con un pino real (`pino` 9.14.0, el que usa Payload) y un `DrizzleQueryError` real con `SNT-` en `params` emitido como `logger.error(err)`, `{err}`, `{err, msg: err.message}`, `{cause: err}` y `('x', err)`: ninguna salida contiene `SNT-` ni `stack`; `logs-intake-fallos` en `up-fallos-en` (exige 500 `interno` con `intake-pg-check`, si no falla): `intake-log-crudo`, `intake-pg-check`, `intake-pg-tipo`, `intake-fuera`, JSON roto y 413 con PII sintética; busca en proxy, `app`, `app-prod` y `db` los valores `SNT-`, las IPs sintéticas y sus /64, y exige ≥ 1 línea con `"evento":"intake"`; `logs-intake` (sin fallos) igual contra `app-prod`. Verde: `$V src/lib test/estatico`; Docker: `./poc.sh up-fallos-en poc3_intake` + `node --test test/docker/logs-intake-fallos.test.mjs`; `./poc.sh up-prod-pruebas-en poc3_intake` + `POC_BASE_URL=https://127.0.0.1:3444 node --test test/docker/logs-intake.test.mjs`; IN-12 en la batería; `./poc.sh build-en poc3_intake` y después `./poc.sh run-prod-en poc3_intake node --test test/build/sin-inyeccion.test.mjs` (dentro de `app-prod`, donde está el volumen `next_prod`; busca los marcadores de `fallos.ts` en `.next-prod/server` y falla si no existe `.next-prod`); la lógica pura de esa comprobación se prueba sin Docker con `.jz/bin/jz-run --cwd poc1a node --test test/build/comprobar-build.test.mjs`.

**U8 · Accesibilidad y E2E.** Archivos: `e2e/intake.spec.ts`, `src/lib/intake/html.ts`, `package.json`, `package-lock.json`. Instalación (humano, autorizada por P3-05): con `/app` en sólo lectura, `deps` no puede editar los manifiestos; se sigue A4 del gate (`./poc.sh manifest-patch-axe`, parche generado en el host y aplicación humana revisada), y después `./poc.sh deps` (`npm ci`). Rojo: sólo teclado (Tab: nombre → contacto → tipo_equipo → descripcion → servicio → Enviar; la trampa no recibe foco), envío vacío → foco en `nombre`, `role="alert"`, `aria-invalid`/`aria-describedby`; envío válido → `role="status"`; con `javaScriptEnabled: false` igual; `AxeBuilder` con `wcag2a`, `wcag2aa` y 0 violaciones en el formulario vacío, con errores y tras el éxito; la cookie `__Host-intake` aparece con `secure: true`. Verde: `./poc.sh e2e-en poc3_intake` y `./poc.sh e2e-prod-en poc3_intake`.

**U9 · Retirada de R-1 y mediciones.** Archivos: borrar `scripts/solicitud-sintetica.ts`; `contrato-driver.mjs` (sin la rama R-1); `test/estatico/guardas-base.test.ts` (3 archivos); `README.md`; `EVIDENCIA.md`; `medicion/intake-latencia.mjs`. Rojo: la batería de 44 sin `POC_INTAKE_SINTETICO` (antes de quitar R-1 debe pasar ya por el intake real). Verde: `up-fallos-en` + `POC_BASE_URL=https://127.0.0.1:3443 $BAT --solo <44>`; `up-prod-pruebas-en` + `POC_BASE_URL=https://127.0.0.1:3444 POC_RESET_ENV='POC_DB_SCHEMA=poc_prod POC_MEDIA_DIR=/app/media-store-prod' $BAT --solo <44 o 43, P-U1-01>`; `--alcance poc-3` 12/12 en los dos; `node medicion/intake-latencia.mjs` (3 series de 50 POST contra 3444, IP nueva por envío; mediana de las medianas y p95 del POST, sin GET ni espera; 150 envíos legítimos distintos → 150 registros, falsos positivos 0); tabla D-08 (desafío externo en papel: datos que recibe, coste, accesibilidad, dependencia) en `EVIDENCIA.md`.

## 11. Matriz de cobertura

| Elemento | Sección | Prueba roja | Unidad | Ejecución |
|---|---|---|---|---|
| IN-01 | §2.2, §2.3, §3.3 | batería IN-01 (`fail` sin endpoint); `{"ok":true}` sin eco | 5 | Docker |
| IN-02 | §2.3, §6 (`aSolicitud`) | vitest `resolverServicioActivo`; batería IN-02 | 2, 5 | Docker |
| IN-03 | §2.3 | integración: inactivo → `null`; batería IN-03 | 2, 5 | Docker |
| IN-04 | §2.3 | integración: inexistente → `null`; batería IN-04 | 2, 5 | Docker |
| IN-05 | §2.3 | vitest 4 obligatorios ausentes; batería | 2, 5 | jz-run + Docker |
| IN-06 | §2.3 | vitest 4×3 tipos; batería | 2, 5 | jz-run + Docker |
| IN-07 | §2.2 paso 5, §1.2 | vitest 4001 code points; HTTP 64 KiB por el proxy → 413 `cuerpo_demasiado_grande` | 2, 5 | jz-run + Docker |
| IN-08 | §2.3, §3.3 (hook) | vitest `campos_no_permitidos`; integración del hook; batería | 2, 5 | jz-run + Docker |
| IN-09 | §3.3 paso 2 | batería IN-09 | 5 | Docker |
| IN-10 | §3.3 | batería IN-10; medición de falsos positivos | 5, 9 | Docker |
| IN-11 | §3.4, §6 | batería IN-11 (`fail` en 5) | 6 | Docker |
| IN-12 | §5 | `logs-intake*.test.mjs` con fuga deliberada y ≥ 1 línea `evento`; batería IN-12 | 7 | Docker |
| §5 Validación | §2.3 | vitest del validador y del slug | 2 | jz-run + Docker |
| §5 Autorización | §3.3, §5.3 (a) | integración del hook; regla estática; AU-*/PR-* en la regresión | 2, 5, 9 | jz-run + Docker |
| §5 Origen y CSRF | §2.2 pasos 4 y 7, §4 | vitest token/origen; HTTP: sin token, alterado, caducado, cookie distinta, Origin ajeno, `null`, sin Origin ni Referer, Referer engañoso → 403 sin registro; urlencoded con token malo → 403 | 3, 5 | jz-run + Docker |
| §5 Límite | §3.4, §2.2 paso 2 | HTTP de U6 | 6 | Docker |
| §5 Antiduplicados | §3.3 | IN-09, IN-10, 2 POST simultáneos del mismo nonce → 1 registro | 5 | Docker |
| §5 Antiabuso | §2.2 paso 8, §4 | vitest config (0 en producción); HTTP trampa y envío antes de 200 ms → 400 `envio_rechazado` | 3, 5 | jz-run + Docker |
| §5 Tamaño y tipo | §2.2 pasos 3, 5, 6 | vitest `cuerpo`; HTTP 415 `text/plain`, 413 chunked y con CL falso | 5 | jz-run + Docker |
| §5 Secretos | §4 | vitest HKDF y config; NV-8 | 3, 5 | jz-run + Docker |
| §5 Privacidad y retención | §3.1, §3.5 | vitest constantes de purga; integración de purga; IN-01 | 3, 5 | jz-run + Docker |
| §5 Logs | §5 | `log.test.ts`; `logs-intake*.test.mjs` | 7 | jz-run + Docker |
| §5 Accesibilidad | §2.4 | `e2e/intake.spec.ts` (teclado y axe) | 8 | Docker |
| §5 Medición | §10 U9 | `medicion/intake-latencia.mjs` | 9 | Docker |
| T-01 | §1.2, §2.2 paso 1, §4 | (i) `compose-proxy.test.ts`; (ii) `ip-produccion.test.mjs`: 6 creaciones con `X-Real-IP`, XFF y `X-Poc-Ip-Sintetica` forjados y distintos → la 6.ª 429; (iii) vitest IP | 3, 5, 6 | jz-run + Docker |
| T-02 | §1.1 | `compose-proxy.test.ts`; `poc.sh sonda-red` | 5 | jz-run + Docker |
| T-03 | §3.3 | (i) HTTP simultáneo; (ii) integración `trasReserva` lanza y el mismo nonce deja 1 registro; (iii) con 4 creaciones, `trasCupo` lanza y la 5.ª se acepta; (iv) vitest purga ≥ TTL | 3, 5, 6 | jz-run + Docker |
| T-04 | §3.4, §6 | U6; vitest §9.7 | 3, 6 | jz-run + Docker |
| T-05 | §5.1–5.4 | (i) `log.test.ts`; (ii) `intake-log-crudo`; (iii) PG real, JSON roto, 413, `intake-fuera`; (iv) reglas (f) y `test/build/` | 7 | jz-run + Docker |
| T-06 | §5.5 | `intake-pg-check` e `intake-pg-tipo` sin valores en logs de `db` (D3) | 7 | Docker |
| T-07 | §2.1, §2.2 paso 7, §4 | HTTP GET contra 3443 y 3444 (cookie, `Cache-Control`, 2 nonces); E2E de cookie; vitest config https; matriz CSRF | 3, 5 | jz-run + Docker |
| T-08 | §1.2, §2.2 paso 5 | desde `app`: chunked 40 KiB a `127.0.0.1:3000` y `app-prod:3000` → 413 propio; CL 40000 → 413 sin leer; CL 100 con 40 KiB → 400 (NV-6) | 5 | Docker |
| T-09 | §1.2, §6 | (i) 0b; (ii) IPs sintéticas y /64 en `logs-intake*` | 0b, 7 | jz-run + Docker |
| T-10 | §7 | batería de 44 sin R-1 en 3443 y 3444 | 9 | Docker |
| T-11 | §1.4, §6 | `guardas-base.test.ts` (unidad 0b) | U0b | jz-run |
| T-12 | §11 | ausencia de cualquiera de las notas `.jz-state/notes/poc3-u1-{security,qa}.md` bloquea la aceptación | U1 | jz-run + revisión documental |
| T-13 | §4, §7 | vitest mínimo 0 en producción; batería `app-prod` con 200 ms | 3, 9 | jz-run + Docker |
| §9.1 | §1.1, §1.2 | `compose-proxy.test.ts`; `ip-produccion.test.mjs` | 5 | jz-run + Docker |
| §9.2 | §5.1, §5.5 | `log.test.ts` (mensaje de drizzle); logs de `db` | 7 | jz-run + Docker |
| §9.3 | §3.3 | T-03 (ii) y (iii) | 5, 6 | Docker |
| §9.4 | §3.5 | vitest `PURGA_ENVIO_MS ≥ TOKEN_TTL_MS` | 3 | jz-run |
| §9.5 | §1.4, §6 | 0b (`verificar-db.ts:7`, `solicitud-sintetica.ts:7`) | U0b | jz-run |
| §9.6 | §2.1, §1.3 | HTTP GET y E2E de cookie sobre https (sin variante http, P3-10) | 5 | Docker |
| §9.7 | §6 | vitest N orígenes → /64 distintos | 3 | jz-run |
| §9.8 | §1.2 | T-08 | 5 | Docker |
| §9.9 | §7 | T-13 | 3, 9 | jz-run + Docker |
| §9.10 | §11 | ausencia de la nota de jz-security o de jz-qa bloquea la aceptación | U1 | jz-run + revisión documental |

## 12. Riesgos de uso no cubiertos por las IN-* (cada uno con su prueba asignada)

1. **Dos pestañas:** el segundo GET sobrescribe la cookie y el primer formulario da 403 `csrf_invalido`; el HTML lo explica («vuelve a cargar el formulario»). E2E de U8: dos páginas, la primera recibe el mensaje.
2. **Fallo de validación sin JS:** el usuario pierde lo escrito (sin eco). E2E de U8 comprueba al menos que el foco y el resumen indican qué corregir.
3. **Emoji y combinaciones:** el límite es en code points, no en grafemas. Vitest de U2 con 120 emoji (pasa) y 121 (falla).
4. **Reloj del contenedor:** un `e` futuro más allá de 5 s invalida el token. Vitest de U3.
5. **Retry-After en el borde de la ventana:** nunca 0 ni negativo. Vitest de U6 con `ahora` en el último segundo de la ventana.
