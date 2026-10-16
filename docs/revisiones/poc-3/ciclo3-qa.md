INFORME-JZ
- Rol: jz-qa (sólo lectura).
- Unidad: revisión acotada de `docs/TRAZABILIDAD-POC-3.md` y `docs/CONTRATO-POC-3-U0-U1.md`.
- Archivos leídos:
  - Los dos documentos revisados, `PLAN-POC-3.md`, `ciclo2-security.md`, `ciclo2-qa.md`, `poc1a/README.md` y `poc1a/EVIDENCIA.md`.
  - `HANDOFF-POC-1B.md` (grep de §7), `.jz/bin/jz-run`, `.jz/tests/*` (grep), `contrato-driver.mjs` (1-70) y `poc.sh` (1-22).
  - `compose.yaml` y `PROPUESTA-EJECUTOR-INTEGRACION.md:76-78` (grep).
- Archivos cambiados: ninguno. No ejecuté comandos.

## Contraste por punto

1. **Citas del §1:** las 5 de jz-security y las referencias a Q-1, Q-7, Q-12 y Q-B a Q-E coinciden literalmente con `ciclo2-*.md`. No hay contenido inventado.
2. **Filas T-*:** coherentes con el plan, salvo los hallazgos 3, 4, 5 y 7.
3. **Comandos de la unidad 0:** salvo los hallazgos 1, 2 y 6, coinciden con `README.md:9-19` y `HANDOFF §7`. La cifra 72/72 de vitest, 43/43 del contrato, 44/44 de la batería y 3/3 de E2E coinciden con `EVIDENCIA.md:145,152`.
4. **Separación jz-run/Docker:** correcta. jz-run no tiene red ni Docker, y el driver necesita el servidor real. `sandbox.test.mjs` se ejecuta en el host porque se salta dentro del sandbox. Todo vitest de integración y HTTP va en Docker.

## Hallazgos importantes (7)

1. **`CONTRATO:23` — vitest «15/15» sin respaldo.**
   - `EVIDENCIA.md:150` usa 15/15 para otra cosa: la caracterización IDOR HTTP.
   - En `src` y `test/estatico` hay 14 `it()` literales en 5 archivos. Esa cifra puede cuadrar o no con 15, pero no está en `EVIDENCIA`.
   - Corrección: medir el recuento real y fijarlo con su fuente, o poner «todo en verde, rc=0, N pruebas según `.jz-state/runs/<log>`».
2. **`CONTRATO:23,50` — `node --test contrato/` y `node --test .jz/tests/` no equivalen a lo documentado.**
   - `README.md:15` y `HANDOFF §7` usan `../contrato/test/`, que da 43/43. En el repo, `contrato/test/` suma 21 `it()` literales en 3 archivos; esa cifra no es 43 porque hay bucles. Por tanto, 43/43 sólo está respaldado por el recuento de `EVIDENCIA.md:16`.
   - Con el Node 20 del host, pasar un directorio ejecuta todos sus `.mjs`. Eso incluiría `contrato/run.mjs`, `contrato/casos/*` y `.jz/tests/integration.mjs`. Este último está pensado para el host, fuera de `jz-run` (`integration.mjs:7`).
   - No lo ejecuté. Compruébalo antes de presentar.
   - Corrección: usar `contrato/test/` y `.jz/tests/*.test.mjs`. Cambiarlo también en la aceptación (c) de la unidad 1 (`:50`).
3. **`CONTRATO:36`, `TRAZABILIDAD:54` — la regla de T-09 choca con el código actual.**
   - «Sólo los rangos `203.0.113.0/24` y `2001:db8::/32`» falla con `http://127.0.0.1:3101` en `contrato-driver.mjs:18`. Esa es infraestructura, no un dato.
   - Un test así quedaría rojo por una razón distinta de la guarda, o se debilitaría.
   - Corrección: definir el alcance, por ejemplo «direcciones de cliente y datos de payload; se excluye la URL de loopback del servidor». Declarar la lista exacta de archivos y expresiones.
4. **`TRAZABILIDAD:52,63`, `CONTRATO:46` — P3-10 no existe en el plan.**
   - `PLAN-POC-3.md:186-199` llega sólo a P3-09, y ciclo 2 habla de P3-01 a P3-09.
   - Es una decisión nueva (TLS con CA efímera) que bloquea la unidad 5 y la aceptación de la unidad 1.
   - Corrección: declararla «decisión nueva propuesta, a añadir al §7 del plan», o incorporarla ahí antes de presentar. Si no, el responsable no la ve.
5. **`TRAZABILIDAD:51` — T-06 prescribe una configuración que no cumple su propia prueba.**
   - `log_error_verbosity=terse` quita `DETAIL`, pero no el valor dentro del mensaje principal (`invalid input syntax for type …: "<valor>"`).
   - `log_min_error_statement=panic` sólo quita la sentencia SQL. Estas son afirmaciones de la configuración de PostgreSQL; no pude comprobarlas en una ejecución.
   - Las dos opciones no están en `ciclo2-security.md`, que sólo pide `db` en `logs()` o justificar su exclusión.
   - Corrección: dejar la configuración como «a decidir en la unidad 1». Para impedir el valor en el mensaje, prever `log_min_messages` alto en `db` o excluir `db` con justificación. Mantener la prueba IN-12 de `db`.
6. **`CONTRATO:25,24` y `TRAZABILIDAD:46` en adelante — la evidencia de Docker no se puede verificar por un tercero.**
   - Los cites son `EVIDENCIA.md:145,152`, pero el recuento de `--alcance poc-1a` está en `:144`: 21 ok, 0 fail, 35 pendientes. El contrato sólo dice «0 fail».
   - Las ejecuciones con `poc.sh` no pasan por `jz-run`, así que no hay `runs.jsonl` que las respalde. No hay lugar definido para las salidas ni huella `head`/`tree`.
   - Corrección:
     - Aceptación = `rc=0` y recuentos exactos: vitest 72/72, contrato 43/43, batería 44/44, E2E 3/3, `--alcance poc-1a` 21 ok/0 fail/35 pendientes.
     - Cada salida en `.jz-state/notes/poc3-u0-docker.md`, con el comando, `git rev-parse HEAD` y `.jz/bin/jz-run --fingerprint`.
     - Falta también el paso `CREATE DATABASE poc1b_migraciones` (`README:10`), que debe figurar como «sólo si no existe».
7. **`CONTRATO:50` — la aceptación de la unidad 1 no obliga a cumplir el §9 del plan.**
   - La nota de jz-qa se limita a «confirmar cobertura» sin un criterio objetivo.
   - `PLAN:227-245` dice que el diseño no se acepta si no resuelve los 10 puntos residuales.
   - Corrección: añadir a (a) y (b) que el documento tenga una matriz IN-*/controles §5/T-01..T-13/§9.1..10 → sección del diseño → prueba roja → unidad → tipo de ejecución. Las notas deben marcar cada fila como cubierta, sin «parcial».

## Otros desajustes menores (no cuentan en los 7)

- `TRAZABILIDAD:49` (T-04): bloquea «inicio de la unidad 6», pero el mapeo de IP sintética lo usa el driver ya en la unidad 5 (`PLAN:115`). Corrección: «Inicio de la unidad 5 (mapeo); la unidad 6 para los contadores».
- `TRAZABILIDAD:63` y `CONTRATO:33`: el §3 exige las decisiones P3 antes de la 0b, pero el contrato de la 0b sólo requiere H0A-16c y la unidad 0.

## Veredicto

**Presentable: no, todavía.**

Las citas del §1 son fieles. Lo que bloquea son los hallazgos 1 a 3 y 6, porque hacen la unidad 0 y la 0b no verificables o directamente rojas. También bloquean el 4, que introduce una decisión fuera del plan, y el 7, que deja la aceptación de la unidad 1 sin criterio objetivo. Con esas correcciones, que son de pocas líneas, el contrato sería presentable.

- Estado: revisado, sin escritura.
- Siguiente paso: el escritor de `docs/` aplica los hallazgos 1 a 7. Luego jz-qa re-verifica sólo esas líneas.
