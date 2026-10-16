# Plan preparado de POC-3 · Intake seguro (candidata A)

Estado: **preparado, no autorizado** (2026-10-16). POC-3 requiere su propia entrada de autorización (H0A-16c, según H0A-16). Este plan no elige el stack definitivo (ADR-0001), no instala nada y no crea ramas. Trabaja sobre el stack de POC-1 (candidata A: Next.js 16.4.1, Payload 3.90.2, PostgreSQL 18.6, Node 24 en contenedor), como fija el contrato de POC-3.

Fuentes:

- `docs/REGISTRO-DECISIONES-H0A.md`: «POC-3 · Intake seguro» y H0A-02/03/04/10/11/14/16.
- `docs/ROADMAP-MVP.md`: D-08, D-09, D-16, INV-09 y R-04.
- `contrato/casos/intake.mjs`: casos IN-01 a IN-12.
- `poc1a/EVIDENCIA.md` y `poc1a/HANDOFF-POC-1B.md`.

Revisión: jz-security y jz-qa revisaron la primera versión en modo lectura (2026-10-16, sin aprobarla). Esta versión incorpora sus hallazgos; el §8 indica dónde.

## 1. Punto de partida

- **POC-1a:** cerrada (13/13).
- **POC-1b:** cerrada en `d0929b9`, con estos resultados:
  - batería explícita 44/44 (13 de POC-1a + 31 de POC-1b);
  - vitest 72/72, contrato 43/43 y E2E 3/3;
  - revisión de jz-security y jz-qa aprobada.
- **Infraestructura de autonomía:** integrada en `27e3323`.
- **Casos `IN-*`:** los 12 siguen en `NoImplementado` (alcance `poc-3`). Nada obtenido con R-1 cuenta como evidencia para ellos (`EVIDENCIA.md:143,160`).
- **Fuera de POC-3:** siguen abiertas las decisiones de producto M3 (recuperación de contraseña abierta) y B7 (id de medio privado expuesto).

## 2. Los 12 casos pendientes

| Caso | Exige | Prueba (a)–(e) |
|---|---|---|
| IN-01 | Envío válido: 2xx, sin eco de nombre, contacto ni descripción; un registro nuevo en `recibida`, con `motivo_cierre` nulo y observaciones vacías | — |
| IN-02 | Con servicio activo, enviado como **slug** (`fixture.mjs`, `snt-servicio-activo`): se guarda la referencia (`intake.mjs:49` compara con el slug de `refs`) | — |
| IN-03 | Con servicio inactivo: rechazo 400–429, sin registro | (d) |
| IN-04 | Con servicio inexistente: rechazo, sin registro | (d) |
| IN-05 | Falta un obligatorio (los 4, de uno en uno): rechazo, sin registro | — |
| IN-06 | Tipos no texto (número, objeto o lista) en los 4 obligatorios: rechazo | — |
| IN-07 | `descripcion` de 64 KiB: rechazo | — |
| IN-08 | `estado`, `motivo_cierre`, `observaciones_internas`, `id` o `creada_en` en el payload: rechazo o ignorados, nunca guardados | (a) |
| IN-09 | El mismo envío (mismo `preparar`) dos veces: un registro y ningún 5xx | (b) |
| IN-10 | Dos envíos legítimos distintos: dos registros, sin falsos positivos | reenvío legítimo |
| IN-11 | Hasta `limite.max` aceptados por origen; el siguiente se deniega sin registro; otro origen se acepta | (c) |
| IN-12 | Los logs, incluidos los del framework, no contienen nombre, contacto, equipo ni descripción, ni en envíos válidos ni en inválidos | (e) |

El contrato de POC-3 exige además:

- pruebas de CSRF y de origen inválido;
- formulario usable con teclado y lector de pantalla;
- medir la latencia y los falsos positivos del antiduplicados.

No hay casos `IN-*` para esto: se añaden como pruebas vitest, HTTP y E2E propias del POC (§5 y §6).

Dos casos del contrato no tienen rojo propio:

- **IN-12** pasa por vacuidad si no se acepta ningún envío o `logs()` no devuelve líneas.
- **IN-07** acepta cualquier código entre 400 y 429.

Por eso las unidades 7 y 5 añaden pruebas propias que sí fallan.

## 3. Flujo del intake público

**Frontera de red (requisito previo para IN-11).** Un route handler de Next 16 no ve la IP del socket. Hoy la app recibe a todos los clientes del host con la IP del gateway del bridge (`compose.yaml:48-49`), y `e2e` comparte la red de `app` (`compose.yaml:86`). Fiarse del gateway o de loopback permitiría falsificar `X-Forwarded-For`; no fiarse dejaría un único cupo global. Por eso:

- un proxy inverso (un servicio nuevo de Compose; su imagen requiere autorización, ver P3-02) es el único punto de entrada;
- el proxy **sobrescribe** `X-Real-IP` con `$remote_addr`;
- la app sólo es alcanzable desde el proxy por una red `internal`, sólo lee `X-Real-IP` y valida que tenga formato de IP;
- las IPv6 se agrupan por /64 y las IPv4-mapped se normalizan;
- en producción, la ausencia de `X-Real-IP` se rechaza.

Para las pruebas, un override de Compose separado permite que el driver indique una IP sintética (`203.0.113.N` o `2001:db8::/32`), y un test comprueba que la configuración de producción ignora el XFF que envía el cliente.

```
GET /solicitar (página dinámica, Cache-Control: no-store, private)
  └─ el token de formulario se emite en un route handler o en proxy.ts (un Server Component
     no puede fijar cookies): {kid, nonce de 128 bits, emitido_en, expira_en} firmado con HMAC.
     Va en un campo oculto y en la cookie __Host-intake; Path=/; Secure; HttpOnly; SameSite=Strict

POST /api/intake (route handler propio; nunca la REST genérica de Payload)
  1. Content-Type: sólo application/json (y x-www-form-urlencoded si el formulario debe funcionar
     sin JS; ver P3-08) → 415
  2. Origen: Origin exacto == ORIGEN_PUBLICO (de la configuración, nunca de Host ni de
     X-Forwarded-Host). Sin Origin se usa new URL(Referer).origin == ORIGEN_PUBLICO.
     Sin ninguno de los dos, u Origin "null" → 403
  3. CSRF: el token del cuerpo y el de la cookie son iguales (timingSafeEqual), con firma válida
     y sin caducar → 403
  4. Límite de INTENTOS por IP (umbral alto, por ejemplo 30 cada 10 min) → 429
  5. Lectura del cuerpo en streaming con tope en bytes (por ejemplo 32 KiB, alineado con las
     longitudes en code points), aunque el cuerpo llegue chunked o con un Content-Length falso → 413
  6. Parseo protegido: un JSON malformado da 400 con un código fijo; el SyntaxError nunca se registra
  7. Antiabuso propio (D-08, familia «controles en servidor»): campo trampa vacío y tiempo mínimo de
     rellenado desde emitido_en, configurable por entorno (bajo en la batería; un test impide
     ponerlo a 0 con NODE_ENV=production) → 400 genérico
  8. Validación por lista blanca: nombre, contacto, tipo_equipo, descripcion y servicio. Son
     strings no vacíos con longitudes máximas en code points. Las claves extra o administrativas
     dan 400 (IN-08). servicio es un slug opcional que se resuelve a id con activo=true; si no se
     encuentra o está inactivo → 400 (IN-02/03/04)
  9. Una transacción:
     a. INSERT INTO intake_envio(clave) VALUES (HMAC(nonce)) ON CONFLICT DO NOTHING RETURNING.
        Si no devuelve fila → 201 idéntico, sin crear nada (IN-09)
     b. Límite de CREACIONES por IP (limite.max, por ejemplo 5 cada 10 min). Si se supera → 429
        y rollback (IN-11). Un reenvío idempotente no cuenta
     c. Creación con la Local API (overrideAccess sólo aquí, req.context.canal='intake',
        select sólo id)
 10. Respuesta 201 {ok:true}, sin eco ni id (IN-01). Los errores son {error:<código>}
 11. Log estructurado: {evento, codigo, duracion_ms, correlacion, err_name, pg_code}. Nunca err,
     message, stack, query, params ni el cuerpo (IN-12)
```

**Relación con las solicitudes actuales:**

- La colección `solicitudes` y sus reglas (H0A-02/03/04) no cambian. `access.create` sigue siendo `soloAdmin`, de modo que la REST y la GraphQL de Payload siguen cerradas al público. AU-* y PR-* deben seguir en verde.
- El hook `beforeChange` de create sólo fuerza `estado` y `motivo_cierre` (`Solicitudes.ts:14-17`). Con `overrideAccess: true` se omite además `soloAdminCampo`. Se amplía para que, cuando `req.context.canal === 'intake'`, fuerce `observaciones_internas = ''` y elimine `id`, `createdAt` y `updatedAt`. Así la validación del paso 8 no queda como única barrera.
- Las tablas nuevas `intake_envio(clave bytea PK, creada_en)` e `intake_limite(clave_hmac, tipo, ventana, n)` están separadas de `solicitudes`, sin PII y con purga de las ventanas que superen 2× su duración. Se crean en una migración incremental, verificada desde cero como en POC-1b.

**Driver del contrato:**

- `intake.preparar(payload)` hace `GET /solicitar` y devuelve `{ payload, token, cookie }`.
- `intake.enviar(envio, { origen })` hace el `POST` y asigna a cada `origen` una IP sintética estable (`origen-sintetico-N` → `203.0.113.N`). Así IN-11 usa orígenes distintos y la batería no comparte cupo.
- `limite.max` declara el valor configurado.

## 4. R-1: qué se reutiliza y qué se sustituye

**Decisión propuesta (P3-09):** al cerrar POC-3, los 44 casos de POC-1a/1b corren contra el intake real, con una IP sintética por llamada. R-1 se retira en la unidad 9, después de demostrar 44/44 sin él. Hasta entonces convive como modo explícito `POC_INTAKE_SINTETICO=1`, para que la línea base no se rompa a mitad de camino.

| Elemento de R-1 / POC-1b | Destino en POC-3 |
|---|---|
| `solicitudPublica()` (`src/lib/solicitudes.ts:9-12`, sólo copia 5 campos) | Se reutiliza como primera etapa y se amplía con tipos, longitudes, claves extra y la resolución del slug del servicio |
| Hook `beforeChange` de `Solicitudes` | Se reutiliza y se amplía para el canal `intake` (§3) |
| `scripts/solicitud-sintetica.ts`, `POC_INTAKE_SINTETICO` y `poc.sh exec-en` | Se sustituyen por el endpoint real; se retiran en la unidad 9 (P3-09) |
| Driver: `limite.max: 1`, el `origen` ignorado y el mapeo de `rc` a 201/400 | Se sustituyen: HTTP real, `max` configurado y origen convertido en IP sintética |
| Guardas `poc1b_*` (`poc.sh:8-16`, `contrato-driver.mjs:12-15`) | Se generalizan a `poc(1b\|3)_` con una prueba roja (unidad 0b); si no, la base `poc3_*` no arranca. Hay que revisar también `scripts/verificar-db.ts` y `scripts/reset-e2e.mjs` |
| `driver.logs()` (`poc.sh logs-since`, un único servicio) | Se reutiliza y se amplía a todos los servicios (proxy, `app` y `app-prod`) |

## 5. Controles y pruebas

| Control | Diseño | Prueba |
|---|---|---|
| Validación | Lista blanca, tipos, longitudes en code points y slug de servicio activo | IN-02..08; vitest del validador y de la resolución del slug |
| Autorización | Endpoint anónimo sólo de creación; la colección sigue con `soloAdmin`; la creación devuelve sólo el id; el hook del canal `intake` | IN-01, IN-08, AU-*/PR-* de regresión; vitest con la Local API que intenta guardar `observaciones_internas`, `id` y `createdAt` |
| Origen y CSRF | Origin/Referer exactos, `__Host-` y doble envío firmado con `timingSafeEqual` | HTTP, todos con 403 y sin registro: sin token, token alterado, caducado, cookie distinta, `Origin: https://evil.example`, `Origin: null`, sin Origin ni Referer y Referer `https://<origen>.evil.example/` |
| Límite | Dos contadores atómicos (`UPSERT`) en PostgreSQL, por IP o /64; el reenvío idempotente no cuenta | IN-11; 5 inválidos seguidos de 1 válido, que se acepta; 2×max en paralelo no supera max; un reenvío de IN-09 no consume cupo |
| Antiduplicados | `intake_envio` con `ON CONFLICT DO NOTHING` en la transacción | IN-09, IN-10, dos envíos simultáneos del mismo nonce (un registro) y falsos positivos medidos (0 esperados) |
| Antiabuso (D-08) | Implementado: límite, campo trampa y tiempo mínimo configurable. En papel: un servicio de desafío externo, sin proveedor, con datos que recibe, coste, accesibilidad y dependencia | vitest del campo trampa y del tiempo mínimo (incluido el test que impide 0 en producción); tabla en `EVIDENCIA` |
| Tamaño y tipo | Lectura en streaming con tope; sólo `application/json` | 413 con chunked sin Content-Length y con Content-Length falso; 415 con `text/plain` |
| Secretos | Claves separadas derivadas con HKDF (`intake-token-v1`, `intake-ip-v1`) desde un secreto propio de ≥ 32 bytes, nunca `PAYLOAD_SECRET`; `kid` en el token; la app no arranca si falta el secreto | vitest de la derivación y del arranque sin secreto |
| Privacidad y retención | IP sólo como HMAC; purga de ventanas; sin eco | IN-01; vitest de la purga |
| Logs | Captura total en el handler; `redact` o serializador en el logger de Payload que elimina `err.params`, `err.query` y `err.cause` (drizzle-orm 0.45.2 incluye los `params` en el mensaje, `errors.js:12-15`) | IN-12 ampliado (unidad 7) |
| Accesibilidad | `<label>` explícitos, `aria-describedby` y `role="alert"` en los errores, foco en el primer error, teclado completo y sin depender del color | E2E por teclado y auditoría automática (P3-05) |
| Medición | Latencia del POST (mediana de 3 series) | `poc1a/medicion/` |

Regla de decisión (contrato de POC-3): si no se pueden evitar las PII en los logs del framework sin eludirlo, se rechaza el mecanismo, no el stack, y ese punto vuelve a POC-1.

## 6. Plan TDD por unidades

Hay un escritor por worktree (`jz-implementer`); los demás roles son de lectura. Cada unidad sigue rojo → verde → `jz-run` → commit. Los revisores verifican la evidencia de `.jz-state/runs.jsonl` y la de las ejecuciones con Docker.

Columna «Ejecución»:

- **jz-run:** autónoma, sin red ni Docker (vitest unitario o estático, `tsc` y `node --test`).
- **Docker:** `poc1a/poc.sh`. La lanza el humano mientras no exista el ejecutor de `docs/PROPUESTA-EJECUTOR-INTEGRACION.md`.

| # | Unidad | Responsable | Rojo previo | Verde | Ejecución |
|---|---|---|---|---|---|
| 0 | Línea base | humano + orquestador | — | Batería 44/44 `--solo`, `--alcance poc-1a` sin fallos, vitest 72/72 y `tsc`. Si algo falla, se detiene | Docker |
| 0b | Guardas de base `poc(1b\|3)_` | jz-implementer | Test estático de `poc.sh` y del driver que exija aceptar `poc3_x` y rechazar `poc_prod` y `poc` | El mismo test | jz-run |
| 1 | Diseño fino `docs/POC-3-DISENO.md`: rutas, códigos, esquemas, proxy y driver; cada IN-* y cada control de §5 con su prueba roja y su criterio | jz-architect (sólo `docs/`) | — | jz-security deja una nota de revisión en `.jz-state/notes/` antes de la unidad 2 | — |
| 2 | Validador puro, resolución del slug y hook del canal `intake` | jz-implementer | vitest IN-05/06/07/08 sobre la función; Local API con campos administrativos | vitest `src/lib` | jz-run (validador); Docker (hook con la Local API) |
| 3 | Token (HKDF, `kid`, caducidad), Origin/Referer y extracción de la IP de `X-Real-IP` | jz-implementer | vitest de firma, alteración, caducidad, `null`, sin cabeceras, Referer con prefijo engañoso e IPv6 /64 | vitest | jz-run |
| 4 | Migración de `intake_envio` e `intake_limite` | jz-implementer | Test estático de la migración | Estático; desde cero en `poc3_*` | jz-run + Docker |
| 5 | Proxy, `GET /solicitar` y `POST /api/intake` con límite de cuerpo y tipo | jz-implementer | Driver real: IN-01..10 pasan de `NoImplementado` a `fail`; HTTP de CSRF/origen, 413 chunked y 415; idempotencia simultánea | Batería `--alcance poc-3` y HTTP | Docker |
| 6 | Límites de intentos y de creaciones | jz-implementer | IN-11, inválidos seguidos de válido, concurrencia y reenvío sin consumo | Ídem | Docker |
| 7 | Logs sin PII | jz-implementer | Test propio que **falla** con una fuga deliberada y exige al menos una línea `evento`; JSON roto con PII sintética, 413 y fallo de BD inyectado durante el insert; logs de todos los servicios, también `app-prod` | IN-12 y el test propio; jz-security revisa el `redact` | Docker |
| 8 | Accesibilidad y E2E | jz-implementer | E2E de teclado y auditoría (P3-05) en rojo | Playwright | Docker |
| 9 | Retirada de R-1, mediciones y antiabuso en papel | jz-implementer + jz-architect | Batería de 44 sin `POC_INTAKE_SINTETICO` | 44/44 contra el intake real; latencia, falsos positivos y tabla D-08 en `EVIDENCIA.md` | Docker |
| 10 | Revisión del hito | jz-security + jz-qa (lectura) | — | Una revisión exhaustiva al cierre y, como máximo, dos ciclos de corrección | — |

**Criterio de cierre:**

- batería `--alcance poc-3` 12/12 IN-*;
- regresión de 44/44 contra el intake real;
- vitest y `tsc` en verde;
- E2E en verde, con teclado y auditoría;
- CSRF y origen con 403 sin registro;
- mediciones registradas;
- jz-security y jz-qa sin defectos importantes abiertos.

## 7. Decisiones del responsable antes de empezar

- **P3-01 · Autorización H0A-16c:** candidata A, sólo local, rama nueva `poc/candidata-a-3` desde el cierre de POC-1b (o continuar en `poc/candidata-a-1b`), mismo proyecto Compose, base `poc3_*` nueva.
- **P3-02 · Proxy inverso:** se añade un servicio de proxy al Compose del POC (imagen fijada por digest; requiere autorizar la imagen) con la sobrescritura de `X-Real-IP` descrita en §3, y un override de pruebas con IP sintética. Sin proxy, IN-11 no se puede implementar de forma segura.
- **P3-03 · Campos administrativos:** rechazarlos (recomendado) o ignorarlos (IN-08).
- **P3-04 · Valores provisionales:**
  - intentos: 30 cada 10 min;
  - creaciones (`max`): 5 cada 10 min;
  - longitudes: nombre ≤ 120, contacto ≤ 200, tipo_equipo ≤ 120 y descripcion ≤ 4000 code points;
  - cuerpo ≤ 32 KiB;
  - tiempo mínimo: 3 s en producción.
- **P3-05 · Auditoría de accesibilidad:** requiere una dependencia nueva (por ejemplo `@axe-core/playwright`, versión fijada) y, por tanto, autorizar su instalación. La alternativa es una lista manual con lector de pantalla, más débil.
- **P3-06 · Secreto del intake:** propio, desechable y de ≥ 32 bytes, en el `.env` de la POC; nunca en el repositorio ni derivado de `PAYLOAD_SECRET`.
- **P3-07 · Ejecución con Docker:** sin el ejecutor aislado, las unidades 0, 2 (hook), 4 (desde cero) y 5–9 las lanza el humano.
- **P3-08 · Formulario sin JavaScript:** si debe funcionar sin JS, se acepta además `x-www-form-urlencoded`, con el mismo CSRF.
- **P3-09 · Retirada de R-1:** retirar R-1 al cierre (recomendado) o mantenerlo como modo explícito.

## 8. Trazabilidad de la revisión (2026-10-16)

- **jz-security**, primera versión no aprobada:
  - 1: IP y proxy → §3, P3-02.
  - 2: Origin, Referer y `__Host-` → §3 paso 2, §5.
  - 3: orden del límite e IPv6 → §3 pasos 4 y 9b, §5.
  - 4: idempotencia y caché del nonce → §3 pasos 9a y GET.
  - 5: PII en drizzle y JSON → §3 pasos 6 y 11, unidad 7.
  - 6: hook con `overrideAccess` → §3, unidad 2.
  - 7: tamaño en streaming y Content-Type → §3 pasos 1 y 5.
  - 8: HKDF y purga → §5, P3-06.
- **jz-qa**:
  - 1: guardas `poc1b_` → unidad 0b.
  - 2: origen en el driver → §3 (driver).
  - 3: tiempo mínimo en la batería → §3 paso 7.
  - 4: slug del servicio → §2, §3 paso 8.
  - 5: IN-12 por vacuidad → §2, unidad 7.
  - 6: R-1 frente al driver real → §4, P3-09.
  - 7: rojo de CSRF y GET → unidad 5.
  - 8: Docker por unidad → columna «Ejecución».
  - 9: el hook → §3.
  - 10: 413 chunked → §5.
  - 11: orden del límite → §3.
  - 12: criterio de la unidad 1 → unidad 1.
- **Ciclo 2** (re-verificación): jz-security da 9 hallazgos resueltos y 3 parciales, sin críticos. jz-qa da 9 resueltos y 3 parciales. Los dos consideran el plan **aprobable para presentar**, a condición de cumplir los criterios del §9. No hay un tercer ciclo de corrección.

## 9. Criterios obligatorios de la unidad 1 (residuales de la revisión)

`docs/POC-3-DISENO.md` no se acepta, ni empieza la unidad 2, si no resuelve estos puntos. Cada uno tiene su prueba roja.

1. **Sin accesos directos a la app.** Con el proxy, `app` y `app-prod` dejan de publicar 3101/3102 y `e2e` deja de compartir la red de `app` (`compose.yaml:48-49,70-71,86`). Test: un `X-Real-IP` enviado por el cliente queda sobrescrito con la configuración de producción.
2. **Logs:**
   - el serializador del logger sustituye también `message`/`msg` de los `DrizzleQueryError`, porque drizzle incrusta los `params` en el mensaje;
   - IN-12 revisa también los logs de `db` (PostgreSQL escribe valores en `DETAIL`/`invalid input syntax`), o su exclusión se justifica y se configura (`log_error_verbosity`).
3. **Atomicidad del paso 9.** `intake_envio`, `intake_limite` y `payload.create` comparten la transacción de Payload (`req.transactionID` y la sesión drizzle de esa transacción). Rojo: un fallo inyectado en 9c y después el mismo nonce deben dejar exactamente 1 registro. Lo mismo para el contador de 9b.
4. **Purga.** La purga de `intake_envio` es ≥ TTL del token.
5. **Guardas de base.** El rojo de la unidad 0b cubre además `scripts/verificar-db.ts:7` y `scripts/solicitud-sintetica.ts:7` (R-1 convive hasta la unidad 9).
6. **`GET /solicitar`.** Rojo en la unidad 5:
   - `Cache-Control: no-store, private`;
   - atributos de `__Host-intake` (y que Chromium la acepte sobre `http://127.0.0.1`; si no, se define una variante sólo para el POC con su justificación);
   - un nonce distinto en cada GET.
7. **IP sintética.** Se define un mapeo con capacidad suficiente (por ejemplo, el índice en los 64 bits altos dentro de `2001:db8::/32`), con un test que compruebe que N orígenes distintos siguen siendo distintos tras normalizar a /64.
8. **413 desde la app.** El test golpea la app por la red interna, y el `client_max_body_size` del proxy no impide llegar al tope en streaming de la app.
9. **Servicio objetivo y tiempo mínimo.** Hay que fijar contra qué servicio corren IN-*, E2E y la regresión de 44 (`app`, `app-prod` o ambos) y qué tiempo mínimo no nulo usa la batería en `app-prod`.
10. **Aceptación de la unidad 1.** Además de la nota de jz-security, jz-qa revisa la cobertura: los 12 IN-*, los controles del §5 y el driver.
