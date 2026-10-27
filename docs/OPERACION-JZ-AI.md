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
tools/jz-autonomy/bin/jz-install <worktree> HEAD          # instala la release del commit revisado
node ~/.local/share/jz-ai/current/tools/jz-autonomy/bin/jz-autonomy.js run \
  --root <worktree> --objective <ruta-relativa.json> --state-dir <nombre> [--engines claude,opencode]
node ~/.local/share/jz-ai/current/tools/jz-autonomy/bin/jz-autonomy.js resume --root <worktree> --state-dir <nombre>
```

Requisitos: worktree limpio, en la rama del objetivo, sin otro escritor ni otro motor con su directorio dentro.
Salida: JSON final en stdout; exit 0 `completed`, 1 `failed`, 2 `blocked`, 3 error interno.

Objetivo (`jz-autonomy-objective-v1`): `unit`, `objective`, `criteria`, `workspace`, `branch`,
`agent`, `workflow` (`standard` o `split-tdd`), `testPaths`, `allowedPaths`, `checks` (argv ejecutados en
`jz-run`), `maxCorrections` (0–2), `commit.message`, y opcionales `engines`, `push`, `timeoutMinutes`.
Ejemplos en `tools/jz-autonomy/objectives/`.

## Ciclo

1. `preflight`: `jz-state` REANUDABLE, rama correcta, árbol limpio.
2. Bloqueo de escritor del supervisor (`.jz-state/writer.lock`, motor `jz-autonomy`) durante toda la ejecución.
3. Worker de implementación. En `split-tdd` sólo puede tocar `testPaths` y debe dejar un check en rojo.
4. Inspección de rutas (fuera de `allowedPaths` = `blocked`) y checks.
5. Correcciones automáticas con los fallos estructurados: re-ejecuta primero los checks que fallaron y,
   en verde, una sola vez los restantes.
6. Commit por `jz-git` con `Jz-Op: <unit>:<runId>:commit`; push si `push: true`.
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

OpenCode y Claude Code se coordinan con commits publicados, no con archivos activos del otro. Cada entrega
publica: rama y SHA, cambios funcionales, pruebas y CI con resultados reales, riesgos bloqueantes y
disponibilidad para integración (`tools/jz-autonomy/src/handoff.js` genera el bloque). La integración común
la hace sólo el orquestador Claude Code, en ramas `integ/*`, tras comprobar ancestros, diff y pruebas.

## Límites conocidos

- Todo corre como root en este host: los permisos de archivo de la release no protegen frente a root; la
  protección real es la política jz (hook y plugin) y el sandbox de `jz-run`, que no montan la release.
- `main` no tiene protecciones, rulesets ni CI en GitHub: no se automatizan merges a `main`.
- QA y Security revisan al cierre de hitos; los hallazgos no bloqueantes van al backlog.
