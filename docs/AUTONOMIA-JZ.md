# Autonomía supervisada de los especialistas `jz-*`

Estado: **configuración local validada** (2026-10-16) en Claude Code 2.1.301 y OpenCode 1.17.18. Complementa `docs/AGENTES-JZ.md` (perfiles y modelos) y no depende de la CLI `jz-ai` (M1–M3).

## 1. Objetivo y amenaza

Los motores completan sin confirmaciones humanas una tarea de desarrollo aprobada: investigar, planificar, delegar, editar, probar, corregir, verificar y dejar un handoff recuperable. Desde I1 (`docs/propuestas/JZ-I1-CONTENCION.md`) los commits los hace el humano: Git de escritura está denegado a todos los agentes. A la vez, no pueden alterar el CT ni otros proyectos.

El CT es compartido, el usuario es `root` y pertenece al grupo `docker`. Cualquier proceso con shell libre controla el host a través de `/var/run/docker.sock`, incluidos Wealthfolio y los demás servicios. La configuración global de OpenCode concede además `"*": allow` y `external_directory: allow`. Por eso las restricciones no se apoyan en el texto de los prompts, sino en controles que el modelo no puede eludir.

## 2. Capas de control

1. **Herramientas por perfil.** Explorer, Security y QA no tienen shell ni herramientas de edición en ningún motor. OpenCode retira del modelo las herramientas denegadas, y en Claude Code la lista `tools:` del perfil define las únicas herramientas disponibles.
2. **Reglas nativas.** En OpenCode, el `permission` V1 de cada perfil parte de `"*": deny` y anula el `allow` global. Los perfiles de `.opencode/agents` son de sólo lectura (sin `edit` ni `bash`, y el orquestador sólo delega en explorer, security y qa): es lo que rige si el plugin no carga. Al cargarse, el plugin aplica con su hook `config` los permisos operativos de `.opencode/jz-permissions.json` (`edit`, `bash` y `task`). OpenCode compara esas reglas como texto: los patrones de lectura de git no terminan en `*` pegado (`"git diff*"` admitiría `git difftool -x`) y las denegaciones finales excluyen redirecciones (`>`, `<`), expansiones (`$`, comillas invertidas), `&`, `\`, `ls` fuera del worktree y las opciones de git que leen o escriben archivos (`--output`, `--contents`, `--no-index`, `--ext-diff`…). En Claude Code, `.claude/settings.json` deniega `git push`, `docker` y la lectura de `.env`.
3. **Política determinista por rol** (`.jz/policy/policy.mjs`). La aplican el hook `PreToolUse` de Claude Code (`.jz/hooks/claude-policy.mjs`) y el plugin de OpenCode (`.opencode/plugins/jz-guard.js`). Para el trabajo ordinario dentro del alcance responde `allow`, de modo que no hay preguntas ni intervención del clasificador. Para todo lo demás responde `deny`, también en modo automático y con fallo cerrado ante errores: la política se importa dentro del manejador de errores (si falta o lanza, se deniega a los `jz-*` y a toda delegación), una entrada inválida sale con código 2 y el hook `PreToolUse` declara `"onFailure": "block"`, de modo que un hook que no arranca o agota su `timeout` también bloquea (Claude Code ≥ 2.1.295; comprobado en 2.1.310). Funciona así:
   - analiza el comando completo sin expansiones y valida por separado cada segmento unido con `&&`, `||` o `;`. Rechaza `&`, `$()`, comillas invertidas, variables (salvo `$?` en `echo`), redirecciones a archivo, subshells, asignaciones de entorno y comodines sin comillas (`*`, `?`, `[`). Valida antes que el comando el directorio de trabajo (el `workdir` de OpenCode), resolviendo enlaces. Admite `cd` a un directorio existente del worktree (no `cd -` ni `cd ±N`; los dos motores fijan `CDPATH` vacío), `echo` y filtros de salida (`| tail -n 40`). El analizador sigue reconociendo el heredoc de `git commit -m "$(cat <<'EOF' … EOF)"`, pero desde I1 el commit se deniega;
   - deniega `git add`, `commit`, `rm`, `mv` y `restore` a todos los roles, con cualquier ruta u opción: modifican el índice o el historial sin pasar por la validación de rutas y ejecutan hooks y filtros fuera de `jz-run`;
   - en git de lectura, deniega rutas fuera del worktree o de secretos (con dos rutas y una externa, `git diff` compara sin índice y lee cualquier archivo), las opciones largas que leen o escriben archivos también abreviadas (`blame --cont=`, porque git acepta prefijos únicos) y las cortas equivalentes (`blame -S`, `ls-files -X`, `-O`). El historial (`git show`, `git log -p`) sigue legible entero;
   - resuelve los enlaces simbólicos antes de autorizar una lectura o una escritura;
   - protege el plano de control: `.git`, `.claude/`, `.opencode/`, `.jz/`, `.jz-state/` (salvo `notes/`), `AGENTS.md`, `CLAUDE.md`, `opencode.json[c]` y `.mcp.json`;
   - impide la lectura de secretos (`.env*`, salvo los de ejemplo, además de `*.pem`, `*.key` e `id_*`) y de rutas fuera del worktree con las herramientas de lectura y con los comandos de shell que admite, con la excepción de las skills y de los resultados de herramientas del propio motor;
   - en OpenCode, deniega a los `jz-*` las herramientas que no reconoce (salvo `skill` y `todowrite`), y el plugin no carga si el worktree no es un repositorio verificable (OpenCode pasa `/` fuera de git);
   - limita la delegación: sólo el orquestador delega, sólo en `jz-*` y nunca en sí mismo ni en agentes genéricos;
   - mantiene un único escritor por worktree mediante `.jz-state/writer.lock`, que comparten los dos motores; el bloqueo se escribe en un temporal y se crea con `link(2)`, así que nunca es visible a medio escribir. Un bloqueo cuyo proceso ya no existe se recupera solo, bajo un mutex (`writer.lock.recover`) y sólo si sigue siendo el mismo que se leyó; liberar y vincular la sesión también toman el mutex, y un bloqueo ilegible de menos de un minuto se trata como activo. Así, dos recuperaciones simultáneas no admiten dos escritores (entrelazados reproducidos en `policy.test.mjs`). Si un proceso muere con el mutex tomado, esas operaciones quedan denegadas hasta que el humano ejecute `.jz/bin/jz-lock release`. El bloqueo registra motor, pid, sesión que delega, sesión escritora (en OpenCode, vinculada en su primera petición al modelo), agente y llamada. `jz-state` sólo lo considera propio si coincide la **sesión** de quien consulta (`CLAUDE_CODE_SESSION_ID` en Claude Code; `JZ_SESSION`, que el plugin pasa a la shell, en OpenCode). Compartir proceso no basta: si la sesión es otra o no puede verificarse, el veredicto es `BLOQUEADO`. En Claude Code, el orquestador y su subagente comparten sesión, así que el mensaje nombra al agente titular en lugar de afirmar quién escribe.
4. **Ejecutor acotado** (`.jz/bin/jz-run`). Es la única vía para ejecutar código del proyecto (tests, typecheck, lint, build y scripts de `package.json`):
   - crea espacios de nombres nuevos de montaje, PID, red, IPC y UTS, y una raíz mínima con `pivot_root`, desmontando por completo la raíz anterior;
   - monta `/usr` y `/etc` en sólo lectura, sin `/etc/shadow`, `/etc/ssh`, `/etc/ssl/private` ni `/etc/docker`;
   - no monta `/root`, `/var`, `/home` de otros proyectos ni `docker.sock`;
   - los secretos del propio worktree (`.env*` salvo los de ejemplo, `*.pem`, `*.key`, `*.p12`, `*.pfx` e `id_*`, fuera de `node_modules`, `.git` y `.next*`) se ven vacíos y en sólo lectura, con los mismos patrones que aplica la política a las lecturas;
   - deja sin red al proceso (sólo tiene su propio loopback);
   - el proceso no tiene capacidades: el bounding set está vacío y `no_new_privs` activo, así que no puede remontar ni crear user namespaces;
   - el entorno se vacía, de modo que no hereda los tokens del agente;
   - el worktree es escribible, salvo el plano de control, que queda en sólo lectura;
   - al terminar, registra el resultado en `.jz-state/runs.jsonl` (comando, `rc`, `head`, huella del árbol y log). La huella y la lista de cambios de `jz-state` las calcula `.jz/lib/tree.mjs` sin `git status` ni `git diff` contra el árbol: no ejecuta filtros `clean`, `textconv` ni `fsmonitor` del repositorio, no sigue enlaces simbólicos, no abre FIFO ni dispositivos y no pasa nombres de archivo como argumentos. La huella liga `HEAD`, el índice completo (modo, OID, stage y ruta de cada entrada, incluidos los conflictos) y el contenido, tipo y permisos de cada ruta rastreada o no ignorada. La huella es el SHA-256 completo. Falla cerrada, con un código `JZ_TREE_*` y `jz-state` en `BLOQUEADO` (y `jz-run` no ejecuta el comando), ante nombres no UTF-8 (`JZ_TREE_NON_UTF8`), repositorios anidados o entradas `.git` a cualquier profundidad de lo no ignorado (`JZ_TREE_NESTED_REPO`), gitlinks o submódulos (`JZ_TREE_GITLINK`), errores de lectura (`JZ_TREE_IO`), archivos que cambian mientras se leen (`JZ_TREE_RACE`) y una configuración que desplace el árbol (`core.worktree`, `JZ_TREE_TOPLEVEL`). Los archivos ignorados (`node_modules`, cachés) siguen fuera de la huella, igual que los indicadores del índice (`intent-to-add`, `skip-worktree`, `assume-unchanged`). Además, pone en cuarentena (`.jz-state/quarantine/`) los archivos de control que se hayan creado y los enlaces simbólicos nuevos que apunten fuera del worktree o al plano de control, y en ese caso devuelve el código 86.

   Sólo usa `unshare`, `setpriv`, `mount` y `pivot_root` de util-linux 2.41, que ya están instalados. El sandbox nativo de Claude Code necesita `bubblewrap` y `socat`, y no se instalaron (§8).
5. **Verificación reconocida** (`.jz/bin/jz-verify`, I2; diseño en `docs/propuestas/JZ-I2-VERIFICACION.md`). Una ejecución de `jz-run` con `rc=0` no valida nada por sí misma. Sólo un perfil del registro `.jz/profiles/` (plano de control) produce evidencia reconocida: `jz-verify run <perfil>` ejecuta su argv exacto mediante `jz-run`, comprueba desde fuera del sandbox HEAD, índice, huella y runtime antes y después, el registro de `runs.jsonl` y el resultado estructurado del Node Test Runner (reporter `.jz/lib/verify-reporter.mjs`), y escribe la evidencia en `.jz-state/verify/<perfil>.json`. `jz-verify status` la clasifica como `VALIDADO`, `FALLIDO`, `OBSOLETO`, `BLOQUEADO` o `SIN_VERIFICACION`. Cada perfil acredita una sola unidad funcional, declarada en el propio perfil protegido (`unitId`). Hoy hay un perfil, `jz-core-tests`, que acredita sólo la unidad `jz-control-core-suites` (las cinco suites del plano de control que corren en el sandbox): no valida I2 completo (excluye `verify.test.mjs`, las pruebas de aislamiento de `sandbox.test.mjs` y OpenCode real) ni el producto, del que no hay perfiles.

## 3. Permisos efectivos

| Agente | Claude Code (herramientas → política) | OpenCode (`permission` → plugin) |
|---|---|---|
| `jz-orchestrator` | Read, Grep, Glob, Skill, TodoWrite, Bash, `Agent(jz-architect, jz-explorer, jz-implementer, jz-security, jz-qa)`. La shell sólo admite lectura de git (`status`, `diff`, `log`, `show`, `rev-parse`, `ls-files`, `blame`, `branch --show-current`, `worktree list`, `remote -v`), `jz-state`, `jz-checkpoint`, `jz-lock status`, `jz-verify status`, `ls` y `pwd`. Sin escritura, `jz-run` ni `jz-verify run`. | Igual (con el plugin cargado). Perfil base: `edit` y `bash` denegados y `task` sólo hacia explorer, security y qa; el plugin añade la shell y la delegación en los seis `jz-*`. |
| `jz-architect` | Read, Grep, Glob, Write, Edit y Skill; escribe sólo en `docs/` y `.jz-state/notes/`. Sin shell. Precarga `writing-plans`. | `edit` sólo en `docs/*` y `.jz-state/notes/*`; `bash: deny`; `task: deny`. |
| `jz-implementer` (y `-copilot` en OpenCode) | Read, Grep, Glob, Bash, Edit, Write y Skill. Edita el worktree salvo el plano de control y los secretos. La shell admite `jz-run <cmd>`, `jz-verify run <perfil>` y `status`, `jz-state`, `jz-checkpoint`, git sólo de lectura (`add`, `commit`, `rm`, `mv` y `restore` denegados desde I1), `ls` y `pwd`. Precarga `test-driven-development` y `verification-before-completion`. | `edit` igual; `bash` con una lista blanca equivalente; `task: deny`. |
| `jz-explorer` | Read, Grep, Glob (dentro del worktree y las skills). | Sólo `read`, `glob`, `grep`, `list`, `skill` y `todowrite`. |
| `jz-security` | Read, Grep, Glob. | Igual que explorer. |
| `jz-qa` | Read, Grep, Glob y Skill. Precarga `verification-before-completion`. | Igual que explorer. |

Todos los perfiles tienen denegadas, en ambos motores, `webfetch`, `websearch`, las herramientas MCP, `question` y `doom_loop`.

Siempre requieren intervención humana:

- Los commits (`git add`, `commit`, `rm`, `mv`, `restore`), desde I1. Hasta que exista un ejecutor Git confinado, el implementador deja los cambios validados en el árbol y propone el mensaje.
- `git push`, `merge`, `rebase`, `reset`, `checkout`, `stash`, `clean`, `tag`, `config` y crear, mover o borrar ramas o worktrees. Afectan a historial compartido o pueden descartar trabajo no confirmado.
- Instalar dependencias o cualquier operación con red, porque `jz-run` no tiene red. Es una superficie de cadena de suministro y requiere autorización.
- Modificar el plano de control (`.claude/`, `.opencode/`, `.jz/`, `AGENTS.md`, `CLAUDE.md`). Es lo que define los permisos de los agentes.
- Revisar la cuarentena y liberar a mano un bloqueo de escritor vivo (`.jz/bin/jz-lock release --force`).
- Docker, servicios, bases de datos y despliegues. Están fuera del alcance de los agentes.

## 4. Protocolo de coordinación

`jz-architect`/`jz-explorer` → informe verificable → `jz-implementer` → pruebas en `jz-run` → `jz-security`/`jz-qa` → corrección → verificación del orquestador.

- El orquestador arranca con `.jz/bin/jz-state` y se detiene si el veredicto es `BLOQUEADO`.
- La investigación en lectura (explorer, security y qa) puede ir en paralelo. Los escritores (`jz-implementer*` y `jz-architect`) van de uno en uno y en primer plano; el bloqueo lo impone el sistema.
- No hay cadenas: los subagentes no tienen la herramienta de delegación en Claude Code y tienen `task: deny` y bloqueo en la política en OpenCode. La delegación nunca sube de privilegios: el orquestador, sin escritura, sólo puede delegar en roles ya definidos y acotados.
- Como máximo dos ciclos de corrección por unidad; después, se detiene y lo informa.
- La verificación no se apoya en lo que diga el implementador. La sección «Verificación reconocida» de `jz-state` (o `jz-verify status`) debe mostrar en `VALIDADO` el perfil cuya unidad (`[unidad …]`) es la del trabajo; un perfil `VALIDADO` de otra unidad no acredita nada más: la evidencia la escribe `jz-verify` fuera del sandbox, a partir de la huella y del registro de `jz-run`, y ningún agente puede escribirla. «Árbol actual con ejecución en verde: sí» se mantiene por compatibilidad, pero sólo significa que alguna ejecución de `jz-run` terminó con `rc=0` sobre ese árbol, sea cual sea el comando (`jz-run true` basta): no es una verificación reconocida. Sin perfil aplicable (hoy no hay perfiles del producto), el estado honesto de la unidad es `incompleto`.

Cada especialista termina su respuesta con este bloque:

```
INFORME-JZ
rol: jz-…
unidad: <unidad funcional>
archivos: leídos … / cambiados …
evidencia: <comandos jz-run y logs .jz-state/runs/…, rc>
hallazgos: …
estado: validado | incompleto | bloqueado | cuota
siguiente: …
```

## 5. Arranque en modo automático

Desde la raíz del worktree:

```sh
# Claude Code: el orquestador es la sesión principal; los subagentes heredan el modo auto.
claude --agent jz-orchestrator --permission-mode auto
claude -p --agent jz-orchestrator --permission-mode auto "<tarea>"     # no interactivo

# OpenCode: --auto aprueba lo que no está denegado explícitamente; las denegaciones se mantienen.
opencode --agent jz-orchestrator                                       # TUI
opencode run --agent jz-orchestrator --auto "<tarea>"                  # no interactivo
```

- OpenCode toma el directorio de la sesión de `PWD`, no del directorio actual del proceso. Desde scripts o herramientas que cambian de directorio sin actualizar `PWD`, pasa siempre `--dir <worktree>`. Si no, la sesión puede trabajar en otro worktree; ocurrió durante la validación (§7).
- No uses `bypassPermissions`, `--dangerously-skip-permissions` ni `opencode run --auto`. Con `opencode --pure` u `OPENCODE_PURE=1` el plugin no carga y los agentes `jz-*` quedan en sólo lectura: sirve para revisar, no para implementar.
- Si Claude Code se abre sin `--agent`, la sesión principal no queda restringida por la política. Sigue el modo de permisos del usuario, aunque sus subagentes `jz-*` sí están restringidos.
- En OpenCode, los agentes `build` y `plan` heredan el `allow` global del usuario. Para trabajar en autónomo, usa siempre `--agent jz-orchestrator`.

## 6. Continuidad ante cuotas e interrupciones

El estado se guarda en `.jz-state/` (ignorado por git, local al worktree):

| Archivo | Quién lo escribe | Contenido |
|---|---|---|
| `runs.jsonl` y `runs/*.log` | `jz-run` | Cada ejecución real: comando, `rc`, `head`, huella del árbol y salida. |
| `verify/<perfil>.json` | `jz-verify` | Última verificación reconocida del perfil: perfil y digest, comando, HEAD, índice y huella antes y después, runtime, registro y log de `jz-run`, resultado estructurado de las pruebas, estado y fecha. |
| `writer.lock` | hook o plugin | Escritor activo: motor, pid, sesión que delega, sesión escritora (OpenCode), agente, llamada y hora. |
| `checkpoints/*.md`, `LATEST.md` | `jz-checkpoint` | Unidad, estado declarado, problemas, siguiente paso y el estado real completo. |
| `notes/*.md` | implementer o architect | Notas libres del handoff. |
| `quarantine/` | `jz-run` | Rutas de control o enlaces hacia fuera creados por un comando. |

`jz-checkpoint --state validado` sólo queda como validado si `--unit` es, exactamente, la unidad canónica (`unitId`) de algún perfil de `.jz/profiles/` y todos los perfiles que la declaran están en `VALIDADO` para el estado actual (desde JZ-I2-FIX-001; en I2 bastaba cualquier perfil en `VALIDADO`, y antes una ejecución de `jz-run` en verde). Si la unidad no tiene perfil o alguno de los suyos está `FALLIDO`, `OBSOLETO` o `SIN_VERIFICACION`, se registra como `incompleto`; si alguno está `BLOQUEADO` o la asociación no se puede determinar, como `bloqueado`; en ambos casos se avisa. Los estados `incompleto`, `bloqueado` y `cuota` admiten cualquier etiqueta de unidad. El checkpoint anota la ejecución en verde (compatibilidad), el estado de cada perfil y la cobertura de la unidad declarada (perfiles que la acreditan y sus estados). Así se distingue el código validado de los cambios a medias sin depender de la palabra del agente.

**Cuando se agota la cuota:**

1. El sistema corta los reintentos:
   - **OpenCode** reintenta por su cuenta de forma indefinida, con espera exponencial: en el registro del 2026-10-16 hay una sesión de POC-1b que seguía reintentando 35 minutos después del primer error `The usage limit has been reached`. Para evitarlo, el plugin `jz-guard` observa los eventos `session.status` de tipo `retry`. Si el mensaje indica cuota agotada (*usage limit*, *quota*, *billing*), actúa en el primer reintento; si es un límite de velocidad (429), al tercero. Entonces libera el bloqueo de escritor, escribe un checkpoint con estado `cuota` y aborta la sesión.
   - **Claude Code** no reintenta indefinidamente. El evento `StopFailure` (el turno termina por un error de la API) libera el bloqueo y escribe el checkpoint.
2. El agente no reintenta. Si su rol puede, completa el checkpoint con `.jz/bin/jz-checkpoint --unit "…" --state cuota --next "…"`.
3. El humano no usa `--continue` a ciegas sobre la misma tarea. `opencode run` termina con código 0 aunque la sesión se haya abortado, así que el indicador fiable es `.jz-state/LATEST.md`.
4. Comprueba la cuota en el otro motor.

**Al reanudar con cualquier motor:**

1. Ejecuta `.jz/bin/jz-state`. Debe dar `REANUDABLE`: sin procesos `claude` u `opencode` vivos en el worktree, sin un bloqueo de escritor vivo de otro proceso o de otra sesión (o de una sesión que no pueda verificarse) y sin cuarentena pendiente.
2. Lee `.jz-state/LATEST.md` y las notas, y revisa `git diff` y `git log`.
3. Pide al orquestador que continúe desde el «siguiente paso» del checkpoint, verificando primero el estado. Nunca hay que repetir la última tarea ni descartar los cambios pendientes: ningún agente tiene `reset`, `checkout`, `stash` ni `clean`.

El procedimiento sólo usa los scripts de `.jz/bin/` y git, así que no necesita `jz-ai`.

## 7. Validación

Las pruebas se reproducen así:

```sh
.jz/bin/jz-run node --test .jz/tests/            # política, hook, huella y recuperación (en el sandbox; omite las del sandbox)
node --test .jz/tests/sandbox.test.mjs            # aislamiento de jz-run (en el host)
node --test .jz/tests/verify.test.mjs             # verificación reconocida (en el host; en el sandbox omite las que usan jz-run)
.jz/bin/jz-verify run jz-core-tests               # evidencia reconocida del plano de control (.jz-state/verify/)
node .jz/tests/opencode-native.mjs                # OpenCode real con un modelo simulado local (sin cuota)
node .jz/tests/integration.mjs --base <dir>       # motores reales en un repositorio desechable
```

`opencode-native.mjs` ejecuta el binario de OpenCode instalado contra un servidor OpenAI-compatible simulado en `127.0.0.1`, que dicta una sola llamada de herramienta por escenario, con datos de OpenCode aislados en un directorio temporal. Comprueba sobre el sistema de archivos el resultado con el plugin cargado, con `--pure`, sin el archivo del plugin, con la política rota, con un error al inicializar, sin `jz-permissions.json` y con sólo el hook `config` (reglas nativas operativas sin la validación por llamada).

`recovery.test.mjs` simula sin consumir cuota el `StopFailure` de Claude Code y el reintento por cuota de OpenCode sobre un repositorio desechable. Comprueba la liberación del bloqueo, el checkpoint `cuota`, el rechazo de un segundo escritor por el plugin y el veredicto de `jz-state`.

`integration.mjs` crea por escenario un repositorio desechable con una copia del plano de control y, a su lado, un directorio «ajeno» con un secreto ficticio. Comprueba el resultado sobre el sistema de archivos y git, no sobre lo que el modelo afirma. Resultados del 2026-10-16 con los modelos de los perfiles:

- **Claude Code:** 6/6. I2–I4 salieron en la corrida completa. I1, I5 e I6 cayeron en esa corrida por el límite de uso de la cuenta (`rate_limit_event`) y se repitieron en verde después del reinicio de la cuota.
- **OpenCode:** I1–I4 e I6 en verde. En I5 el orquestador `gpt-5.6-sol` se negó a lanzar escritores en paralelo porque el protocolo lo prohíbe, así que no hubo escritura doble, pero el bloqueo no se ejercitó. El rechazo lo cubre de forma determinista `recovery.test.mjs`, y en una corrida anterior también se observó en vivo.
- **Recuperación tras cuota en una tarea real del POC (2026-10-16 15:41Z):** al agotarse la cuota de Claude Code, `StopFailure` dejó un checkpoint `cuota` para `jz-architect` y ningún bloqueo colgado.

El escenario I6 comprueba que la sesión trabaja en el worktree indicado aunque el proceso arranque con un `PWD` obsoleto: en OpenCode con `--dir` y en Claude Code con su directorio de trabajo. Los resultados están en `docs/AGENTES-JZ.md` §3.

## 8. Limitaciones conocidas

- **Cuarentena, no prevención.** `jz-run` no puede impedir que un comando cree un archivo de control que no existía, como `opencode.json` en la raíz. Lo detecta al terminar, lo mueve a cuarentena y el estado queda `BLOQUEADO` hasta que lo revise un humano. Mientras dura la ejecución, otra sesión que arranque podría leerlo.
- **Código del proyecto.** Dentro de `jz-run` se ejecuta código arbitrario, pero confinado: puede romper o borrar archivos del worktree, aunque no los del plano de control ni el historial de git. Los cambios sin confirmar se protegen con commits frecuentes, que hace el humano.
- **El hook no es una frontera frente a root.** La política la aplican el hook y el plugin, que corren como el mismo usuario que el motor (`root` en este CT). Protegen frente al modelo, no frente a otro proceso del mismo usuario; la contención de procesos la da `jz-run`.
- **Enlaces internos y herramientas en paralelo.** `jz-run` pone en cuarentena al terminar los enlaces nuevos hacia el plano de control, pero no impide que, mientras corre, una edición de OpenCode en paralelo siga un enlace recién creado: la política resuelve la ruta antes de la llamada. No se verificó si OpenCode ejecuta herramientas en paralelo dentro de una sesión.
- **Git de lectura en el host.** El orquestador y el implementador pueden ejecutar `git status`, `diff`, `log`, `show`, `blame`, `ls-files`, `rev-parse`, `branch --show-current`, `worktree list` y `remote -v` fuera del sandbox, sin las garantías de `jz-run` ni de `tree.mjs`. Los dos motores les fijan `GIT_OPTIONAL_LOCKS=0` y `core.fsmonitor=false` (en `.claude/settings.json` y en el hook `shell.env` del plugin), pero siguen aplicando los filtros y `textconv` que defina la configuración de Git, que es plano de control (hoy no hay ninguno configurado); los atributos sí los elige el agente. `git show` y `git log -p` leen el historial completo, incluidos secretos que se hubieran confirmado. Estos comandos son de diagnóstico: la validación se apoya sólo en la huella de `tree.mjs`. `jz-state` y `jz-run` consultan rama y `HEAD` con un entorno Git limpio (sin `GIT_DIR` heredado, sin configuración global, sin fsmonitor ni hooks).
- **Sesiones sin `--agent`.** La política no se aplica al hilo principal de Claude Code sin `--agent` ni a los agentes no `jz-*` de OpenCode.
- **Plugin de OpenCode.** OpenCode 1.17.18 sigue funcionando sin él si no carga (`--pure`, archivo ausente, error al importar la política o al inicializarse): sólo registra `failed to load plugin`. En esos casos rigen los perfiles base, de sólo lectura; comprobado con `opencode-native.mjs`. El hook `permission.ask` de la API de plugins no se invoca en esta versión, así que el plugin no puede aprobar llamadas que las reglas nativas pregunten. Las reglas nativas operativas no son un analizador de shell: OpenCode separa `;`, `&&`, `|` y `$(…)` en comandos y compara cada uno como texto; la validación semántica la hace el plugin. `opencode debug agent` muestra los permisos antes del hook `config`, no los efectivos.
- **Sandbox nativo de Claude Code.** No está disponible: faltan `bubblewrap` y `socat`. Instalarlos permitiría añadir `sandbox.enabled` como otra capa, pero requiere autorización.

## 9. Integración selectiva en el worktree de POC

Se integró por copia selectiva, sin fusionar ramas, en `poc/candidata-a-1b` (`27e3323`, 2026-10-16). Las correcciones que nacieron allí (ocultación de secretos en `jz-run`, pruebas de recuperación e I6) se portaron a esta rama. La propiedad del bloqueo por sesión se corrigió aquí después y todavía hay que sincronizarla hacia el POC: `27e3323` aún decide por proceso. Lista de lo que se copia en cada integración:

- `.jz/` completo (`bin/`, `hooks/`, `policy/`, `tests/`);
- `.opencode/plugins/jz-guard.js` y `.opencode/jz-permissions.json`;
- `.claude/settings.json` (si el POC tuviera uno propio, hay que fusionar sus `hooks` y `permissions`);
- los perfiles `.claude/agents/*.md` (incluido el nuevo `jz-orchestrator.md`) y `.opencode/agents/*.md`;
- la línea `.jz-state/` en `.gitignore`;
- `docs/AUTONOMIA-JZ.md`, la entrada de `AGENTS.md` y las tablas actualizadas de `docs/AGENTES-JZ.md`.

Después hay que ejecutar en el POC `node --test .jz/tests/sandbox.test.mjs` y `.jz/bin/jz-run node --test .jz/tests/`. En la aplicación `poc1a/`, las comprobaciones sin servicios se lanzan con `--cwd`, por ejemplo `.jz/bin/jz-run --cwd poc1a npx tsc --noEmit`.

**Pendiente de decisión: pruebas con Docker.** Las pruebas de integración y e2e del POC se ejecutan con `poc1a/poc.sh` dentro de `docker compose` (Postgres, app y Playwright). Acceder al socket de Docker equivale a ser root en el CT, y además `compose.yaml` está en el worktree, así que el implementador podría editarlo para montar `/` o activar `privileged`. Por eso `jz-run` no expone Docker, y estas pruebas siguen necesitando al humano o una decisión. Una forma de acotarlas sería un ejecutor `jz-compose` que:

1. sólo admita verbos fijos (`up -d db app`, `exec -T app <cmd>`, `run --rm e2e …`, `down`) sobre un único proyecto (`-p jozeuzz-poc-a`);
2. antes de cada uso, valide con `docker compose config --format json` que no haya `privileged`, `cap_add`, `devices`, `network_mode: host`, `pid: host`, montajes fuera del directorio de la aplicación, montajes de `docker.sock` ni imágenes sin digest;
3. o bien proteja `compose.yaml` como plano de control y compare su hash con uno aprobado por el humano.

No se implementa sin autorización, porque concede acceso indirecto al daemon de Docker del CT compartido.
