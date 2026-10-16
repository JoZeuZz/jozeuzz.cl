**Re-verificación ciclo 2/2 (solo lectura). Presentables: sí, con reservas menores.**

No ejecuté comandos. El log citado en `CONTRATO:23` no existe en este clon: `.jz-state` no está versionado, así que no pude contrastarlo.

## Estado de los hallazgos 1-7

1. **Vitest 15/15: parcial.**
   - `CONTRATO:23` ahora cita el log `.jz-state/runs/20261016T150413Z-774239.log`, `rc=0` y `976f091`.
   - El respaldo ya no es `EVIDENCIA`, sino el `runs.jsonl` real. Eso es lo que pedí.
   - No puedo confirmar que el log diga 15/15. Que el orquestador lo mire una vez.

2. **Rutas `node --test`: parcialmente resuelto.**
   - `CONTRATO:23` ya usa `.jz/tests/*.test.mjs` y `contrato/test/`.
   - `CONTRATO:50` (c) usa `.jz/tests/*.test.mjs contrato/test/`.
   - Pero `CONTRATO:58` sigue diciendo «`node --test contrato/` y `.jz/tests`». Es solo descriptivo, pero contradice las líneas 23 y 50. Cambiarlo.

3. **Alcance de T-09: resuelto.**
   - `CONTRATO:36` y `TRAZABILIDAD:54` limitan la regla a datos de cliente y de payload.
   - Excluyen expresamente la URL de loopback `127.0.0.1:3101`.
   - Nombran los archivos concretos.

4. **P3-10: resuelto.**
   - `TRAZABILIDAD:52` y `:65` y `CONTRATO:46` lo declaran decisión nueva y piden añadirlo al §7 del plan.
   - Mi grep de «P3-10» en `PLAN-POC-3.md` no dio coincidencias, como corresponde a una propuesta aún no incorporada.

5. **Configuración de PostgreSQL en T-06: resuelto.**
   - `TRAZABILIDAD:51` la deja como «se decide en la unidad 1».
   - Las opciones son «candidatas» y están «pendientes de verificar en PostgreSQL 18.6».
   - Admite excluir `db` con justificación.
   - Mantiene la prueba IN-12 ampliada.

6. **Evidencia de Docker: resuelto.**
   - `CONTRATO:24-25` fija los recuentos exactos: 72/72, 43/43, 44/44, 3/3 y 21 ok / 0 fail / 35 pendientes.
   - Cita `EVIDENCIA.md:144`.
   - `CREATE DATABASE` figura como «sólo si no existe».
   - Las salidas van a `.jz-state/notes/poc3-u0-docker.md` con el comando, `git rev-parse HEAD` y la huella de `jz-run --fingerprint`.

7. **Aceptación de la unidad 1 y §9 del plan: resuelto.**
   - `CONTRATO:50` exige una matriz con una fila por elemento: los 12 IN-*, los controles del §5, T-01 a T-13 y los puntos 1 a 10 del §9.
   - Cada fila lleva sección, prueba roja, unidad y tipo de ejecución.
   - jz-qa debe marcar cada fila como cubierta, y un «parcial» impide aceptar.

Los dos desajustes menores también quedaron corregidos: `TRAZABILIDAD:49` y `:66` separan el mapeo de IP (unidad 5) de los contadores (unidad 6), y `CONTRATO:33` limita la unidad 0b a H0A-16c.

## Hallazgos nuevos (máx. 3)

1. **`CONTRATO:58` contradice `:23` y `:50`.** Es el resto del hallazgo 2, corrección de una línea. Por la forma del archivo, el resto de la línea probablemente sea correcto, pero conviene confirmarlo.
2. **`TRAZABILIDAD:46` pide «sin `real_ip_header`» y T-02 excluye `service:app` para `e2e`.** No es nuevo, y ambas cosas son coherentes. Lo anoto como no bloqueante: en la unidad 1 el diseño debe fijar qué archivo es el «de producción».
3. **`CONTRATO:23` pone el 9/9 de `sandbox.test.mjs` en el host sin respaldo.** `EVIDENCIA` no lo cubre y el host no pasa por `jz-run`. Debe registrarse también en `poc3-u0-docker.md` o en una nota equivalente.

Ninguno bloquea.

## Veredicto

**Presentables: sí.** Corregir `CONTRATO:58` antes de presentar. Los hallazgos 3-7 están resueltos. El 1 y el 2 están resueltos salvo la verificación del log y la línea 58.

INFORME-JZ
- Rol: jz-qa, solo lectura.
- Unidad: re-verificación final, ciclo 2/2.
- Archivos leídos: `ciclo3-qa.md`, `TRAZABILIDAD-POC-3.md`, `CONTRATO-POC-3-U0-U1.md`. Además hice un glob del log citado y un grep de `P3-10` en `PLAN-POC-3.md`.
- Cambios: ninguno.
- Estado: completado; presentable tras el ajuste menor de `CONTRATO:58`.
- Siguiente paso: el escritor de `docs/` corrige `CONTRATO:58`, y el orquestador comprueba el log de 15/15.
