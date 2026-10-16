Estoy terminando la revisión. Ya leí el plan, los 12 casos, el driver, `poc.sh`, `Solicitudes.ts` y `EVIDENCIA.md`. Solo me falta redactar el informe.

Hallazgos sobre `docs/PLAN-POC-3.md`. No ejecuté nada (solo lectura). No pude comprobar el hash `d0929b9` porque no tengo git, así que consta como no verificado.

1. **Base `poc3_*` bloqueada por el código (alto).**
   - Plan: líneas 101 y 121, y P3-01.
   - Código: `poc1a/contrato-driver.mjs:12-15` lanza error si `POC_TARGET_DATABASE` no cumple `^poc1b_`. `poc1a/poc.sh:8-16` (`nombre_poc1b`) rechaza cualquier base que no sea `poc1b_*` en `up-en`, `exec-en`, `migrate-en`, `build-en`, `e2e-en`, `psql-en` y `comprobar-en`.
   - Corrección: añade una unidad previa, con prueba roja, que generalice ambas guardas a `poc(1b|3)_`. Si no, las unidades 4 a 8 no arrancan. Revisa también `scripts/verificar-db.ts` y `scripts/reset-e2e.mjs`, que no leí.

2. **P3-02 contradice el driver (alto).**
   - Plan: línea 122, "el driver la envía desde el contenedor `e2e` configurado como proxy".
   - Código: el driver corre en el Node del host (`contrato-driver.mjs:2`) y hace `fetch` directo. `util.mjs:7` genera orígenes como `origen-sintetico-N`, que no son IPs.
   - Corrección: decide que el driver envía `X-Forwarded-For` con IPs sintéticas (por ejemplo `203.0.113.N`), desde la IP del host o del gateway Docker. Pon esa IP en `TRUSTED_PROXIES`. Añade un vitest que compruebe que fuera de `TRUSTED_PROXIES` se ignora el header. Cierra P3-02 antes de la unidad 6.

3. **El "tiempo mínimo de rellenado" rompe toda la batería (alto).**
   - Plan: §3 paso 5.
   - Código: `util.mjs:21-24` llama a `preparar` y luego a `enviar` sin espera, así que IN-01 y los demás envíos válidos fallarían.
   - Corrección: el mínimo debe ser configurable por variable de entorno, con un valor bajo en la batería. Añade un test que impida desactivarlo en producción. Si no, el driver tiene que esperar el mínimo y eso alarga la batería.

4. **Falta resolver el slug del servicio (medio-alto).**
   - Plan: §3 pasos 6 y 8, IN-02 y IN-03.
   - Código: el contrato envía `servicio` como slug (`fixture.mjs:63`, `snt-servicio-activo`). La relación de Payload (`Solicitudes.ts:54`) guarda un id. IN-02 compara `s.servicio === refs.servicio_activo` (`intake.mjs:49`).
   - Corrección: el plan debe decir que la ruta resuelve slug a id, filtrando por `activo: true`. Añade un vitest rojo para esa resolución. Sin eso, IN-02 devuelve 400 o guarda un id numérico.

5. **IN-12 no tiene rojo real (alto).**
   - Plan: línea 104, "IN-12 con inválidos, 413 y JSON roto".
   - Código: `intake.mjs:141-153` no exige que ningún envío sea aceptado ni que `logs()` devuelva líneas. Con un endpoint a medio hacer pasa por vacuidad. Los casos 413 y JSON roto no están en IN-12.
   - Corrección: añade un test propio rojo-primero que fuerce una fuga deliberada y exija al menos una línea `evento` del logger. Cubre 413, JSON roto y un error 500 inyectado. Corre IN-12 también con `POC_LOG_SERVICE=app-prod` (`poc.sh:38`), porque `app` es `next dev` y los logs de producción difieren.

6. **R-1 y el driver real se contradicen (medio-alto).**
   - Plan: líneas 69 y 70, y criterio de cierre "regresión de los 44 casos".
   - Código: `contrato-driver.mjs:311-322`. Si se sustituye `intake`, los 31 casos de POC-1b que usan `crearSolicitud` (`util.mjs:50`) pasan por el endpoint real. Entonces R-1 y `POC_INTAKE_SINTETICO` solo sirven en una rama paralela del driver.
   - Corrección: define una de dos. O los 44 casos corren contra el intake real (con IP sintética distinta por llamada, para no chocar con el límite) y R-1 se elimina en la unidad 9. O se conserva un modo `POC_INTAKE_SINTETICO` explícito. Hoy el plan dice ambas cosas.

7. **La unidad 5 no incluye rojo para CSRF, origen ni la página GET.**
   - Plan: línea 102 solo menciona IN-01..10. La línea 83 exige CSRF y origen (sin token, alterado, caducado, cookie distinta, Origin malo) con 403 y sin registro. La línea 86 pide accesibilidad.
   - Corrección: lista en la unidad 5 los tests HTTP de CSRF y origen, que no tienen caso `IN-*`, y la ruta `GET /solicitar`, todos en rojo. Hoy solo se verifican con vitest (unidad 3), que no prueba el 403 HTTP. Añade además un vitest unitario rojo de idempotencia, con UNIQUE sobre el nonce, para IN-09 e IN-10. Hoy dependen solo del driver con Docker.

8. **Docker no está identificado en todas las unidades (medio).**
   - Plan: línea 93 y P3-07 ("unidades 4 a 8").
   - Código: el reset, la batería y los logs del driver usan `poc.sh` (`contrato-driver.mjs:273,320,326`) y `jz-run` no tiene Docker (`.jz/bin/jz-run:7`). Eso afecta a la unidad 0 (batería 44/44 y regresión poc-1a), a la 9 (`medir-web`, línea 87) y a la 10.
   - Corrección: marca como "requiere Docker/humano" las unidades 0, 5, 6, 7, 8 y 9, y la parte "desde cero" de la 4. Marca como ejecutables con `jz-run` solo: `vitest`, `tsc` y los tests estáticos (unidades 2, 3 y 4 estática). La batería de la unidad 0 hay que lanzarla a mano antes de empezar.

9. **Afirmación inexacta sobre el hook (medio).**
   - Plan: línea 68, "es la defensa en profundidad de IN-08".
   - Código: `Solicitudes.ts:14-17` solo fuerza `estado` y `motivo_cierre`. No cubre `observaciones_internas`, `id` ni `creada_en`. Con `overrideAccess: true` (plan, paso 8) se salta también `soloAdminCampo`, así que `observaciones_internas` se guardaría si la lista blanca falla.
   - Corrección: añade en `beforeChange` (create) `data.observaciones_internas = ''`, con un vitest rojo. O bien cita el límite honestamente: la defensa en profundidad es solo parcial.

10. **El límite de 16 KiB no está especificado (medio).**
    - Plan: §3 paso 3.
    - Corrección: el test de 413 debe usar `Transfer-Encoding: chunked` sin `Content-Length`. Si no, un cliente evade el límite o el parseo ya consumió el cuerpo. IN-07 acepta cualquier estado entre 400 y 429, así que el contrato no lo detecta.

11. **Orden CSRF, límite e idempotencia mal razonado (medio).**
    - Plan: §3 pasos 4 a 7.
    - El rate limit va antes de la validación, así que las peticiones inválidas también consumen cupo. Con `max=5` por 10 minutos y un origen compartido, la batería puede dar 429 inesperados.
    - Corrección: documenta que el rate limit cuenta todas las peticiones. Exige IP sintética única por llamada (hallazgo 2). Añade un test del reenvío de IN-09 (mismo origen) que no agote el cupo.

12. **Unidad 1 sin criterio verificable (bajo).**
    - Plan: línea 98. El criterio es solo un documento sin prueba, y el paso previo de jz-security no se registra como evidencia.
    - Corrección: pide que `docs/POC-3-DISENO.md` liste cada `IN-*` con su prueba roja y su criterio. Pide también una nota de jz-security en `.jz-state/` antes de la unidad 2.

**Lo que sí cuadra:** `solicitudPublica` "solo copia, no valida" (`solicitudes.ts:9-12`). Las cifras de `EVIDENCIA.md` (líneas 143, 144, 145 y 160) coinciden con las del plan. `--alcance poc-3` existe en `run.mjs`. Los 12 casos `IN-*` están mapeados a alguna unidad, aunque IN-03, IN-04 y IN-09 a IN-12 solo tienen rojo a través del driver con Docker.

```
INFORME-JZ
rol: jz-qa (lectura)
unidad: revisión de docs/PLAN-POC-3.md (sin commit)
archivos leídos: docs/PLAN-POC-3.md; contrato/casos/intake.mjs, util.mjs, juicio.mjs, fixture.mjs, run.mjs; poc1a/contrato-driver.mjs, poc.sh, src/lib/solicitudes.ts, src/collections/Solicitudes.ts, EVIDENCIA.md; docs/REGISTRO-DECISIONES-H0A.md (POC-3); .jz/bin/jz-run (cabecera)
archivos cambiados: ninguno
evidencia: lectura estática; no hay ejecuciones ni entradas de .jz-state/runs.jsonl que revisar. `d0929b9` no verificado (sin git)
hallazgos: 12 (importantes: 1, 2, 3, 5, 6)
estado: plan no listo; corregir los hallazgos 1 a 6 antes de pedir H0A-16c
siguiente paso: orquestador pasa los hallazgos a jz-architect y jz-implementer (editan solo docs/ y driver); jz-qa revisa de nuevo el plan corregido
```
