# Evidencia: hardening de concurrencia y recuperación de `jz-coord`

Fechas en UTC (2026-10-28). Rama `feat/jz-interop`. Base `6ecce57`. Código `92b9491` (corrección) y
`40edbff` (`reused` de `jz-git` y `status`). Node local v20.19.2. El runtime de CI (Node 24.22.0) se
comprueba en la CI de GitHub Actions; ver «CI» más abajo.

## RED: las pruebas nuevas sobre el código de `6ecce57`

Las pruebas nuevas se copiaron sobre un `git archive 6ecce57 tools`, junto con `src/proc.js`, que es un
módulo nuevo sin lógica previa que comparar. Resultado: **68 tests, 42 pass, 26 fail**. Fallan:

| Prueba | Fallo observado en `6ecce57` |
|---|---|
| coord-real: controlador muerto con el motor vivo | el `resume` bloqueado borra el lease (`the lease survives the blocked resume`) |
| coord-real: dos `resume` simultáneos | el segundo no se rechaza |
| coord-real: pérdida tras un checkpoint válido (todo y parcial) | `{"status":"blocked","reason":"commit failed"}`: el árbol perdido no se restaura |
| coord-real: árbol divergente | no se bloquea |
| coord-real: checkpoint imposible de escribir | la meta sigue |
| coord-real: caída tras el commit | turno de motor extra tras la caída |
| coord-real: caída tras el push | turno de motor extra |
| coord: lease válido y luego vencido | el segundo `resume` ya no ve el lease |
| coord: `resume` bloqueado conserva lease y turno en vuelo | `close() must not drop the lease of a live holder` |
| coord: lease sin pid con un proceso que lleva el token | el motor no recibe token |
| coord: segundo controlador sobre el mismo state-dir | no se rechaza |
| coord: bloqueo obsoleto recuperado sólo con titular muerto | no hay bloqueo |
| coord: bloqueo ilegible nunca se borra | no hay bloqueo |
| coord: reparación de `events.jsonl` | `JSON.parse` falla con la línea a medias |
| coord: escrituras en serie | `options.fs` no existe: la escritura lenta no se puede ni inyectar |
| coord: checkpoint fallido tras un turno / al inicio | la meta sigue |
| coord: pérdida tras checkpoint con el mismo líder / pérdida parcial | no hay evento `restored` |
| coord: árbol divergente al reanudar | no se bloquea |
| coord: caída durante el commit (antes y después) | turno de motor extra |
| coord: caída durante el push | turno de motor extra |
| opencode: `reused` de un `Jz-Op` ya confirmado | se pierde |
| coord-cli: `status` con lease conservado y commit pendiente | no se muestra |
| proc: `kill` ante un pid reutilizado | mata el proceso señuelo con `--agent jz-orchestrator` |
| proc: titular con token y pid desconocido | se da por terminado |

Los 42 que pasan son las pruebas anteriores y las de `src/proc.js` contra sí mismo (identidad, `holders`,
`kill` de un titular demostrado), que también son verdes en la base porque el `kill` antiguo mata todo lo
que tenga `--agent jz-orchestrator` en sus argumentos.

## GREEN

```sh
node --test tools/jz-autonomy/test/*.test.js tools/jz-gitops/test/*.test.mjs   # 174 tests, 174 pass (antes 145)
node --test .jz/tests/policy.test.mjs .jz/tests/tree.test.mjs .jz/tests/recovery.test.mjs \
  .jz/tests/hook.test.mjs .jz/tests/opencode.test.mjs                          # 68 tests, 68 pass
node tools/jz-autonomy/demo/interop-demo.mjs --source <worktree> --mode synthetic   # 7/7 OK, 78/78 comprobaciones
```

La demo sintética se ejecutó con el código de `40edbff`
([informe](synthetic-20261028T004944Z.md)): Claude lidera solo, OpenCode lidera solo, delegación en los
dos sentidos, failover, failover a mitad de turno y vuelta del liderazgo tras `resume`. En todos: un solo
commit con un `Jz-Op`, sólo `src/` cambiado, tests verdes sobre HEAD extraído aparte, árbol limpio y un
`resume` posterior sin efecto.

## Recuperación real (`test/coord-real.test.js`)

Estas pruebas no simulan en memoria. El controlador corre en su propio proceso (`test/fixtures/coord-child.mjs`)
con los adaptadores reales de procesos, snapshot y restauración. El motor sintético (`test/fixtures/coord-engine.mjs`)
es un proceso real en su propio grupo. Se usa git real y `jz-git` real (commit con `Jz-Op` y push a un remoto
local con una política GitOps de prueba). Todo se verifica con git:

1. **Controlador muerto con el motor vivo.** `SIGKILL` al controlador durante el turno 2. El motor sigue vivo.
   `resume` termina `blocked` (`lease held by claude (pid N)`), no mata al motor y el lease (pid, identidad,
   token) sigue en el estado. Cuando el motor termina, `resume` marca el turno 2 `interrupted`, continúa
   y confirma una sola vez.
2. **Dos `resume` simultáneos.** El segundo se rechaza con `controller pid N active` mientras el primero
   trabaja. Un solo commit; el bloqueo se libera al final.
3. **Pérdida real tras un checkpoint válido.** Cambios de los tres tipos (modificado, nuevo en un directorio
   nuevo, borrado). Se pierden con `git checkout -- . && git clean -fd src` (todo) o
   `git checkout -- src/a.txt` (parcial). `resume` registra `restored` y el árbol `src` del commit es
   exactamente el del checkpoint (`git rev-parse HEAD:src` = `<checkpoint>:src`).
4. **Árbol divergente.** Otra persona edita `src/a.txt` y borra un archivo nuevo. `resume` termina `blocked`
   (`worktree changed since checkpoint N: src/a.txt, …`), no hay commit y `git status` queda idéntico.
5. **Fallo al crear un checkpoint.** `checkpoints/` sustituido por un archivo. Tras el turno 3: `blocked`
   (`checkpoint failed after turn 3`), sin más turnos ni commit, y el trabajo del turno sigue en el árbol.
6. **Caída justo después del commit.** El commit existe pero no está registrado. `resume` no lanza otro turno,
   `jz-git` reutiliza el `Jz-Op` (`reused: true`) y queda un solo commit.
7. **Caída justo después del push.** El remoto ya tiene el SHA. `resume` sólo repite el push, que `jz-git`
   reconoce, y verifica el SHA remoto. Un commit, sin turnos extra.

## Motores reales

El cambio afecta a cómo se lanzan y se dan por terminados los motores reales: el token va en su entorno, la
identidad se lee al lanzarlos y `terminated` busca descendientes con el token. Por eso se repitieron, con
el código de `40edbff`, los dos escenarios de líder único, no los siete
([informe](real-20261028T005110Z.md)). Claude Code 2.1.312 y OpenCode 1.17.18, perfil `jz-orchestrator`.

| Escenario | Resultado | Turnos | Duración | Coste Claude |
|---|---|---|---|---|
| claude-lead | OK, 9/9 | progress, complete; los dos `terminated: true` | 115 s | $0,75 |
| opencode-lead | OK, 9/9 | progress, complete; los dos `terminated: true` | 269 s | — |

En los dos, el lease del turno registró el pid, el `starttime` y el `boot_id` del motor real. Ningún
descendiente con el token sobrevivió al turno, no quedó `controller.lock` y el `resume` posterior no hizo
nada. La delegación, el failover y la reanudación con motores reales no cambiaron de lógica en este
incremento: la cubren las pruebas sintéticas y la demo de siete escenarios.

## Instalación en staging

Base aislada (`JZ_AI_HOME` en el scratchpad de la sesión); `~/.local/share/jz-ai/current` siguió en
`releases/4602cdf8c9e4b805ea14eca3d323f45509740c61` antes y después.

- `jz-install` de `c4ddb0e` (mismo código que el SHA final; sólo cambian documentos): `REVISION`
  correcta. `node --test` sobre la copia instalada, de sólo lectura: 174 tests, 174 pass.
  `jz-coord.js --help` rc 0. `jz-git.mjs` sin argumentos: JSON de uso y rc 2.
- Rollback: se instaló también `4602cdf` en la misma base y se conmutó `current` con
  `ln -s … current.new && mv -T current.new current`. `REVISION` pasó a `4602cdf…` y `jz-git` siguió
  respondiendo con rc 2. `jz-coord.js` no existe en `4602cdf`: el rollback lo retira (documentado en
  [`release-jz-coord.md`](../../release-jz-coord.md)).

## CI

`workflow_dispatch` de `ci` sobre `feat/jz-interop` en `c4ddb0e`:
[run 40611838512](https://github.com/JoZeuZz/jozeuzz.cl/actions/runs/40611838512), `success`.

- Plano de control (`actions/setup-node`, `node: v24.22.0`): `jz-autonomy` y `jz-gitops` 174 tests,
  174 pass, incluidas las siete pruebas de recuperación real; `.jz` 68 tests, 68 pass.
- Producto (imagen Node fijada por digest): lint, tipos, `test:foundation` 4/4, `test:unit`, contrato 32/32
  e integración con PostgreSQL 18.6: todo en verde.
