# Revisión de seguridad: trazabilidad y contrato de POC-3, y re-verificación de ESPEC-VM

**Veredicto:**
- `docs/TRAZABILIDAD-POC-3.md`: **no presentable** tal como está. Hay 7 hallazgos importantes y ninguno crítico. Se arreglan con pocas líneas en T-01, T-03/T-04, T-05, T-06, T-07 y T-09.
- `docs/CONTRATO-POC-3-U0-U1.md`: **sí presentable**, siempre que se corrija la trazabilidad, porque remite a T-01..T-14. No tiene hallazgos críticos ni importantes propios.
- `docs/ESPEC-VM-PRUEBAS.md`: **sí presentable**. Los 6 hallazgos de `vm-ciclo1` están resueltos. Las decisiones de la §13 siguen abiertas.

## (1) Citas del §1 de la trazabilidad

- **Citas de jz-security:** S-1, S-5, S-11, S-N1 y S-N2 coinciden literalmente con `ciclo2-security.md:7-9,17-19,31,37,43`. Las elisiones están marcadas con […]. Los recuentos («3 parciales y 2 nuevos importantes», «3 parciales y 4 nuevos») también son correctos.
- **Apartado de jz-qa (`TRAZABILIDAD:27-33`):** son resúmenes, no texto literal, aunque el título dice «Texto exacto» (`:13`). Es menor.
- **Elisión de S-N1 (`:22`):** el «[…]» se come la frase «Lo mismo vale para el contador de 9b» (`ciclo2-security.md:41`). Después ese requisito no aparece en ninguna prueba (hallazgo F4).

## (2) Hallazgos de la trazabilidad (todos importantes)

**F1 · T-05 deja PII en `stack`** (`TRAZABILIDAD:50`; mismo hueco en `CONTRATO:49` punto 5)
- **Evidencia:** en `drizzle-orm/errors.js:12-17`, `super(\`Failed query: ${query}\nparams: ${params}\`)` va seguido de `Error.captureStackTrace`. V8 escribe el mensaje en la primera línea de `stack`.
- **El fallo:** el serializador sustituye `message/msg/params/query/cause`, pero no `stack`. Tampoco quita `detail`/`where` de un error de pg registrado sin envolver.
- **Efecto:** el nombre, el contacto y la descripción llegan al log por `stack`.
- **Autocorrección:** mi propio S-5 del ciclo 2 tampoco vio `stack`.
- **Corrección:** el serializador debe ser una lista blanca (`{name, code, pg_code}`), no una lista de campos que quitar. Además, un vitest con un `DrizzleQueryError` real cuyos `params` lleven `SNT-` y que compruebe que la salida no contiene `SNT-`.
- **No verificado:** que el serializador `err` de pino emita `stack`. Lo sé por conocimiento de pino; `pino-std-serializers` no está en `node_modules`.

**F2 · El «fallo de BD inyectado» no está definido y puede pasar por vacuidad** (`TRAZABILIDAD:48,50,51`)
- **Evidencia:** el único mecanismo que existe (`Solicitudes.ts:45`) lanza un `Error` de JS, no un error de PostgreSQL, y está desactivado con `NODE_ENV=production`.
- **Efecto:**
  - T-05 y T-06 pasan sin que se genere nunca un `DrizzleQueryError` ni un `DETAIL`.
  - No se puede inyectar el fallo en `app-prod`, aunque T-05 lo exige.
- **Corrección:** el fallo debe ser un error real de PostgreSQL (una violación de `CHECK`/`NOT NULL` con PII sintética en los parámetros). Si se usa en `app-prod`, el mecanismo no puede llegar a un build de producción: una migración o un flag sólo de prueba, con un test estático que lo compruebe.

**F3 · La configuración de T-06 no cubre `invalid input syntax`** (`TRAZABILIDAD:51`)
- **Evidencia:** `log_error_verbosity=terse` sólo quita `DETAIL/HINT/QUERY/CONTEXT`. En `invalid input syntax for type …: "<valor>"` el valor va en el mensaje principal `ERROR`, que S-N2 citaba expresamente.
- **Corrección:** `log_min_messages=fatal` en el servicio `db` del POC, o justificar por qué no puede ocurrir.
- **No verificado:** el comportamiento de PostgreSQL 18.6 sale de lo que sé de PostgreSQL; no lo ejecuté.

**F4 · Falta la prueba de que el rollback devuelve el cupo** (`TRAZABILIDAD:48,49`; `PLAN-POC-3.md:235`)
- **Evidencia:** T-04 exige como requisito que «el rollback devuelve el cupo», pero ni T-03(ii) ni T-04 lo prueban. T-03(ii) sólo cuenta registros.
- **Efecto:** si el contador se confirma fuera de la transacción, los usuarios legítimos se quedan sin cupo y no lo detecta ninguna prueba.
- **Corrección:** con `max-1` creaciones hechas, se inyecta un fallo después de 9b y el envío número `max` siguiente debe aceptarse.

**F5 · T-01 no comprueba lo que pedía S-1 y el override de pruebas no está aislado** (`TRAZABILIDAD:46,47,53`; `PLAN-POC-3.md:67,187`)
- **El fallo:**
  - La prueba sólo afirma que «XFF distinto comparte cupo». No comprueba que un `X-Real-IP` forjado queda sobrescrito, que era el hueco 2 de S-1.
  - Tampoco fija que se ejecute con la configuración de **producción** del proxy. El override de pruebas, por diseño, deja que el cliente fije la IP.
  - T-08 exige un cliente dentro de la red interna, lo que choca con T-02 si no se declara como algo sólo de prueba.
- **Efecto:** el camino de confianza del override puede acabar en producción y saltarse IN-11.
- **Corrección:**
  - El override va en un archivo separado. Un test estático comprueba que el proxy de producción contiene `proxy_set_header X-Real-IP $remote_addr` y no contiene `real_ip_header`/`set_real_ip_from`.
  - Una prueba HTTP con la configuración de producción y `X-Real-IP` forjado: el cupo es el mismo.
  - El cliente de T-08 se define sólo en el override de pruebas.
  - Añadirlo al punto (1) de `CONTRATO:49`.

**F6 · T-09 no prueba la ausencia de IPs en los logs** (`TRAZABILIDAD:54`)
- **Evidencia:** IN-12 sólo busca nombre, contacto, equipo y descripción (`intake.mjs:149-152`).
- **Efecto:** pueden quedar sin detectar, en el proxy, la app o la base de datos, las IPs en claro (que son PII) y un proxy publicado fuera de `127.0.0.1`.
- **Corrección:**
  - La prueba propia de IN-12 busca también las IPs sintéticas enviadas, y su /64, en `proxy`, `app`, `app-prod` y `db`.
  - El test estático de T-02 exige que los `ports` del proxy sean sólo `127.0.0.1:`.

**F7 · T-07 no garantiza el `Secure` de producción si el POC usa otra variante** (`TRAZABILIDAD:52`; `PLAN-POC-3.md:240`)
- **Evidencia:** el truco actual de redirigir a `localhost` (`compose.yaml:84-86`) desaparece con T-02. Eso hace probable una variante de la cookie sólo para el POC.
- **El fallo:** en ese caso, «atributos exactos» no se comprueba nunca con `NODE_ENV=production`.
- **No verificado:** que Chromium rechace las cookies `Secure` sobre `http://<servicio>`. Sale de lo que sé de Chromium; no lo ejecuté.
- **Corrección:**
  - Comprobar `Set-Cookie: __Host-intake…; Secure` en `app-prod`.
  - Con `NODE_ENV=production`, la app no arranca si el flag de la variante está activo o si `ORIGEN_PUBLICO` no es `https:`.

## (3) Columna «Bloquea»

Es correcta en lo esencial. T-14 está bien clasificado: la propuesta ya exige un clon por ejecución (`PROPUESTA:35,78`) y la reutilización en lote queda constando como pérdida de esa garantía.

Hay tres desajustes menores:
- T-01 (unidad 3), T-03 (unidad 4) y T-04 (unidades 3 y 4) bloquean unidades posteriores a donde se implementan. Lo cubre la puerta de T-12, que obliga a tener el diseño antes de la unidad 2.
- P3-10 la exigen `CONTRATO:46` y `TRAZABILIDAD:52`, pero no está en `PLAN-POC-3.md` §7 (`:184-199`).
- `poc_prod` es un schema (`compose.yaml:65`), no una base. La redacción de `CONTRATO:8` choca con las pruebas en `app-prod`.

## Re-verificación de `ESPEC-VM-PRUEBAS.md` frente a `vm-ciclo1`

| Hallazgo | Estado | Evidencia |
|---|---|---|
| C1 · La VM de ventana se clona con las claves, la misma IP e Internet | Resuelto | `:13-14` (plantillas sin claves; `base-ventana` aparte), `:16` (claves por clon), `:56-60` (VMID e IP propios, `jz-remote` suspendido), `:110`, `:139` |
| C2 · Enlaces simbólicos | Resuelto | `:75-76` (`core.symlinks=false`, rechazo de los modos 120000/160000), `:77` (raíz en sólo lectura, `realpath`), `:82`, `:143` |
| I3 · Evidencia falsificable (clave compartida, `clon_nuevo` autodeclarado, sin nonce, `:44` de la propuesta) | Resuelto | `:5`, `:16`, `:66` (rootless obligatorio), `:74`, `:88`, `:91`, `:131`, `:137`, `:145-146` |
| I4 · Canal de vuelta | Resuelto | `:84-90` (sin tar, firma antes de escribir, `O_EXCL\|O_NOFOLLOW`, sin root), `:146` |
| I5 · Tres comprobaciones que no prueban lo que dicen | Resuelto | `:39-40` (`pids_limit`), `:98` y `:100` (`container_name`, `name:`, listado sin filtro), `:68` y `:140` (`sshd -T -C`) |
| I6 · Sin canal de parches; firewall comprobado una sola vez | Resuelto | `:46-54` (comprobación en cada ejecución, también del datacenter), `:107-111`, `:138`, `:164-166` |

No veo nada truncado por el corte de cuota: la §11 cubre los 6 hallazgos. Hay un punto funcional, que no es de seguridad: con la raíz en sólo lectura (`:77`), `npm ci` y `next build` necesitan volúmenes en los que escribir.

```
INFORME-JZ
rol: jz-security (lectura)
unidad: revisión acotada de TRAZABILIDAD-POC-3, CONTRATO-POC-3-U0-U1 y re-verificación de ESPEC-VM-PRUEBAS (vm-ciclo1)
archivos leídos: docs/TRAZABILIDAD-POC-3.md, docs/CONTRATO-POC-3-U0-U1.md, docs/PLAN-POC-3.md, docs/ESPEC-VM-PRUEBAS.md,
  docs/PROPUESTA-EJECUTOR-INTEGRACION.md (30-79), docs/revisiones/poc-3/{ciclo1-security,ciclo2-security,ciclo2-qa,vm-ciclo1}.md,
  poc1a/{compose.yaml,poc.sh,contrato-driver.mjs,EVIDENCIA.md (grep)}, poc1a/scripts/*.ts (grep), poc1a/src (grep fallos inyectables),
  poc1a/node_modules/drizzle-orm/errors.js, poc1a/node_modules/@payloadcms/drizzle/dist/upsertRow/handleUpsertError.js,
  poc1a/package-lock.json (grep pino), contrato/casos/{util,intake}.mjs, contrato/fixture.mjs (grep), .jz (grep runs.jsonl)
archivos cambiados: ninguno
evidencia: sólo Read/Grep/Glob; no se ejecutó ningún comando ni jz-run. No verificado ejecutando: que el stack de V8 incluya el mensaje,
  el comportamiento de log_error_verbosity en PostgreSQL, el de las cookies Secure en Chromium ni el serializador err de pino
  (pino-std-serializers no está en node_modules).
hallazgos: TRAZABILIDAD 7 importantes (F1 stack, F2 inyección, F3 log_min_messages, F4 cupo tras rollback, F5 override/X-Real-IP,
  F6 IPs en los logs, F7 Secure en prod), 0 críticos; CONTRATO sin críticos ni importantes propios; ESPEC-VM C1, C2, I3, I4, I5 e I6 resueltos
estado: completado
siguiente paso: jz-architect corrige T-01, T-03/T-04, T-05, T-06, T-07 y T-09 (y los puntos 1 y 5 de CONTRATO:49), añade P3-10 al §7 del plan;
  re-verificación breve de jz-security; ESPEC-VM puede pasar a commit y a la decisión humana de la §13
```
