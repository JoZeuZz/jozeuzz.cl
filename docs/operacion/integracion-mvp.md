# Integración del MVP y del plano de control JZ-AI

Estado al 2026-10-27. Responsable de integración, GitOps y CI: Claude Code. Implementación del MVP: OpenCode, en `feat/mvp-v0.1`.

## Ramas

| Rama | Base | Papel |
|---|---|---|
| `feat/mvp-v0.1` | `producto/base` (4302e2d) | Desarrollo del MVP. Sólo escribe OpenCode. Se respalda en `origin` con push normal en cada checkpoint confirmado. |
| `integ/mvp-v0.1` | `feat/mvp-v0.1@f3be137` | Integración vigente: MVP limpio, plano de control JZ-AI V2 portado y CI. Fuente de la PR hacia `main`. |
| `integ/mvp` | `poc/candidata-a-3@40e4e56` | Integración anterior, sobre la candidata POC-3. Queda como histórico; no se borra ni se reescribe. |
| `chore/jz-agents` | — | Desarrollo del plano de control JZ-AI. Las correcciones se portan a `integ/mvp-v0.1` con commits explícitos. |

Worktrees: la integración vigente vive en `/home/proyectos/jozeuzz/worktrees/integracion`. La anterior se movió con `git worktree move` a `worktrees/historico/integ-mvp-poc3`; estaba limpia, sin procesos ni montajes y publicada.

## Estrategia

- **No se fusiona la POC con el producto.** La POC-3 deriva de otra línea (poc1a/, contrato con alcances poc-1a/1b/3, documentación de gates). El MVP parte del scaffold limpio y reimplementa lo necesario.
- **Port selectivo del plano de control** (07d595b): `.jz`, `.claude`, `.opencode` (agentes, permisos, plugin jz-guard), `tools/jz-autonomy`, `tools/jz-gitops`, `docs/AUTONOMIA-JZ.md`, `docs/OPERACION-JZ-AI.md`, `docs/AGENTES-JZ.md`, la regla de `jz-run` en `AGENTS.md` y `.jz-state/` en `.gitignore`. El código de la POC no entra.
- **Avances del MVP:** cada checkpoint publicado de `feat/mvp-v0.1` entra en `integ/mvp-v0.1` con `git merge --no-ff`. Nunca se usan rebase, reset ni force-push sobre ramas publicadas.
- **Cambios del plano de control:** se portan desde `chore/jz-agents` con un commit que cita el SHA de origen.
- **`feat/mvp-v0.1` no recibe el plano de control mientras OpenCode escribe en ella.** Hacerlo cambiaría su configuración en caliente. Cuando el MVP llegue a `main`, `feat/mvp-v0.1` (o la rama que la suceda) se actualiza desde `main` con un merge.

## CI y protección de `main`

`.github/workflows/ci.yml` tiene dos jobs y se ejecuta en push a `main` e `integ/**` y en PR hacia `main`:

- `producto (lint, tipos, unit, contrato, integración)`: `npm ci`, lint, typecheck, foundation, unit, contrato y el harness de integración con PostgreSQL 18.6. Todo pasa por las imágenes fijadas por digest del proyecto.
- `plano de control JZ-AI`: jz-autonomy, jz-gitops y las cinco suites `.jz` que no necesitan el host. `sandbox`, `verify`, `opencode-native` e `integration` se siguen ejecutando en el host.

La protección de `main` está en [proteccion-main.json](proteccion-main.json). Exige los dos checks con la rama al día, también a los administradores, y prohíbe force-push y borrado. No exige revisión aprobada: con un solo mantenedor, nadie podría aprobar las PR.

## Handoff para OpenCode: `scripts/verify-external-worktrees.sh`

El script de `feat/mvp-v0.1` compara el HEAD y el hash de `git status` de tres worktrees con valores fijos:

1. `/home/proyectos/jozeuzz-poc-candidata-a` (POC-3, con el documento RP-ADAPT sin confirmar).
2. `worktrees/historico/poc-drizzle-fix` (evidencia histórica).
3. `/home/proyectos/jozeuzz-jz-agents` en `cb967b8`.

El tercer punto convierte en fallo cualquier avance legítimo del plano de control. `chore/jz-agents` es una rama activa de desarrollo, no una evidencia protegida, así que no debe estar en la lista. Corrección propuesta, para que la aplique OpenCode en `feat/mvp-v0.1`:

- Quitar la entrada de `jozeuzz-jz-agents`.
- Mantener las dos primeras: detectan cambios no autorizados en la POC y en la evidencia histórica.
- Cuando el responsable confirme RP-ADAPT en `poc/candidata-a-3`, el HEAD y el status de la POC cambiarán legítimamente. Ese commit humano exige actualizar la línea base en un commit que cite el SHA nuevo.
- El script depende de rutas del host, así que queda fuera de CI y de `npm test`. Así está hoy.

Mientras la corrección no llegue, Claude Code no hace commits en el worktree `jozeuzz-jz-agents`. El trabajo de integración se hace en `worktrees/integracion`, que el script no vigila.

## Backlog (no bloquea el MVP)

- `contrato --listar` (c6b8252, en `feat/contrato-listar` e `integ/mvp`) depende de `--alcance` y de los alcances de la POC. No aplica al contrato del MVP, que es el de `producto/base`. Si el MVP adopta alcances, reimplementarlo sobre ese contrato.
- `state.json` del supervisor no está firmado y vive en el árbol.
- El `touch` de `jz-run` sobre `AGENTS.md` y `CLAUDE.md` cambia el mtime, no el contenido.
- Las reglas nativas de OpenCode niegan `git diff` a jz-implementer.
- Mover `jozeuzz-jz-agents`, `jozeuzz-producto-base` y `jozeuzz-poc-candidata-a` a `worktrees/` sólo cuando estén inactivos. Para la POC, además, después de que se confirme RP-ADAPT.

## Próximo paso

Cuando OpenCode cierre un incremento completo (I1) y esté publicado en `feat/mvp-v0.1`:

1. Hacer merge `--no-ff` en `integ/mvp-v0.1`.
2. Verificar con la CI.
3. Pasar a lista para revisión la PR `integ/mvp-v0.1` → `main`, tras la revisión del hito por QA y Security.
