# Parche del plano de control (2026-10-19): rutas de git, validación reconocida, relevo y respaldo

> **Para quien lo aplique:** este plan lo ejecuta **el humano**. Ningún agente puede aplicarlo, porque modifica `.jz/` (plano de control). Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** cerrar los hallazgos H1, H2, H3/H4, H6/H8 y H10 de jz-explorer y jz-security sin ampliar ningún permiso de los agentes, y dejar diseñados (sin implementar) el relevo entre motores y el respaldo remoto.

**Arquitectura:** las rutas de `git add|commit|rm|mv|restore` se validan como escrituras dentro de la política existente (`.jz/policy/policy.mjs`), que ya aplican el hook de Claude Code y el plugin de OpenCode. «En verde» pasa a significar «una validación reconocida en verde»: lo define una lista que mantiene el humano (`.jz/policy/validacion.json`) y lo calcula sólo `jz-state`, que ahora también reconoce las ejecuciones de `jz-run` vivas y avisa de los cambios sin confirmar.

**Tecnologías:** Node ≥ 20 (`node:test`), bash, `jq` y git, las mismas que ya usa `.jz/`. No hay dependencias nuevas.

**Especificación:** los hallazgos H1–H10 que transmitió el orquestador (confirmados por jz-explorer y jz-security) y `docs/AUTONOMIA-JZ.md` §2–§8.

**Estado:** propuesta para aprobación humana. **No se ha aplicado ni ejecutado nada.** jz-architect no tiene shell: no ha podido ejecutar `git apply --check` ni las pruebas. El parche se redactó a mano a partir del contenido de los archivos en `69e1883` (árbol limpio al empezar). **No está garantizado que aplique limpiamente.** Las líneas de contexto vacías del parche no llevan el espacio inicial; `git apply` las admite como líneas de contexto vacías, pero tampoco se ha comprobado.

- **Base:** `69e1883` (rama `poc/candidata-a-3`).
- **Parche:** `docs/propuestas/plano-control-2026-10-19.patch`, un diff unificado que se aplica desde la raíz del worktree.
- **Archivos que toca el parche:**
  - `.jz/policy/policy.mjs`;
  - `.jz/policy/validacion.json` (nuevo);
  - `.jz/bin/jz-state` y `.jz/bin/jz-checkpoint`;
  - `.jz/hooks/claude-policy.mjs`;
  - `.jz/tests/policy.test.mjs` y `.jz/tests/recovery.test.mjs`;
  - `docs/AUTONOMIA-JZ.md` (§4, §6).
- **Fuera del parche:**
  - `.opencode/agents/*.md`;
  - `.claude/settings.json`;
  - `jz-run`, `jz-lock` y `jz-guard.js` (sin cambios);
  - los diseños de `jz-relevo` y `jz-backup` (§6 y §7).

## Restricciones globales

- Ningún cambio amplía los permisos de un agente: la lista `JZ_TOOLS` (`policy.mjs:267`) no cambia, y `git push` sigue denegado para todos los roles.
- `jz-backup` y `jz-relevo` **no** se añaden a `JZ_TOOLS`. Los ejecuta sólo el humano.
- No se instalan dependencias ni servicios.
- Para el implementador, el comportamiento sólo se restringe. Antes se permitía y ahora se deniega: `git add -A` y `git add -u` sin rutas, `git add .`, `git commit -a`, las opciones de `add`, `commit`, `rm`, `mv` y `restore` que no están en la lista blanca, y las rutas que tocan el plano de control o secretos.
- Las pruebas de política y recuperación se ejecutan con `.jz/bin/jz-run node --test .jz/tests/`, y las del sandbox en el host con `node --test .jz/tests/sandbox.test.mjs` (`docs/AUTONOMIA-JZ.md:134-135`).

## Conflicto con el gate Docker de POC-3 (leer antes de aplicar)

El paso A1 de `docs/GATE-DOCKER-POC-3.md` exige que `git diff --name-only 69e1883..HEAD` sólo contenga rutas bajo `docs/`. Un commit con este parche en `poc/candidata-a-3` antes del gate provocaría una **parada dura en A1**.

**PENDIENTE (decisión humana).** Hay tres opciones:

- (a) aplicar el parche después del gate;
- (b) aplicarlo en `chore/jz-agents`, que es el origen del plano de control según `docs/AUTONOMIA-JZ.md` §9, y sincronizarlo después;
- (c) enmendar A1 para que admita `.jz/`.

La opción (c) relaja el gate, así que no se recomienda.

## Foco de revisión

Estos son los casos que ninguna prueba del parche cubre y que, previsiblemente, más pueden afectar:

1. **Mensajes de commit pasados como `--message=...` o pegados (`-mtexto`).** `--message=x` se admite. `-mtexto` y combinaciones como `-am` se deniegan como opción desconocida, así que el implementador tendrá que usar `-m "texto"`. Lo que se espera es que se deniegue y que el mensaje indique qué hacer.
2. **Exclusiones globales distintas en el host y en el sandbox.** Si el `~/.gitconfig` del host tiene un `core.excludesFile` que ignora `.env*`, `git add cfg` no detecta el secreto: tampoco lo añadiría git, salvo con `-f`, que está denegado. Por eso la prueba `git add cfg` sólo es fiable dentro de `jz-run`, donde `HOME` está vacío.
3. **`git add <directorio>` cuando git no responde** (worktree roto, `index.lock`). Lo esperado es denegar (falla cerrado), y eso hace `checkUntracked`. Ninguna prueba lo ejerce.
4. **Un `jz-run` lanzado de forma no estándar** (`bash -x .jz/bin/jz-run …`, o desde otro espacio de nombres de PID). No se detecta como vivo; ver §4.
5. **Un validador reconocido que no ejecuta nada** (`node --test` en un directorio sin pruebas, o un `vitest.config` del producto con `passWithNoTests`). Cuenta como verde. Es un límite de diseño (§3): la revisión de jz-qa sigue siendo necesaria.

---

## 1. Resumen por hallazgo

| Hallazgo | Corrección en el parche | Pruebas nuevas |
|---|---|---|
| H1 (crítico) | `checkGit` recibe `ctx` y `cwd` (`policy.mjs:286`). En `add`, `commit`, `rm`, `mv` y `restore`, cada argumento que no es opción ni valor de `-m`, y todo lo que sigue a `--`, se valida con `checkGitPath`, con la misma lógica que `checkWrite`. Hay lista blanca de opciones por subcomando | `policy.test.mjs`: «las rutas de git … se comprueban como escrituras» |
| H2 | `git add -f/--force` se deniega. `git add <directorio>` consulta `git ls-files -o --exclude-standard` y deniega si añadiría un secreto sin seguimiento | Misma prueba (`git add -f poc1a/.env`, `git add cfg`) |
| H3/H4 | `.jz/policy/validacion.json` contiene prefijos y opciones prohibidas. `jz-state` y `jz-checkpoint` sólo cuentan como verde las ejecuciones que coinciden con la lista. El checkpoint registra la huella, el HEAD y `git diff --stat` | `recovery.test.mjs`: tres pruebas de validación |
| H6 | Veredicto `REANUDABLE CON CAMBIOS SIN CONFIRMAR: revisar diff antes de continuar` (rc=0) | `recovery.test.mjs`: «el rc=0 de un comando no reconocido…» |
| H8 | `jz-state` detecta los procesos `jz-run` vivos del worktree mediante `/proc/*/cmdline` y los cuenta como bloqueo | `recovery.test.mjs`: «una ejecución de jz-run viva…» |
| H10 | `overloaded` deja de contar como cuota (`claude-policy.mjs:85`) | `recovery.test.mjs`: «StopFailure por sobrecarga…» |
| Push y `jz-backup` | Sin cambio de código: ya se deniegan. Se añade una prueba de regresión | `policy.test.mjs`: «push denegado a todos los roles…» |

## 2. H1 y H2: rutas de git como escrituras

**El problema.** El código actual (`policy.mjs:247-261`) sólo mira las opciones. Por eso permite al implementador, por ejemplo:

- `git rm .jz/policy/policy.mjs`;
- `git mv AGENTS.md x`;
- `git restore --staged .claude/settings.json`;
- `git commit -m x -- .jz/bin/jz-run`;
- `git add -f poc1a/.env`.

**Diseño del parche:**

- `checkGitWrite(sub, args, ctx, cwd)` separa opciones, valores de `-m` y `--message`, y rutas. Todo lo que sigue a `--` es ruta.
- **Lista blanca de opciones** por subcomando. Lo demás se deniega con «opción no admitida»:

  | Subcomando | Opciones admitidas |
  |---|---|
  | `add` | `-A -u -n -v -N` y sus formas largas |
  | `commit` | `-m --message -q -s --allow-empty` |
  | `rm` | `-r --cached -q -n --ignore-unmatch` |
  | `mv` | `-k -n -v` |
  | `restore` | `--staged -S -q` |

  Así se cierran `add -p` y `add -e` (abren un editor o un diálogo fuera del sandbox), `--chmod`, `--author`, `restore --source`, `-am` y otras.
- **Denegaciones con mensaje propio:**
  - `commit --amend`, `-F`, `-C`, `-c` y similares, como hasta ahora;
  - `commit -a`;
  - `rm` y `mv` con `-f`, como hasta ahora;
  - `add -f`;
  - `restore` sin `--staged` o con `--worktree`, como hasta ahora;
  - `add -A` o `add -u` sin rutas, que abarcan todo el árbol.
- **`checkGitPath(p, ctx, cwd)`** deniega cuando la ruta:
  - es pathspec mágico (empieza por `:`);
  - contiene comodines `* ? [ ] \`. Git los expande por su cuenta: `git rm --cached '.jz*'` pasaría el control por nombre y afectaría a `.jz/`;
  - está fuera del worktree o es la raíz (`.`, `poc1a/..`). Todo el plano de control cuelga de la raíz (`policy.mjs:27-28`), así que ningún otro directorio lo contiene;
  - es un secreto (`isSecret`);
  - es plano de control (`.git`, `.jz-state` salvo `notes/`, etc.).

  La comprobación se hace sobre la ruta léxica y sobre la resuelta con `realResolve`. Así se cubre un enlace interno como `src/ctl -> ../.jz`.
- **`checkUntracked`** se aplica sólo a `add` y sólo a las rutas que son directorios existentes. Ejecuta `git --literal-pathspecs -c core.fsmonitor=false -C <wt> ls-files -o --exclude-standard -z -- <dirs>` y deniega si algún archivo cumple `isSecret`. Si git falla, deniega (falla cerrado).
  - Hace falta porque `poc1a/.gitignore:11` sólo ignora `.env`: un `poc1a/.env.local` no ignorado entraría con `git add poc1a`.
  - **Recomendación aparte** (archivo de producto, lo puede hacer jz-implementer): ignorar `.env*` salvo `!.env.example` en `.gitignore`.
- **OpenCode.** Las reglas nativas `git add *`, `git rm *`, `git mv *`, `git restore --staged *` y `git commit *` (`.opencode/agents/jz-implementer.md:73-77` y lo mismo en `jz-implementer-copilot.md:73-77`) siguen en `allow`. Ajustarlas es secundario: el plugin `jz-guard.js:113-114` llama a la misma `checkBash` con el `workdir` como `cwd`, y por tanto aplica las mismas denegaciones.
  - Sólo con `opencode --pure` (plugin desactivado, ya prohibido en `AUTONOMIA-JZ.md` §5 y §8) quedarían únicamente las reglas nativas.
  - Si el humano quiere una barrera nativa adicional, puede añadir reglas `deny` como `"git * .jz*"`, `"git * .claude*"`, `"git * .opencode*"`, `"git * AGENTS.md*"`, `"git * CLAUDE.md*"`, `"git add -f*"` y `"git add --force*"`. Son comodines de texto y pueden bloquear órdenes legítimas. No se incluyen en el parche.
- **Pruebas.** El fixture de `policy.test.mjs` pasa de un `.git` ficticio (`policy.test.mjs:16`) a `git init`, porque `git add <directorio>` consulta `ls-files`. `git add -A` deja de estar permitido: la prueba existente pasa a `git add -A src`.

Casos de aceptación (texto literal de las pruebas):

| Permitidos | Denegados |
|---|---|
| `git add poc1a/src/x.ts`, `git add -A poc1a`, `git add -- poc1a/src/x.ts`, `git rm --cached poc1a/src/x.ts`, `git rm -r --cached poc1a/src`, `git mv poc1a/src/x.ts poc1a/src/y.ts`, `git restore --staged poc1a/src/x.ts`, `git commit -m x -- poc1a/src/x.ts`, `git commit -m "-- .jz/bin/jz-run"` (el texto es el mensaje), `git add .jz-state/notes/n.md`, `cd poc1a && git add src`, `git add .env.example` | `git rm .jz/policy/policy.mjs`, `git rm --cached .jz/policy/policy.mjs`, `git add -f poc1a/.env`, `git add --force poc1a/src/x.ts`, `git add poc1a/.env`, `git mv AGENTS.md x`, `git mv poc1a/src/x.ts .claude/x`, `git restore --staged .claude/settings.json`, `git commit -m x -- .jz/bin/jz-run`, `git commit -m x .jz/bin/jz-run`, `git commit -a -m x`, `git commit -am x`, `git add -A`, `git add -u`, `git add .`, `git add poc1a/..`, `git rm -r --cached .`, `git add :/`, `git add ':(top).jz'`, `git add ':!poc1a'`, `git add .jz*`, `git rm --cached '.jz?policy'`, `git add .git/config`, `git add .jz-state/runs.jsonl`, `git add ../otro/x`, `git add /etc/passwd`, `git add src/fuera` (enlace hacia `/etc`), `git add src/ctl` y `git add src/ctl/bin/jz-run` (enlace hacia `.jz`), `git add cfg` (contiene `.env.local` sin seguimiento), `git add -p poc1a`, `git add -e …`, `git add --chmod=+x …`, `git commit --author=x -m y`, `git restore --staged --source=HEAD~1 …`, `cd poc1a && git add ../.jz`, `git commit -m x --pathspec-from-file=f` |

Para **todos los roles**: `git push`, `git push origin HEAD:refs/heads/backup/x`, `git push --force origin x`, `.jz/bin/jz-backup poc/candidata-a-3` y `<wt>/.jz/bin/jz-backup x` se deniegan. La prueba ya pasaría hoy: es de regresión.

## 3. H3 y H4: validación reconocida

**El problema.** `jz-state:97` y `jz-checkpoint:40` aceptan cualquier `rc=0` sobre la huella actual. Bastaría `jz-run true` para que «Árbol actual con ejecución en verde» saliera `sí` y para que `--state validado` quedara como validado.

**Diseño:**

- **`.jz/policy/validacion.json`** está en el plano de control, así que ningún agente lo escribe (`checkWrite`, y en `jz-run` se monta en sólo lectura). Contiene `validaciones[]`, cada una con un `prefijo` (lista de argumentos exactos) y una lista de `prohibidos` (se compara el nombre de la opción antes de `=`). Los prefijos iniciales:

  | Prefijo | Opciones prohibidas, entre otras |
  |---|---|
  | `node node_modules/vitest/vitest.mjs run` | `--passWithNoTests`, `-t`, `--changed`, `--related`, `--watch`, `--version`, `--help` |
  | `node node_modules/typescript/bin/tsc` | `--version`, `--help`, `--init`, `--showConfig`, `--listFilesOnly`, `--noCheck`, `--build`, `--watch` |
  | `node --test` | `-e`, `--eval`, `-p`, `--print`, `--test-only`, `--test-name-pattern`, `--test-skip-pattern`, `--watch`, `--version`, `--help` |

  Corresponden a las órdenes documentadas en `docs/AUTONOMIA-JZ.md:134,180-182`. Las órdenes `npm test` y `npx …` no cuentan: no figuran en la lista. **PENDIENTE (decisión humana):** si se añaden.
- **`jz-state`:**
  - define `valida($v)` en jq y `last_valid <huella>`;
  - etiqueta cada ejecución como `validación en verde`, `rc=0, no es validación reconocida`, `falló` u `otro árbol`;
  - imprime «Árbol actual con validación en verde: sí (<ts> `<comando>`)» o «NO»;
  - con `--verde [huella]` sólo imprime la última validación en verde. Es de lectura y lo usa `jz-checkpoint`;
  - si la lista falta o no es válida, nada cuenta como verde y aparece un aviso (falla cerrado).
- **`jz-checkpoint`:**
  - llama a `jz-state --verde "$fp"`, de modo que la regla no está duplicada;
  - registra `Huella del árbol: <fp> (HEAD <h>)`, la validación (marca de tiempo y comando) y la sección «Cambios respecto a HEAD (git diff --stat)», con el número de archivos sin seguimiento.

**Límite (no cubierto).** La lista sólo garantiza que se ejecutó un validador reconocido y que terminó con 0 sobre el árbol actual. No garantiza que las pruebas sean pertinentes ni que existan. El agente escribe las pruebas y la configuración del producto: podría escribir una prueba vacía o un `vitest.config` con `passWithNoTests`. Tampoco se comprueba el `cwd` (`--cwd poc1a` frente a la raíz). Que `node --test` termine con 0 sin archivos de prueba es una deducción no verificada. Por eso el checkpoint muestra el comando exacto, para que jz-qa o el humano lo revisen.

## 4. H6 y H8: relevo con cambios sin confirmar y `jz-run` vivo

- **H6.**
  - Con el árbol sucio y sin bloqueos, el veredicto es `## Veredicto: REANUDABLE CON CAMBIOS SIN CONFIRMAR: revisar diff antes de continuar`, con **rc=0**: avisa, pero no bloquea.
  - **PENDIENTE (decisión humana):** si conviene un rc distinto, por ejemplo 4. Se propone 0 porque `jz-checkpoint` y el orquestador sólo tratan rc=3 como bloqueo, y otro rc rompería ese contrato.
  - Hay una sección «## Avisos» para avisos no bloqueantes, como la lista de validación ausente.
- **H8.** El nuevo bloque de `jz-state` recorre `/proc/[0-9]*/cmdline` y marca como vivo:
  - un proceso `unshare` cuyo argv contiene exactamente `<wt>/.jz/bin/jz-run`. Es el padre que `jz-run` deja vivo durante todo el comando (`jz-run:166-167`, `--fork`);
  - un proceso `bash` cuyo `argv[1]`, resuelto desde `/proc/<pid>/cwd`, es ese mismo archivo. Es la etapa externa: el shebang `#!/usr/bin/env bash` deja `bash <ruta>` como línea de órdenes.

  Excluye los ancestros de quien consulta, las llamadas `--fingerprint` y cualquier otro programa que sólo nombre el archivo (un visor o un editor). Cada proceso detectado añade un bloqueo.

  **Fiabilidad:**
  - es fiable para los `jz-run` lanzados de la forma documentada en el mismo espacio de nombres de PID (los agentes corren como root y leen todo `/proc`);
  - **no detecta** `bash -x .jz/bin/jz-run …`, porque `argv[1]` es `-x`;
  - **no detecta** ejecuciones en otro espacio de nombres de PID, como dentro de otro `jz-run`;
  - **no detecta** un proceso que arranque mientras dura el recorrido.

  Estas limitaciones se documentan y no se corrigen. La alternativa de un registro de PID en `.jz-state/` fallaría si se mata la etapa externa con SIGKILL, porque `unshare` seguiría vivo. Por eso se prefiere la línea de órdenes.

## 5. H10: «overloaded» no es cuota

`claude-policy.mjs:85` deja de incluir `overloaded`. Una sobrecarga (529) produce un checkpoint `incompleto`, que se puede reanudar en el mismo motor más tarde.

**Residual:** el patrón `usage` es amplio y puede clasificar como cuota otros mensajes que contengan esa palabra. No se cambia, porque el hallazgo no lo pedía.

## 6. Relevo Claude Code ↔ OpenCode

**Qué es automático hoy** (según el código):

| Evento | Claude Code | OpenCode |
|---|---|---|
| Error de API que termina el turno | `StopFailure`: libera el bloqueo de esa sesión y escribe un checkpoint `cuota` o `incompleto` (`claude-policy.mjs:81-90`) | — |
| Cuota agotada o tercer 429 | — | El plugin libera el bloqueo propio, escribe un checkpoint `cuota` y aborta la sesión (`jz-guard.js:27-48,55-61`) |
| Fin de la delegación en un escritor | `PostToolUse` y `PostToolUseFailure` liberan el bloqueo (`claude-policy.mjs:75-78`) | `tool.execute.after` lo libera (`jz-guard.js:122-126`) |
| Fin de sesión | `SessionEnd` libera el bloqueo (`claude-policy.mjs:79-80`) | — |
| Bloqueo huérfano | Se recupera en la siguiente delegación (`policy.mjs:390-391`) | Igual |

**Qué es humano** (no es automático y no se declara como tal):

1. Comprobar que el otro motor tiene cuota.
2. Ejecutar `.jz/bin/jz-state` y leer el veredicto. Con `CON CAMBIOS SIN CONFIRMAR`, revisar `git diff` y `git status` antes de seguir.
3. Lanzar el otro motor desde la raíz del worktree, con el orquestador. Por ejemplo, `claude --agent jz-orchestrator --permission-mode auto`, o `opencode --agent jz-orchestrator` con `--dir <worktree>` (`AUTONOMIA-JZ.md` §5).
4. Pedirle que continúe desde el «siguiente paso» de `.jz-state/LATEST.md`.
5. Revisar la cuarentena y liberar a mano un bloqueo vivo (`jz-lock release --force`).

Además, `opencode run` termina con 0 aunque la sesión se haya abortado (`AUTONOMIA-JZ.md` §6.3).

**Diseño opcional (no incluido en el parche): `.jz/bin/jz-relevo <claude|opencode> [--acepto-cambios]`**, que ejecuta **sólo el humano**. No se añade a `JZ_TOOLS`, y la política lo deniega a los agentes por no estar en la lista (`policy.mjs:276-282`).

1. Ejecuta `.jz/bin/jz-state`. Con rc distinto de 0, se detiene y muestra los bloqueos.
2. Si el veredicto es `REANUDABLE CON CAMBIOS SIN CONFIRMAR` y no se pasó `--acepto-cambios`, se detiene y pide revisar el diff.
3. Construye el prompt estándar: «Reanuda el trabajo de este worktree: ejecuta `.jz/bin/jz-state`, lee `.jz-state/LATEST.md` y `.jz-state/notes/`, revisa `git diff` y `git log`, y continúa desde el "siguiente paso" del último checkpoint sin repetir a ciegas la última tarea. Si `jz-state` da BLOQUEADO, detente e infórmalo.»
4. Hace `exec` del motor con `cwd` en el worktree:
   - `claude -p --agent jz-orchestrator --permission-mode auto "<prompt>"`;
   - o `opencode run --dir "$WT" --agent jz-orchestrator --auto "<prompt>"`.

   **No verificado:** que `opencode run` admita `--dir` junto a `--agent` y `--auto`. `AUTONOMIA-JZ.md:93` lo recomienda, pero no muestra la orden completa.
5. Nunca usa `--continue`, `--dangerously-skip-permissions` ni `--pure`.

## 7. Respaldo remoto: diseño de `.jz/bin/jz-backup <rama>`

**No incluido en el parche. Requiere aprobación aparte**, porque usa las credenciales del host y la red.

Lo ejecuta **sólo el humano**, o un temporizador del host aprobado aparte. No se añade a `JZ_TOOLS`: los agentes heredarían las credenciales del host. La política sigue denegando `git push` a todos los roles, y ya lo comprueba la prueba de regresión del §2.

**Configuración.** El humano crea `.jz/policy/backup.json`, en el plano de control, con `{"remoto": "origin", "url": "<URL esperada>"}`. **PENDIENTE:** la URL esperada. jz-architect no puede leer la configuración de git, que está fuera del worktree.

**Comprobaciones, en orden.** Cualquier fallo aborta y se registra:

1. **Nombre:**
   - cumple `^[A-Za-z0-9][A-Za-z0-9._/-]*$`;
   - no contiene `..` ni `//`, no termina en `/` ni en `.lock`;
   - no es `main`, `master` ni `HEAD`, ni empieza por `backup/`;
   - `git check-ref-format --branch` lo acepta;
   - `refs/heads/<rama>` existe y apunta a un commit.
2. **Remoto y URL fijos:**
   - el nombre del remoto cumple `^[A-Za-z0-9_-]+$`;
   - `git remote get-url --push <remoto>` y `git remote get-url <remoto>` coinciden exactamente con la URL esperada, que no contiene `PENDIENTE`;
   - no hay `remote.<remoto>.pushurl`;
   - no hay reglas `url.*.insteadOf` ni `url.*.pushInsteadOf`;
   - no hay `remote.<remoto>.receivepack`, `.mirror` ni `.push`, ni `core.sshCommand`, `push.followTags` o `push.recurseSubmodules`;
   - no hay `GIT_SSH_COMMAND`, `GIT_SSH`, `GIT_DIR` ni `GIT_CONFIG_PARAMETERS` en el entorno;
   - una URL `https://` con `@` (credenciales en la URL) se rechaza.
3. **Precondiciones:** `.jz/bin/jz-state` con rc=0. Eso significa que no hay escritor vivo, ni `jz-run` vivo (con el parche), ni procesos de motores, ni cuarentena. Con cambios sin confirmar, avisa de que sólo se respaldan commits.
4. **Rango:**
   - se obtiene `remote_sha` con `git ls-remote --refs <url> refs/heads/backup/<rama>` (lectura de red);
   - si existe y es un commit local, el rango es `<remote_sha>..<sha>`. En cualquier otro caso es toda la historia de `<sha>`.
5. **Escaneo de secretos del rango:**
   - nombres: `git log -m --no-renames --format= --name-only <rango>`, con los patrones de `isSecret` (`.env` y `.env.*` salvo `example`, `sample` y `template`; `*.pem`, `*.key`, `*.p12`, `*.pfx`; `id_rsa*`, `id_ed25519*`, `id_ecdsa*`, `id_dsa*`);
   - contenido: `git log --no-textconv --no-ext-diff -G 'BEGIN [A-Z ]*PRIVATE KEY' --format=%h <rango>` debe salir vacío;
   - cualquier coincidencia aborta e imprime sólo nombres.
6. **Push.** Sólo commits, sólo esa ref y sin forzar:
   - `git -c core.hooksPath=/dev/null -c core.fsmonitor=false push --porcelain --no-follow-tags --recurse-submodules=no "<url>" "refs/heads/<rama>:refs/heads/backup/<rama>"`;
   - nunca `+`, `--force`, `--force-with-lease`, `--mirror`, `--all`, `--tags` ni `--delete`;
   - si la historia del respaldo diverge, el push se rechaza, y lo decide el humano.
7. **Registro.** Se añade una línea JSON a `.jz-state/backups.jsonl` con `ts`, `rama`, `sha`, `rango` y `resultado`. No se registran la URL con credenciales ni la salida del remoto.

**Pruebas previstas** (si se aprueba):

- `policy.test.mjs`: la denegación a todos los roles ya está en el parche;
- `.jz/tests/backup.test.mjs`, en el host, contra un remoto `file://` desechable, con estos casos:
  - nombre inválido;
  - `main`;
  - URL distinta;
  - `insteadOf` presente;
  - archivo `.env` en el rango;
  - `jz-state` bloqueado;
  - push correcto a `backup/<rama>`;
  - segundo push no fast-forward rechazado.

**Recomendación para el servidor** (no verificada; **PENDIENTE:** el proveedor del remoto no figura en los documentos leídos):

- proteger `main`: sin force-push, sin borrado y sin push directo;
- dar a la credencial del host, que debe ser exclusiva para respaldos, permiso de escritura sólo en `backup/*`. Por ejemplo, con reglas de rama del proveedor que restrinjan la creación y actualización de toda ref salvo `backup/**` para esa identidad;
- no reutilizar la credencial personal del humano.

**Temporizador** (aprobación aparte): una unidad del host, fuera del worktree y por tanto fuera del alcance de los agentes, que ejecute `jz-backup <rama>` como el usuario humano, con el `cwd` en el worktree. No debe lanzarse desde una sesión de agente. El script y `backup.json` están en `.jz/`, que los agentes no pueden modificar.

---

## Tarea 1: comprobación previa y fase roja (sólo pruebas)

**Archivos:** `.jz/tests/policy.test.mjs` y `.jz/tests/recovery.test.mjs` (vía el parche).

- [ ] **Paso 1: estado de partida**

```sh
cd /home/proyectos/jozeuzz-poc-candidata-a
.jz/bin/jz-state                      # Veredicto: REANUDABLE (sin sesiones de agentes vivas)
git status --short                    # vacío
git rev-parse --short HEAD            # 69e1883 o posterior con sólo docs/ (git diff --name-only 69e1883..HEAD)
P=docs/propuestas/plano-control-2026-10-19.patch
git apply --check "$P" && echo check-ok
```

- Esperado: `check-ok`.
- Si falla por recuento de líneas: `git apply --check --recount "$P"`. Si con `--recount` pasa, se usa `--recount` en los dos `git apply` siguientes.
- Si falla por contexto: **no se fuerza**. Se aplica a mano siguiendo §2–§5, o se pide a jz-architect que regenere el parche sobre el HEAD real.

- [ ] **Paso 2: aplicar sólo las pruebas y comprobar que fallan por la razón esperada**

```sh
git apply --include='.jz/tests/*' "$P"
.jz/bin/jz-run node --test .jz/tests/ 2>&1 | tail -n 40
```

Esperado. Es una **deducción** del código, no se ha ejecutado:

- `fail 6`. Fallan:
  - la prueba nueva de rutas de git, porque por ejemplo `git rm .jz/policy/policy.mjs` hoy se permite;
  - las cinco de recuperación nuevas: sobrecarga queda como `cuota`, `true` cuenta como verde, `validacion.json` no existe, falta la etiqueta «no es validación reconocida» y `jz-run` vivo da rc=0.
- `pass 19`, con la prueba de push y `jz-backup` incluida, porque ya pasa.
- `skipped 9`: las de `sandbox.test.mjs` dentro del sandbox.

Si falla otra prueba, se detiene y se informa.

## Tarea 2: aplicar el código y comprobar la fase verde

**Archivos:** `.jz/policy/policy.mjs`, `.jz/policy/validacion.json` (nuevo), `.jz/bin/jz-state`, `.jz/bin/jz-checkpoint`, `.jz/hooks/claude-policy.mjs` y `docs/AUTONOMIA-JZ.md`.

- [ ] **Paso 1: aplicar el resto del parche**

```sh
git apply --exclude='.jz/tests/*' "$P"
git status --short    # M de los 7 archivos modificados y ?? .jz/policy/validacion.json
test -x .jz/bin/jz-state && test -x .jz/bin/jz-checkpoint && echo modos-ok
```

- [ ] **Paso 2: política y recuperación en el sandbox**

```sh
.jz/bin/jz-run node --test .jz/tests/ 2>&1 | tail -n 40
```

- Esperado (deducción): `pass 25`, `fail 0`, `skipped 9`. Son 12 de política, 13 de recuperación y las 9 del sandbox omitidas.
- El log queda en `.jz-state/runs/…`, y `jz-run` imprime `rc=0`.

- [ ] **Paso 3: aislamiento del sandbox en el host (regresión)**

```sh
node --test .jz/tests/sandbox.test.mjs 2>&1 | tail -n 15
```

- Esperado: `pass 9`, `fail 0`, igual que antes (`AUTONOMIA-JZ.md:172`). El parche no toca `jz-run`.

- [ ] **Paso 4: comprobación manual de `jz-state`**

```sh
.jz/bin/jz-state
```

- Esperado:
  - aparecen las secciones «Ejecuciones de jz-run vivas en este worktree: Ninguna.» y «Árbol actual con validación en verde: …»;
  - con el parche aplicado sin confirmar, el veredicto es `REANUDABLE CON CAMBIOS SIN CONFIRMAR: revisar diff antes de continuar`.

## Tarea 3: commit humano

- [ ] **Paso 1: revisar el diff completo**

```sh
git diff --no-ext-diff --no-textconv
```

- [ ] **Paso 2: commit.** Antes, decidir la rama: ver «Conflicto con el gate Docker».

```sh
git add .jz/policy/policy.mjs .jz/policy/validacion.json .jz/bin/jz-state .jz/bin/jz-checkpoint \
  .jz/hooks/claude-policy.mjs .jz/tests/policy.test.mjs .jz/tests/recovery.test.mjs docs/AUTONOMIA-JZ.md
git commit -m "fix(jz): check git paths as writes, recognized validation, live jz-run and dirty-tree verdict"
```

- [ ] **Paso 3 (opcional, consume cuota):** `node .jz/tests/integration.mjs --base <dir>` (`AUTONOMIA-JZ.md:136`). No se exige para aceptar el parche.

## Tarea 4 (opcional, aprobación aparte): `jz-relevo` y `jz-backup`

Se implementan sólo si el humano aprueba los diseños de §6 y §7. El orden sería: fijar `.jz/policy/backup.json` y la protección del servidor, escribir primero `backup.test.mjs` y después el script. Un temporizador, si se quiere, requiere su propia aprobación.

---

## Qué no cubre este parche

- La pertinencia de las pruebas: §3, «Límite».
- Los secretos por contenido en archivos con nombre normal. La política sólo mira nombres; el diseño de `jz-backup` añade la búsqueda de `PRIVATE KEY` en el rango.
- La lectura de un secreto ya versionado con `git show <rev>:<ruta>`. Las lecturas de git no cambian.
- Los `jz-run` no detectables (§4) y una sesión sin `--agent` u OpenCode con `--pure` (`AUTONOMIA-JZ.md` §8).
- `AUTONOMIA-JZ.md` §2.3 y la fila de `jz-implementer` en §3 no se actualizan en el parche. Quedan pendientes para jz-architect, en `docs/`, después de aplicarlo.
- La sincronización con `chore/jz-agents` y con otros worktrees.

## Decisiones pendientes (humanas)

| ID | Decisión | Propuesta |
|---|---|---|
| P-PC-01 | Rama y momento de aplicar (conflicto con A1 del gate) | Después del gate, o en `chore/jz-agents` |
| P-PC-02 | Aceptar el cambio de comportamiento: `git add -A` y `-u` sin rutas, `add .`, `commit -a` y las opciones fuera de la lista blanca quedan denegados | Aceptar |
| P-PC-03 | Contenido de `validacion.json`: si `npm test` o `npx …` cuentan, y si `node --test` debe exigir rutas | La lista mínima del parche |
| P-PC-04 | rc de `REANUDABLE CON CAMBIOS SIN CONFIRMAR` | 0 |
| P-PC-05 | Implementar `jz-relevo` | Opcional |
| P-PC-06 | Implementar `jz-backup`: URL esperada, proveedor y protección del servidor, credencial exclusiva | Sólo con remoto y credencial restringidos a `backup/*` |
| P-PC-07 | Temporizador del host para `jz-backup` | Aprobación aparte, después de P-PC-06 |
