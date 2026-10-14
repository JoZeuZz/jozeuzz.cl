# Auditoría de skills locales para jz-ai — jozeuzz.cl

> Estado: **PROVISIONAL / Fase 0**. Fecha: 2026-10-14. Relacionado con [orquestación propuesta](ORQUESTACION-IA-PROPUESTA.md), [bootstrap Debian](AI-BOOTSTRAP-DEBIAN.md) e [Issue #5](https://github.com/JoZeuZz/jozeuzz.cl/issues/5).
> Este documento no autoriza instalaciones, cambios de configuración global ni la implementación de `jz-ai`.

## 0. Alcance y método

Este documento responde al gate «auditoría semántica de skills ya instaladas» de [AI-BOOTSTRAP-DEBIAN.md](AI-BOOTSTRAP-DEBIAN.md). Se revisaron los manifiestos y archivos de referencia de estas nueve skills de `/root/.agents/skills/`: `agent-teams`, `batch-orchestration`, `cavecrew`, `caveman`, `llm-council`, `orchestrate`, `parallel-worktrees`, `session-handoff` y `skill-router`. También se compararon las copias de `caveman` y `cavecrew` en `/root/.config/opencode/skills/` y en la caché del plugin de Claude Code.

La revisión se hizo sólo en modo lectura:

- No se ejecutaron scripts de skills, no se cargaron credenciales y no se instaló nada.
- No se editaron archivos fuera del repositorio.
- No se leyó `/root/.config/opencode/opencode.json`, porque tiene permisos `600` y puede contener datos de proveedor. Sí se leyó `opencode.jsonc`.
- No se leyeron archivos de autenticación.

Las referencias `archivo:Lnn` corresponden al contenido observado el 2026-10-14. Pueden cambiar si las skills se actualizan.

Convención:

- **[V]**: hallazgo verificado leyendo código o archivos.
- **[H]**: hipótesis que requiere prueba en ejecución.

Las hipótesis se reúnen en la sección 9.

## 1. Procedencia

- **[V]** `/root/.agents/.skill-lock.json` registra para cada skill `source`, `sourceUrl`, `skillPath`, `skillFolderHash`, `installedAt` y `updatedAt`. Al tratarse de un hash de carpeta, no de un SHA de commit, no fija la revisión del repositorio de origen.
- **[V]** Origen de cada skill:

  | Skill | Origen | Instalación |
  |---|---|---|
  | `agent-teams`, `batch-orchestration`, `llm-council`, `orchestrate`, `parallel-worktrees`, `session-handoff`, `skill-router` | `rohitg00/pro-workflow` | 2026-07-25 |
  | `caveman`, `cavecrew` | `JuliusBrussee/caveman` | 2026-09-03 |

- **[V]** Las siete skills de pro-workflow constan únicamente de `SKILL.md`. La excepción es `llm-council`, que incluye `scripts/council.js`. Ninguna declara hooks.
- **[V]** `/root/.claude/skills/caveman` y `/root/.claude/skills/cavecrew` son enlaces simbólicos a `/root/.agents/skills/caveman` y `/root/.agents/skills/cavecrew`. El resto de `~/.claude/skills/*` también apunta a `../../.agents/skills/*`. Por eso, una parte de los «nombres repetidos» de [AI-BOOTSTRAP-DEBIAN.md](AI-BOOTSTRAP-DEBIAN.md) son el mismo archivo, no copias distintas.
- **[V]** `/root/.config/opencode/opencode.jsonc:3` carga `superpowers@git+https://github.com/obra/superpowers.git` sin fijar commit ni tag. Esto contradice la regla de procedencia de [ORQUESTACION-IA-PROPUESTA.md](ORQUESTACION-IA-PROPUESTA.md) §3 («fijar tag/commit»).
- **[V]** Ninguna de las nueve skills hace referencia a `/root/.agents/references/` (`accessibility-checklist.md`, `orchestration-patterns.md`, `security-checklist.md`).

## 2. Capacidades reales por skill

### 2.1 agent-teams — `/root/.agents/skills/agent-teams/SKILL.md`

- **[V]** Es documentación pura: no tiene scripts ni hooks. Describe la función experimental de Claude Code `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` (L13-16).
- **[V]** Atajos y eventos que menciona, todos del propio Claude Code:
  - navegación con `Shift+Down` (L48);
  - modo delegado con `Shift+Tab` (L124);
  - eventos de hook `TeammateIdle`, `TaskCreated` y `TaskCompleted` (L131-135).
- **[V]** La lista de tareas, el buzón y el bloqueo de archivos (L99-108) se describen, pero la skill no los implementa. Dependen del runtime de Claude Code y no están disponibles en OpenCode.
- **[H]** La afirmación de que «subsequent sessions in the same repo join as teammates» (L18) no se ha comprobado.
- Conceptos aprovechables:
  - estados `pending → in-progress → completed | blocked` (L60-64);
  - dependencias declaradas (L90-97);
  - aprobación del plan antes de implementar (L112-120);
  - tope de 3 a 5 participantes (L35-41).

### 2.2 batch-orchestration — `/root/.agents/skills/batch-orchestration/SKILL.md`

- **[V]** Documenta el patrón `/batch` de Claude Code (L13-21) sin aportar implementación.
- **[V]** Efectos que describe: un worktree por unidad, un agente en segundo plano por unidad y **un PR por unidad** (L94-98). Se presenta como «the heaviest tool» (L148).
- **[V]** Reglas útiles:
  - no lanzar agentes sin confirmación explícita (L88);
  - no usarlo para migraciones de esquema ni para cambios de arquitectura (L130-136).
- **[H]** Hay que confirmar que `/batch` existe en Claude Code 2.1.296.

### 2.3 orchestrate — `/root/.agents/skills/orchestrate/SKILL.md`

- **[V]** Propone un flujo `/develop` en cuatro fases con un umbral de confianza de 70 (L13-27, L34).
- **[V]** **Tiene referencias rotas:**
  - Los agentes `scout`, `orchestrator`, `reviewer` y `debugger` (L57-63) no existen localmente: `/root/.claude/agents` no existe.
  - El comando `/develop` tampoco existe: `/root/.claude/commands` no existe.
- **[V]** Depende del ecosistema pro-workflow (L65-70).
- **[V]** Su flujo compite directamente con la cadena de proceso de Superpowers.

### 2.4 parallel-worktrees — `/root/.agents/skills/parallel-worktrees/SKILL.md`

- **[V]** Usa comandos estándar `git worktree list/add/remove/prune` (L48-57) e incluye medidas de protección (L81-84). Funciona con cualquier host.
- **[V]** Los extras exclusivos de Claude Code (`claude -w`, `isolation: worktree`, `Ctrl+F`, `Ctrl+B`) aparecen en L34-37.
- **[V]** `git worktree remove` y `git worktree prune` (L55-56) no comprueban el estado previo. La comprobación con `git -C … status` (L82) sólo aparece como recomendación en texto.

### 2.5 session-handoff — `/root/.agents/skills/session-handoff/SKILL.md`

- **[V]** Ejecuta comandos git de sólo lectura (L25-30) y rellena una plantilla Markdown (L34-72). Es portable entre hosts.
- **[V]** Para usarla en `jz-ai` le faltan:
  - `task-id`, `base_sha` y HEAD;
  - host, proveedor y modelo;
  - estado del lease;
  - evidencia de tests;
  - la regla de no reaplicar escrituras ([ORQUESTACION-IA-PROPUESTA.md](ORQUESTACION-IA-PROPUESTA.md) §5).

### 2.6 skill-router — `/root/.agents/skills/skill-router/SKILL.md`

- **[V]** Es un índice estático de pro-workflow («41 skills and 23 commands», L9).
- **[V]** Referencias rotas:
  - `module-map` (L71) no existe en `/root/.agents/skills`;
  - `rules/skill-conventions.mdc` (L88) no existe;
  - los comandos de L84 (`/develop`, `/handoff`, `/learn` y otros) no están instalados.
- **[V]** Enruta a `tdd` (L49), `smart-commit` (L51) y `wrap-up` (L75), que compiten con Superpowers.
- **[V]** Elementos aprovechables para un catálogo propio:
  - la convención `[human]` / `[auto]` (L9, L86-88);
  - la regla de actualizar el índice en el mismo cambio que la skill (L11).

### 2.7 llm-council — `SKILL.md` y `scripts/council.js`

El script tiene 286 líneas y se analizó sin ejecutarlo.

**Selección de proveedor**

- **[V]** Hay un registro fijo de cinco proveedores en orden de inserción: `anthropic`, `openai`, `openrouter`, `fireworks` y `custom` (`council.js:10-50`).
- **[V]** `pickProvider` (`council.js:52-58`):
  - usa `--provider` si el nombre existe;
  - si no, recorre el registro y elige **el primer proveedor cuya variable de entorno esté definida**. Por eso, con `ANTHROPIC_API_KEY` definida, Anthropic gana siempre sin avisar.
- **[V]** Un `--provider` inválido no produce error: se ignora y entra en juego la detección automática (L53).
- **[V]** Cada ejecución usa **un solo proveedor**: los modelos del consejo y el presidente comparten proveedor (L164, L185, L196, L206). Sólo hay diversidad entre proveedores a través de un agregador (`openrouter`) o de un endpoint `custom`.

**Credenciales**

- **[V]** Lee únicamente `process.env[provider.envKey]` en el momento de cada llamada:
  - `Authorization: Bearer …` en el modo compatible con OpenAI (L89);
  - `x-api-key` en el modo Anthropic (L107).
- **[V]** No lee archivos, llaveros ni OAuth. **No puede aprovechar las suscripciones de Claude Pro, ChatGPT ni GitHub Copilot** que usan los ejecutores del proyecto: necesita claves de API, que se facturan aparte.
- **[V]** `council.js providers` sólo muestra `has_key` como booleano (L250) y no imprime la clave.
- **[V]** El modo `custom` toma `LLM_COUNCIL_BASE_URL`, `LLM_COUNCIL_MODELS` y `LLM_COUNCIL_CHAIRMAN` del entorno (L43-49).

**Red**

- **[V]** Usa exclusivamente el módulo `https` (L5, L64-68).
- **[V]** **Defecto:** construye la petición con `hostname` y `path`, pero no con `url.port` (L64-67). Un `LLM_COUNCIL_BASE_URL` con puerto no estándar, o con esquema `http://` (por ejemplo, un proxy local), intentaría TLS contra el puerto 443 del host.
- **[V]** Tiene un tiempo límite de 120 s por llamada (L60, L74). No hay reintentos, límite de concurrencia ni tope de presupuesto.
- **[V]** Fija `max_tokens: 4000` y `temperature: 1` en el modo compatible con OpenAI (L87-88). En el modo Anthropic fija sólo `max_tokens: 4000` (L103).
- **[V]** Los IDs de modelo por defecto están fijados en el código (L14, L21, L28, L36-40) y pueden quedar obsoletos.

**Flujo de deliberación**

- **[V]** Hace 2N+1 llamadas en total:
  1. fase 1, N llamadas en paralelo (L185);
  2. fase 2, otras N llamadas de ranking, cada una con todas las respuestas (L196);
  3. fase 3, una llamada al presidente (L206).

  El volumen de tokens de la fase 2 crece aproximadamente con N².
- **[V]** Sólo hay etiquetas de la A a la G (L191). Con más de 7 modelos aparecerían etiquetas `undefined`.
- **[V]** Cada modelo conoce su propia etiqueta (L194). El anonimato oculta el nombre de los demás, pero no evita que un modelo favorezca su propia respuesta.
- **[V]** Los rankings no se analizan ni se agregan: el presidente recibe texto libre (L202-205).
- **[V]** Una llamada fallida devuelve como «contenido» un mensaje de error con hasta 300 caracteres del cuerpo de la respuesta (L91, L111, L178-181). Ese texto entra en las fases 2 y 3 como si fuera una respuesta.

**Efectos en disco**

- **[V]** Escribe `~/.pro-workflow/council/<timestamp>/` con `config.json`, `phase1_responses.json`, `phase2_rankings.json`, `phase3_synthesis.txt` y `final_output.md` (L8, L172-176, L188, L199, L207, L235). La consulta y las respuestas se guardan literalmente, sin redacción. El directorio no existe hoy.
- **[V]** Con `--wiki`, `PRO_WORKFLOW_ROOT` se resuelve a `/root/.agents` (L7) y el script hace `require` de `/root/.agents/dist/db/store.js` (L135-137).
  - Ese archivo no existe, así que la persistencia se omite con un aviso por stderr (L240).
  - **Cualquier JavaScript que aparezca en esa ruta se ejecutaría.**

**Diferencias entre `SKILL.md` y el script**

- **[V]** Dice «logs per-call latency + tokens» (SKILL.md L77), pero el script guarda latencia y uso en JSON sin mostrarlos ni calcular costo.
- **[V]** Declara `allowed-tools: Read, Write, Bash, AskUserQuestion` (SKILL.md L5), un frontmatter propio de Claude Code.

### 2.8 caveman

- **[V]** Es una instrucción de estilo de respuesta. La skill por sí sola no transforma la entrada ni los tool results. Esto coincide con [ORQUESTACION-IA-PROPUESTA.md](ORQUESTACION-IA-PROPUESTA.md) §6: instalar `/caveman` no demuestra ahorro de tokens de entrada.

**Claude Code: plugin `caveman@caveman`**

Las rutas son relativas a `/root/.claude/plugins/cache/caveman/caveman/7066cc815414/`.

- **[V]** `.claude-plugin/plugin.json` registra dos hooks.
- **[V]** `SessionStart` ejecuta `src/hooks/caveman-activate.js`, que:
  - escribe el flag `~/.claude/.caveman-active` (L5, L60);
  - escribe un marcador de aviso (L179);
  - lee `~/.claude/settings.json` para detectar la statusline (L171-173);
  - lee el `SKILL.md` del plugin en tiempo de ejecución (L67-99) e imprime su contenido, que acaba inyectado en el contexto (L199).
- **[V]** `UserPromptSubmit` ejecuta `src/hooks/caveman-mode-tracker.js`, que reescribe el flag de modo (L115, L120, L148).
- **[V]** `src/hooks/cavecrew-model-overrides.js` (lo invoca `caveman-activate.js`) **reescribe los archivos de agentes del plugin** (L110) cuando existen `CAVECREW_REVIEWER_MODEL`, `CAVECREW_BUILDER_MODEL` o `CAVECREW_INVESTIGATOR_MODEL`. Los fallos se ignoran sin aviso.

**OpenCode: `/root/.config/opencode/plugins/caveman/plugin.js`**

- **[V]** Escribe `~/.config/opencode/.caveman-active` al cargarse el plugin y en cada evento `session.created` (L183-198, L206-208).
- **[V]** Analiza **todos** los mensajes de usuario con expresiones regulares de lenguaje natural (L107-169, L214-222). Frases como «start … caveman» o «normal mode» pueden cambiar el modo sin intención.
- **[V]** Añade una línea de refuerzo al system prompt antes de cada request mientras el modo está activo (L227-233).
- **[V]** Carga `caveman-config.cjs` leyendo el archivo y evaluándolo con `new Function` (L67-77), es decir, ejecuta código desde disco en el proceso de OpenCode.
- **[V]** `getDefaultMode` da prioridad a `CAVEMAN_DEFAULT_MODE` (`caveman-config.cjs:90-93`).
- **[V]** `safeWriteFlag` y `readFlag` usan `O_NOFOLLOW`, y las escrituras son atómicas mediante archivo temporal y rename (`caveman-config.cjs:113-236`).
- **[V]** Además del plugin, `/root/.config/opencode/AGENTS.md:1-17` impone de forma global las reglas de caveman en **todas** las sesiones de OpenCode, incluidas las que lance `jz-ai`.

### 2.9 cavecrew

- **[V]** Es una guía de decisión para delegar en tres subagentes: `cavecrew-investigator`, `cavecrew-builder` y `cavecrew-reviewer`.
- **[V]** Define contratos de salida parseables (`/root/.agents/skills/cavecrew/SKILL.md:29-53`):
  - investigator: `path:line — symbol — nota`;
  - builder: recibo `path:line-range` con verificación y terminales `too-big.`, `needs-confirm.`, `ambiguous.` y `regressed.`;
  - reviewer: `path:line: <emoji> <severity>: <problem>. <fix>.` con totales.
- **[V]** Los agentes están en `/root/.claude/plugins/cache/caveman/caveman/7066cc815414/agents/` (Claude Code) y en `/root/.config/opencode/agents/` (OpenCode).

## 3. Diferencias entre copias de Caveman y Cavecrew

No se modificó ni eliminó ningún archivo.

### 3.1 Hashes SHA-256 de `SKILL.md`

| Copia | `caveman/SKILL.md` | `cavecrew/SKILL.md` |
|---|---|---|
| Plugin Claude (`~/.claude/plugins/cache/caveman/caveman/7066cc815414/skills/`) | `daf9cec496ebd039809d8236f99f17fa1b4beaadf8ce4e2d532d0da51d70afce` | `b74f374f6aae6e9a31e78e7d876860406fe5833378e9298536edf176c12f379b` |
| `/root/.agents/skills/` (y `~/.claude/skills/` por symlink) | `fec5718a391dd9d8c89746d39e0cc0fa7aa5b50447669a15e44c3244167828c0` | `c05f8e8d16bd8ae1c8d0b0abf6e8b9671051bde61653c4986304c2de3a1cf5d4` |
| `/root/.config/opencode/skills/` | `e38ec671ecbee47ce234190be12615daf60ac667d775b7340d49d07f4f63c7bc` | `b74f374f6aae6e9a31e78e7d876860406fe5833378e9298536edf176c12f379b` |

### 3.2 caveman: tres versiones distintas

**[V] Copia de `.agents` frente al plugin:**

- La copia de `.agents` **perdió todos los guiones largos «—»**, y algunas frases quedaron ambiguas. Por ejemplo, «unless asked quote shortest decisive line» (L19) y «flip meaning worse» (L21).
- Añade la regla «Never ADD word to sound caveman» (L23).
- Formula la persistencia de forma más suave (L13).
- Amplía los límites a issues, defects, tickets y bug reports (L88).
- Acorta la descripción y elimina la cifra de ahorro (L3-6).

**[V] La copia de OpenCode es anterior y contradice a las otras dos:**

- En `ultra` **permite abreviaturas y flechas causales** (L38, L46, L54-56), que las otras dos copias prohíben expresamente.
- Sólo admite `/caveman lite|full|ultra` (L17).
- No incluye estas reglas de las otras copias:
  - «never drop not/never/no/only/except»;
  - la de llamadas a herramientas;
  - la que reserva los caracteres clásicos a los modos wenyan.
- Sus límites sólo cubren «Code/commits/PRs» (L78): no protegen documentación, memoria ni issues.
- Declara un ahorro de «~75%» (L4); su README, de «~65-75%» (README L7).

**[V] Duplicado activo en Claude Code:** conviven `caveman` (skill de usuario, versión `.agents`) y `caveman:caveman` (plugin). El hook `SessionStart` inyecta la versión del plugin, de modo que en una misma sesión hay dos definiciones divergentes disponibles.

### 3.3 cavecrew

- **[V]** La copia de OpenCode es idéntica byte a byte a la del plugin de Claude.
- **[V]** La copia de `.agents`:
  - acorta la descripción y pierde las frases de activación (L3-6);
  - en el README, elimina las cifras «~60%» y «1/3» y añade una sección de overrides de modelo (README L38-59). Esos overrides sólo funcionan con el plugin de Claude, que es el que tiene `cavecrew-model-overrides.js`.

### 3.4 Agentes cavecrew: OpenCode frente a Claude

- **[V]** La única diferencia de contenido es que **en OpenCode falta la línea `tools:`**:

  | Agente | `tools:` en el plugin de Claude | En OpenCode |
  |---|---|---|
  | builder | `[Read, Edit, Write, Grep, Glob]` | sin línea |
  | investigator | `[Read, Grep, Glob, Bash]` | sin línea |
  | reviewer | `[Read, Grep, Bash]` | sin línea |

- **[V]** `cavecrew-builder.md:18` afirma «No `Bash` available», pero en OpenCode ningún frontmatter lo hace cumplir.
- **[V]** `cavecrew-investigator.md:8` y `cavecrew-reviewer.md:8` declaran `model: haiku`, que no sigue el formato `provider/model` de OpenCode. Ninguno declara `mode: subagent`.

## 4. Compatibilidad por host

| Skill | Claude Code | OpenCode | Observación |
|---|---|---|---|
| agent-teams | Sí, experimental | No | Depende de funciones propias del runtime de Claude Code |
| batch-orchestration | Patrón `/batch` [H] | Sólo como texto | Sin implementación propia |
| orchestrate | Referencias rotas | Referencias rotas | Agentes y comando inexistentes |
| parallel-worktrees | Sí | Sí | git estándar; los extras de Claude son opcionales |
| session-handoff | Sí | Sí | git de sólo lectura y plantilla |
| skill-router | Desactualizado | Sólo como texto | Índice de pro-workflow con entradas inexistentes |
| llm-council | Sí, con Bash y Node | Si el agente puede ejecutar Node [H] | Requiere claves de API; no usa OAuth |
| caveman | Sí (plugin, hooks y skill de usuario) | Sí (plugin y `AGENTS.md` global) | Tres versiones divergentes |
| cavecrew | Sí, con herramientas restringidas | Parcial [H] | Sin `tools:`, `model` dudoso y sin `mode` |

## 5. Solapamientos con Superpowers

- **[V]** `orchestrate` choca de forma directa con la cadena `brainstorming` → `writing-plans` → `subagent-driven-development` / `executing-plans` → `requesting-code-review`, porque ambas pretenden ser la autoridad de proceso.
- **[V]** `parallel-worktrees` equivale a `using-git-worktrees`.
- **[V]** `batch-orchestration` y `agent-teams` se solapan parcialmente con `dispatching-parallel-agents` y `subagent-driven-development`.
- **[V]** `skill-router` se solapa con `using-superpowers` y con el futuro `jz-skill-router`, y además enruta a `tdd` y `smart-commit`.
- **[V]** `session-handoff` no tiene equivalente en Superpowers, pero sí se solapa con `handoff` de mattpocock, que [ORQUESTACION-IA-PROPUESTA.md](ORQUESTACION-IA-PROPUESTA.md) §3 selecciona.
- **[V]** `llm-council` no se solapa con Superpowers: complementa la revisión.
- **[V]** `cavecrew-reviewer` se solapa con el revisor de `requesting-code-review`.
- **[V]** Las instrucciones de caveman prohíben narrar y anunciar las acciones, mientras que `using-superpowers` exige anunciar «Using [skill] to [purpose]». **[H]** Falta comprobar cómo resuelve cada host ese conflicto.
- **[V]** Fuera del alcance, pero relevante: `/root/.agents/skills` también contiene `test-driven-development`, `planning-and-task-breakdown` e `incremental-implementation`, que la política de colisiones de [ORQUESTACION-IA-PROPUESTA.md](ORQUESTACION-IA-PROPUESTA.md) §3 excluye como reemplazos de Superpowers.

## 6. Matriz de decisión

| Skill | Clasificación | Qué se reutiliza o qué falta |
|---|---|---|
| session-handoff | **ADAPTAR** | Plantilla base para `.ai/runs/<task-id>/handoff.md`; añadir task-id, `base_sha`, HEAD, host y modelo, lease, evidencia de tests y la regla de no reaplicar |
| parallel-worktrees | **ADAPTAR** | `git worktree list/add` para `jz-ai status` y el lease. Como skill de proceso gobierna `using-git-worktrees` |
| llm-council | **ADAPTAR** el patrón; **DESCARTAR** el script | Se aprovechan las tres fases, el anonimato y la persistencia literal. El script falla en lo esencial: sólo usa claves de API, un único proveedor, ignora el puerto, no tiene presupuesto y hace un `require` dinámico |
| skill-router | **ADAPTAR** el formato | Convención `[human]`/`[auto]` y «actualizar en el mismo cambio» para `catalog.yaml`. El contenido se descarta |
| agent-teams | **ADAPTAR** los conceptos | Estados y dependencias de tareas, aprobación del plan y tope de 3 a 5 escritores. El runtime es exclusivo de Claude Code |
| cavecrew | **REQUIERE PRUEBA** | Los contratos de salida sirven como formato de `reviews/*.md` (redactados en prosa normal). En OpenCode hay que verificar permisos efectivos y modelo |
| caveman | **REQUIERE PRUEBA** | Piloto E de [ORQUESTACION-IA-PROPUESTA.md](ORQUESTACION-IA-PROPUESTA.md) §8. Desactivado por defecto en tareas de `jz-ai`; unificar versiones antes de cualquier piloto |
| batch-orchestration | **DESCARTAR** por ahora | Sin implementación y sin aplicación en Fase 0. Reevaluar para codemods mecánicos |
| orchestrate | **DESCARTAR** | Referencias rotas y conflicto de autoridad con Superpowers |

Ninguna skill auditada puede **REUTILIZARSE** tal cual como componente de `jz-ai`. Sí puede reutilizarse `/root/.agents/.skill-lock.json` como fuente de datos para el inventario.

## 7. Observaciones arquitectónicas

1. **Un `lease.json` no es por sí mismo un bloqueo atómico.**
   - Leer el archivo, comprobar que no existe y luego escribirlo deja una carrera entre dos ejecutores.
   - El lease debe crearse de forma exclusiva: `open` con `O_CREAT|O_EXCL`, `mkdir` atómico de un directorio de bloqueo, o `flock` sobre un descriptor que se mantiene abierto.
   - Debe registrar dueño (host, PID, task-id), `base_sha` y expiración.
   - Hace falta un procedimiento explícito para recuperar bloqueos huérfanos.
   - Antes de cualquier escritura hay que verificar que HEAD coincide con `base_sha`.
   - Un worktree no es una sandbox ([ORQUESTACION-IA-PROPUESTA.md](ORQUESTACION-IA-PROPUESTA.md) §5).
2. **El efecto de `CAVEMAN_DEFAULT_MODE=off` debe verificarse frente a las instrucciones globales.**
   - La variable controla el flag del plugin de OpenCode (`caveman-config.cjs:90-93`), pero no elimina el texto global de `~/.config/opencode/AGENTS.md:1-17`.
   - En Claude Code, el hook `SessionStart` y la skill de usuario duplicada son vías de inyección independientes.
   - Apagar el flag no garantiza que el modelo deje de recibir instrucciones de caveman. `jz-ai` debe registrar el estado efectivo, no el que supone.
3. **El primer consejo multimodelo será un piloto simple y manual antes de automatizar las tres fases.**
   - Se enviará la misma consulta a los tres ejecutores (Claude Code, OpenCode/OpenAI y OpenCode/Copilot), cada uno con su sesión autenticada. Se guardarán las respuestas de forma literal y la síntesis la hará una persona.
   - El ranking anónimo, el presidente, la agregación de votos y el presupuesto sólo se automatizarán después de evaluar ese piloto. Los defectos documentados en §2.7 no deben replicarse.
4. Las instrucciones escritas en una skill o en un agente (por ejemplo, «No `Bash` available») no son barreras de permisos, y menos ejecutando como root. Las restricciones tienen que expresarse en la configuración del host y verificarse ([AI-BOOTSTRAP-DEBIAN.md](AI-BOOTSTRAP-DEBIAN.md)).
5. Que exista una skill no prueba que el host la cargue. «Duplicado por nombre» no implica copia de contenido, y «contenido distinto» no implica que el host cargue ambas versiones.

## 8. Responsabilidades y arquitectura mínima propuesta

### 8.1 Responsabilidades

- **Superpowers:** única autoridad de proceso (planificación, TDD, revisión y verificación).
- **Hosts (Claude Code y OpenCode en sus dos identidades):** ejecutan el trabajo y lanzan subagentes nativos, con permisos declarados en la configuración de cada host.
- **`jz-ai`:** plano de control sin LLM propio. Se encarga de:
  - sobre de tarea y lease;
  - despacho;
  - recolección de evidencia;
  - handoff;
  - revisión cruzada entre proveedores;
  - consejo;
  - inventario de skills.
- **Skills complementarias:** aportan sólo checklists y formatos, como la plantilla de handoff o los contratos de salida de cavecrew.
- **Caveman:** opcional. Queda fuera de los artefactos persistidos, de las revisiones de seguridad y de los documentos.

### 8.2 Qué habrá que construir

1. Sobre de tarea (`task.json`) y lease atómico por worktree entre hosts. Los bloqueos de agent-teams sólo funcionan dentro de Claude Code.
2. Adaptadores por host que usen las sesiones autenticadas existentes en lugar de claves de API:
   - Claude Code en modo no interactivo [H];
   - `opencode run --agent … -m <provider/model>`, ya validado por el operador en [AI-BOOTSTRAP-DEBIAN.md](AI-BOOTSTRAP-DEBIAN.md).
3. Revisión cruzada entre proveedores y un consejo que use los ejecutores, no APIs directas.
4. Inventario de skills por host con realpath, hash y detección de duplicados con contenido distinto.
5. Control y registro del modo caveman efectivo por proceso.
6. Handoff y resume sin reaplicar escrituras.

### 8.3 Arquitectura mínima

```text
.ai/
├─ skills/catalog.yaml      # origen, hash (de .skill-lock.json), host, fase, colisiones, [human|auto]
├─ roles/                   # rol lógico -> wrapper por host (.claude/agents, .opencode/agents)
└─ runs/<task-id>/
   ├─ task.json             # sobre de tarea, sin secretos
   ├─ lease/                # bloqueo exclusivo (mkdir atómico u O_EXCL) + owner.json
   ├─ status.json           # estado + modo caveman efectivo
   ├─ handoff.md            # plantilla derivada de session-handoff
   ├─ checks.json
   └─ reviews/<host>.md     # formato tipo cavecrew-reviewer, en prosa normal

jz-ai doctor | skills | status | dispatch | review | council | handoff | resume
        └─ adaptadores: claude | opencode-openai | opencode-copilot
```

Estos comandos siguen siendo un **contrato futuro**, como establece [ORQUESTACION-IA-PROPUESTA.md](ORQUESTACION-IA-PROPUESTA.md) §5. Este documento no los implementa.

## 9. Hipótesis pendientes de prueba

| # | Hipótesis | Prueba propuesta (no ejecutada) |
|---|---|---|
| H1 | OpenCode 1.17.18 descubre también `~/.agents/skills` y/o `~/.claude/skills`, y con ello duplicados de `caveman` y `cavecrew` con contenido distinto | Listar skills desde una sesión de OpenCode e identificar la ruta de origen de cada duplicado |
| H2 | Los agentes cavecrew de OpenCode, sin `tools:`, heredan todas las herramientas, incluido Bash | `opencode agent list` e inspección de los permisos efectivos en modo plan |
| H3 | `model: haiku` no resuelve en OpenCode, o resuelve a un modelo inesperado | Invocar el agente en modo plan y registrar el ID de modelo efectivo |
| H4 | `CAVEMAN_DEFAULT_MODE=off` desactiva el plugin, pero `AGENTS.md` global sigue inyectando las reglas | Sesión con la variable definida; observar el estilo y el flag |
| H5 | Claude Code admite ejecución no interactiva con la sesión de suscripción, sin clave de API | Smoke test equivalente al de OpenCode en modo plan |
| H6 | Caveman y el anuncio de skills de Superpowers entran en conflicto | Invocar `brainstorming` con caveman activo en ambos hosts |
| H7 | Las sesiones posteriores se unen automáticamente como teammates (`agent-teams` L18) | Consultar la documentación oficial y, si procede, probar en un entorno aislado |
| H8 | `/batch` existe en Claude Code 2.1.296 | Comprobar la lista de comandos disponibles |

Smoke tests ya registrados por el operador en [AI-BOOTSTRAP-DEBIAN.md](AI-BOOTSTRAP-DEBIAN.md): OpenCode responde con `openai/gpt-5.6-sol` y con `github-copilot/claude-sonnet-4.6`, y Superpowers carga `brainstorming` en OpenCode. Falta confirmar la carga funcional de Superpowers en Claude Code.

## 10. Decisiones pendientes para el responsable

1. Si se unifican las versiones de caveman y cuál es la canónica, o si se desactiva en OpenCode (`AGENTS.md` global) mientras dure el piloto de `jz-ai`.
2. Si se fija Superpowers en OpenCode a un commit concreto, en lugar de `git+https` sin ref.
3. Si se retiran de los catálogos activos las skills clasificadas como DESCARTAR (`orchestrate` y, por ahora, `batch-orchestration`) o las que compiten con Superpowers. No se borra nada sin una decisión explícita.
4. La ubicación y el lenguaje de `jz-ai` (ADR) antes de su primer incremento.
5. Si se usan claves de API para algún consejo. La recomendación es no hacerlo y usar los ejecutores autenticados.
