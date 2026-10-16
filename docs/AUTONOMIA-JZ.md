# Autonomía supervisada de los especialistas `jz-*`

Estado: **configuración local validada** (2026-10-16) en Claude Code 2.1.301 y OpenCode 1.17.18. Complementa `docs/AGENTES-JZ.md` (perfiles y modelos) y no depende de la CLI `jz-ai` (M1–M3).

## 1. Objetivo y amenaza

Los motores completan sin confirmaciones humanas una tarea de desarrollo aprobada: investigar, planificar, delegar, editar, probar, corregir, verificar, hacer commits locales y dejar un handoff recuperable. A la vez, no pueden alterar el CT ni otros proyectos.

El CT es compartido, el usuario es `root` y pertenece al grupo `docker`. Cualquier proceso con shell libre controla el host a través de `/var/run/docker.sock`, incluidos Wealthfolio y los demás servicios. La configuración global de OpenCode concede además `"*": allow` y `external_directory: allow`. Por eso las restricciones no se apoyan en el texto de los prompts, sino en controles que el modelo no puede eludir.

## 2. Capas de control

1. **Herramientas por perfil.** Explorer, Security y QA no tienen shell ni herramientas de edición en ningún motor. OpenCode retira del modelo las herramientas denegadas, y en Claude Code la lista `tools:` del perfil define las únicas herramientas disponibles.
2. **Reglas nativas.** En OpenCode, el `permission` V1 de cada perfil parte de `"*": deny` y anula el `allow` global. En Claude Code, `.claude/settings.json` deniega `git push`, `docker` y la lectura de `.env`.
3. **Política determinista por rol** (`.jz/policy/policy.mjs`). La aplican el hook `PreToolUse` de Claude Code (`.jz/hooks/claude-policy.mjs`) y el plugin de OpenCode (`.opencode/plugins/jz-guard.js`). Para el trabajo ordinario dentro del alcance responde `allow`, de modo que no hay preguntas ni intervención del clasificador. Para todo lo demás responde `deny`, también en modo automático y con fallo cerrado ante errores. Funciona así:
   - analiza el comando completo sin expansiones y valida por separado cada segmento unido con `&&`, `||` o `;`. Rechaza `&`, `$()`, comillas invertidas, variables (salvo `$?` en `echo`), redirecciones a archivo, subshells y asignaciones de entorno. Admite `cd` dentro del worktree, `echo`, filtros de salida (`| tail -n 40`) y el heredoc de `git commit -m "$(cat <<'EOF' … EOF)"`, verificando que el delimitador no se cierre antes;
   - resuelve los enlaces simbólicos antes de autorizar una lectura o una escritura;
   - protege el plano de control: `.git`, `.claude/`, `.opencode/`, `.jz/`, `.jz-state/` (salvo `notes/`), `AGENTS.md`, `CLAUDE.md`, `opencode.json[c]` y `.mcp.json`;
   - impide la lectura de secretos (`.env*`, salvo los de ejemplo, además de `*.pem`, `*.key` e `id_*`) y de rutas fuera del worktree, con la excepción de las skills y de los resultados de herramientas del propio motor;
   - limita la delegación: sólo el orquestador delega, sólo en `jz-*` y nunca en sí mismo ni en agentes genéricos;
   - mantiene un único escritor por worktree mediante `.jz-state/writer.lock`, que comparten los dos motores; un bloqueo cuyo proceso ya no existe se recupera solo.
4. **Ejecutor acotado** (`.jz/bin/jz-run`). Es la única vía para ejecutar código del proyecto (tests, typecheck, lint, build y scripts de `package.json`):
   - crea espacios de nombres nuevos de montaje, PID, red, IPC y UTS, y una raíz mínima con `pivot_root`, desmontando por completo la raíz anterior;
   - monta `/usr` y `/etc` en sólo lectura, sin `/etc/shadow`, `/etc/ssh`, `/etc/ssl/private` ni `/etc/docker`;
   - no monta `/root`, `/var`, `/home` de otros proyectos ni `docker.sock`;
   - los secretos del propio worktree (`.env*` salvo los de ejemplo, `*.pem`, `*.key`, `*.p12`, `*.pfx` e `id_*`, fuera de `node_modules`, `.git` y `.next*`) se ven vacíos y en sólo lectura, con los mismos patrones que aplica la política a las lecturas;
   - deja sin red al proceso (sólo tiene su propio loopback);
   - el proceso no tiene capacidades: el bounding set está vacío y `no_new_privs` activo, así que no puede remontar ni crear user namespaces;
   - el entorno se vacía, de modo que no hereda los tokens del agente;
   - el worktree es escribible, salvo el plano de control, que queda en sólo lectura;
   - al terminar, registra el resultado en `.jz-state/runs.jsonl` (comando, `rc`, `head`, huella del árbol y log). Además, pone en cuarentena (`.jz-state/quarantine/`) los archivos de control que se hayan creado y los enlaces simbólicos nuevos que apunten fuera del worktree, y en ese caso devuelve el código 86.

   Sólo usa `unshare`, `setpriv`, `mount` y `pivot_root` de util-linux 2.41, que ya están instalados. El sandbox nativo de Claude Code necesita `bubblewrap` y `socat`, y no se instalaron (§8).

## 3. Permisos efectivos

| Agente | Claude Code (herramientas → política) | OpenCode (`permission` → plugin) |
|---|---|---|
| `jz-orchestrator` | Read, Grep, Glob, Skill, TodoWrite, Bash, `Agent(jz-architect, jz-explorer, jz-implementer, jz-security, jz-qa)`. La shell sólo admite lectura de git (`status`, `diff`, `log`, `show`, `rev-parse`, `ls-files`, `blame`, `branch --show-current`, `worktree list`, `remote -v`), `jz-state`, `jz-checkpoint`, `jz-lock status`, `ls` y `pwd`. Sin escritura ni `jz-run`. | Igual. `edit: deny`; `task` sólo hacia los seis `jz-*`. |
| `jz-architect` | Read, Grep, Glob, Write, Edit y Skill; escribe sólo en `docs/` y `.jz-state/notes/`. Sin shell. Precarga `writing-plans`. | `edit` sólo en `docs/*` y `.jz-state/notes/*`; `bash: deny`; `task: deny`. |
| `jz-implementer` (y `-copilot` en OpenCode) | Read, Grep, Glob, Bash, Edit, Write y Skill. Edita el worktree salvo el plano de control y los secretos. La shell admite `jz-run <cmd>`, `jz-state`, `jz-checkpoint`, git local (`add`, `commit` sin `--amend`, `rm`/`mv` sin `--force`, `restore --staged` y las lecturas), `ls` y `pwd`. Precarga `test-driven-development` y `verification-before-completion`. | `edit` igual; `bash` con una lista blanca equivalente; `task: deny`. |
| `jz-explorer` | Read, Grep, Glob (dentro del worktree y las skills). | Sólo `read`, `glob`, `grep`, `list`, `skill` y `todowrite`. |
| `jz-security` | Read, Grep, Glob. | Igual que explorer. |
| `jz-qa` | Read, Grep, Glob y Skill. Precarga `verification-before-completion`. | Igual que explorer. |

Todos los perfiles tienen denegadas, en ambos motores, `webfetch`, `websearch`, las herramientas MCP, `question` y `doom_loop`.

Siempre requieren intervención humana:

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
- La verificación no se apoya en lo que diga el implementador. `jz-state` debe mostrar «Árbol actual con ejecución en verde: sí», que se calcula a partir de la huella que registró el propio `jz-run` y que ningún agente puede escribir.

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
- No uses `bypassPermissions`, `--dangerously-skip-permissions`, `opencode --pure` ni `OPENCODE_PURE=1`: el último desactiva el plugin, aunque las reglas nativas se mantendrían.
- Si Claude Code se abre sin `--agent`, la sesión principal no queda restringida por la política. Sigue el modo de permisos del usuario, aunque sus subagentes `jz-*` sí están restringidos.
- En OpenCode, los agentes `build` y `plan` heredan el `allow` global del usuario. Para trabajar en autónomo, usa siempre `--agent jz-orchestrator`.

## 6. Continuidad ante cuotas e interrupciones

El estado se guarda en `.jz-state/` (ignorado por git, local al worktree):

| Archivo | Quién lo escribe | Contenido |
|---|---|---|
| `runs.jsonl` y `runs/*.log` | `jz-run` | Cada ejecución real: comando, `rc`, `head`, huella del árbol y salida. |
| `writer.lock` | hook o plugin | Escritor activo: motor, pid, sesión, agente y hora. |
| `checkpoints/*.md`, `LATEST.md` | `jz-checkpoint` | Unidad, estado declarado, problemas, siguiente paso y el estado real completo. |
| `notes/*.md` | implementer o architect | Notas libres del handoff. |
| `quarantine/` | `jz-run` | Rutas de control o enlaces hacia fuera creados por un comando. |

`jz-checkpoint --state validado` sólo queda como validado si existe una ejecución en verde sobre el árbol actual. En caso contrario se registra como `incompleto` y se avisa. Así se distingue el código validado de los cambios a medias sin depender de la palabra del agente.

**Cuando se agota la cuota:**

1. El sistema corta los reintentos:
   - **OpenCode** reintenta por su cuenta de forma indefinida, con espera exponencial: en el registro del 2026-10-16 hay una sesión de POC-1b que seguía reintentando 35 minutos después del primer error `The usage limit has been reached`. Para evitarlo, el plugin `jz-guard` observa los eventos `session.status` de tipo `retry`. Si el mensaje indica cuota agotada (*usage limit*, *quota*, *billing*), actúa en el primer reintento; si es un límite de velocidad (429), al tercero. Entonces libera el bloqueo de escritor, escribe un checkpoint con estado `cuota` y aborta la sesión.
   - **Claude Code** no reintenta indefinidamente. El evento `StopFailure` (el turno termina por un error de la API) libera el bloqueo y escribe el checkpoint.
2. El agente no reintenta. Si su rol puede, completa el checkpoint con `.jz/bin/jz-checkpoint --unit "…" --state cuota --next "…"`.
3. El humano no usa `--continue` a ciegas sobre la misma tarea. `opencode run` termina con código 0 aunque la sesión se haya abortado, así que el indicador fiable es `.jz-state/LATEST.md`.
4. Comprueba la cuota en el otro motor.

**Al reanudar con cualquier motor:**

1. Ejecuta `.jz/bin/jz-state`. Debe dar `REANUDABLE`: sin procesos `claude` u `opencode` vivos en el worktree, sin un bloqueo de escritor de otro proceso vivo y sin cuarentena pendiente.
2. Lee `.jz-state/LATEST.md` y las notas, y revisa `git diff` y `git log`.
3. Pide al orquestador que continúe desde el «siguiente paso» del checkpoint, verificando primero el estado. Nunca hay que repetir la última tarea ni descartar los cambios pendientes: ningún agente tiene `reset`, `checkout`, `stash` ni `clean`.

El procedimiento sólo usa los scripts de `.jz/bin/` y git, así que no necesita `jz-ai`.

## 7. Validación

Las pruebas se reproducen así:

```sh
.jz/bin/jz-run node --test .jz/tests/            # política por rol y recuperación (en el sandbox; omite las del sandbox)
node --test .jz/tests/sandbox.test.mjs            # aislamiento de jz-run (en el host)
node .jz/tests/integration.mjs --base <dir>       # motores reales en un repositorio desechable
```

`recovery.test.mjs` simula sin consumir cuota el `StopFailure` de Claude Code y el reintento por cuota de OpenCode sobre un repositorio desechable. Comprueba la liberación del bloqueo, el checkpoint `cuota`, el rechazo de un segundo escritor por el plugin y el veredicto de `jz-state`.

`integration.mjs` crea por escenario un repositorio desechable con una copia del plano de control y, a su lado, un directorio «ajeno» con un secreto ficticio. Comprueba el resultado sobre el sistema de archivos y git, no sobre lo que el modelo afirma. El escenario I6 comprueba que la sesión trabaja en el worktree indicado aunque el proceso arranque con un `PWD` obsoleto: en OpenCode con `--dir` y en Claude Code con su directorio de trabajo. Los resultados están en `docs/AGENTES-JZ.md` §3.

## 8. Limitaciones conocidas

- **Cuarentena, no prevención.** `jz-run` no puede impedir que un comando cree un archivo de control que no existía, como `opencode.json` en la raíz. Lo detecta al terminar, lo mueve a cuarentena y el estado queda `BLOQUEADO` hasta que lo revise un humano. Mientras dura la ejecución, otra sesión que arranque podría leerlo.
- **Código del proyecto.** Dentro de `jz-run` se ejecuta código arbitrario, pero confinado: puede romper o borrar archivos del worktree, aunque no los del plano de control ni el historial de git. Los cambios sin confirmar se protegen con commits frecuentes.
- **Sesiones sin `--agent`.** La política no se aplica al hilo principal de Claude Code sin `--agent` ni a los agentes no `jz-*` de OpenCode.
- **Plugin de OpenCode.** No se carga con `--pure` u `OPENCODE_PURE=1`. En ese caso quedan las reglas nativas, que también deniegan push y escritura fuera del alcance, pero no analizan el comando completo.
- **Sandbox nativo de Claude Code.** No está disponible: faltan `bubblewrap` y `socat`. Instalarlos permitiría añadir `sandbox.enabled` como otra capa, pero requiere autorización.

## 9. Integración selectiva en el worktree de POC

Se copia, sin fusionar ramas, a `poc/candidata-a-1b` cuando la etapa lo autorice y su árbol esté limpio o con su handoff cerrado:

- `.jz/` completo (`bin/`, `hooks/`, `policy/`, `tests/`);
- `.opencode/plugins/jz-guard.js`;
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
