INFORME-JZ
- Rol: jz-qa (solo lectura), re-verificación ciclo 2/2.
- Unidad: `docs/PLAN-POC-3.md`.
- Archivos leídos: el plan, `contrato/casos/intake.mjs`, `contrato/casos/util.mjs`, `contrato/fixture.mjs`, `poc1a/poc.sh`, `poc1a/contrato-driver.mjs`, `poc1a/scripts/{solicitud-sintetica,verificar-db}.ts`, `poc1a/src/collections/Solicitudes.ts` y `poc1a/src/lib/solicitudes.ts`. No cambié nada ni ejecuté nada.

## Los 12 hallazgos previos

1. **Guardas `poc1b_`: parcial.**
   - Resuelto: la unidad 0b (`PLAN-POC-3.md:162`) y la fila del §4 (`:128`) cubren `poc.sh:8-16` y `contrato-driver.mjs:12-15`.
   - Falta: el rojo de 0b solo exige probar `poc.sh` y el driver. Siguen con `^poc1b_` otros dos archivos:
     - `scripts/verificar-db.ts:7`, que usa `comprobar-en`.
     - `scripts/solicitud-sintetica.ts:7`, que usa R-1. R-1 convive hasta la unidad 9 (`PLAN-POC-3.md:120`).
   - El §4 pide "revisar" `verificar-db.ts` y `reset-e2e.mjs`, pero no hay prueba roja para ellos. `reset-e2e.mjs` no tiene guarda `poc1b_` (grep sin resultados). `solicitud-sintetica.ts` ni se nombra.
   - Con base `poc3_*`, R-1 y `comprobar-en` fallarían a mitad del camino.
2. **Origen en el driver: resuelto.** `PLAN-POC-3.md:115` convierte `origen` en IP sintética estable y `:116` declara `limite.max`. Es coherente con `intake.mjs:112-137` y `util.mjs:7,21`.
3. **Tiempo mínimo: resuelto.** `PLAN-POC-3.md:87-89` lo hace configurable (bajo en la batería, con un test que impide 0 en producción). Queda la ambigüedad del nuevo hallazgo D.
4. **Slug del servicio: resuelto.** `PLAN-POC-3.md:30,92-93` fija el slug y lo resuelve a id. El driver ya devuelve el slug al leer (`contrato-driver.mjs:202`).
5. **IN-12 por vacuidad: resuelto.** `PLAN-POC-3.md:51-55,169`: el test propio falla con una fuga deliberada y exige al menos una línea `evento`.
6. **R-1 frente al driver real: resuelto.** La tabla `PLAN-POC-3.md:122-129`, P3-09 y el rojo de la unidad 9 (`:171`, batería de 44 sin `POC_INTAKE_SINTETICO`) lo cubren. Ver el nuevo hallazgo B sobre el mapeo de IP.
7. **Rojo CSRF/GET: parcial.**
   - Resuelto: la unidad 5 (`PLAN-POC-3.md:167`) y `:137` listan los rojos de CSRF y origen.
   - Falta: el §8 (`:219`) dice "CSRF y GET → unidad 5", pero la unidad 5 no tiene rojo para `GET /solicitar`. Faltan estas comprobaciones:
     - `Cache-Control: no-store, private`.
     - Atributos de la cookie `__Host-intake`.
     - Nonce distinto en cada GET.
   - Son exigencias del §3 (`:70-73`) sin prueba.
8. **Docker por unidad: resuelto.** Columna «Ejecución» (`PLAN-POC-3.md:159-171`) y P3-07 (`:197`), consistentes entre sí.
9. **Hook: resuelto.** `PLAN-POC-3.md:109` amplía el hook: fuerza `observaciones_internas=''` y elimina `id`/`createdAt`/`updatedAt` con el canal `intake`. El código actual solo fuerza `estado` y `motivo_cierre` (`Solicitudes.ts:14-17`). La unidad 2 (`:164`) tiene rojo con Local API.
10. **413 chunked: resuelto en diseño.** `PLAN-POC-3.md:84-85,141,167`. Ver el nuevo hallazgo C sobre cómo se prueba.
11. **Orden del límite: resuelto.** `PLAN-POC-3.md:83` pone el límite de intentos antes de leer el cuerpo. El de creaciones (`:97-98`) va tras la idempotencia, y el rollback devuelve el nonce.
12. **Criterio de la unidad 1: parcial.** `PLAN-POC-3.md:163` pone en «Unidad» que cada IN-* y control tendrá su prueba roja y criterio. Pero la columna «Verde» solo exige una nota de jz-security. Ningún revisor comprueba que el documento esté completo (los 12 IN-*, los controles del §5 y el driver). Falta añadir a ese «Verde» una revisión de jz-qa de la cobertura IN-*/controles.

## Hallazgos nuevos

- **B. IP sintética sin capacidad definida (`PLAN-POC-3.md:67,115`).** `203.0.113.N` es un /24 con 254 hosts. `origenNuevo()` incrementa un contador por proceso (`util.mjs:6-7`) y la batería de 44 casos más IN-05/06/08 hace muchas llamadas. N podría desbordar. Con IPv6 agrupado por /64 (`:64`), la variación debe estar en los 64 bits altos. Define el mapeo (por ejemplo, índice dentro de `2001:db8::/32`) y añade un test que compruebe que N distintos dan IP distintas tras la normalización.
- **C. Los tests de 413 pasan por el proxy.** nginx, por defecto, almacena el cuerpo en búfer y fija `Content-Length`. También limita con `client_max_body_size` (1 MiB por defecto) y rechaza un `Content-Length` falso. Así el 413 podría salir del proxy y no del tope en streaming de la app (`:84-85`). Exige que la prueba golpee la app por la red interna y que el proxy no impida llegar al tope de la app.
- **D. Servicio y tiempo mínimo en `app-prod`.** El §3 y la unidad 7 (`:169`) ejecutan `app-prod` con `NODE_ENV=production`. El plan no dice qué mínimo usa ahí la batería, ni contra qué servicio corren IN-* y el E2E. Con 3 s (`:194`), `preparar` + `enviar` inmediatos darían 400 genérico. Fija un valor de batería no cero para `app-prod` o di que IN-* solo corren contra `app`.
- **E. Ámbito de la regresión de 44/44 (`:120`).** Decide si es contra `app`, `app-prod` o ambos. Con el proxy, `compose.yaml` y los nombres de servicio cambian. Debe quedar en la unidad 1.

## Veredicto

**Sí, aprobable para presentar al responsable**, condicionado a corregir cuatro puntos menores en la unidad 1/0b antes de implementar: 1 (ampliar el rojo de 0b), 7 (rojo de GET), 12 (verde de la unidad 1) y los hallazgos B–D. Ninguno es un defecto de arquitectura. Resueltos: 2, 3, 4, 5, 6, 8, 9, 10 y 11. Parciales: 1, 7 y 12. No resueltos: ninguno.

- Estado: revisado, sin escritura.
- Siguiente paso: el arquitecto ajusta §4 y las unidades 0b, 1 y 5, y el responsable decide P3-01 a P3-09.
