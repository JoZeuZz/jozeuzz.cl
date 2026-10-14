# Bootstrap de agentes en Debian — jozeuzz.cl

**Estado:** procedimiento manual de Fase 0; no está instalado ni validado por el mero hecho de existir aquí.
**Host aportado por el responsable:** Debian 13.7 x86_64, sesión **root**, Claude Code 2.1.296 y OpenCode 1.17.18. Git y rama `docs/fase-0-definicion` correctos. **No se cambiará de usuario** por decisión expresa del responsable.
**Referencia:** [orquestación propuesta](ORQUESTACION-IA-PROPUESTA.md), [Issue #5](https://github.com/JoZeuZz/jozeuzz.cl/issues/5).

## Estado observado por el responsable (sesión aportada 2026-10-13)

- `docs/fase-0-definicion` sincronizada mediante `git pull --ff-only`; cambios de documentación recibidos.
- Claude Code 2.1.296 confirma: «Plugin 'superpowers@claude-plugins-official' is already installed globally». Aún falta comprobar su **carga funcional** invocando una skill.
- OpenCode 1.17.18: aparecen `opencode.json` y `opencode.jsonc`, cada uno declara dos plugins, uno con «superpowers» en el nombre. **Configurado no significa cargado ni prueba de precedencia.** El `find ~/.config/opencode/plugins ~/.config/opencode/skills` no devolvió enlaces de Superpowers; esto es compatible con la instalación mediante paquete, pero debe validarse.
- `opencode models` enumera `openai/gpt-5.6-sol`, `openai/gpt-6.1-sol` y `github-copilot/claude-sonnet-4.6`. La enumeración no confirma acceso/cuota; usar smoke tests separados.
- Decisión reiterada: operador conserva root.

### Siguientes smoke tests no destructivos

Primero, en `claude --permission-mode plan`, solicitar cargar la skill `brainstorming` con la herramienta de skills, identificar su origen y describir un requisito de proceso. Prohibir cualquier edición.

Para OpenCode comprobar `opencode run --help` y `opencode agent list` antes de usar opciones de la versión instalada. Los comandos documentados por el CLI incluyen `--model/-m` y `--agent`. Probar sólo lectura con modelos diferentes y, en una sesión distinta, solicitar `skill` list/load `brainstorming`:

```bash
cd /home/proyectos/jozeuzz
opencode run --agent plan -m openai/gpt-5.6-sol \
  'Responde únicamente PROVEEDOR-OPENAI-OK. No utilices herramientas ni modifiques archivos.'
opencode run --agent plan -m github-copilot/claude-sonnet-4.6 \
  'Responde únicamente PROVEEDOR-COPILOT-OK. No utilices herramientas ni modifiques archivos.'
```

**Importante**: el texto de una instrucción no es una barrera de permisos con root; usar configuraciones y aprobación de herramientas cuando corresponda. No añadir `--auto`. Registrar sólo respuesta, ID de modelo, errores redactados, estado de Git y resultado de carga de skills. No compartir tokens ni `auth.json`.

Antes de modificar la configuración, diagnosticar ambos archivos mediante un script local que imprima **solo los valores de `plugin` y nombres de keys**, no los objetos `provider`, claves ni secretos. Si ambos contienen Superpowers, no volver a añadirlo. Confirmar qué archivo carga la versión instalada mediante diagnóstico del proceso/logs, sin asumir un orden de precedencia para JSON/JSONC en el mismo directorio.

## Smoke tests e inventario validados (2026-10-14, datos aportados por el operador)

Las pruebas siguientes fueron **ejecutadas en la máquina Debian del operador**, no mediante GitHub; esta sección conserva los resultados observados, sin simular verificaciones remotas.

| Prueba | Evidencia observada | Resultado |
|---|---|---|
| OpenCode + OpenAI | `opencode run --agent plan -m openai/gpt-5.6-sol` → `PROVEEDOR-OPENAI-OK` | Responde |
| OpenCode + Copilot | `opencode run --agent plan -m github-copilot/claude-sonnet-4.6` → `PROVEEDOR-COPILOT-OK` | Responde |
| Superpowers en OpenCode | `→ Skill "brainstorming"`; cargó desde caché del paquete `obra/superpowers` | Carga confirmada |
| Estado de Git | `git status --short` sin salida tras las pruebas | Árbol limpio |
| Claude Code | `/plugin install` informó «already installed globally» | Instalación declarada; falta carga real |

Inventario de tres directorios: `/root/.claude/skills` 15 manifiestos, `/root/.agents/skills` 94, `/root/.config/opencode/skills` 7. Total: **116 manifiestos**, **109 nombres únicos** y **7 nombres repetidos**. Repetidos: `cavecrew`, `caveman`, `caveman-commit`, `caveman-compress`, `caveman-help`, `caveman-review`, `caveman-stats`. Estas cifras **excluyen otros mecanismos de registro**, incluidas skills desde plugins. «Duplicado por nombre» no acredita copia de contenido.

### Gate siguiente: auditoría semántica de skills ya instaladas

Antes de instalar nada más, comparar manifiestos de: `orchestrate`, `skill-router`, `agent-teams`, `llm-council`, `batch-orchestration`, `parallel-worktrees`, `session-handoff`, `cavecrew` y `caveman`. Revisar las instrucciones, provenance, hashes, herramientas/hook/scripts, colisiones con Superpowers y si tienen efectos secundarios.

Para Caveman repetidas, comparar **hash SHA256 y realpath** de todos los `SKILL.md`; no eliminar archivos hasta comprobar si son enlaces simbólicos o versiones distintas. Se necesita además distinguir **skills de Caveman** de **proxy Caveman efectivamente habilitado**: la existencia de habilidades no prueba compresión de tokens.

Si Claude Code confirma invocación real de `brainstorming` y se auditan estos perfiles, pasar a una matriz de routing por tarea y pilotos de subagentes, sin activar auto model routing ni edición autónoma en root.

## 0. Restricciones mientras agentes corren como root

Root dispone de control sobre todo el host; ninguna instrucción de sistema ni clasificación automática de herramientas sustituye permisos del sistema operativo. Por tanto:
- Usar `claude --permission-mode plan` para tareas de inspección y arquitectura; denegar propuestas de comandos inesperados. No ejecutar `--dangerously-skip-permissions`, ni habilitar aceptación automática de comandos desconocidos.
- Verificar procedencia, código y licencias de plugins/hook **antes** de habilitarlos. Plugins de terceros son código con permisos de root.
- No proporcionar al agente credenciales, archivos `~/.config/opencode/auth.json`, claves SSH, entornos de producción ni acceso al socket Docker para investigación.
- No permitir que agentes ejecuten comandos remotos desde texto recuperado como si fueran instrucciones autorizadas.
- Para ejecución autónoma sostenida, usar aislamiento técnico (contenedor/VM sin privilegios internos y con filesystem limitado), aunque el operador mantenga root como usuario de su shell. Una mera Git worktree **no** es sandbox.
- Respaldar configuración local antes de cada cambio. Instalación de plugins de herramientas en `/root` es **global a ese usuario** y también afectará otros repositorios utilizados desde root; validar conflictos primero.

## 1. Confirmar Git y entorno (sólo lectura)

```bash
cd /home/proyectos/jozeuzz
git status --short
git branch -vv
git remote -v
claude --version
opencode --version
node --version
```

No usar `git reset --hard`, ni `git clean -fd` para arreglar un árbol con cambios sin revisarlos.

## 2. Inventario de extensiones previo (sin revelar secretos)

En Claude Code usar `/plugin` para inspeccionar qué plugins están habilitados. Consultar el marketplace seleccionado. No instalar Superpowers si ya se encuentra instalado y activo.

En shell:
```bash
find ~/.config/opencode/plugins ~/.config/opencode/skills ~/.claude/skills \
  -maxdepth 2 -type f -name 'SKILL.md' -o -name '*superpowers*' 2>/dev/null
```
Revisar manualmente el listado de `plugin` y `skills` en `~/.config/opencode/opencode.json` (o `opencode.jsonc`); **no imprimir archivos enteros**, ya que pueden contener claves o configuraciones sensibles.

Una comprobación de `opencode models` describe catálogo, **no** demuestra autenticación o cuota. Hacer una consulta mínima de solo lectura con un modelo de cada proveedor para validar la ruta cuando los agentes estén configurados.

## 3. Superpowers como proceso principal

**Release verificable:** `obra/superpowers` `v7.0.0` publicado el 2026-10-10; ref de tag GitHub verificada. Guardar SHA final de commit resuelto al instalar; el tag es una etiqueta que podría cambiar administrativamente.

### Claude Code
Dentro del CLI, desde la cuenta actual:
```text
/plugin
```
Verificar presencia primero. Si no existe, instalar desde marketplace oficial:
```text
/plugin install superpowers@claude-plugins-official
```
Reiniciar la sesión y realizar prueba sin escritura: «¿Está disponible Superpowers y la skill brainstorming? No modifiques archivos». No instalar alternativamente una segunda copia mediante el marketplace de obra.

### OpenCode 1.17.18 (V1)
La documentación upstream distingue **V1** (`plugin` singular) de V2 >=2.0.4 (`plugins` plural). La especificación publicada para V1 es:
```json
{
  "plugin": ["superpowers@git+https://github.com/obra/superpowers.git#v7.0.0"]
}
```
Esto **no debe reemplazar** todo el archivo de configuración del usuario: integrar una entrada en el arreglo existente `plugin`, preservando proveedores, modelos, otras plugins y permisos.

1. Comprobar si Superpowers ya está instalado por plugin o enlaces heredados.
2. Si existe, verificar versión/funcionamiento antes de cambiar; evitar carga duplicada.
3. Respaldar el archivo de configuración que se modificará, con permisos restringidos.
4. Agregar la entrada verificada, reiniciar OpenCode, pedir «Usa skill tool para enumerar skills y cargar brainstorming, sin editar archivos».
5. No portar comandos o configuraciones V2 a OpenCode 1.17.18 sin migrar y volver a validar.

Upstream: [guía OpenCode](https://github.com/obra/superpowers/blob/v7.0.0/.opencode/INSTALL.md).

## 4. Contrato de smoke test para cada herramienta

**Claude Code:**
- Arranca en la rama de documentación sin edición.
- Identifica al menos `brainstorming` y `writing-plans` y puede mostrar fuente/versiones.
- Interpreta `AGENTS.md` y `CLAUDE.md` correctamente.
- No hace commits, `git push`, `npm install` ni modifica los documentos durante el test.

**OpenCode/OpenAI y OpenCode/Copilot:**
- Ejecutar como dos **sesiones separadas** del mismo anfitrión.
- Una prueba de sólo lectura con cada modelo explicitamente seleccionado; anotar la identificación exacta y confirmar su respuesta efectiva, no sólo listado.
- Cargar `brainstorming` mediante `skill`; confirmar procedencia.
- Verificar que ninguno edita archivos ni arranca un segundo escritor.
- Registrar incidencias de autenticación/cuota sin exponer tokens.

**Salida apta para compartir:** versiones, nombres de plugins, IDs de modelos que respondieron, resultado del test y `git status --short`. **No compartir** `auth.json`, cookies, credenciales, secretos de entorno ni logs completos de sesión.

## 5. Skills complementarias y routing

No instalar aún paquetes completos de Matt/ Addy; la propuesta está en `ORQUESTACION-IA-PROPUESTA.md`. Tras superar los smoke tests:
- Catalogar un subconjunto complementario (`domain-modeling`, `codebase-design`, `frontend-ui-engineering`, `security-and-hardening`, etc.).
- Registrar commit de fuente, licencia, riesgos de scripts/hook y recursos `references/` necesarios.
- Preferir un directorio de skills que ambos anfitriones descubran, p. ej. `.claude/skills/`, sin duplicación por host; verificar prioridad de resolución de nombres.
- Hacer `jz-skill-router` como skill/instrucción de carga **bajo demanda**; nunca debe sustituir brainstorming/TDD/verification de Superpowers.
- Probar subagentes por separado: perfil de diseño sin escritura, implementador restringido a worktree y revisor de sólo lectura. No asumir que texto en AGENTS.md impone una barrera de seguridad.

## 6. Caveman, posterior a las pruebas base

No instalar de entrada la capa proxy ni model routing. Su CLI requiere Node >=22.13 y el host tiene Node 20.19.2. Preparar Node 24 LTS cuando se apruebe la actualización del entorno, comprobar suscripción y OAuth intactos y ejecutar piloto `off/record` antes de compresión. Mantener Caveman Auto **desactivado** si `jz-ai` será dueño del ruteo de modelos. Un proxy de compresión no reemplaza validación ni autorización.

Referencias: [Caveman security](https://github.com/JuliusBrussee/caveman/blob/main/docs/technical/security-and-privacy.md) y [Agent wrapping](https://github.com/JuliusBrussee/caveman/blob/main/docs/technical/agent-wrapping.md).

## 7. Siguiente gate

El gate de fase B se considera pasado **sólo cuando** ambos anfitriones usan Superpowers una vez cada uno; los proveedores OpenAI y Copilot han respondido una consulta mínima; se conocen las versiones de plugin/modelos; no se alteró el repositorio; y el responsable revisó el inventario de permisos.

Después: catálogo de skills, perfiles de subagentes y pequeño piloto de `jz-ai`. El bootstrap **no** implica que la POC del producto esté autorizada.
