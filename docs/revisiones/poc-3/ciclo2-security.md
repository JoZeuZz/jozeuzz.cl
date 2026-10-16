Hice la re-verificación (ciclo 2): 9 de los 12 hallazgos están resueltos y 3 quedan parciales (1, 5 y 11). No encuentro ningún crítico. Hay 2 hallazgos importantes nuevos.

Comprobé que las referencias que cita el plan son correctas: `compose.yaml:48-49,86`, `Solicitudes.ts:14-17`, `solicitudes.ts:9-12`, `poc.sh:8-16`, `contrato-driver.mjs:12-15`, `intake.mjs:49` y `drizzle-orm/errors.js:12-15`.

## Estado de los 12 hallazgos anteriores

**1. IP y proxy: parcial.** El diseño es correcto: el proxy sobrescribe `X-Real-IP`, la app está en una red `internal`, se agrupa por /64 y se rechaza si falta la cabecera en producción (`PLAN-POC-3.md:59-67`, P3-02 `:187`). Quedan dos huecos:
- **No se pide quitar los accesos directos a la app.** Hoy `app` publica `127.0.0.1:3101` (`compose.yaml:48-49`), `app-prod` publica `3102` (`:70-71`) y `e2e` comparte la red de `app` (`:86`). Mientras eso siga así, cualquier proceso del contenedor llega a la app sin pasar por el proxy, puede poner el `X-Real-IP` que quiera, e IN-11 y el E2E no prueban el proxy.
- **La prueba de `:67` sólo comprueba que se ignora `X-Forwarded-For`.** Falta la que importa: un `X-Real-IP` enviado por el cliente debe quedar sobrescrito con la configuración de producción.

**2. Origin, Referer y `__Host-`: resuelto.** Ver `:73`, `:78-80` y las pruebas de `:137`. Nota menor: `__Host-` exige `Secure` y el POC va por http en `127.0.0.1`. Hay que comprobar en la unidad 5 que Chromium la acepta en ese origen.

**3. Orden del límite e IPv6: resuelto.** Ver `:83`, `:97-98`, `:64` y `:138`.

**4. Idempotencia y caché del nonce: resuelto.** Ver `:70` y `:95-96`. Nota menor: la purga de `intake_envio` (`:110`) no está ligada a la caducidad del token. Si se purga antes de que caduque, ese token se puede volver a usar y crea un duplicado. Debe exigirse purga ≥ TTL del token.

**5. PII en errores de drizzle y JSON, e IN-12: parcial.**
- Resueltos: el `SyntaxError` (`:86`), el log estructurado del handler (`:102-103`) y el rojo propio de IN-12 (`:169`).
- **Pendiente:** el `redact` del logger de Payload (`:144`) sólo quita `err.params`, `err.query` y `err.cause`. Pero drizzle mete los `params` dentro de `message` (`errors.js:12-13`: ``` `Failed query: ${query}\nparams: ${params}` ```), y el propio plan lo reconoce. Hay que eliminar o sustituir también `message`/`msg` de los `DrizzleQueryError`; si no, la PII llega al log por el mensaje.

**6. Hook con `overrideAccess`: resuelto.** Ver `:109`, `:136` y unidad 2 `:164`. La lista blanca del paso 8 junto con el hook dan dos barreras.

**7. Tamaño en streaming y Content-Type: resuelto.** Ver `:76-77`, `:84-85` y `:141`. Mejoras opcionales: poner también un límite de cuerpo en el proxy y comparar el media type ya parseado, para aceptar `application/json; charset=utf-8`.

**8. HKDF y purga: resuelto.** Ver `:142-143` y P3-06 `:196`. Nota menor: `poc.sh init` sólo crea `.env` si no existe (`poc.sh:19`), así que en un `.env` existente el secreto nuevo no se añade solo.

**9. Código del commit en el host de la VM: resuelto.** Ver `PROPUESTA-EJECUTOR-INTEGRACION.md:37-39` y `:44`.

**10. Lista negra de Compose: resuelto.** Ahora es un esquema de lista blanca con una fixture maliciosa por regla (`:102-111`).

**11. Integridad de la evidencia: parcial.** El manifiesto firmado, la clave de host y las rutas saneadas están bien (`:40`, `:42`). Pero `:35` y `:78` admiten reiniciar la VM «como mínimo, por lote», y a la vez `:78` afirma que «una ejecución que comprometa la VM no puede falsear las siguientes». Eso sólo es cierto si se reinicia en cada ejecución. Hay que exigir clon por ejecución o retirar esa afirmación.

**12. Precarga de npm: resuelto.** Ver `:55-62`. Nota menor: «al cerrar la ventana, se revierte el snapshot» (`:60`) no deja claro cómo llega la caché a `base-limpia`. Además, montada en sólo lectura con `--offline` puede fallar con `EROFS`, aunque eso es funcional, no de seguridad.

## Hallazgos nuevos importantes

**N1. No se dice cómo se garantiza la atomicidad del paso 9 (`PLAN-POC-3.md:94-100`).** El SQL propio (`intake_envio`, `intake_limite`) y `payload.create` tienen que ir en la misma transacción de Payload: `beginTransaction`, `req.transactionID` y la sesión drizzle de esa transacción. Si el SQL propio corre en otra conexión y la creación falla después de confirmar el nonce:
- el reintento recibe un 201 «idéntico» sin que exista ningún registro;
- el ciudadano cree que su solicitud quedó enviada y se pierde en silencio.

Falta una prueba roja: fallo inyectado en 9c, después el mismo nonce, y debe quedar 1 registro. Lo mismo vale para el contador de 9b.

**N2. IN-12 no revisa los logs de PostgreSQL.** El alcance de los logs es proxy, `app` y `app-prod` (`:129`, `:169`), sin `db`. Por defecto, PostgreSQL escribe valores en sus errores, por ejemplo `DETAIL: Failing row contains (...)` en violaciones de `NOT NULL`/`CHECK`, o `invalid input syntax for type …: "<valor>"`. La unidad 7 inyecta justo un «fallo de BD durante el insert», que puede provocarlos. Hay que añadir `db` a `logs()`, o justificar y configurar su exclusión.

## Veredicto

**Sí, se puede presentar al responsable.** Ningún hallazgo bloquea las decisiones P3-01 a P3-09, porque todos son detalle de diseño. Condición: el 1, el 5 parcial, N1 y N2 deben quedar como criterio explícito de la unidad 1 (diseño fino, con nota de jz-security antes de la unidad 2), o añadirse ya al plan, que son pocas líneas. La propuesta del ejecutor también se puede presentar si se corrige la frase de `:78`.

```
INFORME-JZ
rol: jz-security (lectura)
unidad: re-verificación ciclo 2/2 · PLAN-POC-3 + PROPUESTA-EJECUTOR-INTEGRACION
archivos leídos: docs/PLAN-POC-3.md, docs/PROPUESTA-EJECUTOR-INTEGRACION.md, poc1a/compose.yaml,
  poc1a/src/collections/Solicitudes.ts, poc1a/src/lib/solicitudes.ts, poc1a/poc.sh (1-40),
  poc1a/contrato-driver.mjs (1-60), contrato/casos/intake.mjs, poc1a/node_modules/drizzle-orm/errors.js
archivos cambiados: ninguno
evidencia: lectura directa; sin comandos ejecutados (rol sin ejecución). Referencias del plan contrastadas con el código.
hallazgos: resueltos 2,3,4,6,7,8,9,10,12; parciales 1,5,11; nuevos importantes N1 (atomicidad del paso 9), N2 (logs de db en IN-12); críticos: 0
estado: completado
siguiente paso: el escritor de docs añade el 1, el 5, el 11, N1 y N2 al plan o a los criterios de la unidad 1; luego se presenta al responsable (H0A-16c)
```
