# JZ-I1 — Contención del plano de control

Estado: **implementado en `fix/jz-i1-contencion` con las correcciones de JZ-I1-FIX-001 (§7), pendiente de la revisión focalizada de OpenCode y de la aceptación humana.** No es PASS hasta esa revisión. JZ-REVIEW-I1 (OpenCode, 2026-10-24) dio NO GO sobre `cc63e59`; §7 recoge sus hallazgos y lo que se corrigió.
Origen: JZ-AUDIT-001 (Claude Code, 2026-10-23) y JZ-REVIEW-001 (OpenCode, 2026-10-24), encargo JZ-IMPLEMENT-001.
Base: `chore/jz-agents` `3d1c3a0`.

## 1. Especificación

### A. Política Git (H1)

- Ningún rol autónomo (`jz-*`) ejecuta Git de escritura directo: `add`, `commit`, `rm`, `mv` y `restore` se deniegan, con cualquier opción o ruta. Lo mismo vale para el resto de subcomandos que modifican índice, árbol o historial (ya denegados por omisión).
- Los commits los hace el humano (o un ejecutor Git confinado futuro, fuera de I1).
- Las lecturas de Git permitidas no cambian.

### B. Hook de Claude Code (H2)

- El hook importa la política de forma dinámica dentro del manejador de errores. Si la política falta o lanza al importarse, un `PreToolUse` de un rol `jz-*` o de una delegación (`Agent`/`Task`) se deniega.
- Una entrada que no es un objeto JSON válido se rechaza con código 2 (bloqueante en `PreToolUse`).
- Los hooks `PreToolUse` declaran `"onFailure": "block"` (Claude Code ≥ 2.1.295; instalado 2.1.310). Según la documentación oficial (`code.claude.com/docs/en/hooks`), así un hook que no arranca, sale con un código distinto de 0 y 2, imprime JSON inválido o agota su `timeout` bloquea la llamada en lugar de dejarla pasar.
- La sesión principal sin `--agent` y los agentes que no son `jz-*` no reciben `allow` de la política: siguen el flujo de permisos normal del usuario.
- Límite declarado: el hook no es una frontera frente a procesos del mismo usuario o root; es una capa más sobre las listas `tools:`, las reglas nativas y `jz-run`.

### C. Huellas y consultas Git (N1, N2)

- La huella del árbol y la lista de cambios de `jz-state` no ejecutan comandos Git que apliquen filtros `clean`/`smudge`, `textconv`, `fsmonitor` ni hooks: no se usa `git status` ni `git diff` contra el árbol de trabajo.
- Las consultas Git usan sólo `rev-parse`, `ls-files` (índice y no rastreados) y `diff-index --cached` (índice frente a `HEAD`), con `core.fsmonitor=false`, sin configuración global ni de sistema, sin locks opcionales y sin pager. Patrón tomado de `tools/jz-ai` M0 (`exec.js`, `fs-read.js`).
- El contenido se lee desde Node con `O_NOFOLLOW | O_NONBLOCK`: los enlaces simbólicos se registran por su destino (no se siguen), las FIFO y dispositivos por su tipo (no se abren) y las rutas cuyo directorio padre resuelve fuera del worktree se registran como externas sin leerlas. Los nombres de archivo nunca pasan por argv de otro programa.
- La huella cambia de algoritmo: las ejecuciones antiguas de `runs.jsonl` dejan de coincidir con el árbol actual (comportamiento conservador).
- Fuera de alcance (I2): los archivos ignorados (`node_modules`, cachés) siguen fuera de la huella (N3).

### D. Compatibilidad

Sin cambios en: sandbox de `jz-run`, locks, checkpoints, delegación, perfiles de sólo lectura, Superpowers y skills, estado del gate POC-3. Sin dependencias nuevas.

## 2. Criterios de aceptación

1. Pruebas nuevas en rojo antes del cambio, en verde después, sin `skip`.
2. `node --test .jz/tests/policy.test.mjs .jz/tests/recovery.test.mjs .jz/tests/hook.test.mjs .jz/tests/tree.test.mjs` en verde en el host, y `.jz/bin/jz-run node --test .jz/tests/` en verde en el sandbox.
3. `node --test .jz/tests/sandbox.test.mjs` en verde (aislamiento sin regresión).
4. Fixtures sintéticos en el directorio temporal; ningún secreto real leído.

## 3. Resultado (2026-10-24, host `root`, Node 20.19.2, Claude Code 2.1.310)

### Pruebas que fallaron antes del cambio

| Prueba | Fallo observado con `3d1c3a0` |
|---|---|
| `policy`: git de escritura denegado | `jz-implementer: git add src/a.ts: git add local` (permitido). También se permitían `git add -A`, `git add -f .env`, `git add .claude/settings.json`, `git commit -a`, `git commit --no-verify`, `git rm .jz/policy/policy.mjs`, `git rm -r --cached .`, `git mv AGENTS.md x.md`, `git mv src/x .jz/bin/jz-run`, `git restore --staged .` |
| `hook`: política ausente | el hook salía con código 1 (error no bloqueante): ni denegación ni bloqueo |
| `hook`: política que lanza al importarse | ídem |
| `hook`: exportaciones incompletas | ídem (`SyntaxError` al enlazar el módulo) |
| `hook`: entrada inválida | salía con 0 sin decisión |
| `hook`: denegación explícita | `git add -A` permitido |
| `hook`: `onFailure` | ausente en `settings.json` |
| `tree`: filtros y fsmonitor | el `fsmonitor` del repositorio se ejecutó |
| `tree`: nombre `-b` | `sha256sum` lo tomó como opción: la huella no cambiaba con su contenido |
| `tree`: enlace externo | la huella cambiaba con el contenido del destino externo (se seguía el enlace) |
| `tree`: directorio sustituido por enlace | `sha256sum: dir: Is a directory` |
| `tree`: FIFO | `git diff` abortaba (`cannot hash`) y la huella fallaba |
| `tree`: repositorio anidado | se omitía de la huella (prueba añadida durante la revisión propia) |

Ya pasaban antes, y quedan como regresión: error interno durante la decisión, sesión principal sin capacidades autónomas, determinismo de la huella y formato de `jz-state`.

### Pruebas en verde después del cambio

- Host: `node --test .jz/tests/{policy,hook,tree,recovery}.test.mjs`: 35/35.
- Sandbox: `.jz/bin/jz-run node --test .jz/tests/`: 35 pass, 0 fail, 9 skip (las de `sandbox.test.mjs`, que no se anidan por diseño).
- Aislamiento: `node --test .jz/tests/sandbox.test.mjs`: 9/9.
- Paridad: `node .jz/lib/tree.mjs status` produce lo mismo que `git status --porcelain=v1 --untracked-files=all` en este worktree.
- Motor real, Claude Code 2.1.310 con `haiku` en directorios desechables, hook `PreToolUse` sobre `Bash` y `touch MARK`:

| Hook | `onFailure` | Resultado |
|---|---|---|
| script inexistente | `block` | bloqueado, `MARK` ausente |
| script inexistente | (sin campo) | ejecutado, `MARK` creado |
| `sleep 20` con `timeout: 2` | `block` | bloqueado, `MARK` ausente |
| `sleep 20` con `timeout: 2` | (sin campo) | ejecutado, `MARK` creado |

No se ejecutó `integration.mjs` (consume cuota de los dos motores). Sus escenarios I1 e I6 se adaptaron: el implementador ya no hace commit y se comprueba que el índice queda intacto.

### Recuperación

- `recovery.test.mjs` (cuota, `StopFailure`, bloqueo de escritor, veredicto de `jz-state`) sigue en verde con el nuevo `jz-state`.
- Si la lista de cambios o la huella fallan, `jz-state` y `jz-checkpoint` terminan con error (antes se ignoraban los errores de `git diff`).
- Las ejecuciones anteriores de `runs.jsonl` dejan de coincidir con el árbol actual: después de actualizar, hay que volver a ejecutar la validación.
- Rollback: el humano revierte el commit de I1 (`git revert`) o vuelve a copiar el plano de control de `3d1c3a0`. No se deben reanudar agentes con la política antigua.

## 4. Riesgos residuales

1. **El hook y el plugin no son una frontera frente a root.** Corren con el mismo usuario que el motor.
2. **`onFailure: "block"` afecta también a la sesión principal.** Si el hook no puede arrancar (por ejemplo, `node` ausente), Claude Code bloquea todas las herramientas del proyecto, también para el humano. La reparación se hace fuera de Claude Code.
3. **El plugin de OpenCode no tiene equivalente a `onFailure`.** Superado en JZ-I1-FIX-001 (§7.2): OpenCode sigue sin el plugin si no carga, pero ahora los perfiles base son de sólo lectura.
4. **Git de lectura en el host.** Los agentes pueden ejecutar `git status` y `git diff`, que aplican los filtros de la configuración de Git. Hoy no hay ninguno configurado (comprobado con `git config --show-origin --get-regexp`), y la configuración es plano de control. JZ-I1-FIX-001 les fija `GIT_OPTIONAL_LOCKS=0` y `core.fsmonitor=false` (§7.4).
5. **`git show` y `git log -p` leen secretos del historial** sin validar rutas (N4 de JZ-REVIEW-001). Fuera de I1.
6. **TOCTOU en `tree.mjs`.** `O_NOFOLLOW` protege el último componente. Un directorio intermedio cambiado entre la comprobación del padre y la apertura podría hacer leer un archivo externo. En la práctica, `jz-run` mata a sus procesos al terminar y la huella se calcula fuera de la ejecución.
7. **Lista de cambios sin filtros.** Compara bytes crudos con el índice: en un repositorio con conversión de fin de línea o filtros, un archivo podría aparecer como modificado sin estarlo. Es el lado seguro del error.
8. **Los archivos ignorados siguen fuera de la huella** (N3). Lo trata I2.
9. **Respaldo en un remoto público.** Las refs `refs/backup/2026-10-24/*` se publicaron en `origin`, que es público. Las dos auditorías recomendaban un remoto privado o un bundle cifrado fuera del CT por el contenido interno (rutas, modelo de amenaza, procedimientos del gate). No aparecen en la interfaz de ramas de GitHub, pero cualquiera puede descargarlas.

## 5. Handoff para la revisión independiente (OpenCode, sólo lectura)

- Worktree `/home/proyectos/jozeuzz-jz-i1`, rama `fix/jz-i1-contencion`, base `3d1c3a0`. Revisar con `git -C /home/proyectos/jozeuzz-jz-i1 show --stat HEAD` y `git diff 3d1c3a0..HEAD`.
- Archivos clave: `.jz/policy/policy.mjs` (`checkGit`), `.jz/hooks/claude-policy.mjs`, `.claude/settings.json`, `.jz/lib/tree.mjs`, `.jz/bin/jz-run` (`tree_fingerprint`), `.jz/bin/jz-state`, perfiles de `jz-implementer` y `jz-orchestrator` en los dos motores.
- Reproducción, sin efectos fuera de temporales y de `.jz-state/` del propio worktree:
  - `TMPDIR=<tmp> node --test .jz/tests/policy.test.mjs .jz/tests/hook.test.mjs .jz/tests/tree.test.mjs .jz/tests/recovery.test.mjs`
  - `.jz/bin/jz-run node --test .jz/tests/` y `node --test .jz/tests/sandbox.test.mjs` (requieren root).
- Preguntas para el revisor:
  1. ¿Queda alguna vía, además de `add|commit|rm|mv|restore`, por la que un agente modifique el índice o el plano de control con los comandos permitidos?
  2. ¿El orden de `try` y `catch` del hook deja algún caso de `PreToolUse` de un `jz-*` sin decisión ni bloqueo?
  3. ¿`tree.mjs` ejecuta algo del repositorio, o lee fuera del worktree, en algún caso no cubierto por `tree.test.mjs`?
  4. ¿Las reglas `permission` de OpenCode (`"git add*": deny` …) tienen la precedencia esperada frente a `"*": deny` y a las lecturas permitidas?
  5. ¿Debe el plugin de OpenCode importar la política de forma dinámica en I2?

## 6. Diseño propuesto para I2: `jz-ai verify` (validación reconocida)

Recoge JZ-REVIEW-001 §5 y JZ-AUDIT-001 §6. No se implementa sin aceptar I1.

- **Interfaz.** `jz-ai verify <profile-id> [--json]`, sin argv libre. `jz-ai` (`tools/jz-ai`) es la fachada: valida la entrada, invoca `.jz/bin/jz-run --verify <profile-id>` y muestra el resultado. `.jz` es la única autoridad sobre qué se ejecuta.
- **Perfiles.** Están en `.jz/profiles/<id>.json` (plano de control, versionados) y contienen `id`, `version`, `cwd`, `argv`, `requiredInputs`, `lockfiles`, `oracle` (`format: tap`, `minimumTests`, `allowSkipped`) y `assurance: recognized`. Primeros perfiles: `control-plane` (`node --test .jz/tests/`) y `jz-ai-m0`.
- **Ejecución en `jz-run --verify`.**
  1. Resuelve el perfil y su digest.
  2. Calcula la huella inicial con `tree.mjs`.
  3. Ejecuta en el sandbox.
  4. Calcula la huella final y exige que coincida con la inicial.
  5. Aplica el oráculo TAP: tests > 0, sin fallos y sin skips no permitidos.
  6. Escribe la evidencia en `.jz-state/validaciones/` mediante temporal, `fsync` y `rename`. Esa carpeta es de sólo lectura dentro del sandbox.
- **Evidencia.** `schemaVersion: 1`, `profileId`, `profileDigest`, `head`, `treeStart`, `treeEnd`, `cwd`, `argv`, runtime (versión y digest de `node`), digests de los lockfiles, `rc`, oráculo (tests, failed, skipped), `logDigest` y `result: recognized`.
- **Consumo.** `jz-state` y `jz-checkpoint --state validado` aceptan sólo evidencias válidas para el árbol y el `head` actuales. `runs.jsonl` queda como observabilidad.
- **Pruebas de aceptación (rechazo).** Perfil inexistente, argv libre, `true` con `rc=0`, cero tests, skips no permitidos, cwd distinto, mutación del árbol durante la ejecución, evidencia de otro worktree o de otro `head`, perfil, lockfile o runtime distinto, y evidencia truncada o no atómica.
- **Fuera de I2.** El nivel `reproducible-attested` (snapshot o digest de `node_modules`; opción 3 de `PLANO-CONTROL-2026-10-19`), el ejecutor Git confinado, el backup externo (I3) y el supervisor.

## 7. JZ-I1-FIX-001: correcciones de la revisión independiente (2026-10-24)

JZ-REVIEW-I1 (OpenCode, sesión `ses_e93afc666ffek1Gaow6MajxRy9`) dio **NO GO** sobre `cc63e59`. Esta sección recoge qué se corrigió en un commit adicional (sin reescribir `cc63e59`), con qué pruebas y qué queda abierto. No es PASS hasta la revisión focalizada.

### 7.1 Huella del árbol (`.jz/lib/tree.mjs`, formato `jz-tree-v3`)

- **A1, nombres no UTF-8.** La salida de git se procesa como bytes y cada ruta se decodifica con un decodificador estricto que conserva el BOM; si los bytes no vuelven a ser idénticos, falla con `JZ_TREE_NON_UTF8`. No hay conversión con pérdida.
- **A2, índice.** La huella incluye cada entrada de `git ls-files -s -z` (modo, OID, stage y ruta), así que preparar un cambio, cambiar el modo en el índice o resolver un conflicto cambia la huella aunque el árbol de trabajo sea el mismo. Los indicadores `intent-to-add`, `skip-worktree` y `assume-unchanged` no forman parte (§7.6).
- **A3, repositorios anidados y gitlinks.** Fallan con `JZ_TREE_NESTED_REPO` un repositorio anidado no rastreado y cualquier entrada `.git` (directorio o archivo, sea o no un repositorio válido) en un directorio que git recorrió o, a cualquier profundidad, dentro de un directorio no rastreado (se recorre sin seguir enlaces, salvo sus subdirectorios ignorados). Una entrada `160000` del índice falla con `JZ_TREE_GITLINK`. No hay soporte recursivo.
- **A4, errores.** Sólo `ENOENT` y `ENOTDIR` se registran como ausentes. Fallan los demás errores de inspección (`JZ_TREE_IO`, por ejemplo un bucle de enlaces), las rutas inseguras (`JZ_TREE_UNSAFE_PATH`), los tipos desconocidos (`JZ_TREE_TYPE`), un archivo que cambia entre `lstat` y la lectura (`JZ_TREE_RACE`), una entrada del índice irreconocible (`JZ_TREE_INDEX`) y cualquier fallo de git (`JZ_TREE_GIT`). FIFO, sockets y dispositivos se distinguen entre sí sin abrirse y la huella incluye todos los bits de permiso.
- **D, configuración.** Las consultas añaden `core.excludesFile=/dev/null` y `--no-ext-diff --no-textconv`, y la huella falla con `JZ_TREE_TOPLEVEL` si `core.worktree` desplaza el árbol.
- La huella es el SHA-256 completo (antes, 64 bits: un agente que controla los dos árboles podía buscar una colisión).
- `jz-state` responde `BLOQUEADO` (código 3) con el error `JZ_TREE_*` cuando la huella o la lista de cambios no se pueden calcular, y `jz-run` termina sin ejecutar el comando ni registrar nada. `jz-checkpoint` también falla: el checkpoint de cuota del plugin se pierde (sin aviso) si el árbol no es verificable.

### 7.2 OpenCode

- **B2, comportamiento real sin plugin.** Se comprobó con OpenCode 1.17.18 y un modelo simulado local (`.jz/tests/opencode-native.mjs`, sin cuota). Con `--pure`, sin el archivo del plugin, con la política rota y con un error al inicializar, OpenCode **arranca igual, sin el plugin**. En el último caso sólo registra `failed to load plugin`. Con los perfiles de `cc63e59` quedaban las reglas nativas: `echo hola > MARK` creó el archivo en todos esos casos y el implementador escribió con `write`. El hook `permission.ask` de la API de plugins no se invoca en esta versión (el binario sólo emite el evento `permission.asked`), y la mutación de la configuración en el hook `config` sí se aplica en `opencode run`.
- **Contención aplicada.** Los perfiles de `.opencode/agents` son ahora la base de sólo lectura: `edit: deny` y `bash: deny`, y el orquestador sólo delega en explorer, security y qa. Al cargarse, el plugin aplica con su hook `config` los permisos operativos de `.opencode/jz-permissions.json`. El archivo se lee al importar el plugin: si falta o no es JSON válido, el plugin no carga y rige la base. El import estático de la política se mantiene a propósito: si falla, el plugin no carga y también rige la base. Un import dinámico no resolvería los casos en que el plugin no se ejecuta.
- **B1, `workdir`.** `checkBash` resuelve el directorio de trabajo (también a través de enlaces) y lo deniega si queda fuera del worktree, antes de analizar el comando. El plugin toma como base el `directory` de OpenCode. Con `cc63e59`, `git status` con `workdir` en un enlace hacia fuera se ejecutaba fuera del worktree, porque `external_directory` no resuelve enlaces.
- **B3, patrones nativos.** OpenCode separa `;`, `&&`, `|` y `$(…)` en comandos, pero compara cada uno como texto e incluye las redirecciones. Con `cc63e59`, `"git diff*"` admitía `git difftool -y -x "touch MARK"` (creó MARK), `"echo *"` admitía `echo hola > MARK` y `"ls *"` y `"git blame*"` leían `/root` y `/etc/hostname`. Los patrones operativos pasan a `"git diff *"` (los argumentos opcionales) y terminan con denegaciones para `>`, `<`, `$`, comillas invertidas, `&`, `\`, `[`, `ls` y `echo` con rutas fuera del worktree, rutas de git absolutas, con `..` o `~`, y las opciones de git que leen o escriben archivos. Las abreviaturas se deniegan desde el primer prefijo que git 2.47.3 no rechaza por ambiguo o desconocido (`--con`, `--ou`, `--no-i`…; comprobado subcomando por subcomando). Los prefijos más cortos sólo los deniega la política. Las reglas `edit` permiten `.env.example`, como la política. `*` y `?` no se pueden excluir con un patrón porque son los comodines de OpenCode. La validación semántica sigue siendo la del plugin.
- **Perfiles base.** También deniegan la lectura de `*.pem`, `*.key`, `*.p12`, `*.pfx` e `id_*` (antes sólo `.env*`), que es lo único que protege con `--pure`. No resuelven enlaces.

### 7.3 Bloqueo de escritor (C)

La carrera era real: con una interposición determinista sobre `fs` (B lee el huérfano y, justo antes de que lo borre, A lo recupera y adquiere), `cc63e59` admitía a los dos. Ahora:

- el bloqueo se escribe en un temporal y se crea con `link(2)`, que falla si ya existe, de modo que nunca es visible vacío ni a medio escribir (con `writeFileSync(wx)` lo era, y un lector lo tomaba por huérfano);
- un bloqueo ilegible de menos de un minuto se trata como activo;
- un huérfano sólo se retira tomando un mutex exclusivo (`writer.lock.recover`, con espera de 200 ms) y si su contenido sigue siendo el que se leyó;
- liberar y vincular la sesión escritora también toman el mutex, así que mientras un recuperador lo tiene nadie más puede borrar ni reescribir el bloqueo, y nadie puede crear otro mientras exista.

Pruebas con interposición: A completa la recuperación justo antes de que B tome el mutex; A lo intenta mientras B lo tiene; bloqueo vacío reciente y antiguo; liberar y vincular con el mutex tomado. Si un proceso muere con el mutex tomado, la adquisición queda denegada (fallo cerrado) hasta que el humano ejecute `.jz/bin/jz-lock release`, que también retira el mutex. No hay supervisor.

### 7.4 Git de lectura (D)

- **Política:** ver §7.7 (rutas externas, abreviaturas y opciones cortas en git de lectura).
- **Autoritativo:** la huella y la lista de cambios (`tree.mjs`) no ejecutan filtros, `textconv`, fsmonitor, hooks ni comandos configurados (canario en `tree.test.mjs`), no leen la configuración global ni de sistema y usan un entorno fijo. `jz-state` y `jz-run` consultan rama y `HEAD` con un entorno Git limpio (`hgit`). Antes, un `GIT_DIR` heredado hacía que `jz-state` mostrara el `HEAD` de otro repositorio.
- **Fuera de garantías (diagnóstico en el host):** `git status`, `diff`, `log`, `show`, `blame`, `ls-files`, `rev-parse`, `branch --show-current`, `worktree list` y `remote -v` ejecutados por los agentes con su shell. Los dos motores les fijan `GIT_OPTIONAL_LOCKS=0` y `core.fsmonitor=false` (`.claude/settings.json` y el hook `shell.env` del plugin), pero aplican los filtros y `textconv` de la configuración de Git (plano de control; hoy ninguno), y `show` y `log -p` leen todo el historial.

### 7.5 Pruebas

En las cinco suites del host, 34 pruebas nuevas o ampliadas (las dos rondas, §7.7) fallan con el código de `cc63e59`: se ejecutaron sobre una copia de `cc63e59` con las pruebas nuevas, adaptando en esa copia sólo el import de `policy.test.mjs` (exportaciones que no existían) y la longitud de huella aceptada (y, en `opencode.test.mjs`, la exportación `GIT_DENIED_LONG`). Todas pasan después. Las 33 restantes pasan con los dos códigos, entre ellas el canario de filtros, ampliado con su control positivo. En `sandbox.test.mjs` hay 3 pruebas nuevas.

| Archivo | Pruebas nuevas o ampliadas |
|---|---|
| `tree.test.mjs` | no UTF-8 (no rastreado, rastreado y preparado; BOM válido), índice (OID y modo), conflicto, repositorio anidado (ampliada), `.git` no válido (tres ubicaciones y archivo `.git`), `.git` a cualquier profundidad, gitlink, error de inspección, índice corrupto (`JZ_TREE_GIT`), FIFO frente a socket, `core.worktree` y `core.excludesFile`, `GIT_DIR` heredado, inyección en `jz-state`. Además, huella de 64 caracteres en todas y control positivo del canario de filtros. |
| `policy.test.mjs` | cwd fuera del worktree, git de lectura (rutas externas, secretos, abreviaturas y opciones cortas), `cd -`, `cd ±N` y comodines, y cinco entrelazados del bloqueo |
| `recovery.test.mjs` | `jz-lock release` retira el mutex, entorno de `shell.env` (ampliada), saltos de línea en `jz-checkpoint` y `jz-checkpoint` con árbol no verificable |
| `hook.test.mjs` | entorno de `settings.json` y su efecto real sobre el fsmonitor, con control positivo |
| `opencode.test.mjs` (nuevo) | `workdir`, worktree no verificable, herramientas no reconocidas, hook `config` (con el alias copilot y las reglas `edit` evaluadas), base de sólo lectura (incluidos los secretos), patrones nativos con la semántica de OpenCode y todas las abreviaturas de las opciones prohibidas |
| `sandbox.test.mjs` | cuarentena de enlaces hacia el plano de control; `jz-run` sin ejecutar ni registrar nada con un árbol no verificable (pasaba ya con `cc63e59`, por `set -e`); `HEAD` propio con `GIT_DIR` heredado (con `cc63e59` habría registrado el del otro repositorio; no se ejecutó contra él) |

Resultados finales (host `root`, Node 20.19.2, git 2.47.3, OpenCode 1.17.18):

- Host: `node --test .jz/tests/{policy,tree,recovery,hook,opencode}.test.mjs`: 67/67.
- Sandbox: `.jz/bin/jz-run node --test .jz/tests/`: 67 pass, 0 fail y 12 skip (los de `sandbox.test.mjs`, que no se anida). La línea de `runs.jsonl` y su huella están en el informe de entrega.
- Aislamiento: `node --test .jz/tests/sandbox.test.mjs`: 12/12.
- OpenCode real: `node .jz/tests/opencode-native.mjs`: 27/27 escenarios como se esperaba, cada denegación con su motivo (plugin, regla nativa o herramienta ausente). Con el plano de control de `cc63e59` (extraído con `git archive cc63e59`), 14 de los 20 escenarios de la primera versión del script dieron un resultado distinto: MARK creado sin plugin, `git difftool -x` ejecutado y `workdir` externo ejecutado. Los 7 escenarios añadidos después (N6, N7, P6 y C7 a C10) no se ejecutaron contra `cc63e59`.
- El emulador de reglas de `opencode.test.mjs` evalúa la cadena completa y no separa `;`, `&&` ni `|` como OpenCode: los comandos compuestos los cubren C6, C9 y C10 con el motor real.
- `jz-run` hace `touch` de cada archivo del plano de control al montarlo en sólo lectura (comportamiento previo): cambia su fecha, no su contenido.
- Paridad: `tree.mjs status` coincide con `git status --porcelain=v1 --untracked-files=all` en este worktree.
- No se ejecutó `integration.mjs` (consume cuota). Su fixture copia ahora `jz-permissions.json`. No se consumió cuota de ningún proveedor: `opencode-native.mjs` sólo usa un servidor simulado en `127.0.0.1`.
- Las salidas están en `.jz-state/evidencia/JZ-I1-FIX-001/`, que no se versiona.

Las sesiones de Claude Code abiertas en este proyecto heredan el entorno de `settings.json` (`core.fsmonitor=false`). Por eso los canarios de las pruebas limpian `GIT_*` y tienen un control positivo: sin él, el canario de fsmonitor habría pasado aunque se ejecutara `git status`.

Incidente durante la caracterización: la primera versión del script lanzó OpenCode con el `PWD` heredado y OpenCode tomó ese directorio (este worktree) en lugar del cwd del fixture. Se ejecutaron `git status --short` (lectura) y cinco escenarios más, todos denegados por el plugin o fuera del worktree. Se comprobó que el worktree no cambió: los mismos archivos modificados, sin `MARK`, sin `src/` y sin checkpoints nuevos. El script fija ahora `--dir` y `PWD` y falla si la instancia no arranca en el fixture.

### 7.6 Riesgos residuales

| Riesgo | Clase |
|---|---|
| El hook y el plugin no son una frontera frente a root. | Aceptado (§4.1) |
| Archivos ignorados fuera de la huella (N3), incluidos los `.git` dentro de directorios ignorados. | Abierto, I2 |
| Indicadores del índice (`intent-to-add`, `skip-worktree`, `assume-unchanged`) fuera de la huella: dos índices que sólo difieren en ellos tienen la misma huella. El criterio A2 se cumple para OID, modo, stage y conflictos, no para estos indicadores. Los agentes no pueden cambiarlos (`git add` y `update-index` denegados). | Bajo, documentado |
| FIFO y sockets no rastreados: git no los lista y no entran en la huella. No tienen contenido. | Bajo |
| `JZ_TREE_RACE`, `JZ_TREE_TYPE`, `JZ_TREE_UNSAFE_PATH`, `JZ_TREE_INDEX` y los errores de permiso (`EACCES`, como root) están implementados pero sin prueba: no se pueden provocar de forma determinista. | Bajo |
| TOCTOU de directorios intermedios en `tree.mjs` (§4.6). | Aceptado temporalmente |
| La base de sólo lectura de OpenCode depende de que el hook `config` siga mutando la configuración efectiva. Sólo se comprobó en `opencode run` 1.17.18; TUI, `serve` y otras versiones no se verificaron (el script se niega a ejecutarse con otra versión salvo `--any-version`). `opencode debug agent` muestra los permisos anteriores al hook. Otros plugins globales (caveman, superpowers) también podrían mutarla. | Medio: repetir `opencode-native.mjs` al actualizar OpenCode |
| Los perfiles base no resuelven enlaces: con `--pure`, un perfil de lectura puede leer a través de un enlace del worktree. | Medio, sólo lectura |
| Con el plugin cargado, OpenCode en `--auto` o en el modo automático de la TUI aprueba las solicitudes `ask`. Los perfiles no tienen reglas `ask`, pero el `external_directory: ask` por omisión sólo lo tapa el `"*": deny` de cada perfil. | Bajo |
| Enlace interno hacia el plano de control creado por `jz-run` y seguido por una edición en paralelo antes de la cuarentena (§8 de `AUTONOMIA-JZ.md`). No se verificó si OpenCode ejecuta herramientas en paralelo. | Medio, abierto |
| Un nombre de enlace con salto de línea rompe la cuarentena de `jz-run`: `mv` falla y la ejecución no se registra. | Bajo |
| Un árbol no verificable hace fallar `jz-checkpoint` sin escribir nada: el checkpoint de cuota del plugin se pierde sin aviso. | Bajo, fallo cerrado |
| Mutex interrumpido: bloquea adquirir, liberar y vincular hasta `jz-lock release`, que no comprueba si hay una operación viva (es una operación humana). | Bajo, fallo cerrado |
| Git de diagnóstico en el host: filtros y `textconv` de la configuración, e historial completo con secretos (`show`, `log -p`, N4). | Abierto, fuera de I1 |
| «En verde» sólo significa alguna ejecución con `rc=0` sobre el árbol (`jz-run true` basta). | Abierto, I2 |
| `.claude/settings.json` fija `GIT_OPTIONAL_LOCKS=0`, `core.fsmonitor=false` y `CDPATH` vacío también para la sesión humana de Claude Code en este proyecto. | Aceptado (sin efecto funcional) |
| Refs de respaldo en un remoto público (§4.9). | Abierto, decisión humana |

### 7.7 Segunda ronda: revisión interna de seguridad y QA (jz-security y jz-qa, sólo lectura)

Antes del commit, `jz-security` dio NO GO y `jz-qa` un aprobado condicionado. Lo que se confirmó y se corrigió:

- **Bloqueante, lectura de archivos del host con git de lectura.** Se confirmó en git 2.47.3:
  - `git diff /etc/hostname /dev/null` compara sin índice (implícito con una ruta externa) y muestra el archivo;
  - `git blame --cont=/etc/hostname f` lo muestra como contenido, porque git acepta prefijos únicos de las opciones largas;
  - `git blame -S /etc/hostname` y `--ignore-revs-f=` filtran su primera línea en el mensaje de error.

  La política y los patrones nativos los admitían. Ahora `checkGit` deniega las rutas fuera del worktree o de secretos, los prefijos de cuatro o más caracteres de las opciones prohibidas y `blame -S`, `ls-files -X` y `-O`. Los patrones nativos añaden denegaciones equivalentes (escenarios C7 y C8).
- `cd -`, `cd ±N` y `CDPATH` saltaban fuera del worktree sin pasar por la validación. Ahora se deniegan, se exige un directorio existente y los dos motores fijan `CDPATH` vacío. Los comodines sin comillas (`echo /root/.ssh/*`) se expandían después de validar y ahora se rechazan.
- El bloqueo vacío durante su creación y la liberación o vinculación sin mutex: §7.3.
- Con un worktree `/` (OpenCode fuera de git), el plugin trataba todo como interior. Ahora no carga y rige la base.
- Las herramientas no reconocidas pasaban sin política; ahora se deniegan a los `jz-*`.
- Inyección de evidencia: `jz-state` imprimía el comando registrado en crudo y `jz-checkpoint` admitía saltos de línea en sus campos. Ahora el comando se muestra como JSON y los saltos de línea se sustituyen por espacios.
- Un `.git` a dos o más niveles dentro de un directorio no rastreado no se detectaba (§7.1). La huella era de 64 bits (§7.1).
- `jz-run` pone ahora en cuarentena también los enlaces nuevos hacia el plano de control.
- QA: cada denegación de `opencode-native.mjs` exige su motivo, y hay escenarios de comandos compuestos (C9 y C10), delegación con bloqueo (N6) y lectura de clave con `--pure` (P6). Además: aserción de versión, control positivo de los canarios, prueba de comportamiento del entorno git y git de las pruebas sin configuración global.

Lo que no se corrigió está en §7.6. La documentación se ajustó para no atribuir más de lo probado.

En la re-revisión focalizada, `jz-security` dio GO para la revisión humana y `jz-qa` aprobó con observaciones (R1–R7), que se atendieron:

- reglas `edit` y alias copilot probados a través del hook `config`;
- todas las abreviaturas de las opciones prohibidas, en la política y en los patrones nativos;
- `jz-checkpoint` con un árbol no verificable;
- git de las pruebas de recuperación sin configuración global;
- `HEAD` de `jz-run` con `GIT_DIR` heredado;
- procedencia de la evidencia roja y límites del emulador;
- comentario obsoleto y aserción vacía eliminados.

Ninguna de las dos revisiones sustituye a la revisión focalizada de OpenCode (§7.8).

### 7.8 Handoff para la revisión focalizada (OpenCode, sólo lectura)

- Worktree `/home/proyectos/jozeuzz-jz-i1`, rama `fix/jz-i1-contencion`. Revisar el commit posterior a `cc63e59` con `git -C /home/proyectos/jozeuzz-jz-i1 show --stat HEAD` y `git diff cc63e59..HEAD`.
- Reproducción, sin efectos fuera de temporales y de `.jz-state/`: `TMPDIR=<tmp> node --test .jz/tests/{policy,tree,recovery,hook,opencode}.test.mjs`, `.jz/bin/jz-run node --test .jz/tests/` y `node --test .jz/tests/sandbox.test.mjs` (root), y `node .jz/tests/opencode-native.mjs` (OpenCode real, sin cuota, unos 15 minutos; se lanza desde un directorio temporal). Las salidas de esta entrega están en `.jz-state/evidencia/JZ-I1-FIX-001/`.
- Preguntas:
  1. ¿Queda algún nombre, entrada del índice o tipo de archivo que produzca una huella válida sin representar su contenido?
  2. ¿Hay alguna forma de que el plugin cargue sin aplicar su hook `config`, o de que la base de sólo lectura de los perfiles no rija cuando el plugin no carga?
  3. ¿Algún patrón de `jz-permissions.json` admite escritura, ejecución o lectura fuera del worktree que el plugin no rechace después?
  4. ¿La recuperación del bloqueo admite algún entrelazado con dos escritores además de los cubiertos por `policy.test.mjs`?
  5. ¿Queda alguna forma de leer un archivo fuera del worktree con los comandos de shell que admite la política (git de lectura, `ls`, `echo`, `cd`)?

## 8. JZ-I1-BOOT-001: permisos operativos del orquestador en OpenCode (2026-10-24)

Incidente: en la TUI de OpenCode 1.17.18, `jz-orchestrator` (worktree y rama correctos, plugin cargado) no pudo ejecutar `.jz/bin/jz-state`, `.jz/bin/jz-state --` ni `.jz/bin/jz-checkpoint ...`, y la revisión final de I1 no empezó.

- **Causa raíz.** La denegación es nativa, no del plugin ni de `.jz/policy/policy.mjs` (que admite los tres comandos). El registro de OpenCode muestra, para cada uno, `action.pattern="*\\*" action.action=deny`. `Wildcard.match` de OpenCode 1.17.18 convierte `\` en `/` en la orden y en el patrón antes de comparar, así que la regla `"*\\*": "deny"` de `jz-permissions.json` (pensada para la barra invertida) equivale a `*/*` y deniega toda orden con `/`. Como iba después de las reglas de `.jz/bin`, ganaba siempre (gana la última regla que coincide).
- **Por qué no lo detectaron las pruebas.** El emulador de `opencode.test.mjs` no hacía esa conversión, y ninguno de los 27 escenarios de `opencode-native.mjs` ejecutaba una orden admitida con `/` (los positivos eran `git status --short`). No hay diferencia entre `opencode run` y la TUI: con `opencode run` el fallo se reproduce igual (N8 a N11 en rojo antes del cambio).
- **Cambio.** En los dos conjuntos de `bash` (orquestador e implementador), `*\*` se mueve antes de las denegaciones de redirección y expansión, y los ejecutores de `.jz/bin` (`jz-state *`, `jz-checkpoint *`, `jz-lock status` y, en el implementador, `jz-run *`) van justo después. Las demás reglas no cambian. No se añade ningún permiso: lo único que deja de denegarse de forma nativa son esos ejecutores con `/` en la ruta o en los argumentos. Las órdenes con `>`, `<`, `` ` ``, `$`, `&` o `[` siguen denegadas, y el plugin vuelve a validar cada llamada.
- **Limitación que se mantiene.** La regla nativa no distingue `/` de `\`: `git` y `ls` con rutas (`git show HEAD:src/a.ts`, `git diff -- docs/a.md`, `ls docs/propuestas`) siguen denegados de forma nativa. El agente lee esas rutas con `read`, `glob` y `grep`. Admitirlas obligaría a renunciar a la barrera nativa contra opciones y rutas ocultas con `\` (p. ej. `git log --o\utput=MARK`, C11).
- **Pruebas nuevas.** `opencode.test.mjs`: el emulador aplica la conversión; comandos operativos con `/` admitidos; `\` en opciones, rutas y ejecutores, `jz-lock release` y ejecutores fuera de `.jz/bin` denegados; git y ls con rutas denegados de forma nativa; `jz-run` sólo para el implementador. `opencode-native.mjs`: N8 a N12, P7, C11 y C12.
- **Resultados.** Antes del cambio, N8 a N11 fallaban (`rule which prevents`) y N12 tenía un motivo distinto del esperado. Después del cambio: `opencode-native.mjs` 35/35 como se esperaba; `node --test .jz/tests/{policy,tree,recovery,hook,opencode}.test.mjs` 67/67; `.jz/bin/jz-run node --test .jz/tests/` 67 en verde y 12 omitidas (espacios de nombres anidados); `sandbox.test.mjs` 12/12. La salida nativa está en `.jz-state/evidencia/JZ-I1-BOOT-001/`.
- **Pendiente: prueba manual en la TUI.** `opencode-native.mjs` usa `opencode run`. La TUI usa el mismo servicio de permisos, pero no se verificó de forma automática. Para comprobarlo: `cd /home/proyectos/jozeuzz-jz-i1 && opencode /home/proyectos/jozeuzz-jz-i1 --agent jz-orchestrator` y pedir que ejecute `.jz/bin/jz-state`, `.jz/bin/jz-lock status`, `.jz/bin/jz-checkpoint --unit "JZ-I1-BOOT-001" --state incompleto --next "prueba TUI"` y `.jz/bin/jz-lock release`. Los tres primeros deben ejecutarse; el cuarto debe rechazarse con `jz-policy: jz-lock: sólo "status"`. Después, `grep 'permission=bash' ~/.local/share/opencode/log/opencode.log | tail` no debe mostrar `action.action=deny` para los tres primeros.
