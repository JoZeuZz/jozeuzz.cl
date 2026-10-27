# jz-autonomy

Supervisor de un motor para objetivos JSON `jz-autonomy-objective-v1`.

## Interfaz

```sh
node tools/jz-autonomy/bin/jz-autonomy.js run --objective <archivo-json-relativo> --state-dir <ruta-relativa> [--root <ruta-absoluta>]
```

El JSON declara unidad, objetivo, criterios, workspace, rama, agente, workflow, rutas permitidas, checks, correcciones y mensaje de commit. Estados finales: `completed`, `failed` o `blocked`. El stdout final es JSON compacto; logs y estado quedan bajo el state-dir supervisor.

## Operación

Comando host exacto:

```sh
node tools/jz-autonomy/bin/jz-autonomy.js run --objective tools/jz-autonomy/objectives/i2-real-task.json --state-dir i2-demo --root /ruta/absoluta/al/worktree
```

Antes de usarlo, worktree debe estar limpio y debe existir `.jz/bin/jz-git` para completar commit. Conservar evidencia de `state.json`, `events.jsonl`, logs de checks y checkpoint.

Límites: un motor, sin failover. Agentes actuales no pueden lanzar supervisor host; requieren integración operativa humana autorizada.
