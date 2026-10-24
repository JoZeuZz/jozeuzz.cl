# JZ-I1 — Contención del plano de control

Estado: **implementado en `fix/jz-i1-contencion`, pendiente de revisión independiente (OpenCode) y aceptación humana.** No es PASS hasta esa revisión.
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
3. **El plugin de OpenCode no tiene equivalente a `onFailure`.** Su import sigue siendo estático. No se verificó qué hace OpenCode 1.17.18 si el plugin no carga; como mínimo quedan las reglas `permission` nativas, que ahora también deniegan `git add|commit|rm|mv|restore`. El plugin no se modificó en I1.
4. **Git de lectura en el host.** Los agentes pueden ejecutar `git status` y `git diff`, que aplican los filtros de la configuración de Git. Hoy no hay ninguno configurado (comprobado con `git config --show-origin --get-regexp`), y la configuración es plano de control.
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
