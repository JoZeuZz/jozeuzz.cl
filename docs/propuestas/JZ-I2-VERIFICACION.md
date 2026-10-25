# JZ-I2 — Verificación reconocida

Estado: **implementado en `feat/jz-i2-verificacion`; JZ-REVIEW-I2-001 emitió NO GO y JZ-I2-FIX-001 (§6) corrige la asociación entre unidad y perfil. Pendiente de una nueva revisión independiente de OpenCode y de la aceptación humana.** No es PASS hasta esa revisión.
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
| `unitId` | Unidad funcional canónica que acredita el perfil (misma forma que `id`). Desde JZ-I2-FIX-001 (§6). |
| `description` | Qué cubre y qué no. |
| `cwd` | `"."` (v1 sólo admite la raíz del worktree). |
| `argv` | Comando exacto: `node`, `--test`, `--test-reporter=./.jz/lib/verify-reporter.mjs` y, después, exactamente los archivos del oráculo, en el mismo orden. |
| `oracle` | `format: "node-test-jz-v1"`, `files`, `minTests` (≥ 1), `allowSkipped` y `allowTodo` (≥ 0). |
| `ignoredInputs` | `[]`. v1 no admite dependencias ignoradas por git (§2.5). |

Cualquier otra forma se rechaza al cargar (`JZ_VERIFY_PROFILE`): argv libre o `true`, otro ejecutable, opciones adicionales (`-e`, `--import`, `--test-only`, `--test-name-pattern`, otros reporters o destinos), archivos fuera del worktree o distintos de los del oráculo, campos desconocidos, un id que no coincide, JSON inválido y un perfil que sea un enlace simbólico.

El único perfil es `jz-core-tests` v2 (v1 hasta JZ-I2-FIX-001, sin `unitId`): `policy`, `tree`, `recovery`, `hook` y `opencode` (`.jz/tests/*.test.mjs`), con 0 omitidas y 0 pendientes admitidas. Acredita sólo la unidad `jz-control-core-suites`, esas cinco suites: no valida I2 completo, porque excluye `verify.test.mjs`, las pruebas de aislamiento (`sandbox.test.mjs`, en el host) y OpenCode real (`opencode-native.mjs`, `integration.mjs`). Esas cinco suites sólo importan módulos `node:` y rutas relativas del plano de control, y sus fixtures copian archivos del plano de control a directorios temporales. No se definió ningún perfil de `jozeuzz.cl`: antes hay que inspeccionar sus scripts y dependencias reales.

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
- `profile`: id, versión, `unitId`, digest del archivo y oráculo;
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
4. **OBSOLETO** si cambió el perfil (digest; si cambió su `unitId`, además «unidad acreditada cambiada») o se retiró, HEAD, el índice, la huella del árbol o el runtime (`node` y sus bibliotecas, o `git`). Volver exactamente al mismo estado la hace vigente otra vez.
5. **FALLIDO** o **VALIDADO**, según la evidencia.

La integridad se comprueba antes que la vigencia: lo que no se puede verificar nunca aparece como `OBSOLETO` ni como `VALIDADO`.

**No es una atestación criptográfica.** Root o cualquier proceso del mismo usuario puede reescribir `.jz-state`. El digest sólo detecta corrupción y ediciones descuidadas. Frente al modelo, la protección es la de I1: los agentes no escriben el plano de control y el sandbox no escribe `.jz-state`.

### 2.6 Dependencias ignoradas

La huella no cubre lo ignorado por git (`node_modules`, cachés). Para `jz-core-tests` no hay dependencias ignoradas: las suites sólo importan módulos `node:` y rutas relativas del plano de control. Un perfil v1 no puede declararlas (`ignoredInputs` debe ser `[]`), y cada evidencia registra `reproducible: false` para lo ignorado: no se afirma su identidad ni su reproducibilidad. El nivel con digest de `node_modules` o snapshot (`reproducible-attested`) queda fuera de I2.

### 2.7 Integración

- **`jz-state`** mantiene «Árbol actual con ejecución en verde» (compatibilidad), añade que no es una verificación reconocida y muestra la sección «Verificación reconocida» con `jz-verify status`. Si este termina con error (algún `BLOQUEADO`), el veredicto es `BLOQUEADO`.
- **`jz-checkpoint --state validado`** exige que `--unit` sea la unidad canónica de algún perfil y que todos los perfiles de esa unidad estén en `VALIDADO` para el estado actual (§6; la versión original de I2 aceptaba cualquier perfil en `VALIDADO`, el defecto de JZ-REVIEW-I2-001); si no, registra `incompleto` o `bloqueado` y avisa. El checkpoint anota la ejecución en verde, el estado de cada perfil y la cobertura de la unidad. Consecuencia: mientras no haya perfiles del producto, una unidad del producto no puede quedar como `validado`, que es lo que corresponde.
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

## 6. JZ-I2-FIX-001 — Asociación entre unidad y perfil

Encargo: JZ-I2-FIX-001, tras el NO GO de JZ-REVIEW-I2-001. Base: `6b08e5fa342906bf0b468a96190e1962f29a2573`.

### 6.1 Causa raíz

`jz-checkpoint` (en `6b08e5f`, líneas 45-54) calculaba `recognized` como la lista de perfiles en `VALIDADO` y aceptaba `--state validado` si no estaba vacía, sin relacionar ningún perfil con `--unit`. El perfil no declaraba qué unidad acredita, así que no había nada con qué comparar: con `jz-core-tests` vigente, `--unit "Landing jozeuzz.cl" --state validado` quedaba como `validado`. La prueba de `verify.test.mjs` (líneas 433-456) lo daba por bueno con la unidad `u`, que el perfil `fx` no cubre.

Reproducción (`repro-landing.sh`, repositorio desechable con `git archive 6b08e5f .jz` y `jz-run` real; salida en `.jz-state/evidencia/JZ-I2-FIX-001/rojo-landing-6b08e5f.txt`): `jz-verify run fx` → `VALIDADO`, y `jz-checkpoint --unit "Landing jozeuzz.cl" --state validado` → `- Estado declarado: validado`.

### 6.2 Contrato canónico unidad–perfil

- Cada perfil declara en su archivo protegido `unitId`, un identificador canónico (`^[a-z0-9][a-z0-9-]{0,63}$`). Es obligatorio: un perfil sin `unitId`, con una etiqueta libre («Landing jozeuzz.cl»), vacío u otro tipo no se reconoce (`JZ_VERIFY_PROFILE`).
- La asociación es la del registro actual `.jz/profiles/`, plano de control que los agentes no escriben (política y sandbox). No sale de los argumentos de `jz-checkpoint`, de las notas, de los problemas declarados ni de `.jz-state/`. Un perfil retirado (sólo queda su evidencia) no acredita ninguna unidad.
- `jz-checkpoint --state validado` compara `--unit`, tras normalizar los saltos de línea, por igualdad exacta con los `unitId` del registro. Sin comodines, mayúsculas, espacios ni listas: `ux `, `UX`, `ux,uy` o el id del perfil (`fx`, `jz-core-tests`) no son la unidad `ux`/`jz-control-core-suites`.
- Si varios perfiles declaran la misma unidad, **todos** deben estar en `VALIDADO` (conjunción).
- Resultado de la cobertura (siempre anotada en `- Cobertura de la unidad:`):

| Cobertura | Condición | Con `--state validado` se registra |
|---|---|---|
| `validada` | Algún perfil la declara y todos los que la declaran están en `VALIDADO` | `validado` |
| `ninguna` | Ningún perfil del registro la declara (unidad no registrada o etiqueta libre) | `incompleto` |
| `incompleta` | Algún perfil suyo está `FALLIDO`, `OBSOLETO` o `SIN_VERIFICACION` | `incompleto` |
| `bloqueada` | Algún perfil suyo está `BLOQUEADO` | `bloqueado` |
| `indeterminada` | `jz-verify status` ilegible, o un perfil del registro no se puede cargar (podría declararla) | `bloqueado` |

- Los estados `incompleto`, `bloqueado` y `cuota` admiten cualquier etiqueta (trabajo sin perfil, checkpoints del hook y del plugin) y también anotan la cobertura.
- **Cambiar la asociación** modifica el archivo del perfil: su digest cambia y la evidencia anterior pasa a `OBSOLETO` (con «unidad acreditada cambiada (ux → uz)»), así que no acredita ni la unidad antigua (que ya no tiene perfil) ni la nueva. Hace falta un `jz-verify run` nuevo. Volver exactamente al perfil anterior la hace vigente otra vez, como cualquier otra entrada (§2.5).
- La evidencia registra `profile.unitId`; `jz-verify status --json` añade a cada perfil `registered` (está en el registro) y `unit` (su `unitId`, o `null` si no se puede cargar o se retiró), y el texto muestra `[unidad …]`.

Tres conceptos distintos, cada uno en su sitio:

- **Verificación vigente de un perfil**: `jz-verify status` (`VALIDADO`… `SIN_VERIFICACION`).
- **Cobertura efectiva de una unidad**: `jz-checkpoint` (`- Cobertura de la unidad:`), que `jz-state` muestra en «Último checkpoint».
- **Estado operativo del worktree**: el veredicto de `jz-state` (`REANUDABLE` o `BLOQUEADO`), que no depende de que alguna unidad esté validada. `jz-state` advierte que un perfil `VALIDADO` sólo acredita su propia unidad.

`jz-core-tests` acredita `jz-control-core-suites`, no I2: la aceptación de I2 sigue requiriendo `verify.test.mjs` y `sandbox.test.mjs` en el host y la revisión independiente.

### 6.3 Cambios

- `.jz/lib/verify.mjs`: `unitId` obligatorio en el perfil, registrado en la evidencia y comprobado al calcular la vigencia; `status --json` con `registered` y `unit`; texto con `[unidad …]`.
- `.jz/profiles/jz-core-tests.json`: v2, `unitId: "jz-control-core-suites"` y la descripción con sus exclusiones.
- `.jz/bin/jz-checkpoint`: cobertura de la unidad con la tabla de §6.2, línea `- Cobertura de la unidad:` y avisos.
- `.jz/bin/jz-state`: nota de alcance tras «Verificación reconocida» y la cobertura en «Último checkpoint».
- `.jz/tests/verify.test.mjs`: la prueba extremo a extremo ya no acepta `u` y comprueba la regresión de Landing con `jz-run` real; diez pruebas nuevas (§6.4).
- Documentación: este documento, `docs/AUTONOMIA-JZ.md` y los perfiles de agente de implementador y orquestador de los dos motores.

Sin cambios en `jz-run`, el sandbox, el bloqueo de escritor, la política (`policy.mjs`), las reglas nativas de OpenCode, el hook, el plugin ni la política de Git. `jz-checkpoint` no gana opciones: `--profile` y similares siguen siendo argumentos desconocidos.

### 6.4 Pruebas

Rojo (`.jz-state/evidencia/JZ-I2-FIX-001/rojo.txt`, pruebas nuevas sobre el código de `6b08e5f`): 21 de 33 fallan. Las de perfiles y evidencia porque el esquema no admitía `unitId`; las de unidad, además, porque `jz-checkpoint` no anotaba cobertura ni distinguía la unidad. El defecto de fondo se reprodujo aparte con el perfil sin `unitId` (§6.1).

Pruebas nuevas (`verify.test.mjs`, jz-checkpoint real sobre evidencias del ejecutor simulado; corren también en el sandbox):

| Caso | Resultado |
|---|---|
| `fx` (unidad `ux`) `VALIDADO` + «Landing jozeuzz.cl» | `incompleto`, cobertura `ninguna`, `fx VALIDADO` sigue en «Verificación reconocida» |
| `fx` `VALIDADO` + `ux` | `validado`, «perfiles que la acreditan: fx VALIDADO» |
| `uz`, `fx`, `jz-core-tests`, `ux `, ` ux`, `UX`, `ux\n`, `ux,uy`, `ux*` | `incompleto` |
| Perfil aplicable `SIN_VERIFICACION`, `FALLIDO`, `OBSOLETO` | `incompleto` |
| Perfil aplicable `BLOQUEADO` (log borrado); perfil del registro ilegible | `bloqueado` |
| `fy` (unidad `uy`) sin ejecutar y `fx` `VALIDADO` + `uy`; `--profile fx`, `--unit-id ux`, `--verified-by fx`; nota y problema que afirman cobertura | `incompleto`; código 2 «argumento desconocido»; `incompleto` |
| Dos perfiles de la misma unidad, uno sin ejecutar / los dos `VALIDADO` | `incompleto` / `validado` |
| `unitId` cambiado de `ux` a `uz` | `fx` `OBSOLETO` («unidad acreditada cambiada (ux → uz)»), `ux` y `uz` `incompleto`; tras una verificación nueva, `uz` `validado` |
| `incompleto`, `bloqueado`, `cuota` con «Landing jozeuzz.cl» | Se conservan, sin aviso, con cobertura `ninguna` |
| `jz-verify status` (texto y `--json`) | `unit`/`registered`; `[unidad ux]` y `[unidad no determinable]` |
| Perfiles inválidos | Sin `unitId`, etiqueta libre, vacío y lista |
| Extremo a extremo (host, `jz-run` real) | Landing → `incompleto`; `unidad-fx` → `validado`; `jz-state` muestra `[unidad unidad-fx]`, la nota de alcance y la cobertura del último checkpoint; tras `jz-run true` sobre un cambio, `incompleto` |

### 6.5 Resultados (2026-10-24, host `root`, Node 20.19.2)

Salidas en `.jz-state/evidencia/JZ-I2-FIX-001/` (no versionado).

- Host: `node --test .jz/tests/{policy,tree,recovery,hook,opencode,verify}.test.mjs`: 101/101 (`verde-host.txt`).
- Sandbox: `.jz/bin/jz-run node --test .jz/tests/`: 97 pass, 0 fail y 16 skip (las 12 de `sandbox.test.mjs` y las 4 de `verify.test.mjs` que necesitan `jz-run`) (`verde-sandbox.txt`).
- Aislamiento: `node --test .jz/tests/sandbox.test.mjs`: 12/12 (`verde-aislamiento.txt`).
- Regresión de Landing con `jz-run` real (`repro-landing.sh` sobre el árbol corregido, `verde-landing-worktree.txt`): «Landing jozeuzz.cl» → `incompleto` con aviso y cobertura `ninguna`; `unidad-fx` → `validado`, «perfiles que la acreditan: fx VALIDADO».
- `.jz/bin/jz-verify run jz-core-tests` (árbol corregido antes del commit): `VALIDADO`, v2, unidad `jz-control-core-suites`, 68 pruebas superadas, 0 fallidas, canceladas, omitidas y pendientes.
- Permisos de `jz-verify` en OpenCode: el emulador de reglas nativas (`opencode.test.mjs`) y la política (`policy.test.mjs`) siguen en verde: `status` para orquestador e implementador, `run <id>` sólo para el implementador, orquestador denegado y argumentos extra, redirecciones, expansiones, `&` y rutas ajenas rechazados. OpenCode real con modelo simulado (`opencode-native.mjs`, sin cuota): 35/35 escenarios como se esperaba (`opencode-native.txt`).
- No se ejecutó `integration.mjs` (consume cuota de los dos motores).

### 6.6 Limitaciones residuales

| Limitación | Clase |
|---|---|
| La asociación vive en el perfil: quien puede escribir el plano de control (humano o root) puede cambiarla. Los agentes no pueden, y el cambio deja `OBSOLETO` la evidencia anterior. No es una atestación (§2.5). | Aceptado |
| Un perfil acredita una sola unidad; una unidad con varios perfiles exige todos (conjunción). No hay unidades compuestas ni jerarquía. | Intencionado |
| Un perfil del registro que no se puede cargar deja la cobertura `indeterminada` para todas las unidades (`bloqueado`), aunque no las declarara. | Conservador |
| Con `--state validado`, un perfil aplicable `BLOQUEADO` registra ahora `bloqueado`, no `incompleto` como en I2. | Cambio documentado |
| `statusAll` lee el archivo del perfil dos veces (estado y unidad). Un cambio del perfil entre ambas lecturas requiere escribir el plano de control mientras corre `jz-checkpoint`. | Bajo |
| Los estados de progreso admiten cualquier etiqueta: no se comprueba que «incompleto» o «cuota» describan trabajo real. | Intencionado |
| `jz-core-tests` acredita `jz-control-core-suites`, no I2 completo: excluye `verify.test.mjs`, las pruebas de aislamiento y OpenCode real. No hay perfiles del producto. | Documentado |
| `opencode-native.mjs` sigue sin escenarios de `jz-verify` con el motor real (sólo el emulador); la prueba manual en la TUI de I1 sigue pendiente. | Abierto, revisión |
| La evidencia previa a este cambio (perfil v1, sin `unitId`) queda `OBSOLETO`: hay que repetir `jz-verify run jz-core-tests`. | Esperado |

### 6.7 Handoff para la revisión focalizada (OpenCode, sólo lectura)

- Worktree `/home/proyectos/jozeuzz-jz-i2`, rama `feat/jz-i2-verificacion`, base `6b08e5f`. Revisar con `git -C /home/proyectos/jozeuzz-jz-i2 show HEAD` y `git diff 6b08e5f..HEAD`.
- Archivos: `.jz/bin/jz-checkpoint` (cobertura), `.jz/lib/verify.mjs` (`validateProfile`, `profileStatus`, `statusAll`, CLI), `.jz/profiles/jz-core-tests.json`, `.jz/bin/jz-state`, `.jz/tests/verify.test.mjs` (pruebas «unidad: …» y la extremo a extremo).
- Reproducción, sin efectos fuera de temporales y de `.jz-state/`: `TMPDIR=<tmp> node --test .jz/tests/verify.test.mjs`; `.jz/bin/jz-verify run jz-core-tests`; `.jz/bin/jz-checkpoint --unit "Landing jozeuzz.cl" --state validado --next n` (debe quedar `incompleto`) y `--unit jz-control-core-suites` (debe quedar `validado` con evidencia vigente).
- Preguntas:
  1. ¿Puede alguna `--unit` distinta del `unitId` exacto de un perfil vigente quedar como `validado`?
  2. ¿Puede un agente, con los comandos que admite la política, alterar la asociación unidad–perfil (argumentos, notas, `.jz-state/`, evidencias de perfiles retirados)?
  3. ¿Algún estado del perfil aplicable distinto de `VALIDADO` (o un registro parcialmente ilegible) acaba en `validado`?
  4. ¿Cambiar el `unitId` de un perfil deja alguna evidencia anterior acreditando la unidad nueva o la antigua?

No es PASS de I2: la aceptación requiere esa revisión independiente.
