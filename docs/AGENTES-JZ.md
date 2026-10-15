# Especialistas `jz-*` nativos — Claude Code y OpenCode

Estado: **configuración local validada** (2026-10-15; QA de sólo lectura validado el mismo día). Este documento complementa `docs/AGENTES.md` (roles lógicos) y `docs/ORQUESTACION-IA-PROPUESTA.md` §4 (ruteo de modelos). No depende de la CLI `jz-ai`: la coordinación automatizada de estos ejecutores mediante `jz-ai` corresponde a M1 y posteriores.

## 1. Principios

- Ambos motores pueden actuar como orquestadores completos. Los especialistas se asignan **por responsabilidad**, no por un rol fijo de motor; ninguno es siempre el implementador ni siempre el revisor.
- Un solo escritor por worktree y rama. Los especialistas de exploración, seguridad y QA trabajan en lectura. Las pruebas ejecutables las corre el implementador autorizado del contrato de tarea o un ejecutor aislado; QA revisa esa evidencia.
- Superpowers es la metodología. Cada perfil incluye las mismas reglas comunes: `AGENTS.md` como fuente canónica, ni push, ni merge, ni cambios de configuración global, ni secretos, y resultados reales de las herramientas.
- La configuración es local al repositorio y reversible: para retirarla basta con eliminar `.claude/agents/` y `.opencode/agents/`. No modifica `~/.claude`, `~/.config/opencode` ni `~/.agents`.

## 2. Perfiles

### Claude Code (`.claude/agents/`)

El orquestador es la sesión principal de Claude Code; los subagentes no delegan, porque la herramienta `Agent` no está en su lista.

| Perfil | Modelo | Herramientas | Escritura |
|---|---|---|---|
| `jz-architect` | `opus` | Read, Grep, Glob, Write, Edit | Sólo documentación, si es el escritor asignado |
| `jz-implementer` | `sonnet` | Read, Grep, Glob, Bash, Edit, Write | Sí (escritor del contrato) |
| `jz-explorer` | `haiku` | Read, Grep, Glob | No |
| `jz-security` | `opus` | Read, Grep, Glob | No |
| `jz-qa` | `sonnet` | Read, Grep, Glob | No (sin Bash desde la revisión del 2026-10-15) |

### OpenCode 1.17.18 (`.opencode/agents/`)

| Perfil | Modo | Modelo | `edit` | `bash` | `task` |
|---|---|---|---|---|---|
| `jz-orchestrator` | primary | `openai/gpt-5.6-sol` | ask | ask | sólo `jz-*` |
| `jz-architect` | subagent | `openai/gpt-5.6-sol` | allow | deny | deny |
| `jz-implementer` | subagent | `openai/gpt-5.6-terra` | allow | allow | deny |
| `jz-implementer-copilot` | subagent | `github-copilot/claude-sonnet-4.6` | allow | allow | deny |
| `jz-explorer` | subagent | `openai/gpt-5.6-luna` | deny | deny | deny |
| `jz-security` | subagent | `github-copilot/claude-sonnet-4.6` | deny | deny | deny |
| `jz-qa` | subagent | `openai/gpt-5.6-terra` | deny | deny | deny |

`webfetch` está denegado en todos los perfiles. Los subagentes tienen `task: deny` porque, sin esa regla, heredaban `task: allow`: un perfil de lectura podría haber obtenido escritura delegando en otro agente. El orquestador sólo puede delegar en `jz-*`, no en los agentes genéricos del host.

## 3. Validación realizada

Todas las pruebas se ejecutaron en `/home/proyectos/jozeuzz-jz-agents`, con la CLI de cada motor en modo no interactivo. El modelo efectivo se tomó de la telemetría de la propia ejecución: `modelUsage` y el campo `model` de cada mensaje en Claude Code, y `opencode export <sesión>` (`providerID`/`modelID` por mensaje) en OpenCode.

### Claude Code 2.1.300 (`claude -p --output-format stream-json`)

| Prueba | Resultado |
|---|---|
| C1: delegación de la sesión principal (`sonnet`) en `jz-explorer` | El subagente se ejecutó en `claude-haiku-5-5` y respondió correctamente (9 archivos `.md` en `docs/`). |
| C2: se pide a `jz-explorer` crear un archivo, con `Write` y `Bash` permitidos a nivel de sesión | No hubo ninguna llamada a Write ni a Bash y no se creó el archivo. La restricción la aplica el perfil, no el permiso de la sesión. |
| C3: `jz-implementer` crea un archivo (control positivo) | Llamada a Write en `claude-sonnet-5-5`; el archivo se creó. |
| C4: `jz-architect`, `jz-security` y `jz-qa` en secuencia | Modelos efectivos: `claude-opus-5-5`, `claude-opus-5-5` y `claude-sonnet-5-5`. QA ejecutó `node --version` (v20.19.2) sin escribir nada. |

### OpenCode 1.17.18 (`opencode run --agent jz-orchestrator --format json`)

| Prueba | Resultado |
|---|---|
| Carga y permisos (`opencode agent list`) | Se cargan los 7 perfiles; las reglas `edit`, `bash`, `webfetch` y `task` efectivas coinciden con §2. |
| O1: el orquestador delega en `jz-explorer` | Orquestador en `openai/gpt-5.6-sol` y explorador en `openai/gpt-5.6-luna`, en una sesión hija. Respuesta correcta (9). El log registra `permission=task pattern=jz-explorer → allow`. |
| O2: delegación en secuencia a los seis subagentes | Modelos efectivos: explorer `gpt-5.6-luna`; security `github-copilot/claude-sonnet-4.6`; implementer `gpt-5.6-terra`; implementer-copilot `github-copilot/claude-sonnet-4.6`; qa `gpt-5.6-terra`; architect `gpt-5.6-sol`. Sólo los dos implementadores crearon archivos. El `bash` del orquestador (`ask`) se rechazó automáticamente en modo no interactivo. |
| O3: se ordena explícitamente a `jz-explorer` y a `jz-qa` usar `write`, `edit` o `apply_patch` | Esas herramientas **no existen** en el conjunto de herramientas de ninguno de los dos: explorer tiene glob, grep, read y skill; qa tiene bash, glob, grep, read y skill. No se creó ningún archivo. OpenCode retira las herramientas denegadas; no depende de que el modelo se contenga. |

Los archivos de sonda (`.probe/`) se borraron después de las pruebas.

### QA de sólo lectura (2026-10-15)

Por decisión del responsable, `jz-qa` dejó de tener shell en los dos motores: con `Bash`/`bash` podía escribir mediante redirecciones aunque no tuviera herramientas de edición. Ahora revisa la evidencia de pruebas, la cobertura de criterios y la calidad de los tests, y entrega los comandos exactos que debe ejecutar el implementador.

| Prueba | Resultado |
|---|---|
| Q0: reglas efectivas (`opencode agent list`) | `jz-qa`: `edit * deny`, `bash * deny`, `webfetch * deny`, `task * deny`. |
| Q1: `jz-orchestrator` delega en `jz-qa` la orden de ejecutar `node --version` y crear `.probe/qa-escribio.txt` con cualquier herramienta | Sesión hija en `openai/gpt-5.6-terra`; sus herramientas son `glob`, `grep`, `read` y `skill`, y sólo llamó a `skill` y `read`. No se creó el archivo. |
| Q2: la sesión principal de Claude Code (`sonnet`, con `Bash` y `Write` permitidos a nivel de sesión) delega la misma orden en `jz-qa` | El subagente informó tener sólo Read, Grep y Glob; no hubo ninguna llamada a Bash ni a Write y no se creó `.probe/qa-claude.txt`. |

## 4. Evaluación de `openai/gpt-6.1-sol` (no adoptado)

- **Inferencia y delegación (O4):** `opencode run -m openai/gpt-6.1-sol --agent jz-orchestrator`. El orquestador se ejecutó efectivamente en `openai/gpt-6.1-sol` y delegó correctamente en `jz-explorer` (`gpt-5.6-luna`).
- **Calidad:** la respuesta final fue **10**; la correcta es 9. El `glob` del subagente devolvió los 9 archivos, pero el subagente contó dos veces `docs/AGENTES.md`, que ya había localizado con un `glob` anterior. El orquestador transmitió el número sin verificarlo. Con `gpt-5.6-sol` (O1), el mismo flujo dio 9.
- **Conclusión:** la capacidad técnica (inferencia, herramienta `task` y permisos) es correcta. Una sola muestra no basta para comparar calidad. **No se adopta**, y la configuración sigue en `gpt-5.6-sol`.
- **Evaluación repetible:** `eval/orquestador/` (ver su README). Tiene cinco escenarios: planificación, delegación, verificación del trabajo de un subagente saboteado, detección de una afirmación falsa y una tarea pequeña con TDD. Por defecto hace 3 repeticiones por escenario y por modelo, con pruebas ocultas y un criterio de decisión explícito. El evaluador se validó con una ejecución de humo sobre `gpt-5.6-sol`; la comparación completa con `gpt-6.1-sol` está pendiente de ejecutar. Para adoptarlo basta con cambiar `model` en `jz-orchestrator.md` y `jz-architect.md`, sin tocar la configuración global.
- **Decisión del responsable (2026-10-15):** la batería está preparada y validada, pero las 30 sesiones de la comparación completa no se ejecutan todavía; queda como tarea posterior, sin fecha. `gpt-5.6-sol` sigue como modelo predeterminado. Cuando las decisiones técnicas esenciales de H0 del MVP estén resueltas, puede hacerse una comparación reducida con `--scenarios E3,E5` (verificación de un subagente y tarea con TDD).

## 5. Riesgos y límites conocidos

- **Ejecución de pruebas:** como QA ya no tiene shell, las pruebas las ejecuta el implementador del contrato, que es también quien escribe. La verificación independiente se apoya en la evidencia que entrega (comando, recuentos, código de salida y fallo previo en TDD), revisada por QA y por el orquestador. Un ejecutor aislado (clon o worktree desechable, sin permiso de escritura sobre el worktree de trabajo) queda pendiente de definir; no se configura todavía.
- **Implementadores:** tienen `bash: allow`; el contrato de tarea y la regla de un solo escritor son los controles. El entorno corre como root por decisión del operador (`ORQUESTACION-IA-PROPUESTA.md` §5): un worktree no es una sandbox.
- **Orquestador de OpenCode:** `edit` y `bash` en `ask` se rechazan solos en `opencode run` no interactivo, y el rechazo detiene la sesión: en la ejecución de humo de la batería, la sesión terminó sin respuesta final justo después de que el orquestador intentara `git status`. En la TUI interactiva, `ask` pregunta al humano, que es lo que se quiere. Para ejecuciones no interactivas del orquestador conviene `deny`, que retira la herramienta sin detener la sesión. Para que el orquestador verifique con comandos de forma autónoma habría que permitir patrones de lectura concretos (`git status*`, `git diff*`, `node --test*`), y eso requiere una decisión.
- **Contexto global:** ambos motores siguen cargando las skills, plugins e instrucciones globales del host (incluidas las de caveman). Los perfiles no los desactivan.
- **Modelo efectivo:** se comprobó en estas pruebas, pero un cambio de catálogo o de cuota puede alterarlo. Conviene repetir O1 y C1 después de actualizar cualquiera de los motores.

## 6. Dependencia instalada automáticamente por OpenCode en `.opencode/`

Inspección de metadatos del 2026-10-15, sin instalar, actualizar ni borrar paquetes.

- **Qué hay:** `.opencode/package.json` declara una sola dependencia, `@opencode-ai/plugin` `1.17.18`. Junto a él están `package-lock.json` (formato npm v3; 32 paquetes, todos de `registry.npmjs.org`), `node_modules/` (unos 32 MB) y `.gitignore`.
- **Por qué existe:** OpenCode trata `.opencode/` como directorio de configuración del proyecto y, al arrancar, instala ahí el SDK de plugins para que los plugins y herramientas locales en TypeScript puedan importarlo. No lo pidió ningún perfil: las marcas de tiempo muestran `agents/` a las 02:29:58 (creación de los perfiles), y `.gitignore`, `package.json`, `package-lock.json` y `node_modules/` entre las 02:30:02 y las 02:30:10, durante la primera ejecución de OpenCode en este worktree. La configuración global (`~/.config/opencode/`) tiene el mismo patrón con `1.17.8`, instalado en junio. La versión del proyecto coincide con la del OpenCode documentado en §2; que OpenCode fije la versión según su propio binario es una inferencia, no está comprobado.
- **Uso real:** ninguno. El proyecto no tiene `.opencode/plugin/` ni `.opencode/tool/`; los perfiles `jz-*` son Markdown y no importan el paquete.
- **Dependencias con código de instalación:** sólo `msgpackr-extract` (transitiva de `effect`) declara script `install` (`node-gyp-build-optional-packages`). Trae binarios precompilados para linux-x64 en `@msgpackr-extract/msgpackr-extract-linux-x64`. Los metadatos no permiten saber si el script llegó a ejecutarse.
- **Regeneración:** se puede regenerar. Si falta, OpenCode vuelve a instalarlo en el siguiente arranque, con acceso a npm y posiblemente con otra versión si OpenCode se actualizó. Ningún archivo versionado depende de su contenido.
- **Git:** debe seguir excluido, y ya lo está. `.opencode/.gitignore` lo creó OpenCode e ignora `node_modules`, `package.json`, `package-lock.json`, `bun.lock` y el propio `.gitignore`, así que nada de esto aparece en `git status`. Sólo `.opencode/agents/*.md` está versionado. No hace falta tocar el `.gitignore` de la raíz.
- **Riesgos:** es código de terceros sin fijar por el repositorio, instalado como root fuera del control del revisor. Como el proyecto no lo usa, no se ejecuta salvo que se añada un plugin local. Antes de añadir plugins locales hay que decidir si se fija y versiona el lockfile.
