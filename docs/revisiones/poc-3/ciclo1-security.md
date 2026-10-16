# Revisión de seguridad: PLAN-POC-3 y PROPUESTA-EJECUTOR-INTEGRACION

No apruebo ninguno de los dos documentos tal como están. Hay 2 hallazgos críticos y 10 importantes. Los que deben corregirse antes de autorizar son el 1, 4, 5, 9, 10 y 11.

## A. Intake público (`docs/PLAN-POC-3.md`)

**1. [Crítico] La IP del cliente no es fiable y la opción A de P3-02 no se puede implementar tal como está escrita.**
- **Evidencia:**
  - El plan (`PLAN-POC-3.md:44` y `:122`) supone que la app comprueba si la conexión viene de una IP de `TRUSTED_PROXIES`.
  - Desde Next 15, `NextRequest` ya no tiene `ip`, y un route handler no ve la dirección del socket. Esto lo sé por la versión de Next; no lo comprobé ejecutando.
  - `poc1a/compose.yaml:48-49` publica en `127.0.0.1:3101`, así que la app ve a todos los clientes del host con la IP del gateway del bridge.
  - En `compose.yaml:86`, `e2e` usa `network_mode: service:app`, así que su IP es 127.0.0.1.
  - `contrato/casos/util.mjs:7` genera orígenes como cadenas (`origen-sintetico-N`), no como IP.
- **Efecto:**
  - Si se confía en el gateway o en loopback, cualquiera falsifica `X-Forwarded-For` y salta el límite de IN-11.
  - Si no se confía, todos comparten un único bucket: 5 envíos cada 10 minutos para todo el mundo, es decir, una denegación de servicio global.
- **Corrección:**
  - La frontera de confianza tiene que ser de red. Un proxy inverso, único punto de entrada, **sobrescribe** `X-Real-IP` con `$remote_addr` (no añade al valor recibido).
  - La app sólo es alcanzable por una red `internal` desde ese proxy. Lee únicamente ese header, valida que tenga formato de IP y, en producción, rechaza la petición si falta.
  - El proxy de pruebas va en un override de Compose distinto. Un test comprueba que la configuración de producción ignora el XFF que envía el cliente.
  - IPv6 se agrupa por /64, y las direcciones IPv4-mapped se normalizan.

**2. [Importante] La comprobación de origen y CSRF tiene huecos.**
- **Evidencia:**
  - `:41` no define qué pasa si faltan a la vez Origin y Referer, ni cómo se trata `Origin: null`, ni cómo se compara el Referer.
  - `:38`: la cookie no lleva el prefijo `__Host-`.
  - `:83`: las pruebas no cubren esos casos.
- **Efecto:** una implementación literal puede dejar pasar peticiones sin cabeceras, o con un Referer como `https://jozeuzz.cl.evil.example/` si se compara por prefijo.
- **Corrección:**
  - Responder 403 si faltan las dos cabeceras o si Origin es `null`.
  - Comparar de forma exacta: `new URL(referer).origin === ORIGEN_PUBLICO`.
  - `ORIGEN_PUBLICO` sale de la configuración, nunca de `Host` ni de `X-Forwarded-Host`.
  - Cookie `__Host-…; Path=/; Secure; HttpOnly; SameSite=Strict`.
  - Comparar el token con `timingSafeEqual`.
  - Añadir esos casos a las pruebas.

**3. [Importante] El orden del rate limit bloquea a usuarios legítimos y se puede eludir con IPv6.**
- **Evidencia:** en `:44` y `:80` el contador (paso 4) va antes de la validación (6) y de la idempotencia (7).
- **Efecto:**
  - Un doble clic o unos cuantos errores de validación agotan la cuota de 5. Eso contradice «un reenvío legítimo no queda bloqueado» (`REGISTRO-DECISIONES-H0A.md:138`).
  - El CGNAT móvil hace que muchos usuarios compartan IP.
  - Con IPv6, un atacante rota direcciones dentro de su /64 sin límite.
- **Corrección:**
  - Dos contadores. Uno de intentos por IP, con umbral alto (p. ej. 30 cada 10 minutos), antes de validar. Otro de creaciones (`max`), que se incrementa en la misma transacción que la inserción y sólo si se crea el registro.
  - El reenvío idempotente no cuenta.
  - Clave por /64 en IPv6.
  - Test: 5 envíos inválidos seguidos de uno válido, y el válido se acepta.

**4. [Importante] La idempotencia apoyada en una columna UNIQUE de `solicitudes` es frágil, y hay riesgo de pérdida silenciosa.**
- **Evidencia:**
  - `:50-52` y `:59`: el duplicado se detecta por la violación de UNIQUE al insertar la fila con PII.
  - Payload convierte el error 23505 en un `ValidationError` genérico (`node_modules/@payloadcms/drizzle/dist/upsertRow/handleUpsertError.js:48-60`), así que hay que distinguirlo por `path`.
  - Cualquier otro error de base de datos se relanza tal cual (`:62-63`); ver el hallazgo 5.
  - IN-09 es secuencial (`intake.mjs:113-114`): no prueba la carrera de dos envíos simultáneos.
  - Si `/solicitar` se cachea o se prerenderiza, todos los visitantes reciben el mismo nonce. A partir del segundo, cada envío responde 2xx y se descarta.
  - Un Server Component no puede fijar cookies, y el plan no dice dónde se emite la cookie.
- **Efecto:** solicitudes perdidas con respuesta 2xx.
- **Corrección:**
  - Tabla separada `intake_envio(clave bytea PRIMARY KEY, creada_en)`. En la transacción, `INSERT … ON CONFLICT DO NOTHING RETURNING`. Si no devuelve fila, responder 201 sin intentar insertar la solicitud.
  - Emitir el token en `proxy.ts` o en un route handler, con la página dinámica y `Cache-Control: no-store, private`.
  - Entregar un token nuevo tras cada 201.
  - Tests: dos POST concurrentes con el mismo nonce dejan un solo registro y ningún 5xx; dos GET dan nonces distintos.

**5. [Importante] Hay PII en los errores de drizzle y de `JSON.parse`, y la captura de logs de IN-12 es incompleta.**
- **Evidencia:**
  - drizzle-orm es la 0.45.2 (`package-lock.json:4457-4458`).
  - `drizzle-orm/errors.js:12-15` construye el mensaje como `Failed query: …\nparams: ${params}` y además guarda `this.params`. El serializador de errores de pino incluye esas propiedades.
  - Cualquier fallo de base de datos durante el insert (timeout, conexión, serialización) vuelca nombre, contacto y descripción.
  - En Node 24, el `SyntaxError` de `JSON.parse` incluye un fragmento de la entrada. Esto es por la versión de V8; no lo comprobé ejecutando.
  - `driver.logs()` sólo lee el servicio `app` (`contrato-driver.mjs:325-327`, `poc.sh:38`).
- **Corrección:**
  - En el handler, un try/catch total. Registrar sólo `{evento, codigo, err_name, pg_code}` y nunca `err`, `message` ni `stack`.
  - Un serializador o `redact` en el logger de Payload que elimine `err.params`, `err.query` y `err.cause`.
  - Ampliar IN-12 con un fallo de base de datos inyectado durante el insert y con JSON roto que contenga PII sintética, revisando los logs de todos los servicios (proxy y `app-prod` incluidos).

**6. [Importante] El hook no cubre IN-08 si se usa `overrideAccess: true`.**
- **Evidencia:**
  - `:53-54` y `:68` presentan el hook como la defensa en profundidad.
  - Pero `Solicitudes.ts:13-17` sólo fuerza `estado` y `motivo_cierre`.
  - Con `overrideAccess: true`, Payload salta el acceso de campo de `observaciones_internas` (`Solicitudes.ts:64-67`). `createdAt` también se puede fijar por la Local API.
- **Efecto:** el validador es la única barrera para 3 de los 5 campos.
- **Corrección:**
  - En el hook de create, cuando `req.context.canal === 'intake'`, forzar `observaciones_internas` vacío y borrar `id`, `createdAt` y `updatedAt` de `data`.
  - Vitest con la Local API que intente guardar esos campos.
  - Devolver sólo el id (`select`) y no registrar el documento.

**7. [Importante] El límite de tamaño no está definido como streaming, y falta una lista blanca de Content-Type.**
- **Evidencia:**
  - `:43` dice «antes de parsear», pero `request.json()` lee el cuerpo entero sin límite, también con chunked o con un Content-Length falso.
  - 4000 emojis ocupan 16 000 bytes. Con el resto de campos se supera 16 KiB, así que una entrada válida acabaría rechazada.
  - Aceptar `text/plain` permite peticiones CORS simples.
- **Corrección:**
  - Leer `req.body` con un reader y cortar con 413 al pasar el límite.
  - Alinear el límite en bytes (p. ej. 32 KiB) con las longitudes, contadas en code points.
  - Aceptar sólo `application/json` (o `x-www-form-urlencoded` si el formulario debe funcionar sin JS).
  - Tests: cuerpo chunked sin Content-Length, y Content-Length falso.

**8. [Importante] Secretos y retención.**
- **Evidencia:**
  - `:126` prevé un único secreto para el token y para la IP.
  - `:84` habla de «rotación por ventana» sin definirla.
  - El riesgo es acabar reutilizando `PAYLOAD_SECRET`.
  - `intake_limite` guarda HMAC(IP), un dato personal seudonimizado, sin ninguna purga prevista.
- **Corrección:**
  - Derivar claves separadas con HKDF (`intake-token-v1`, `intake-ip-v1`), nunca a partir de `PAYLOAD_SECRET`.
  - Que la app no arranque si la clave falta o tiene menos de 32 bytes.
  - Incluir un `kid` en el token.
  - Purgar ventanas de más de 2× la duración de la ventana, con su test.

## B. Ejecutor aislado (`docs/PROPUESTA-EJECUTOR-INTEGRACION.md`)

**9. [Crítico] El código del commit se ejecuta en el host de la VM con acceso a Docker.**
- **Evidencia:**
  - `:38` («ejecuta la suite») no define el comando.
  - Hoy la suite es `poc1a/poc.sh`, un archivo versionado.
  - Si `jz-runner` lanza `poc.sh` o `npm` desde el bundle, el commit controla un proceso que habla con `dockerd` (root en la VM). Con `docker run --privileged -v /:/h` se anula todo el §4.
- **Corrección:**
  - Comandos fijos dentro de `jz-runner`. El código del commit se ejecuta sólo dentro de contenedores validados.
  - El usuario de `jz-runner` no pertenece al grupo `docker`: rootless por ejecución o un wrapper mínimo.

**10. [Importante] El validador de Compose (`:92-99`) es una lista negra con huecos.**
- **Evidencia.** No detecta:
  - volúmenes con nombre y `driver_opts: {type: none, o: bind, device: /}`, es decir, un bind encubierto;
  - `volumes_from`;
  - `network_mode: container:`;
  - `cgroup: host` y `cgroup_parent`;
  - `uts: host`;
  - `configs`/`secrets` con `file:`;
  - `env_file` fuera del directorio (compose incrusta en la configuración el contenido de archivos de la VM);
  - en `build`: `context` absoluto, `additional_contexts` y `secrets`;
  - `user` root.

  Además, hay un TOCTOU entre validar y ejecutar, y el `.env` del bundle podría fijar `COMPOSE_*` o `DOCKER_HOST`.
- **Corrección:**
  - Lista blanca de claves y valores (un esquema).
  - Ejecutar exactamente el JSON validado: `-f resolved.json`.
  - Ignorar el `.env` del bundle.
  - Una fixture maliciosa por cada caso.

**11. [Importante] La integridad de la evidencia y del canal de vuelta no está protegida.**
- **Evidencia:**
  - El tar de vuelta (`:39`) sale de un directorio donde escriben los contenedores (bind `./:/app`, `compose.yaml:9-10`). Puede traer symlinks o rutas con `../`, y al extraerlo en el CT permitiría escribir donde quiera.
  - `runs.jsonl` lo escribe en el CT un proceso que lanza el agente (`:41`): un `rc: 0` se puede falsificar.
  - El snapshot se revierte sólo una vez al día (`:68`): una ejecución que comprometa la VM persiste y puede falsear las siguientes.
- **Corrección:**
  - Un manifiesto `{sha, suite, rc, sha256 de los logs}` firmado con una clave ed25519 de la VM, que jz-qa verifica.
  - No extraer el tar, o validar cada entrada: sólo archivos regulares, sin rutas absolutas ni `..`, con tope de tamaño.
  - Recoger los artefactos con `docker cp` desde rutas fijas.
  - Revertir el snapshot o usar un clon por ejecución.
  - Fijar la clave de host de la VM (`StrictHostKeyChecking yes`).
  - Tratar los logs como datos no confiables para los agentes (riesgo de inyección de prompts).

**12. [Importante] La precarga de npm abre una vía de ejecución con red.**
- **Evidencia:** según `:52`, la caché se precarga desde el `package-lock.json` del commit durante la ventana con Internet. `npm ci` ejecuta los scripts de instalación de las dependencias que elija el commit.
- **Corrección:**
  - Precargar en un contenedor desechable con `--ignore-scripts`.
  - Salida sólo hacia el registro de npm, mediante un proxy con lista blanca.
  - Un humano aprueba el diff del lockfile antes de abrir la ventana.
  - En las ejecuciones, la caché va montada en sólo lectura y la instalación es `--offline` dentro del contenedor.
  - Revertir el snapshot al cerrar la ventana.

```
INFORME-JZ
rol: jz-security
unidad: revisión documental de PLAN-POC-3 y PROPUESTA-EJECUTOR-INTEGRACION (sin commit)
archivos: leídos docs/PLAN-POC-3.md, docs/PROPUESTA-EJECUTOR-INTEGRACION.md, docs/REGISTRO-DECISIONES-H0A.md (§POC-3), contrato/casos/intake.mjs, contrato/casos/util.mjs (grep), poc1a/src/collections/Solicitudes.ts, poc1a/src/access/index.ts, poc1a/src/lib/solicitudes.ts, poc1a/contrato-driver.mjs, poc1a/compose.yaml, poc1a/poc.sh (grep), poc1a/package.json y package-lock.json (grep), node_modules/drizzle-orm/errors.js, node_modules/@payloadcms/drizzle/dist/upsertRow/handleUpsertError.js / cambiados: ninguno
evidencia: sólo lectura con Read, Grep y Glob; no ejecuté ningún comando ni jz-run. Lo que digo de Next 15+ (NextRequest sin ip) y de los SyntaxError de V8 sale de conocimiento de esas versiones; no lo verifiqué ejecutando.
hallazgos: 2 críticos (1 IP/proxy, 9 código del commit en el host de la VM) y 10 importantes (2–8 y 10–12)
estado: validado (revisión terminada); los documentos no se aprueban hasta corregir 1, 4, 5, 9, 10 y 11
siguiente: que jz-architect incorpore las correcciones en PLAN-POC-3 §3/§5/§7 y en la PROPUESTA §3.1/§4; el responsable decide P3-02 con la variante de proxy que sobrescribe; jz-security vuelve a revisar docs/POC-3-DISENO.md antes de la unidad 2
```
