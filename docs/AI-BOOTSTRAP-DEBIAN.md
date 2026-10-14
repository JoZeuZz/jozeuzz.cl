# Bootstrap de agentes en Debian — jozeuzz.cl

**Estado:** procedimiento manual de Fase 0; no está instalado ni validado por el mero hecho de existir aquí.
**Host aportado por el responsable:** Debian 13.7 x86_64, sesión **root**, Claude Code 2.1.296 y OpenCode 1.17.18. Git y rama `docs/fase-0-definicion` correctos. **No se cambiará de usuario** por decisión expresa del responsable.
**Referencia:** [orquestación propuesta](ORQUESTACION-IA-PROPUESTA.md), [Issue #5](https://github.com/JoZeuZz/jozeuzz.cl/issues/5).

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
