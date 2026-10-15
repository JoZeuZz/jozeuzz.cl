# ADR 0002 — `jz-ai` M0: CLI de solo lectura en JavaScript ESM sin dependencias

- Estado: **Propuesta** (revisada por OpenCode/OpenAI y OpenCode/Copilot; pendiente de aprobación del responsable en la PR de M0)
- Fecha: 2026-10-14
- Issue: [#6](https://github.com/JoZeuZz/jozeuzz.cl/issues/6)
- Especificación: [2026-10-14-jz-ai-m0-design.md](../superpowers/specs/2026-10-14-jz-ai-m0-design.md)
- Numeración: `0001-stack.md` queda reservado para la arquitectura de la aplicación web.

## Contexto

El proyecto planea un plano de control `jz-ai` para coordinar Claude Code y OpenCode (ver `docs/ORQUESTACION-IA-PROPUESTA.md` y `docs/AUDITORIA-SKILLS-LOCALES.md`, presentes en la PR #1). Antes de despachar agentes hace falta evidencia fiable sobre el entorno: qué skills existen, de dónde vienen, cuáles son copias o enlaces y qué herramientas están presentes. La auditoría manual mostró tres versiones divergentes de Caveman y dos de Cavecrew, symlinks entre raíces y procedencia sin fijar.

Restricciones:

- Fase 0: el stack de la aplicación web no está decidido; `jz-ai` no debe condicionarlo.
- El host ejecuta agentes como root por decisión del operador; no hay sandbox de sistema operativo.
- Las skills, plugins y configuraciones inspeccionadas son código y datos no confiables, y algunas configuraciones contienen credenciales.
- Node 20.19.2 está instalado; la migración a Node 24 LTS se evaluará aparte para la aplicación.

## Decisión

1. **Componente de herramienta, no del producto.** `jz-ai` vive en `tools/jz-ai/` con su propio `package.json` privado. No se crea `package.json` en la raíz ni se instala globalmente. Este componente no es el scaffold de la aplicación y no adelanta la decisión de `0001-stack.md`.
2. **JavaScript ESM sobre Node ≥ 20.19, sin dependencias.** Sólo APIs nativas (`node:fs`, `node:path`, `node:crypto`, `node:util` `parseArgs`, `node:child_process` restringido, `node:test`). Sin TypeScript ni paso de compilación en M0.
3. **Solo lectura, local y sin red.** Sin escrituras persistentes, sin código de red y sin opción para habilitarla. Sólo se lee el contenido de `SKILL.md` en raíces autorizadas, `~/.agents/.skill-lock.json` y `~/.claude/plugins/installed_plugins.json`, con listas blancas de campos y límites de tamaño. El resto, incluidas todas las configuraciones y archivos de autenticación, sólo se inspecciona como metadata.
4. **Ejecución de procesos limitada a `git`.** Sólo `/usr/bin/git`, validado (archivo regular, propietario root, sin escritura para grupo u otros) y sin consultar `PATH`. Si falta o no supera la validación, se informa y no se ejecuta ninguna otra ruta. Lista cerrada de argumentos (`--version` y dos `rev-parse`; **sin `git status`**, porque ejecuta filtros `clean` del repositorio aun con las mitigaciones), `execFile` sin shell, entorno construido desde cero con `PATH` fijo, `GIT_OPTIONAL_LOCKS=0`, `GIT_CONFIG_NOSYSTEM=1` y `GIT_CONFIG_GLOBAL=/dev/null`, fsmonitor y hooks desactivados, timeout y tope de salida. El estado del working tree se informa como `not-inspected` en M0. Claude Code, OpenCode, skills, plugins y hooks no se ejecutan; sus versiones se infieren de metadata o se informan como `unknown`, con nivel de confianza explícito.
5. **Política de salida.** Una sola política de saneamiento aplicada a todo valor de cadena en JSON y a toda celda en texto (controles C0/C1, ANSI y bidi eliminados; credenciales y consulta de URLs redactadas). Texto tabular apto para scripts; JSON con `schemaVersion: 1`, orden documentado, sin marcas de tiempo y con `completeness` ∈ {`complete`, `partial`, `failed`}. El JSON publica sólo metadata autorizada: nunca el cuerpo de `SKILL.md`, valores de entorno, campos de procedencia fuera de lista blanca ni mensajes de excepción; los errores internos usan un mensaje fijo. Códigos de salida: 0 completo, 1 parcial o con errores, 2 uso inválido, 3 fallo interno.
6. **Disponibilidad no inferida.** Ningún resultado afirma que un host carga una skill o un plugin por su mera presencia. Instalación, habilitación y carga se reportan por separado; habilitación y carga quedan `unknown`/`unverified` en M0.
7. **Seguridad verificada dinámicamente.** Las invariantes se prueban ejecutando la CLI contra fixtures con canarios, marcadores y snapshots del árbol. Un escaneo estático del código es una capa adicional, no la garantía.

## Alternativas consideradas

- **TypeScript:** mejor tipado, pero exige compilador o un runtime adicional, contrario a «sin dependencias» en M0. Reevaluable cuando exista un stack decidido.
- **Bash:** sin dependencias, pero difícil de probar, de parsear JSON y de hacer seguro con nombres de archivo arbitrarios.
- **Python:** disponible en Debian, pero introduce un segundo runtime frente al ecosistema Node que ya usan Claude Code, OpenCode y probablemente la aplicación.
- **Reutilizar `wf-ai` o scripts de skills (`llm-council`, `session-handoff`):** la auditoría los clasificó como ADAPTAR o DESCARTAR; se toman ideas, no código.
- **Ejecutar `git status` con mitigaciones:** descartado; ejecuta filtros `clean` de la configuración local del repositorio (verificado en el host), y desactivarlos exigiría leer esa configuración.
- **Ejecutar `claude --version` / `opencode --version`:** daría versiones verificadas, pero ejecuta binarios que cargan plugins con efectos globales (por ejemplo, el plugin Caveman escribe un flag al cargarse). Rechazado para M0.
- **Leer `~/.claude/settings.json` para conocer plugins habilitados:** puede contener variables de entorno con secretos. Rechazado; la habilitación queda `unknown`.

## Consecuencias

- Positivas: auditable por revisores de otros proveedores, ejecutable en cualquier host con Node, sin cadena de suministro adicional y sin riesgo de alterar configuración global.
- Negativas: analizador de frontmatter mínimo; versión de OpenCode `unknown`; hash sólo de `SKILL.md`, no de la carpeta completa; las invariantes dependen del código al no haber sandbox; `doctor` no informa cambios pendientes del working tree (`not-inspected`); repositorios de otro propietario no se inspeccionan al ignorar `safe.directory` global; `git` fuera de `/usr/bin` no se usa; el guard de red de las pruebas es un control de prueba, no un sandbox.
- Seguimiento: inspección segura del working tree sin ejecutar filtros, con pruebas específicas; hash por carpeta y verificación de `skillFolderHash`; detección de habilitación con una fuente no sensible; CI que ejecute `node --test`; ADR de Node 24 cuando se decida el runtime de la aplicación.
