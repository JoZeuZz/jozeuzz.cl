# Modelo de colaboración humano–agentes
Estado: **Propuesta de orquestación**, no software ya implementado.

## Herramientas del desarrollador
- Claude Code (suscripción del usuario): ejecutor principal de tareas extensas, planificación y cambios estructurales.
- OpenCode con proveedores conectados a ChatGPT Plus y GitHub Copilot: alternativa/failover y revisión de enfoques.
- GitHub Copilot: segunda opinión puntual y asistencia acotada. La disponibilidad de modelos y cuotas debe consultarse en las herramientas, no suponerse.
- GitHub: fuente de verdad de código, issues, PRs, CI y ADR.

## Principio
Una tarea, un dueño de escritura por rama o worktree. Revisores no alteran el árbol de trabajo del ejecutor. No iniciar dos agentes que editen los mismos archivos. La aprobación final corresponde al humano.

## Roles lógicos (independientes del modelo)
- orchestrator: descompone el trabajo, prioriza y asigna.
- architect: registra alternativas, decisiones y contratos.
- frontend: páginas, contenido, UI y accesibilidad.
- backend: reglas de negocio, datos, API y migraciones.
- security-reviewer: amenazas, autorización, secretos, exposición, PII.
- qa: pruebas, reproducibilidad, regresiones.
- devops: CI, contenedores, migraciones y operación.
- docs-reviewer: documentación, README, ADR y coherencia.
Los roles son instrucciones especializadas; no es necesario ejecutarlos en paralelo ni pagar modelos distintos en cada etapa.

## Contrato de tarea
Cada tarea debe tener: contexto y archivos relevantes, objetivo, alcance/no-alcance, dependencias, plan, criterios de aceptación, pruebas esperadas y riesgo. Salida obligatoria: resumen, archivos cambiados, pruebas ejecutadas con resultados reales, decisiones, limitaciones y próximo paso.

## Reglas entre herramientas
- AGENTS.md será el documento canónico; CLAUDE.md remitirá a AGENTS.md para compatibilidad. Configuración específica se incorporará tras verificar sintaxis y soporte actual.
- No hacer replay ciego después de failover: verificar `git status`, rama, HEAD, PR, archivos, logs y resultados de CI; releer handoff.
- Nunca hacer push a main directamente durante implementación; usar rama y PR, salvo bootstrap explícito.
- Handoff versionado: objetivo, estado exacto, último commit, cambios pendientes, pruebas y riesgos.
- Roles que revisan seguridad no tienen permisos para editar por defecto.
- Prohibido introducir dependencias, servicios o integraciones sin evaluación y justificación.
- No persistir tokens, conversaciones privadas, credenciales ni datos reales de clientes en prompts, logs o commits.
- Agentes no despliegan producción, aplican migraciones irreversibles ni modifican DNS sin autorización humana explícita.

## Flujo estándar
Issue -> lectura de docs/ADR -> plan -> rama de feature -> implementación incremental -> lint/types/tests/build -> revisión de seguridad y dominio -> PR -> CI -> aprobación humana -> merge -> handoff si corresponde.

## Próxima fase para wf-ai
Evaluar reusar las ideas de `wf-ai` (locks, status, handoff y failover) como `jz-ai` opcional, pero no portar directamente dependencias ni configurar enrutamiento a modelos sin probar la autenticación/quotas reales. El CLI debe ser reemplazable y no contener información necesaria sólo en su memoria local.
