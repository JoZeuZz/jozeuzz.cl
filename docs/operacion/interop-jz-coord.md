# Interoperabilidad entre orquestadores: `jz-coord`, evidencia y límites

Fecha: 2026-10-27. Rama: `feat/jz-interop`, creada desde `integ/mvp-v0.1@e98a80a`. Diseño y uso:
[`docs/OPERACION-JZ-AI.md`](../OPERACION-JZ-AI.md), sección «Orquestadores pares».

## Qué se añadió y qué se reutilizó

| Pieza | Nuevo o reutilizado |
|---|---|
| Contrato de meta `jz-coord-goal-v1` | Nuevo. Valida a través de `validateObjective` de `jz-autonomy`, con las mismas reglas de rama, rutas, plano de control, secretos y checks |
| Protocolo de turno `jz-coord-v1`: prompt JSON y respuesta `JZ-COORD {"actions":[...]}` | Nuevo (`src/coord.js`) |
| Estado compartido: líder, salud de cada motor, lease, turno en vuelo, tareas, buzón, checkpoints, commit | Nuevo. Persistencia atómica y `events.jsonl`, con el mismo esquema que `runner.js` |
| Lanzar Claude u OpenCode como orquestador principal (`jz-orchestrator`) | Nuevo adaptador (`src/orchestrators.js`). Reutiliza `runEngineProcess` (grupo de procesos, timeout, logs), los entornos mínimos y la comprobación de modo primario de OpenCode |
| Detección de cuota | Reutiliza `quotaExhausted`. Se añadió la clasificación `provider`, `timeout`, `session-lost`, `abnormal` y `protocol` |
| Checks, inspección de rutas, huella, bloqueo de escritor, commit y push | Reutilizados de `createOpenCodeAdapters` (`jz-run`, `tree.mjs`, `.jz/policy`, `jz-git` con `Jz-Op`) |
| Checkpoint verificable | Nuevo: árbol git en un índice temporal, más el patch. También registra `jz-checkpoint` |
| CLI `jz-coord lead`, `resume` y `status` | Nuevo (`src/coord-cli.js`). Reutiliza la carga de objetivos versionados y la creación segura de state-dir, extraídas de `cli.js` |

No se tocaron `.jz/`, `.claude/`, `.opencode/`, `jz-git`, POC-3, Wealthfolio ni
`/home/proyectos/jozeuzz-producto-base`.

## Pruebas automáticas (sintéticas)

`node --test tools/jz-autonomy/test/*.test.js tools/jz-gitops/test/*.mjs`: 145 tests, 0 fallos (Node
v20.19.2). `test/coord.test.js` añade 21 tests con motores guionizados en memoria. Cubren:

- ciclo completo liderado por cada motor;
- delegación en los dos sentidos, con el resultado estructurado en el buzón;
- cuota a mitad de meta, con transferencia y un solo commit;
- vuelta del liderazgo tras `resume`, y `yield`;
- lease válido que bloquea y lease vencido cuyo titular se mata y se verifica;
- caída del controlador con el turno en vuelo, que termina en `interrupted` sin repetir;
- árbol alterado que bloquea, y restauración desde el checkpoint;
- correcciones con los fallos estructurados de los checks, y reanudación ya confirmada sin un segundo
  commit;
- rutas fuera de la meta, tanto del líder como del delegado;
- respuesta sin `JZ-COORD`;
- validación de acciones, clasificación de fallos y `kill` restringido a procesos `jz-orchestrator`.

## Demo ejecutable

```sh
node tools/jz-autonomy/demo/interop-demo.mjs --source <worktree> --mode synthetic   # ~1 min, sin coste
node tools/jz-autonomy/demo/interop-demo.mjs --source <worktree> --mode real --scenarios claude-lead,delegate-c2o
```

Cada escenario crea un repositorio git desechable en `/var/tmp/jz-coord-demo/<modo>-<fecha>/<escenario>/repo`.
Lleva el plano de control confirmado de `--source` (`git archive`), un test que falla y una meta versionada.
Lanza el CLI real (`bin/jz-coord.js`) y luego verifica con git, no con lo que dice el controlador:

- un solo commit nuevo con un `Jz-Op`, igual al HEAD;
- sólo `src/` cambiado;
- los tests pasan sobre HEAD extraído aparte;
- el árbol queda limpio;
- el liderazgo es el esperado;
- la delegación termina con su resultado entregado;
- el trabajo sin confirmar del líder anterior llega al commit;
- un `resume` posterior no hace nada.

| Escenario | Qué demuestra |
|---|---|
| `claude-lead` / `opencode-lead` | Cada motor, solo, planifica, delega en sus subagentes, implementa y pide `complete`. El controlador verifica, confirma y registra el checkpoint |
| `delegate-c2o` / `delegate-o2c` | El líder delega `wordCount` en el otro motor y recibe en su buzón `result` con `status`, `summary`, `paths` y `evidence` |
| `failover` | Cuota simulada del líder (Claude) en el turno 2, con `slugify` hecho y sin confirmar. OpenCode lo hereda, lo verifica, termina y queda un solo commit |
| `failover-midturn` | Como `failover`, pero Claude se lanza y se mata a mitad del turno (`+45s` en real, `+1s` en sintético) con el bloqueo de escritor tomado |
| `reverse` | Claude cae y lidera OpenCode. OpenCode también cae (en real, muerto a los 60 s), así que queda `blocked` sin motores. `resume --cooldown-minutes 0` devuelve el liderazgo a Claude, que termina |

## Resultados

### Motores sintéticos (`demo/fake-engine.mjs`, sin modelo)

`synthetic-20261027T170021Z` (código 4be5b71): los 7 escenarios OK, 78 comprobaciones
([informe](evidencia/jz-coord/synthetic-20261027T170021Z.md)). El motor sintético ejercita los procesos
reales, los grupos de procesos, los logs, el bloqueo de escritor, `jz-run`, `jz-git` y los snapshots git.
**No demuestra el razonamiento de un motor real.**

### Motores reales (Claude Code 2.1.311, OpenCode 1.17.18, perfil `jz-orchestrator`)

Todas las ejecuciones son reales salvo la cuota, que es simulada y queda marcada así en el estado. No se
agotó ninguna cuota de proveedor de verdad.

| Escenario | Ejecución (código) | Resultado | Turnos | Coste Claude |
|---|---|---|---|---|
| claude-lead | real-20261027T164630Z (3d14561) | OK, 9/9 | claude: progress, complete | ≈ $0,8 |
| opencode-lead | real-20261027T164630Z (3d14561) | OK, 9/9 | opencode: progress, complete | — |
| delegate-c2o | real-20261027T163751Z (75daf05) | OK, 11/11 | claude delegate · opencode result · claude complete | $0,55 |
| delegate-o2c | real-20261027T163751Z (75daf05) | OK, 11/11 | opencode delegate · claude result · opencode complete | $0,32 |
| failover | real-20261027T161727Z (2a26e4d) | OK, 12/12 | claude progress · claude cuota (sim.) · opencode timeout · opencode complete | $0,36 |
| failover-midturn | real-20261027T164630Z (3d14561) | OK, 14/14 | claude progress · claude muerto a los 45 s (sim.) · opencode complete | ≈ $0,4 |
| reverse | real-20261027T164109Z (5091284) | OK, 12/12 | claude · claude cuota · opencode muerto a los 60 s · `blocked` · `resume` · claude · claude complete | $0,90 |

OpenCode no informa coste en `step_finish`. Informes completos en `evidencia/jz-coord/`.

Hechos observados en las ejecuciones reales:

- En `delegate-o2c`, Claude delegado aplicó TDD (rojo rc=1, verde rc=0) y devolvió la evidencia con las
  rutas de log de `jz-run`. Justificó por qué omitía QA y Security.
- En `failover`, OpenCode recibió la transferencia, conservó `src/slug.js` de Claude (mismo blob
  `fe02d61c40ac` en el checkpoint y en HEAD) y escribió `wordCount`.
- En `failover-midturn`, el subagente de Claude ya había escrito `src/words.js` cuando murió. El checkpoint
  posterior al turno lo capturó. OpenCode lo verificó y lo confirmó sin cambios (blob `a2e61d275e34`). El
  bloqueo de escritor huérfano se recuperó sin intervención.
- En `reverse` el controlador terminó en `blocked` (rc 2, checkpoint `cuota`) y otro proceso `resume`
  continuó desde el estado en disco: el estado sobrevive al cierre del controlador.

### Defectos encontrados en las ejecuciones reales y resueltos

1. Las primeras ejecuciones de OpenCode perdían el turno por timeout (15 min). Duraban 11–12 min en
   `jz-security` (Copilot Sonnet 4.6) y 1–1,5 min en `jz-qa`, todo para una función de una línea. El trabajo
   estaba hecho a los 80–90 s. El controlador lo trató bien: el delegado devolvió `failed`, el líder terminó
   solo y el reintento completó. Pero se perdía tiempo. Corrección `75daf05`: el prompt lleva
   `budgetMinutes` y pide revisiones proporcionales al riesgo; el resultado de un delegado fallido lista los
   cambios que dejó; un líder reintentado recibe un aviso. Después, el delegado OpenCode tardó 2 min 16 s
   y `opencode-lead`, 4 min en total.
2. Revisión propia (`910ddc5`). Las rutas sólo se comprobaban después de un delegado o de `complete`; ahora
   se comprueban tras cada turno. `kill` usaba un pid leído del estado sin comprobarlo; ahora sólo mata si
   `/proc/<pid>/cmdline` sigue siendo un proceso `--agent jz-orchestrator`.
3. Las expectativas de la demo se ajustaron (`5091284`, `3d14561`). Un motor real puede terminar dos pasos
   en un turno o terminar un archivo antes de morir. La lógica del controlador no cambió.

## Qué funciona realmente

- Cualquiera de los dos motores reales puede llevar una meta de principio a fin con sus propios subagentes,
  sin intervención humana: planificar, implementar, verificar, confirmar y registrar el checkpoint.
- Delegación real en los dos sentidos, con resultados estructurados que el controlador entrega al líder en
  el turno siguiente. El usuario no copia nada entre motores.
- Ante indisponibilidad (cuota simulada, motor muerto a mitad de turno, timeout real), el controlador:
  1. conserva el estado;
  2. comprueba que el grupo de procesos del escritor terminó y que no queda un bloqueo vivo;
  3. verifica el árbol frente al checkpoint;
  4. transfiere a otro motor, que termina sin perder cambios y sin commits duplicados.
- El liderazgo vuelve en sentido inverso al reanudar, también entre procesos distintos del controlador.

## Incremento 2: concurrencia y recuperación (2026-10-28)

Código `92b9491` y `40edbff` sobre `6ecce57`. Evidencia: [`evidencia/jz-coord/hardening-20261028.md`](evidencia/jz-coord/hardening-20261028.md).
Contrato actualizado en [`docs/OPERACION-JZ-AI.md`](../OPERACION-JZ-AI.md); release en
[`release-jz-coord.md`](release-jz-coord.md).

Cada defecto se reprodujo primero con una prueba que fallaba sobre `6ecce57` y pasa ahora.

| # | Defecto en `6ecce57` | Corrección |
|---|---|---|
| 1 | `close()` borraba el lease y el turno en vuelo aunque el motor siguiera vivo: un `resume` bloqueado por el lease dejaba vía libre al siguiente | `close()` sólo los olvida si el titular terminó; `status` muestra el lease conservado |
| 2 | Dos `lead`/`resume` podían operar a la vez sobre el mismo state-dir, y el segundo partía de una copia vieja del estado | `controller.lock` exclusivo con identidad; recuperación sólo de un titular demostradamente muerto; el estado se relee con el bloqueo tomado |
| 3 | Escrituras de `state.json` concurrentes (la del pid tras el spawn no se esperaba): una escritura lenta podía pisar un estado posterior. Sin `fsync`. `events.jsonl` podía quedar sin líneas o con una a medias | Escrituras en serie y duraderas; reparación de `events.jsonl` desde `state.json` al reanudar |
| 4 | `kill` sólo comprobaba los argumentos (`--agent jz-orchestrator`): podía matar otro orquestador que hubiera heredado el pid. Un lease sin pid registrado (caída justo tras el spawn) se daba por terminado | Identidad `starttime` + `boot_id` y token `JZ_COORD_LEASE` en el entorno del motor; sólo se mata lo demostrado |
| 5 | Un checkpoint fallido se ignoraba y la meta seguía | Fail-closed: `blocked` antes de otro turno |
| 6 | Al reanudar con el mismo líder no se verificaba el árbol: una pérdida de cambios tras un checkpoint válido terminaba en `commit failed` o en un commit incompleto | Cada `resume` verifica el árbol; restauración ruta a ruta si sólo hubo pérdida; cualquier divergencia bloquea sin tocar nada |
| 7 | Restauración sólo con pérdida total; una pérdida parcial bloqueaba | Restauración parcial con la misma garantía |
| 8 | Caída durante el commit o el push: el `resume` gastaba otro turno de motor y podía confirmar un árbol distinto | Marca `committing`: `resume` repite verificación y commit con el mismo `Jz-Op`; tras el push sólo repite el push |
| 9 | `reused` de `jz-git` se perdía en el adaptador | Se conserva |

## Limitaciones y trabajo pendiente

- **Cuota real no probada.** Sólo se probó cuota simulada. La detección de cuota real reutiliza los
  patrones de JZ-AI V2, ya validados con Claude en `handoff-1`. Con OpenCode, el plugin `jz-guard` aborta la
  sesión por cuota: eso se clasificaría como `session-lost` o `abnormal`, que también transfiere, pero el
  motivo registrado sería menos preciso.
- **Coordinación por turnos, no en tiempo real.** Los orquestadores se comunican sólo entre turnos, a través
  del controlador; no hay mensajería durante un turno. El controlador decide cuándo actúa cada motor.
- **Sin paralelismo entre motores.** Un worktree tiene un escritor a la vez y los turnos son secuenciales.
  Las tareas `read` delegadas tampoco van en paralelo todavía. El paralelismo seguro con worktrees separados
  queda pendiente.
- **Un orquestador interactivo no puede delegar fuera del controlador.** Una sesión interactiva (p. ej. esta
  de Claude Code) no puede delegar en OpenCode sin pasar por `jz-coord lead`. Falta un `jz-coord delegate`
  puntual.
- **Mutex de recuperación huérfano.** Si un controlador muere justo mientras recupera un
  `controller.lock` obsoleto (microsegundos), queda `controller.lock.recover` y los siguientes controladores
  se rechazan hasta que una persona lo retire. Es intencionado: no se elimina nada a ciegas.
- **Grupo huérfano sin token.** Si el líder del turno murió y queda su grupo de procesos sin ningún proceso
  con el token (p. ej. hijos con el entorno reiniciado), la identidad no se puede demostrar: la meta queda en
  `blocked` en lugar de matar ese grupo.
- **HEAD movido durante un commit interrumpido.** Si el controlador cae durante el commit y alguien confirma
  otra cosa en la rama, el `resume` vuelve a verificar y confirma encima (sin sobrescribir nada).
- **Estado sin firmar.** `state.json` no está firmado, igual que el journal de `jz-autonomy` (backlog
  existente). Lo protege la política jz, que niega `.jz-state` a los agentes.
- **`jz-security` de OpenCode sigue siendo lento** (Copilot Sonnet 4.6, 11–12 min por revisión). El prompt
  lo mitiga; la causa del perfil o del proveedor queda en el backlog.
- **Aún no hay release instalada.** `jz-coord` no está instalado como release ni se ha usado sobre el
  producto: la siguiente meta real del MVP debería ser la primera.
