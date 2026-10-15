# jz-ai (M0)

Herramienta local de diagnóstico e inventario para el desarrollo de jozeuzz.cl. No es parte de la aplicación web.

Especificación: `docs/superpowers/specs/2026-10-14-jz-ai-m0-design.md`. Decisión: `docs/adr/0002-jz-ai-m0-cli-solo-lectura.md`.
Instrucciones del proyecto (`AGENTS.md`, `CLAUDE.md`, `docs/AGENTES.md`): mientras la PR #1 no se fusione, están sólo en la rama `docs/fase-0-definicion`.

## Uso

    node tools/jz-ai/bin/jz-ai.js doctor [--json]
    node tools/jz-ai/bin/jz-ai.js skills [--json]

Códigos de salida: 0 completo; 1 parcial o con errores; 2 uso inválido; 3 fallo interno.

## Garantías

- Sólo lectura: no escribe archivos. Salida por stdout y stderr.
- Sin red y sin opción para habilitarla.
- No ejecuta skills, hooks, plugins, Claude Code ni OpenCode. Sólo ejecuta `git` con una lista cerrada de argumentos y sin hooks ni fsmonitor.
- No lee el contenido de archivos de autenticación ni de configuración. Sólo lee `SKILL.md` en raíces autorizadas, `~/.agents/.skill-lock.json` y `~/.claude/plugins/installed_plugins.json`.
- La presencia de una skill o plugin no implica que un host la cargue: `availability`, `enabled` y `loaded` no se infieren.
- `git` se ejecuta sólo desde `/usr/bin/git` validado, sin `PATH` heredado ni configuración global o de sistema, y sólo para `--version` y dos `rev-parse`. No ejecuta `git status`, porque ejecuta filtros `clean` del repositorio: el working tree figura como `not-inspected`.
- El JSON sólo publica metadata autorizada; los errores internos usan un mensaje fijo.

Estas garantías son controles del código, verificados con pruebas. No sustituyen un sandbox: el proceso se ejecuta con los permisos de quien lo lanza.

## Pruebas

    cd tools/jz-ai && node --test
