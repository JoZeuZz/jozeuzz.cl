# JZ-I2 — Verificación reconocida

Estado: **implementado en `feat/jz-i2-verificacion`, pendiente de la revisión independiente de OpenCode y de la aceptación humana.** No es PASS hasta esa revisión.
Encargo: JZ-I2-IMPLEMENT-001. Base: `96755110d8fa39f1f58167eafc4afa92d4415660` (I1 cerrado, integrado en `chore/jz-agents`).

## 1. Problema

Hasta I1, `jz-state` daba el árbol por «en verde» con cualquier ejecución de `jz-run` que terminara con `rc=0` sobre su huella, y `jz-checkpoint --state validado` lo aceptaba. Se reprodujo sobre el plano de control de `9675511` (`git archive HEAD .jz` en un repositorio desechable): `jz-run true` y después `jz-checkpoint --state validado` dejan `- Estado declarado: validado`. Un código de salida no dice qué se comprobó.

## 2. Diseño

### 2.1 Perfiles (`.jz/profiles/<id>.json`)

El registro es un directorio del plano de control: los agentes no lo pueden escribir (política y sandbox) y su contenido entra en la huella del árbol. Un perfil tiene exactamente estos campos:

| Campo | Contenido |
|---|---|
| `id` | Identificador (`^[a-z0-9][a-z0-9-]{0,63}$`), igual al nombre del archivo. |
| `version` | Entero positivo. |
| `description` | Qué cubre y qué no. |
| `cwd` | `"."` (v1 sólo admite la raíz del worktree). |
| `argv` | Comando exacto: `node`, `--test`, `--test-reporter=./.jz/lib/verify-reporter.mjs` y, después, exactamente los archivos del oráculo, en el mismo orden. |
| `oracle` | `format: "node-test-jz-v1"`, `files`, `minTests` (≥ 1), `allowSkipped` y `allowTodo` (≥ 0). |
| `ignoredInputs` | `[]`. v1 no admite dependencias ignoradas por git (§2.5). |

Cualquier otra forma se rechaza al cargar (`JZ_VERIFY_PROFILE`): argv libre o `true`, otro ejecutable, opciones adicionales (`-e`, `--import`, `--test-only`, `--test-name-pattern`, otros reporters o destinos), archivos fuera del worktree o distintos de los del oráculo, campos desconocidos, un id que no coincide, JSON inválido y un perfil que sea un enlace simbólico.

El único perfil es `jz-core-tests` v1: `policy`, `tree`, `recovery`, `hook` y `opencode` (`.jz/tests/*.test.mjs`), con 0 omitidas y 0 pendientes admitidas. Esas cinco suites sólo importan módulos `node:` y rutas relativas del plano de control, y sus fixtures copian archivos del plano de control a directorios temporales. No se definió ningún perfil de `jozeuzz.cl`: antes hay que inspeccionar sus scripts y dependencias reales.

### 2.2 Interfaz

`.jz/bin/jz-verify`, con la convención de los demás ejecutores de `.jz/bin` (bash que resuelve el worktree y delega en `.jz/lib/verify.mjs`, como `jz-run` con `tree.mjs`):

- `jz-verify run <perfil>`: 0 `VALIDADO`, 1 `FALLIDO`, 2 perfil o uso no válidos (no se ejecuta nada), 3 `BLOQUEADO` (no se ejecuta nada ni se escribe evidencia).
- `jz-verify status [--json]`: estado de cada perfil del registro y de las evidencias de perfiles retirados; 3 si alguno está `BLOQUEADO`.

El envoltorio vacía el entorno (sin `NODE_OPTIONS` ni variables del motor) y usa el `PATH` del sandbox, para que `jz-verify` corra con el mismo `node` que el perfil. No se creó la CLI `jz-ai`, interfaz gráfica ni un sistema de plugins (el diseño de I1 §6 proponía `jz-ai verify` como fachada; queda para M1).

### 2.3 Ejecución (`run`)

1. Carga y valida el perfil, y calcula el SHA-256 de su archivo.
2. Toma la instantánea previa con `tree.mjs` (`snapshot`: HEAD completo, huella del índice y huella del árbol, que ya liga ambas) y la identidad del runtime. Si falla (`JZ_TREE_*`), devuelve `BLOQUEADO` sin ejecutar.
3. Ejecuta `.jz/bin/jz-run --cwd . -- <argv del perfil>` en su propio grupo de procesos. Una señal a `jz-verify` termina el grupo y la ejecución queda interrumpida.
4. Localiza en `runs.jsonl` el único registro añadido durante la ejecución con el pid de ese `jz-run` (el log se llama `<ts>-<pid>.log`) y exige el mismo argv y cwd, la huella previa, el HEAD previo (abreviado) y `rc=0`, igual al código con que terminó `jz-run`.
5. Toma la instantánea y el runtime posteriores y exige que coincidan con los previos.
6. Aplica el oráculo al log que escribió `jz-run` (§2.4).
7. Escribe `.jz-state/verify/<perfil>.json` con un temporal, `fsync`, `rename` y `fsync` del directorio. Si hay algún motivo de rechazo, el estado es `FALLIDO` y los motivos quedan en la evidencia.

La evidencia la escribe `jz-verify` en el host, fuera del proceso verificado: `.jz-state` es de sólo lectura dentro de `jz-run` (prueba en `verify.test.mjs`) y es plano de control para los agentes.

### 2.4 Oráculo (`node-test-jz-v1`)

Se caracterizó el Node Test Runner 20.19.2 con archivos sintéticos antes de diseñarlo. Hallazgos que condicionan el diseño:

- No hay evento `test:summary`: el resumen llega como diagnósticos `tests N`, `pass N`… sin archivo.
- Un archivo vacío, uno que llama a `process.exit(0)` a mitad o uno que falla al cargarse aparece como **una única prueba con la ruta del archivo por nombre**. En los dos primeros casos el runner informa `tests 1, pass 1, fail 0` sin haber ejecutado nada. Un oráculo basado en el resumen o en «0 fail» los acepta.
- La salida de las pruebas (stdout y stderr de los procesos hijos) llega al reporter como eventos `test:stdout`/`test:stderr`; los diagnósticos de `t.diagnostic()` no llegan al proceso principal.
- Node cuenta como pruebas los padres y los hijos, no las suites (`describe`), y clasifica en este orden: omitida, pendiente (`todo`, aunque falle), cancelada, fallida, superada.

Por eso el perfil fija un reporter del plano de control (`.jz/lib/verify-reporter.mjs`) que transcribe cada evento como una línea `JZV1 <json>`, entre un evento `start` y otro `end`. Lo que imprimen las pruebas va dentro de una cadena JSON, así que no puede formar una línea propia. El oráculo (`parseReport`) exige:

- exactamente un `start` (versión 1) y un `end`, sin eventos fuera de ellos (sin `end`: salida incompleta);
- líneas `JZV1` que sean JSON y eventos de tipos conocidos;
- el resumen del runner completo, sin duplicados y **igual al recuento propio de los eventos** en las siete claves;
- ningún archivo «sin resultados estructurados» (prueba de nivel 0 cuyo nombre es su archivo);
- 0 fallidas, 0 canceladas, 0 suites fallidas, omitidas y pendientes dentro de lo que admite el perfil y al menos `minTests` superadas;
- al menos una prueba de cada archivo esperado y ninguna de otro archivo.

El texto TAP o spec (`# pass 1`, `# fail 0`, `PASS`) no se interpreta: sin eventos del reporter no hay resultado estructurado.

### 2.5 Evidencia y vigencia

`.jz-state/verify/<perfil>.json` (`schema: jz-verify-evidence-v1`) guarda la última verificación del perfil:

- `state` (`VALIDADO` o `FALLIDO`), `reasons` y `date`;
- `profile`: id, versión, digest del archivo y oráculo;
- `command`: cwd, argv y su digest;
- `repo` y `repoAfter`: HEAD, huella del índice y huella del árbol antes y después;
- `runtime`: ruta, versión y SHA-256 de `node` y de cada archivo ejecutable mapeado en su proceso (incluidos `libnode`, `libc`, `libcrypto` e ICU), y ruta y SHA-256 de `git`;
- `ignored`: `inputs: []`, `reproducible: false` y la nota de §2.6;
- `run`: log, SHA-256 del log, rc, argv, huella y HEAD registrados por `jz-run`, fecha, motor, duración y pid;
- `oracle`: recuento, pruebas por archivo, primeras 20 fallidas con su mensaje y versión de node dentro del sandbox;
- `assurance` y `digest` (SHA-256 del JSON canónico del resto).

`jz-verify status` decide en este orden:

1. **BLOQUEADO** si el repositorio no se puede inspeccionar (`JZ_TREE_*`), aunque no haya evidencia.
2. **SIN_VERIFICACION** si no hay evidencia del perfil (una ejecución de `jz-run true` en verde sigue sin serlo).
3. **BLOQUEADO** si la evidencia no es JSON, tiene otro formato o su digest no coincide, si el log falta o cambió, si el oráculo aplicado de nuevo al log no da el mismo resultado, si falta en `runs.jsonl` el registro del log o es distinto, si el perfil actual es inválido o si no se puede calcular el runtime.
4. **OBSOLETO** si cambió el perfil (digest) o se retiró, HEAD, el índice, la huella del árbol o el runtime (`node` y sus bibliotecas, o `git`). Volver exactamente al mismo estado la hace vigente otra vez.
5. **FALLIDO** o **VALIDADO**, según la evidencia.

La integridad se comprueba antes que la vigencia: lo que no se puede verificar nunca aparece como `OBSOLETO` ni como `VALIDADO`.

**No es una atestación criptográfica.** Root o cualquier proceso del mismo usuario puede reescribir `.jz-state`. El digest sólo detecta corrupción y ediciones descuidadas. Frente al modelo, la protección es la de I1: los agentes no escriben el plano de control y el sandbox no escribe `.jz-state`.

### 2.6 Dependencias ignoradas

La huella no cubre lo ignorado por git (`node_modules`, cachés). Para `jz-core-tests` no hay dependencias ignoradas: las suites sólo importan módulos `node:` y rutas relativas del plano de control. Un perfil v1 no puede declararlas (`ignoredInputs` debe ser `[]`), y cada evidencia registra `reproducible: false` para lo ignorado: no se afirma su identidad ni su reproducibilidad. El nivel con digest de `node_modules` o snapshot (`reproducible-attested`) queda fuera de I2.

### 2.7 Integración

- **`jz-state`** mantiene «Árbol actual con ejecución en verde» (compatibilidad), añade que no es una verificación reconocida y muestra la sección «Verificación reconocida» con `jz-verify status`. Si este termina con error (algún `BLOQUEADO`), el veredicto es `BLOQUEADO`.
- **`jz-checkpoint --state validado`** exige algún perfil en `VALIDADO` para el estado actual; si no, registra `incompleto` y avisa. El checkpoint anota la ejecución en verde y el estado de cada perfil. Consecuencia: mientras no haya perfiles del producto, una unidad del producto no puede quedar como `validado`, que es lo que corresponde.
- **Política** (`.jz/policy/policy.mjs`, cambio mínimo y justificado): `jz-verify` se añade a los ejecutores del proyecto. El implementador puede ejecutar `jz-verify status` y `jz-verify run <id>` (sólo un identificador válido, sin más argumentos); el orquestador, sólo `status`, porque ejecutar un perfil corre código. Necesidad reproducida: sin el cambio, la política denegaba `.jz/bin/jz-verify status` («ejecutable no permitido») y el nuevo requisito de `jz-checkpoint` dejaría a los agentes sin forma de llegar a `validado`. No se añade ninguna escritura.
- **Reglas nativas de OpenCode** (`.opencode/jz-permissions.json`): `.jz/bin/jz-verify status` para los dos roles con shell y `.jz/bin/jz-verify run *` para el implementador, justo después de `*\*`, como los demás ejecutores. Las denegaciones de redirección, expansión y `&` siguen después, y el plugin valida cada llamada con la política.
- **Perfiles de agentes** (los dos motores): el implementador y el orquestador citan `jz-verify` y dejan de tomar «en verde» como validación.
- **`tree.mjs`**: nueva función `snapshot` (HEAD completo, huella del índice y huella del árbol, con HEAD e índice comprobados antes y después). La huella `jz-tree-v3` no cambia.

Sin cambios en el sandbox de `jz-run`, el bloqueo de escritor, la delegación, el hook ni el plugin. Sin dependencias nuevas.

## 3. Pruebas

### 3.1 Rojo antes de implementar

Salida completa en `.jz-state/evidencia/JZ-I2-IMPLEMENT-001/rojo-inicial.txt` (no versionado), con las pruebas nuevas sobre el código de `9675511`:

- `policy.test.mjs`, «jz-verify: el implementador ejecuta perfiles por id…»: `run de un perfil: ejecutable no permitido: .jz/bin/jz-verify`.
- `opencode.test.mjs`, patrones nativos: `jz-orchestrator: jz-verify status` denegado.
- `verify.test.mjs`: `ERR_MODULE_NOT_FOUND` (`.jz/lib/verify.mjs` no existía).
- Defecto de I1 reproducido (`rojo-i1-checkpoint-true.txt`): `jz-run true` y `jz-checkpoint --state validado` dejaban `- Estado declarado: validado`.

Durante el verde fallaron tres pruebas por defectos del primer borrador, que se corrigieron en el código: una evidencia `FALLIDO` por comando distinto aparecía como `BLOQUEADO` (se comparaba el registro con el argv del perfil en vez de con lo registrado) y un repositorio no inspeccionable sin evidencia aparecía como `SIN_VERIFICACION`.

### 3.2 Casos cubiertos (`verify.test.mjs`, 23 pruebas)

| Requisito | Prueba |
|---|---|
| Perfil legítimo aprobado | `jz-core-tests` carga con las cinco suites, el reporter y el oráculo esperados; fixture `VALIDADO` con todos los campos de la evidencia; extremo a extremo con `jz-run` real. |
| `true` con `rc=0` | Perfil `["true"]` rechazado; registro con `cmd: ["true"]` y `rc=0` → `FALLIDO`; `jz-run true` registrado → `SIN_VERIFICACION`; en el host, `jz-run true` sobre un cambio deja «en verde: sí», el perfil `OBSOLETO` y el checkpoint `incompleto`. |
| Perfil inexistente | `JZ_VERIFY_PROFILE` sin ejecutar nada; CLI con código 2 y sin `runs.jsonl`. |
| Comando no autorizado | 16 perfiles inválidos (argv, opciones, reporters, archivos, campos, id, cwd, `ignoredInputs`, `minTests`, versión, JSON) y un perfil enlace; CLI con argumentos extra; política y reglas nativas. |
| Salida incompleta o malformada | Truncada, sin inicio, JSON inválido, fin duplicado, resumen duplicado o inconsistente, evento tras el fin, vacía, TAP y spec «en verde», líneas falsas impresas por una prueba. |
| Pruebas fallidas | Oráculo con salida real y ejecución `FALLIDO` con el nombre y el mensaje de la prueba. |
| Omitidas inesperadamente | `skip`, `todo` y cancelada por timeout; `allowSkipped` explícito sí se admite. |
| Ejecución interrumpida | El runner muere con `SIGKILL` a mitad (rc 137, sin fin); `SIGTERM` a `jz-verify` con `jz-run` real (`FALLIDO`, «interrumpida»); registro ausente. |
| Cambio del árbol | Durante la ejecución (`FALLIDO`); después (`OBSOLETO`, y otra vez `VALIDADO` al restaurar); archivo nuevo; índice. |
| Cambio de HEAD | Commit posterior → `OBSOLETO`. |
| Cambio del perfil protegido | Versión 2 → `OBSOLETO`; perfil retirado → `OBSOLETO`. |
| Evidencia faltante o corrupta | Faltante → `SIN_VERIFICACION`; JSON truncado, recuento editado, log sustituido o borrado y `runs.jsonl` borrado → `BLOQUEADO`. |
| Fallo al inspeccionar | `.git` anidado: `run` devuelve `BLOQUEADO` sin invocar el ejecutor ni escribir; `status` da `BLOQUEADO` con y sin evidencia. |
| Sin escritura en el plano de control ni rodeo de `jz-run` | Política: `jz-verify` sólo con `status` o `run <id>`, sin argv libre; `node .jz/lib/verify.mjs` y el comando del perfil a mano, denegados; perfiles, reporter, verificador y evidencias no escribibles por implementer ni architect. Sandbox: `jz-run sh -c 'echo x > …'` no escribe `.jz-state/verify/` ni `.jz/profiles/`. El ejecutor sólo recibe el argv del perfil. |

Las pruebas con el ejecutor simulado sustituyen sólo a `jz-run`: ejecutan el argv recibido con `node --test` real y escriben el registro como lo hace `jz-run`, así que el oráculo, la instantánea, la búsqueda del registro, la evidencia y el estado son los reales. Cuatro pruebas usan `jz-run` de verdad y sólo corren en el host.

### 3.3 Resultados (2026-10-24, host `root`, Node 20.19.2, git 2.47.3)

- Host: `node --test .jz/tests/{policy,tree,recovery,hook,opencode,verify}.test.mjs`: 91/91.
- Sandbox: `.jz/bin/jz-run node --test .jz/tests/`: 87 pass, 0 fail y 16 skip (las 12 de `sandbox.test.mjs` y las 4 de `verify.test.mjs` que necesitan `jz-run`).
- Aislamiento: `node --test .jz/tests/sandbox.test.mjs`: 12/12.
- Verificación reconocida: `.jz/bin/jz-verify run jz-core-tests`: `VALIDADO`, 68 pruebas superadas (las 67 de I1 y la nueva de la política), 0 fallidas, canceladas, omitidas y pendientes, unos 22 s. La evidencia del commit queda en `.jz-state/verify/jz-core-tests.json` (no versionado) y el informe de entrega cita su log.
- OpenCode real con modelo simulado (`node .jz/tests/opencode-native.mjs --src <worktree>`, sin cuota): 35/35 escenarios como se esperaba, sin regresión de las reglas nativas. No incluye escenarios de `jz-verify`: las reglas nuevas las cubre el emulador de `opencode.test.mjs`. Salida en `.jz-state/evidencia/JZ-I2-IMPLEMENT-001/opencode-native.txt`.
- No se ejecutó `integration.mjs`: consume cuota de los dos motores.

## 4. Riesgos residuales

| Riesgo | Clase |
|---|---|
| No es una atestación: root o el mismo usuario puede reescribir `.jz-state/verify/`, `runs.jsonl` y los logs de forma coherente. El digest no lleva clave. | Aceptado (I1 §4.1) |
| Un proceso dentro del sandbox puede escribir directamente en el stdout del runner (`/proc/<pid>/fd/1`) e imitar líneas `JZV1`. Con `jz-core-tests` sólo se ejecuta código del plano de control; un perfil futuro que ejecute código del proyecto o de `node_modules` hereda este riesgo, y además ese código decide qué afirman sus pruebas. | Bajo hoy; medio para perfiles del producto |
| Editar y revertir durante la ejecución: la instantánea es igual antes y después, pero las pruebas pudieron leer otro contenido. Un agente podría hacerlo con una ejecución en segundo plano. Las entradas de `jz-core-tests` son del plano de control, que los agentes no escriben. | Bajo hoy; medio para perfiles del producto |
| Archivos ignorados fuera de la huella: no se afirma su identidad (§2.6). | Abierto para perfiles del producto |
| El runtime registrado es `node` con sus bibliotecas mapeadas y `git`. El resto de `/usr` (`bash`, `jq`, util-linux), `/etc` y el núcleo no se registran. | Bajo, documentado |
| Sólo la última evidencia por perfil: un `FALLIDO` reemplaza a un `VALIDADO` anterior aunque fuera de otro estado. | Conservador |
| El oráculo depende del formato de eventos de Node 20.19.2. Otra versión de Node cambia el runtime (`OBSOLETO`), pero un cambio de formato podría rechazar ejecuciones legítimas (fallo cerrado) o, en teoría, aceptar un caso nuevo no caracterizado. Hay que repetir la caracterización al actualizar Node. | Medio al actualizar Node |
| Al no haber perfiles del producto, `jz-checkpoint --state validado` ya no es alcanzable para trabajo del producto. | Intencionado; requiere definir perfiles |
| `jz-state` y `jz-checkpoint` tardan más con evidencia (identidad del runtime: unos 100 MB de SHA-256). | Bajo |
| Si `jz-verify` muere con `SIGKILL`, `jz-run` sigue hasta terminar sin dejar evidencia (el estado anterior se mantiene). | Bajo |
| `opencode-native.mjs` no tiene escenarios de `jz-verify` con el motor real (sólo el emulador), y la prueba manual en la TUI de I1 (§8) sigue pendiente. | Abierto, revisión |

## 5. Handoff para la revisión independiente (OpenCode, sólo lectura)

- Worktree `/home/proyectos/jozeuzz-jz-i2`, rama `feat/jz-i2-verificacion`, base `96755110d8fa39f1f58167eafc4afa92d4415660`. Revisar con `git -C /home/proyectos/jozeuzz-jz-i2 show --stat HEAD` y `git diff 9675511..HEAD`.
- Archivos clave: `.jz/lib/verify.mjs` (perfiles, oráculo, ejecución, estado), `.jz/lib/verify-reporter.mjs`, `.jz/bin/jz-verify`, `.jz/profiles/jz-core-tests.json`, `.jz/lib/tree.mjs` (`snapshot`), `.jz/bin/jz-state`, `.jz/bin/jz-checkpoint`, `.jz/policy/policy.mjs` (`checkVerify`), `.opencode/jz-permissions.json` y `.jz/tests/verify.test.mjs`.
- Reproducción, sin efectos fuera de temporales y de `.jz-state/`:
  - `TMPDIR=<tmp> node --test .jz/tests/{policy,tree,recovery,hook,opencode,verify}.test.mjs`
  - `.jz/bin/jz-run node --test .jz/tests/` y `node --test .jz/tests/sandbox.test.mjs` (root)
  - `.jz/bin/jz-verify run jz-core-tests` y `.jz/bin/jz-verify status`; `.jz/bin/jz-state`
- Preguntas:
  1. ¿Hay alguna salida del Node Test Runner 20.19.2 que el oráculo acepte sin que se hayan ejecutado y superado las pruebas de los cinco archivos?
  2. ¿Puede un agente, con los comandos que admite la política, hacer que `status` muestre `VALIDADO` para un estado que no se verificó, o evitar que muestre `OBSOLETO` tras un cambio?
  3. ¿Hay alguna vía para que `jz-verify run` ejecute algo distinto del argv del perfil, o fuera de `jz-run`?
  4. ¿Las reglas nativas nuevas admiten algo que el plugin no rechace después?
  5. ¿El orden de decisión de `status` (§2.5) deja algún caso no verificable como `VALIDADO`, `OBSOLETO` o `SIN_VERIFICACION`?
