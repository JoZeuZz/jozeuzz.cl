Re-verifiqué los siete hallazgos: seis están resueltos y F3 queda parcial. No hay hallazgos críticos nuevos. TRAZABILIDAD y CONTRATO son presentables.

## Estado de F1–F7

**F1 · `stack` en los logs: resuelto.**
- `TRAZABILIDAD:50` (T-05) pide un serializador en lista blanca `{name, code, pg_code}`. Prohíbe expresamente `message`/`msg`, `stack`, `params`, `query`, `cause`, `detail` y `where`.
- La prueba (i) es un vitest con un `DrizzleQueryError` real que lleva `SNT-` en los `params`.
- `CONTRATO:49`, punto (5), recoge lo mismo.
- Menor: el contrato no nombra `where` ni `msg`. No importa, porque la lista blanca ya los excluye.

**F2 · fallo de BD inyectado: resuelto.**
- `TRAZABILIDAD:50` exige un error real de PostgreSQL (violación de `CHECK` o `NOT NULL` con PII sintética).
- El mecanismo es sólo de pruebas y la prueba (iv) es un test estático que comprueba que no llega al build de producción.
- `CONTRATO:49`, punto (5), lo recoge.

**F3 · valor en el mensaje principal de PostgreSQL: parcial.**
- El requisito está resuelto en `TRAZABILIDAD:51` (T-06): impedir también el valor en `invalid input syntax …: "<valor>"`, con `log_min_messages` alto como candidata y la verificación pendiente en PostgreSQL 18.6.
- Lo que falta es la prueba. Usa «el fallo de BD inyectado», que según T-05 es un `CHECK` o `NOT NULL`. Ese fallo produce `DETAIL`, pero nunca `invalid input syntax`, así que la prueba no comprueba el caso de F3.
- Corrección, una línea en T-06: añadir un segundo fallo inyectado con un valor `SNT-` en un campo de tipo incompatible (uuid, entero o fecha) y comprobar que ese valor no aparece en los logs de `db`.
- No es crítico. Lo puede cerrar la matriz de la unidad 1.

**F4 · cupo tras el rollback: resuelto.**
- `TRAZABILIDAD:48`, T-03 (iii): con `max-1` creaciones hechas, se inyecta un fallo después de 9b y el envío número `max` se acepta.
- Detalle de orden, menor: la prueba vive en T-03 (unidades 4 y 5), pero los contadores son de la unidad 6 (`:49`). Hay que ejecutarla cuando existan los contadores.

**F5 · override aislado y `X-Real-IP` en producción: resuelto.**
- `TRAZABILIDAD:46` (T-01): el test estático (i) cubre la configuración de producción del proxy, la ausencia de `real_ip_header` y `set_real_ip_from`, y el override en un archivo separado. La prueba HTTP (ii) envía `X-Real-IP` y XFF forjados contra esa configuración.
- `:47` (T-02): el cliente con acceso a la red interna sólo existe en el override.
- `CONTRATO:49`, punto (1), lo recoge.
- `PLAN:231` es coherente con todo lo anterior.

**F6 · IPs en los logs: resuelto.**
- `TRAZABILIDAD:54`, T-09 (ii): se buscan las IPs sintéticas y su /64 en los logs de proxy, `app`, `app-prod` y `db`.
- `:47` (T-02): el proxy sólo publica en `127.0.0.1:`.

**F7 · `Secure` en producción: resuelto.**
- `TRAZABILIDAD:52`, T-07: se comprueba `Set-Cookie: __Host-intake…; Secure` en `app-prod`.
- Un vitest comprueba que, con `NODE_ENV=production`, la app no arranca si el flag de la variante del POC está activo o si `ORIGEN_PUBLICO` es http.
- Menor y funcional, no de seguridad: con esa guarda, la opción (b) de P3-10 (`__Host-` sobre http) no sirve en `app-prod`. Para arrancar haría falta un `ORIGEN_PUBLICO` https, y entonces el `Origin` http que envía Chromium daría 403. En la práctica, la guarda obliga a elegir la opción (a), TLS en el proxy. Como la guarda bloquea en vez de dejar pasar, el resultado es seguro. Conviene dejarlo escrito en P3-10.

## Hallazgos críticos nuevos

Ninguno.

Tres observaciones menores, que no bloquean:
1. **Fallos inyectados de T-03 y T-04:** sus mecanismos de inyección (unidades 5 y 6) sólo quedan cubiertos por el test estático de T-05 (iv), que es de la unidad 7. Conviene adelantarlo o extenderlo a esas unidades.
2. **`msg` derivado del error:** si el logger recibe un `Error` como primer argumento, pino suele rellenar `msg` con `err.message`, fuera del serializador. No lo he podido verificar porque este clon no tiene `node_modules`. Lo cubre la revisión de logs de T-05 (iii), pero el diseño de la unidad 1 debería prohibir esa forma de llamada.
3. **P3-10 sigue fuera del §7 del plan.** Lo busqué en `PLAN-POC-3.md` y no hay coincidencias. Es una acción pendiente que la trazabilidad ya declara.

## Veredicto

- **`docs/TRAZABILIDAD-POC-3.md`: presentable, sí.** F3 queda parcial (falta un caso de prueba), sin críticos.
- **`docs/CONTRATO-POC-3-U0-U1.md`: presentable, sí.** Sin críticos ni importantes propios. `:8` ya corrige `poc_prod` como schema.

```
INFORME-JZ
rol: jz-security (lectura)
unidad: re-verificación final ciclo 2/2 de F1-F7 (ciclo3-security.md) sobre TRAZABILIDAD-POC-3 y CONTRATO-POC-3-U0-U1
archivos leídos: docs/revisiones/poc-3/ciclo3-security.md, docs/TRAZABILIDAD-POC-3.md, docs/CONTRATO-POC-3-U0-U1.md,
  docs/PLAN-POC-3.md (grep: P3-10, log_min_messages, lista blanca, X-Real-IP)
archivos cambiados: ninguno
evidencia: sólo Read/Grep. P3-10 no aparece en PLAN-POC-3.md. El grep sobre poc1a/node_modules/payload/dist falló:
  «Path does not exist» (el clon no tiene node_modules). No se ejecutó ningún comando ni jz-run.
  Siguen sin verificar ejecutando: el stack de V8, PostgreSQL 18.6, Chromium y Secure, y pino (msg derivado de un Error).
hallazgos: F1, F2, F4, F5, F6 y F7 resueltos; F3 parcial (la prueba de T-06 no ejercita invalid input syntax, TRAZABILIDAD:51);
  0 críticos nuevos; 3 menores (fallos inyectados de T-03/T-04 antes del test estático de T-05 (iv), msg de pino, P3-10 fuera del §7)
estado: completado
siguiente paso: jz-architect añade a T-06 el caso de tipo incompatible con SNT- y añade P3-10 al §7 del plan
  (opcional antes del commit); después, commit de TRAZABILIDAD y CONTRATO y decisión humana sobre H0A-16c
```
