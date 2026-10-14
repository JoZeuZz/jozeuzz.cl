# Propuesta de orquestación multiagente y skills — jozeuzz.cl
> Estado: **PROVISIONAL / Fase 0**. Fecha 2026-10-13. Relacionado con [Issue #5](https://github.com/JoZeuZz/jozeuzz.cl/issues/5). No es una instalación, configuración habilitada ni autorización de despliegue.

## 1. Intención de producto
Tres ejecutores, cada uno capaz de delegar en subagentes, colaboran para desarrollar jozeuzz.cl:
1. **Claude Code** (Claude Pro) — primario para arquitectura, planificación y ejecución compleja.
2. **OpenCode / OpenAI** (cuenta ChatGPT conectada) — implementación complementaria, validación y segundo escritor cuando la tarea lo amerite.
3. **OpenCode / GitHub Copilot** — tercer ejecutor, revisión y especialidades; hoy se conoce Sonnet 4.6 disponible en el catálogo, la disponibilidad efectiva debe probarse.

Los ejecutores 2 y 3 comparten aplicación anfitriona OpenCode, pero tienen identidades lógicas, modelo/proveedor y sesiones separados. **No equivalen a tres instalaciones independientes**. Se admiten escritores concurrentes *sólo sobre worktrees/tareas/archivos disjuntos*.

## 2. Arquitectura lógica
```text
Humano / Issue / ADR / criterios de aceptación
                |
         jz-ai (control plane)
         ├─ Task envelope y enrutamiento
         ├─ Skill policy/catalog y compatibilidad
         ├─ Writer lease por worktree
         ├─ Run log / tests / PR / handoff
         └─ Quota/error failover sin replay automático
                |
   +------------+-------------+
   |            |             |
Claude Code  OpenCode(OpenAI) OpenCode(Copilot)
   |            |             |
Subagentes   Subagentes      Subagentes
(especial.)  (especial.)     (especial.)
   +------------+-------------+
                |
     PRs / CI / revisiones cruzadas
                |
     Humano aprueba merge y producción
```
**jz-ai no es un cuarto LLM**: es un conjunto pequeño y auditable de comandos/scripts para iniciar/continuar herramientas, reunir evidencias y hacer cumplir límites. La deliberación principal ocurre en los tres ejecutores y sus subagentes.

## 3. Metodología y selección de skills

### Base: Superpowers
Usar Superpowers de `obra/superpowers` como **única autoridad de proceso** para:
`brainstorming` → `using-git-worktrees` → `writing-plans` → `subagent-driven-development` / `executing-plans` → `requesting-code-review` → `verification-before-completion` → `finishing-a-development-branch`. Para fallos, `systematic-debugging`; para código, `test-driven-development`.

Instalar Superpowers de forma nativa *en Claude Code y OpenCode por separado* con instrucciones oficiales por versión. No duplicarlo además copiando skills en directorios del proyecto. La integración V1 y V2 de OpenCode cambia: para OpenCode 1.x se usa clave `plugin` (singular), para 2.0.4+ se usa `plugins` (plural). Registrar versión y commit/tag exactos probados.

### Complementarias seleccionadas (no instalar paquetes completos a ciegas)
| Necesidad | Origen y skill | Fase de activación | Rol preferente |
|---|---|---|---|
| Terminología, glosario, ADR | mattpocock/skills — `domain-modeling` | Discovery/diseño | Architect/domain |
| Diseño modular y trade-offs | mattpocock/skills — `codebase-design` | Diseño/refactor | Architect |
| Investigación con evidencia | mattpocock/skills — `research` | Investigación | Research |
| Handoff entre modelos | mattpocock/skills — `handoff` | Interrupción/failover | Orchestrator |
| UX, componentes y accesibilidad | addyosmani/agent-skills — `frontend-ui-engineering` | Frontend | Frontend |
| Permisos, privacidad y amenazas | addyosmani/agent-skills — `security-and-hardening` | Backend/PR | Security |
| Rendimiento y medición | addyosmani/agent-skills — `performance-optimization` | Optimización | Performance |
| CI/CD reproducible | addyosmani/agent-skills — `ci-cd-and-automation` | Infraestructura | DevOps |
| Prueba de navegador | addyosmani/agent-skills — `browser-testing-with-devtools` | QA E2E | QA |
| Instrumentación | addyosmani/agent-skills — `observability-and-instrumentation` | Operación | DevOps |

**Política de colisiones:** si dos skills cubren la misma fase, la de Superpowers gobierna proceso; la complementaria sólo aporta checklist o técnica específica. No instalar `implement`, `tdd`, `spec-driven-development`, `planning-and-task-breakdown` y comandos homónimos como reemplazos de Superpowers sin una excepción documentada. Evitar invocar todas en cada tarea.

**Ruteo de skills:** catálogo declarativo `.ai/skills/catalog.yaml` previsto (nombre, origen, ref/commit SHA, licencia, tipo, triggers, fase, host, prioridad, colisiones, riesgo, archivos adicionales). Un router reducido mediante `AGENTS.md` y/o `.claude/skills/jz-skill-router/SKILL.md` selecciona las habilidades necesarias por tipo de tarea, cargando su contenido *bajo demanda*. No montar otra metodología global. Preferir `.claude/skills/<nombre>/SKILL.md` para complementarias porque Claude y OpenCode lo detectan; no duplicar también en `.opencode/skills`. Verificar descubrimiento real desde cada ejecutor. Algunas skills de Addy requieren referencias compartidas en `references/`: instalarlas con su material asociado y comprobar enlaces.

**Proveniencia:** no ejecutar instalación automática desde HEAD/movible en tareas sensibles. Revisar código de hooks, licencias, scripts y red; fijar tag/commit y suma de archivos críticos, registrar actualizaciones por PR y ejecutar smoke test. Las skills son instrucciones confiadas al agente, no simples textos inocuos.

## 4. Subagentes y ruteo de modelos

| Subagente lógico | Rol | Modelo/efuerzo: criterio, no ID definitivo |
|---|---|---|
| `jz-architect` | arquitectura, decisiones, dependencias, ADR | razonamiento alto, Claude Opus u OpenAI profundo según proveedor |
| `jz-domain` | entidades, reglas de negocio, estados, invariantes | razonamiento medio/alto |
| `jz-frontend` | UI, SEO, accesibilidad, UX, performance | modelo fuerte de código |
| `jz-backend` | permisos, Payload, BD, migraciones y APIs | modelo fuerte de código |
| `jz-security` | revisión independiente de autenticación, filtración de PII y pruebas negativas | razonamiento alto, sin escritura |
| `jz-qa` | casos, tests, ejecución, diagnósticos verificables | modelo de código / rápido para triage |
| `jz-devops` | Docker, Coolify, CI, backup y restauración | modelo fuerte de código, aprobación de operaciones sensibles |
| `jz-research` | búsqueda acotada, documentación oficial y compatibilidad | modelo rápido cuando sea suficiente |

Cada ejecutor admite las mismas **responsabilidades lógicas**, pero subagentes del propio host:
- Claude Code: `.claude/agents/*.md`; modelos por alias `opus`, `sonnet`, `haiku` o identificador probado; permisos de tools y `model` declarados. No suponer que todas las delegaciones mantienen el mismo modelo.
- OpenCode 1.x: `.opencode/agents/*.md` o `opencode.json`; `mode: subagent`, `model`, `permission` por rol según documentación que corresponda a versión local. Dos ejecutores con el mismo conjunto de perfiles, cambiando proveedor/modelo al lanzar sesión; se deben probar los permisos efectivos.
- Una fuente común futura `.ai/roles/` puede generar wrappers por host; **no usar archivos YAML incompatibles como si se interpretaran igual**. Validar parsers antes de automatizar.

Estrategia de modelos: seleccionar *según rol y verificación de disponibilidad, costo relativo, latencia y resultados*, no sólo por la etiqueta de versión. El catálogo `opencode models` no demuestra cuota real; ejecutar smoke tests con ambos proveedores. No fijar IDs definitivos hasta ese inventario.

## 5. Coordinación dinámica, revisión y seguridad

### Tarea como contrato
Cada ejecución recibe `task-id`, Issue/PR, objetivo, alcance, criterios, archivos permitidos, `base_sha`, modelo/host, presupuesto/cuotas opcionales y skills enrutadas. Devuelve cambios, commit/PR, resultados de pruebas, hallazgos, incertidumbres y handoff.

### Trabajo simultáneo
- Un escritor por worktree y rama. Los agentes pueden trabajar a la vez si sus tareas/archivos están separados.
- Revisores pueden operar a la vez en lectura sobre snapshots/commits estables; no editar el worktree del implementador.
- Para cambios solapados, serializar la edición y pasar un contrato explícito; fusionar mediante PR/CI y revisión.
- Ejecutar al menos una revisión cruzada por **proveedor distinto** en tareas relevantes: A implementa → B revisa → A corrige → C revisa aspectos críticos si corresponde → humano aprueba.
- La revisión de seguridad y la de funcionamiento deben contener evidencia independiente, no "aprobación por mayoría" de modelos.
- Los agentes no tienen permiso de push directo a `main`, deploy productivo, DNS, migraciones destructivas, lectura de secretos ajenos o infraestructura sin autorización.
- Claude Code/OpenCode no deben ejecutarse como root. En Debian crear/usar un usuario de desarrollo y mantener permisos mínimos; pertenecer al grupo Docker equivale prácticamente a privilegios root.

### Handoff y continuidad
Proponer artefactos localmente en `.ai/runs/<task-id>/` (ignorar logs o datos sensibles en Git) con:
`task.json` (sin secretos), `status.json`, `handoff.md`, `checks.json` y `reviews/*.md`.
Compartir en Git sólo la evidencia apta para revisión (PR, commits, logs redactados y handoff resumido).
Al fallar cuota o proveedor: pausar, verificar `git status`, rama, HEAD, test status y lock; registrar eventos; recién entonces transferir a otro ejecutor. **No repetir automáticamente una instrucción de escritura ni sobrescribir cambios existentes.**

### jz-ai mínimo — interfaz propuesta
```text
jz-ai doctor              # verifica herramientas, versiones, autenticación sin revelar secretos
jz-ai agents              # ejecutores y modelos efectivamente probados
jz-ai skills              # skills instaladas, origen, SHA y host que las reconoce
jz-ai status              # worktrees, tareas, locks y handoffs
jz-ai dispatch <task-id> --to claude|openai|copilot
jz-ai review <task-id> --with claude|openai|copilot
jz-ai handoff <task-id>
jz-ai resume <task-id> --to claude|openai|copilot
jz-ai bench <task-id>     # comparación controlada de calidad, costo/uso y latencia
```
Estos comandos son **contrato futuro, no ejecutables que ya existan**. Primero crear scripts mínimos con tests y dry-run; después automatizar switching/failover. Logs sin transcripciones privadas ni prompts con tokens.

## 6. Caveman: evaluación separada
Caveman agrupa (a) skills de estilo de respuesta, (b) transformaciones de tool results/contexto mediante hooks o proxy, (c) métricas y (d) selección de modelos opcional. Sólo (b) puede reducir significativamente tokens de entrada; instalar `/caveman` no demuestra esa reducción.

**Introducción escalonada:**
1. Confirmar que las sesiones directas de Claude Code y OpenCode funcionan, con cuota y OAuth intactos.
2. Instalar tras revisión de fuente/permiso en cuenta NO root y medir modo **off/record** (sin transformación) en tarea reproducible.
3. Probar **compress** por host/proveedor y subagentes: exactitud de logs, salida de tests, integridad de snippets de código, errores, rutas y recuperación de fuente original.
4. Comparar tareas idénticas con y sin Caveman; medir tokens de entrada/salida reales, duración, fallos, pruebas y costo cuando el proveedor reporta costo real.
5. No activar Auto model routing de Caveman al mismo tiempo que el enrutador de modelos de jz-ai; sólo un propietario de routing. Evitar telemetría/servicios cloud adicionales sin revisar privacidad.
6. Mantener `off` para archivos legales, comandos destructivos, reportes de seguridad y migraciones críticas o cualquier caso en que una transformación con pérdida pueda omitir información relevante.
7. Volver al modo nativo del agente si el proxy altera OAuth, Remote Control, plugins, MCP, streaming o herramientas.

El propio repositorio advierte que proxy local escucha loopback, que los handles de recuperación requieren almacenamiento local protegido y que su modo Auto puede enviar cierto contexto a Caveman Cloud. Las cifras de ahorro publicadas son resultados de benchmarks específicos, **no garantías transferibles a nuestro entorno**.

## 7. Compatibilidad inicial a verificar
Entorno aportado por el usuario: Debian 13.7, x86_64, Git 2.47.3, Node 20.19.2, npm 9.2.0, Docker 29.9.0, Compose 5.6.0, Claude Code 2.1.296, OpenCode 1.17.18. Actualmente sesiones ejecutadas como **root**; solucionar antes de instalar hooks o permitir edición autónoma.

Superpowers: OpenCode 1.x usa la clave `plugin`, no `plugins`. La guía V2 es para 2.0.4+. Claude Code instala Superpowers en plugin marketplace. Comprobar si existe Superpowers previo en OpenCode y no instalar duplicados. Recordar que OpenCode 1.17.18 puede tener diferencias respecto de documentación para 1.18+; ejecutar pruebas de descubrimiento.

Caveman CLI indica Node >=22.13; antes de usarlo preparar Node 24 LTS compatible con la POC en perfil de usuario, sin sustituir globalmente runtimes de otros proyectos.

## 8. Experimento de aceptación (antes de escalar)
**Piloto A:** una tarea de especificación sin código; Claude arquitecto, OpenAI crítico de diseño, Copilot revisor de riesgos. Debe existir un solo documento final con disensos trazables y aprobación humana.

**Piloto B:** implementar una función pura pequeña con tests en un worktree; Claude Code escritor + OpenCode/OpenAI revisor + OpenCode/Copilot segundo revisor. Invertir roles en la siguiente tarea; verificar que cualquiera puede ser escritor cuando el contrato se lo permita.

**Piloto C:** dos tareas verdaderamente independientes en dos worktrees con escritores distintos; bloquear una asignación conflictiva al mismo worktree. No lanzar proceso si fallan locks o no existe handoff seguro.

**Piloto D:** simular cuota/error de uno de los ejecutores sin reaplicar cambios, generar handoff y continuar con otro. Verificar HEAD/diff y tests.

**Piloto E:** Caveman off → record → compress en cada host/proveedor; criterio de aceptación: ninguna degradación observable en tests y revisión humana del resultado, recuperación correcta de originales y ahorro medido. Volver a off ante fallo.

## 9. Fases propuestas
- **0A documentación:** incorporar esta propuesta a PR #1; revisar contradicciones C1–C9 señaladas por Claude en docs.
- **0B seguridad local:** abandonar root, inventariar plugins actuales, corregir Node por usuario, preparar worktrees.
- **0C instalación controlada:** Superpowers por host, skill catalogue complementario compartido, subagentes y comprobación de permisos/modelos.
- **0D piloto jz-ai mínimo:** status, dispatch, review, handoff y bloqueo; gates A–E.
- **0E arquitectura del producto:** POC Next.js/Payload/PostgreSQL, con tres ejecutores colaborando sobre trabajo controlado.
- **Fase 1:** scaffold limpio, CI, seguridad, UX y funcionalidades.
No fusionar PR #1 ni habilitar la POC de producto como producción hasta aprobar especificación y ADR.

## 10. Fuentes inspeccionadas (2026-10-13)
- Superpowers: https://github.com/obra/superpowers/tree/bb92a77741419a4ab5f06e711a283343f1ada0c3
- Guía OpenCode de Superpowers: https://github.com/obra/superpowers/blob/bb92a77741419a4ab5f06e711a283343f1ada0c3/.opencode/INSTALL.md
- Matt Pocock Skills: https://github.com/mattpocock/skills/tree/49dd158d1076134a641b33efb035946536778336
- Addy Osmani Agent Skills: https://github.com/addyosmani/agent-skills/tree/aeac41d4d005999432bb7312f7ff06383a91d59d
- Guía OpenCode de Addy: https://github.com/addyosmani/agent-skills/blob/aeac41d4d005999432bb7312f7ff06383a91d59d/docs/opencode-setup.md
- Caveman: https://github.com/JuliusBrussee/caveman/tree/d262ab3882952a59312ff3537cd86d894523c5ab
- Caveman arquitectura de wrapping: https://github.com/JuliusBrussee/caveman/blob/d262ab3882952a59312ff3537cd86d894523c5ab/docs/technical/agent-wrapping.md
- Caveman seguridad: https://github.com/JuliusBrussee/caveman/blob/d262ab3882952a59312ff3537cd86d894523c5ab/docs/technical/security-and-privacy.md
- OpenCode: https://opencode.ai/docs/agents/ , https://opencode.ai/docs/skills/
- Claude Code: https://code.claude.com/docs/en/sub-agents
