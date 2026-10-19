# Continuidad de jozeuzz.cl y jz-ai — 19-10-2026

> **Documento de recuperación, no evidencia de publicación del código local.**
> Se redacta a partir de los informes de trabajo y revisiones comunicados hasta el 17-10-2026 y de las referencias comprobadas directamente en GitHub el 19-10-2026. Las tareas de POC-3 posteriores al último informe **no están verificadas**. Esta rama es un respaldo informativo y no debe fusionarse automáticamente.
>
> **Seguridad:** no incluir aquí claves, sesiones, datos de clientes, ficheros de entorno, direcciones privadas ni registros operativos sensibles.

## 1. Propósito y prioridad

El producto principal es **jozeuzz.cl**, un sitio profesional propio que combina dos experiencias separadas, aunque comparten identidad e infraestructura:

- **Portafolio profesional:** presentación como ingeniero civil informático, trayectoria, experiencia y formación verificables, proyectos/casos de estudio publicables, competencias, enlaces y contacto profesional.
- **Servicios técnicos informáticos:** catálogo editable y una forma segura de registrar solicitudes, recibir confirmación y administrarlas internamente.

El sitio profesional **no debe depender** de la gestión de reparaciones. No reducirlo a una landing sin contenido y tampoco construir un ERP antes de validar el MVP.

### MVP v0.1: resultado exigible

1. Páginas públicas responsive: inicio, perfil/experiencia, proyectos con detalle, servicios y contacto, con contenido real autorizado.
2. Administración autenticada para perfil, proyectos, servicios, contenidos y medios; borradores y recursos privados inaccesibles al anónimo.
3. Formulario público de solicitud con validación de servidor, prevención de abuso/duplicados, protección de datos y confirmación; panel privado de solicitudes y transiciones autorizadas.
4. SEO, accesibilidad, pruebas de autorización negativas, integración/E2E, CI, copias de seguridad y restauración comprobable antes de producción.

**Fuera de v0.1:** cuentas de clientes, pagos, reservas, órdenes complejas de reparación, inventario, facturación, chat de IA, sistemas de colas o microservicios injustificados.

## 2. Arquitectura y decisión pendiente

La **candidata A**, estudiada en las pruebas de concepto, es Next.js 16 + React 19 + TypeScript + Payload 3 + PostgreSQL 18. Se prefiere un monolito modular con administración integrada, pero **ADR-0001 todavía debe resolverse con evidencia**. Comparar de manera acotada con candidata B (Astro + administración/backend propio o separado); evitar otra ronda abierta de exploración.

Los dominios se separan por responsabilidad: sitio público, contenidos/medios, catálogo de servicios, intake, operaciones/solicitudes y control de acceso. La POC no es todavía el MVP ni un despliegue productivo.

## 3. Avances reportados del producto

### POC-1a — pruebas iniciales de candidata A

Informada como completada localmente: contenido publicable, roles y denegaciones de acceso, compatibilidad, pruebas de interfaz y medios. Los informes de cierre registraron baterías de contrato y E2E satisfactorias. La rama de trabajo no consta en GitHub.

### POC-1b — solicitudes protegidas e historial

Informada como completada localmente; último cierre conocido `d0929b9`. Controles de transiciones en servidor, eventos de solicitudes, reglas de privacidad, transacciones y migraciones. Resultados declarados: 72/72 Vitest; 43/43 contrato base; 44/44 regresión combinada; 3/3 E2E; 15/15 comprobaciones de privacidad HTTP; typecheck/build satisfactorios. Estas son **evidencias comunicadas de ejecuciones locales**, no pruebas reejecutadas en GitHub.

### POC-3 — intake público seguro

Autorización `H0A-16c` y decisiones `P3-01` a `P3-10` registradas localmente. Rama local `poc/candidata-a-3`. Avance conocido según el último registro de OpenCode:

| Unidad | Estado más recientemente comunicado |
|---|---|
| U0, U1, U0b | Línea base, diseño y guardas de bases completados. |
| U2 | Validación de solicitudes, resolución de servicio activo y hook; pruebas Docker pendientes. |
| U3 | Configuración de seguridad, secretos, CSRF, origen e IP; revisiones corregidas. |
| U4 | Esquema y migraciones para intake; ejecución real en BD de prueba pendiente. |
| U5a | Proxy/TLS y topología de red; verificación Docker pendiente. |
| U5b | Formulario y ruta de recepción; verificación HTTP/transaccional pendiente. |
| U6 | Primera implementación de límites atómicos y revisión QA/seguridad ejecutadas; resultado y cierre no confirmados al interrumpirse la sesión. |
| U7 | Protección de privacidad y sanitización de logs pendiente en el último corte. |
| U8 | Accesibilidad, pruebas E2E del flujo nuevo pendientes en el último corte. |
| U9 | Reemplazo de intake sintético, regresión integral y evidencia final pendientes. |
| U10 | Revisión de aceptación final pendiente. |

**No declarar POC-3 terminada** hasta recopilar los resultados reales de U6–U10, ejecutar la integración Docker que falte y demostrar los 12 casos de intake más las regresiones relevantes. Si hubo avances tras el último corte, recuperarlos de Git antes de actualizar esta matriz.

## 4. Evolución de jz-ai y herramientas de agentes

Son dos capas complementarias, no confundirlas:

- **`tools/jz-ai/`**, CLI de diagnóstico/inventario local nacida en el M0: lectura e inspección de skills/procedencia, sin funciones de ejecución descontrolada. Un conjunto inicial de tareas fue recuperado y probado después de un incidente previo; la rama remota `feat/jz-ai-m0-recuperado` contiene parte del código. La revisión posterior y el cierre M0 local **no están totalmente publicados**.
- **`.jz/` y perfiles `jz-*`**, ejecución supervisada usada para las POC: orquestación con Claude Code y OpenCode, roles especializados, políticas, sandbox `jz-run`, lock de escritor, evidencias, checkpoints y relevos. Las revisiones y pruebas de controles fueron informadas localmente, pero su rama `chore/jz-agents` y la integración en POC-3 **no constan en GitHub**.

Regla estructural: **Superpowers gobierna el proceso; jz-ai organiza quién trabaja, con qué límites y cómo se recupera; el producto es jozeuzz.cl.** Nunca convertir el desarrollo del sistema de agentes en el camino crítico del MVP. Un escritor por worktree; revisores en solo lectura; relevos sin repetir ciegamente; sin bypass de permisos para operar Docker u otros proyectos.

El diseño de una VM ejecutora Docker aislada está documentado, pero su implementación se **aplaza explícitamente**. Mientras tanto, las pruebas Docker autorizadas las ejecuta el responsable humano mediante los comandos aislados del proyecto y bases de prueba explícitas.

## 5. Estado remoto comprobado el 19-10-2026

Repositorio: https://github.com/JoZeuZz/jozeuzz.cl (público).

| Rama remota | Commit comprobado |
|---|---|
| `main` | `4946aa42618104bdf4fbc4df7c0cebf8b28b23ba` |
| `docs/fase-0-definicion` | `e763b95bf5ac66ea29d35d2f4a9547a8fca6b8cb` |
| `feat/jz-ai-m0-recuperado` | `3efb11454b999b947424fdafd028d0937eeeb0b4` |

La PR #1 de Fase 0 sigue abierta como **draft**, sin fusionar. Los commits locales `d0929b9` (POC-1b), `2d5532c` (POC-3) y `a3348cc` (jz-ai M0 posterior) no fueron encontrados en GitHub. No están publicadas las ramas `poc/candidata-a-3` ni `chore/jz-agents`. El repositorio principal no representa el estado real del desarrollo local.

**Advertencia:** crear este archivo en GitHub NO sube esos commits ni recupera bases de datos, logs o archivos no rastreados del servidor. El único respaldo completo posible requerirá acceso a los objetos Git originales o a una copia de ellos.

## 6. Próximo orden operativo, sin desviaciones

1. **Recuperar acceso y respaldar inmediatamente las referencias originales**: inspeccionar worktrees y cambios sin confirmar; revisar secretos/archivos ignorados; publicar ramas `poc/candidata-a-3`, `chore/jz-agents` y la versión local de `feat/jz-ai-m0-recuperado` mediante push normales sin force; verificar SHAs remotos. No tocar `main` ni fusionar PR.
2. **Cerrar POC-3**: retomar U6 sin duplicar trabajo, terminar U7–U10 y ejecutar controles Docker en bases sintéticas aisladas. Producir informe de aceptación honesto con bloqueos si los hubiera.
3. **Tomar ADR-0001 y scaffold definitivo** tras la evidencia; conservar la candidata validada si satisface los criterios, sin nuevas semanas de exploración.
4. **Entregar MVP público real**: UX/identidad, portafolio editable con proyectos publicados, catálogo, formulario, administración, SEO/accesibilidad.
5. **Calidad y publicación**: CI, seguridad, pruebas E2E, política de privacidad/retención, hosting, backups/restauración y despliegue reproducible. Solo después abrir v0.2 de órdenes/equipos.

## 7. Reglas anticrisis

- Priorizar `commit` local **y publicación periódica de ramas de desarrollo** en GitHub; no mantener días de avance solo en disco. No publicar secretos, `.env`, logs privados, credenciales, archivos de clientes ni volcados de BD.
- Distinguir siempre `implementado`, `probado en ejecución`, `revisado estáticamente`, `pendiente` y `publicado en remoto`.
- Antes de cambiar de agente: HEAD, rama, árbol, lock, notas, pruebas y archivo siguiente. Al interrumpirse cuota, no repetir instrucciones de escritura sin revisar diff.
- Nada de `reset --hard`, `git clean`, `push --force`, merge, modificaciones a otros servicios o despliegue sin revisión y autorización.
- Limitar desarrollo auxiliar de agentes a defectos que **bloqueen realmente la entrega** del MVP.
- Una copia Git remota protege código confirmado; **no sustituye respaldos de datos, medios, configuraciones y cambios no confirmados**.

**Prioridad permanente:** la entrega verificable de jozeuzz.cl tiene precedencia sobre nuevas funcionalidades de jz-ai o una VM ejecutora.
