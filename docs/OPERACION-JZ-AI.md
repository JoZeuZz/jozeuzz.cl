# Operación de JZ-AI V2

Guía breve para ejecutar objetivos con `jz-autonomy`. El diseño de detalle está en el código y en sus tests
(`tools/jz-autonomy/`, `tools/jz-gitops/`).

## Responsabilidades

| Pieza | Qué hace | Dónde vive | Quién la cambia |
|---|---|---|---|
| Supervisor (`jz-autonomy`) | Valida el objetivo, toma el bloqueo de escritor, lanza workers, re-ejecuta checks, corrige, confirma, publica, registra estado y checkpoint | Copia inmutable `~/.local/share/jz-ai/releases/<sha>` (instalada con `jz-install`) | Commit revisado + `jz-install` |
| Workers | Escriben código y tests dentro de `allowedPaths`; comandos sólo vía `.jz/bin/jz-run` | Claude Code (`claude -p --agent jz-implementer`) u OpenCode (`opencode run --agent jz-implementer`) | Nadie en ejecución: plano de control protegido |
| GitOps (`jz-git`) | `commit` de un manifiesto de rutas en la rama declarada (con `Jz-Op` idempotente) y `push` normal, sin force, verificando el SHA remoto | Misma release que el supervisor | Commit revisado + `jz-install` |
| Autorización de push | Remoto exacto y patrones de rama | `~/.config/jz-ai/gitops.json` | Sólo el humano (`admin-authorize`) |

Los workers no pueden ejecutar `jz-git`, `node` directo, `git add/commit/push` ni escribir fuera del
worktree o en el plano de control (`.claude/`, `.opencode/`, `.jz/`, `.jz-state/`, `AGENTS.md`, `CLAUDE.md`).
El supervisor corre en el host con los permisos de quien lo lanza; no lo lanza un worker.

## Ejecutar un objetivo

```sh
# Instala la release de un commit revisado. Se ejecuta desde el commit, nunca desde el árbol (lo escriben workers):
sha=$(git -C <worktree> rev-parse <ref-revisada>)
git -C <worktree> show "${sha}:tools/jz-autonomy/bin/jz-install" | bash -s -- <worktree> "$sha"
node ~/.local/share/jz-ai/current/tools/jz-autonomy/bin/jz-autonomy.js run \
  --root <worktree> --objective <ruta-relativa.json> --state-dir <nombre> [--engines claude,opencode]
node ~/.local/share/jz-ai/current/tools/jz-autonomy/bin/jz-autonomy.js resume --root <worktree> --state-dir <nombre>
```

Requisitos: worktree limpio, en la rama del objetivo, sin otro escritor ni otro motor con su directorio dentro.
El objetivo debe estar versionado y sin cambios respecto de HEAD, `workspace` es siempre `.` y `allowedPaths`
no puede cubrir `tools/jz-autonomy/bin`, `tools/jz-autonomy/objectives` ni `tools/jz-gitops`.
Salida: JSON final en stdout; exit 0 `completed`, 1 `failed`, 2 `blocked`, 3 error interno.

Objetivo (`jz-autonomy-objective-v1`): `unit`, `objective`, `criteria`, `workspace`, `branch`,
`agent`, `workflow` (`standard` o `split-tdd`), `testPaths`, `allowedPaths`, `checks` (argv ejecutados en
`jz-run`), `maxCorrections` (0–2), `commit.message`, y opcionales `engines`, `push`, `timeoutMinutes`.
Ejemplos en `tools/jz-autonomy/objectives/`.

## Ciclo

1. `preflight`: `jz-state` REANUDABLE, rama correcta, árbol limpio.
2. Bloqueo de escritor del supervisor (`.jz-state/writer.lock`, motor `jz-autonomy`) durante toda la ejecución.
3. Worker de implementación. En `split-tdd` sólo puede tocar `testPaths` y debe dejar un check en rojo.
4. Inspección de rutas: fuera de `allowedPaths`, o con un nombre del plano de control o de secreto a cualquier
   profundidad, es `blocked`. Se registra la huella del árbol (`jz-run --fingerprint`) y se ejecutan los checks.
5. Correcciones automáticas con los fallos estructurados: re-ejecuta primero los checks que fallaron y,
   en verde, una sola vez los restantes.
6. Si la huella cambió desde la inspección, `blocked`. Commit por `jz-git` con `Jz-Op: <unit>:<runId>:commit`
   (rechaza secretos, plano de control, enlaces y gitlinks dentro de un directorio del manifiesto); push si
   `push: true`, sólo a la URL de push autorizada y sin `mirror`.
7. Libera el bloqueo y registra `jz-checkpoint`.

## Estado y recuperación

`.jz-state/autonomy/<nombre>/state.json` (estado canónico con el journal `steps`) y `events.jsonl`, más los
logs de cada worker. `resume` repite el journal sin volver a ejecutar los pasos registrados: agentes, checks,
commit y push ya hechos no se repiten. No se memorizan el preflight bloqueado, el commit o push fallido ni
la falta de cuota, así que se reintentan al reanudar. Si el proceso muere, el bloqueo queda huérfano y se
recupera en la siguiente adquisición.

## Motores y failover

`engines` fija el orden. Un motor se descarta para el resto de la ejecución si informa cuota o límite de uso,
si no está instalado, o (OpenCode) si el perfil del agente no es primario: con un perfil `mode: subagent`,
OpenCode ejecuta el agente por defecto sin política jz, así que el supervisor se niega a lanzarlo y mata el
proceso si aparece el aviso `Falling back to default agent`. Sin motores disponibles el resultado es
`blocked` con checkpoint `cuota`.

## Contrato de entrega entre motores

Fuera de `jz-coord`, OpenCode y Claude Code se coordinan con commits publicados, no con archivos activos del
otro. Cada entrega publica: rama y SHA, cambios funcionales, pruebas y CI con resultados reales, riesgos
bloqueantes y disponibilidad para integración (`tools/jz-autonomy/src/handoff.js` genera el bloque). No hay
roles fijos por motor: integra, en ramas `integ/*`, el orquestador que lidera esa meta, tras comprobar
ancestros, diff y pruebas, con un único escritor por worktree.

## Orquestadores pares (`jz-coord`)

`jz-coord` coordina a Claude Code y OpenCode como orquestadores completos de una misma meta. Cualquiera de
los dos puede liderarla de principio a fin, delegar tareas en el otro o heredar el liderazgo. El controlador
no razona: guarda el estado compartido, arbitra quién escribe, verifica, confirma y publica. Cada motor decide
dentro de su turno con su perfil `jz-orchestrator` y sus propios subagentes `jz-*`.

```sh
node ~/.local/share/jz-ai/current/tools/jz-autonomy/bin/jz-coord.js lead --root <worktree> \
  --goal <meta.json versionada> --state-dir <nombre> [--engines claude,opencode] [--simulate quota:claude@2]
node …/jz-coord.js resume --root <worktree> --state-dir <nombre> [--cooldown-minutes 0]
node …/jz-coord.js status --root <worktree> --state-dir <nombre>
```

Meta (`jz-coord-goal-v1`): `id`, `objective`, `criteria`, `branch`, `allowedPaths`, `checks`,
`commit.message` y opcionales `engines` (orden de preferencia), `lead`, `maxTurns` (≤ 30),
`maxCorrections` (≤ 3), `push` y `timeoutMinutes`. Se valida con las mismas reglas que un objetivo de
`jz-autonomy`: rama, rutas, plano de control, secretos, rutas del supervisor y checks.

Contrato de turno (`jz-coord-v1`):

- Entrada: un prompt JSON con la meta, el rol (`lead` o `delegate`), los pares y su estado, el buzón
  (resultados, mensajes, transferencias, fallos de checks), las tareas y el último checkpoint.
- Salida: la respuesta final del motor termina con una línea `JZ-COORD {"actions":[...]}`. Un líder
  puede responder `progress`, `delegate` (tarea `write` o `read` con `allowedPaths` dentro de la meta),
  `message`, `yield` (cede el liderazgo), `complete` (pide verificar y confirmar) o `blocked`. Un
  delegado responde sólo `result` (`done`, `failed` o `blocked`, con `summary`, `paths` y `evidence`).
  Una respuesta inválida se rechaza una vez con el motivo. Si la siguiente también lo es, el motor
  queda fuera de servicio.

Estado y seguridad:

- `.jz-state/coord/<nombre>/state.json` y `events.jsonl` contienen la meta, la salud de cada motor, el
  líder y su historial, el lease, el turno en vuelo, las tareas, el buzón, los checkpoints y el commit.
  También quedan los logs de cada turno y los patches de cada checkpoint. Las escrituras van en serie y
  son duraderas (temporal con `fsync`, `rename` atómico, `fsync` del directorio). `state.json` es la fuente
  de verdad: al reanudar, `events.jsonl` se repara a partir de él si le faltan líneas o quedó una a medias.
- Un solo controlador por state-dir: `controller.lock` se crea con `link(2)` y guarda pid, `starttime` y
  `boot_id`. Otro `lead` o `resume` sobre el mismo state-dir se rechaza sin escribir nada. Un bloqueo
  obsoleto sólo se recupera si su titular está demostradamente muerto (otro `starttime` u otro arranque);
  se aparta como `controller.lock.stale-<token>` y queda como evidencia. Un bloqueo ilegible o un
  `controller.lock.recover` huérfano no se tocan: los resuelve una persona. El estado se relee del disco
  con el bloqueo tomado.
- Lease de escritor: cada turno tiene un titular, un token, un pid con su identidad (`starttime` y
  `boot_id`) y un plazo (timeout más 60 s). El token va en el entorno del motor (`JZ_COORD_LEASE`) antes
  de lanzarlo, así que identifica al titular y a sus descendientes aunque el pid no llegue a registrarse.
  Nadie escribe ni hereda mientras el titular siga vivo y en plazo, y cerrar la meta no borra el lease de
  un titular vivo. Un titular vencido sólo se mata si su identidad queda demostrada (token o `starttime`);
  un pid reutilizado por otro proceso nunca se toca, y si no se puede demostrar la meta queda en `blocked`.
  Entre turnos rige además el bloqueo de escritor de `.jz/policy`: los subagentes lo toman al escribir. El
  controlador lo toma para verificar y confirmar y comprueba, antes de transferir, que no lo retiene un
  proceso vivo.
- Checkpoint verificable tras cada turno: un árbol git de todo el worktree, cambios sin confirmar
  incluidos, creado en un índice temporal sin tocar el índice, las ramas ni el árbol. Se guardan también
  HEAD, las rutas cambiadas y un patch. Si un checkpoint no se puede crear, la meta queda en `blocked`
  antes de otro turno. Antes de entregar la meta a otro motor y en cada `resume`, el árbol actual tiene que
  coincidir con el del último checkpoint. Si sólo hubo pérdida (cada ruta distinta estaba cambiada en el
  checkpoint y hoy vuelve a ser la de HEAD), esas rutas se restauran y se comprueba de nuevo el árbol. Si
  el árbol cambió de cualquier otra forma, o HEAD se movió, la meta queda en `blocked` sin tocar nada.
- Fallos de un turno: `quota` (30 min de espera), `provider` (5 min), `timeout`, `session-lost`,
  `abnormal` y `protocol`. En todos los casos el motor queda fuera y la meta pasa al otro motor disponible
  con un mensaje `transfer`. Si no queda ninguno, la meta queda en `blocked` con checkpoint `cuota`, y
  `resume` (con `--cooldown-minutes 0` si la cuota ya se repuso) devuelve el liderazgo a un motor que vuelva
  a estar disponible, prefiriendo uno distinto del último que falló.
- `complete`: con el bloqueo de escritor tomado, se exige que las rutas estén dentro de la meta, se ejecutan
  los checks en `jz-run` y se comprueba que la huella no cambió. Después se confirma con `jz-git` y
  `Jz-Op: <meta>:<runId>:commit`, idéntico para todos los líderes y reanudaciones de una ejecución, así que
  no hay commits duplicados. Antes del commit se registra `committing`: si el controlador cae durante el
  commit, `resume` repite la verificación y el commit con el mismo `Jz-Op` (que `jz-git` reutiliza) sin
  otro turno de motor. Si cae durante el push, `resume` sólo repite el push y verifica el SHA remoto.
  Tras el commit no puede quedar ningún cambio sin confirmar. Por último se publica si `push: true`. Si
  algún check falla, los fallos vuelven estructurados al líder.
- Si el controlador cae a mitad de un turno, `resume` no repite el turno a ciegas: espera o mata al titular
  según su lease, marca el turno como `interrupted`, toma un checkpoint y avisa al líder.
  `jz-coord status` muestra el lease conservado y un commit pendiente.
- Instalación, comprobación y rollback de la release: [`operacion/release-jz-coord.md`](operacion/release-jz-coord.md).
- Fallos simulados (`--simulate kind:engine@turn[+Ns]`): sin `+Ns`, el turno no llega a lanzarse; con
  `+Ns`, el motor real se lanza y se mata a los N segundos. Quedan marcados como `simulated` en el estado y
  los eventos.

Demo: `node tools/jz-autonomy/demo/interop-demo.mjs --source <worktree> --mode synthetic|real`. Crea
repositorios sintéticos en `/var/tmp/jz-coord-demo/` con el plano de control confirmado de `--source` y
ejecuta los escenarios con el CLI real. Después verifica con git el número de commits, el `Jz-Op`, los tests
sobre HEAD, el liderazgo, la delegación y los checkpoints. Evidencia y límites:
[`docs/operacion/interop-jz-coord.md`](operacion/interop-jz-coord.md).

## Límites conocidos

- Todo corre como root en este host: los permisos de archivo de la release no protegen frente a root; la
  protección real es la política jz (hook y plugin) y el sandbox de `jz-run`, que no montan la release.
  Los motores corren en su propio grupo de procesos, que se mata al terminar cada agente.
- El journal (`state.json`) no está firmado: su integridad depende de que la política deniega `.jz-state` a
  los workers. Pendiente (backlog): guardarlo fuera del worktree o firmarlo.
- `admin-authorize` también se ejecuta desde la release instalada, no desde el árbol.
- `main` no tiene protecciones, rulesets ni CI en GitHub: no se automatizan merges a `main`.
- QA y Security revisan al cierre de hitos; los hallazgos no bloqueantes van al backlog.
