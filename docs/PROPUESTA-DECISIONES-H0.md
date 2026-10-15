# Propuesta de decisiones para H0 — jozeuzz.cl

> **Estado:** propuesta para discusión. **Ninguna decisión de este documento está aprobada** salvo las marcadas como «indicada por el responsable», que sólo falta registrar.
> **Fecha:** 2026-10-15. **Base:** `docs/ROADMAP-MVP.md` (`0e57214`), `docs/ANALISIS-INCONSISTENCIAS-ROADMAP-MVP.md` (`a433333`) y sus fuentes.
> **Uso previsto:** cuando el responsable responda, este archivo (o uno derivado) pasa a ser el registro de decisiones de H0 que pide el criterio 1 de la sección 6.3 del análisis.

Las referencias `I-xx` remiten al análisis de inconsistencias y las `D-xx` a la tabla de decisiones de stack del roadmap (sección 5). Este documento no elige ninguna de las 19 tecnologías pendientes.

**Estados de cada propuesta:**

- **Aprobación requerida:** bloquea H0-a y necesita la decisión del responsable.
- **Indicada por el responsable:** la dirección ya se dio el 2026-10-15; falta dejarla por escrito en las fuentes.
- **Diferible:** se puede decidir más tarde sin frenar las POC; aquí sólo se fija cuándo.

## 0. División de H0

**PH0-00 · H0 se divide en H0-a (técnico esencial) y H0-b (visual y contenido).** Aprobación requerida (I-21).

- **H0-a**, que bloquea las POC y el ADR: decisiones de dominio PH0-01 a PH0-06, aprobación documental (PH0-07 y PH0-08), independencia de jz-ai (PH0-09), autorización de las POC (PH0-12) y entorno provisional (PH0-13).
- **H0-b**, que bloquea H3 pero no H1 ni H2: wireframes revisados con los criterios de UX §6, dos o tres direcciones visuales con una elegida, y la lista de contenidos reales con su responsable.
- H1 depende sólo de H0-a. H0-b avanza en paralelo con las POC.

## 1. Alcance funcional y dominio

**PH0-01 · Estados de la Solicitud: `recibida`, `en_gestion` y `cerrada`, con motivo de cierre.** Aprobación requerida (I-09, I-10, I-11; propuesta P-A).

- El servidor asigna `recibida` al crear la solicitud, sea cual sea su origen.
- Transiciones válidas: `recibida → en_gestion`, `recibida → cerrada` y `en_gestion → cerrada`. Se validan en el servidor; cualquier otra se rechaza.
- `cerrada` exige `motivo_cierre` ∈ {`atendida`, `descartada`, `duplicada`, `spam`}. Los valores son provisionales.
- `cerrada` es terminal: no se reabre, y un nuevo contacto crea una solicitud nueva. Marca el inicio del plazo de retención.
- No hay transiciones automáticas (PROD:22) ni estados que impliquen reserva, presupuesto u orden (INV-10).
- **Pruebas que exige:** 3 transiciones válidas, 3 inválidas, además de las de sesión y permisos.
- **Para discutir:** si `en_gestion` basta o hace falta distinguir «esperando al cliente»; la propuesta lo deja para v0.2.

**PH0-02 · Observaciones privadas de administración.** Aprobación requerida (I-12 A).

- Un único campo de texto por solicitud (nombre provisional `observaciones_internas`), que sólo el administrador lee y edita.
- Nunca aparece en respuestas públicas, logs, trazas, sitemap ni mensajes de error, por ningún canal.
- El formulario advierte de que no se escriban credenciales ni contraseñas de equipos.
- Las notas con historial siguen en v0.2 (PROD:27).

**PH0-03 · Eventos de transición de sólo inserción.** Aprobación requerida (I-13 B, I-15 A).

- `EventoSolicitud` registra solicitud, estado anterior, estado nuevo, actor administrativo, fecha y `motivo_cierre` cuando corresponda. No lleva texto libre.
- Cada transición válida crea exactamente un evento, en la misma transacción que el cambio de estado.
- Ningún canal permite modificar ni borrar un evento.
- La creación de la solicitud no es un evento: queda en su fecha de creación.
- **Tensión a resolver:** la única excepción al «sólo inserción» sería el borrado por retención (PH0-16), que eliminaría en cascada los eventos de una solicitud cerrada. Lo ejecutaría un procedimiento documentado, no la API.

**PH0-04 · Un único usuario administrador.** Aprobación requerida (I-06 A). El alta y la recuperación del acceso siguen un procedimiento operativo documentado, sin interfaz de gestión de cuentas. Ese procedimiento forma parte de D-07 (riesgo R-12).

**PH0-05 · Sin avisos de nuevas solicitudes en el MVP.** Aprobación requerida (I-08 A). El administrador revisa la bandeja. Sale de los bloqueantes de H0 y aplaza D-19.

**PH0-06 · Métrica de publicación: «sin commit ni intervención técnica, con tiempo de propagación medido».** Aprobación requerida antes de fijar los criterios de POC-1 y POC-2 (I-01 B). Sustituye a «sin redespliegue», que penalizaba de antemano a la Candidata B.

**Diferibles (no bloquean H0-a):**

| Tema | Propuesta | Cuándo decidir |
|---|---|---|
| Vista previa obligatoria para cerrar F3 (C-04) | Sí, porque F3 la nombra y F3 es condición de terminado | Antes de H3 |
| Textos de servicios e indicador «destacado» (I-04) | Bloque editable de textos de servicios e indicador en Proyecto | Antes de H3 |
| Alcance de la auditoría básica (I-07) | Transiciones de solicitudes e inicios de sesión, sin PII | Antes de H2 |
| Filtros públicos (C-13) | *Should*, como dice RF-15 | Antes de H3 |
| Taxonomía de categorías (sección 3.1 del roadmap) | Pendiente de contenido real | Con H0-b |

## 2. Aprobación documental y desbloqueo de PR #1

**Hechos comprobados (2026-10-15):**

- La PR #1 está en borrador, con `docs/fase-0-definicion` contra `main`.
- Mezcla 5 documentos de producto (`PRODUCTO`, `ESPECIFICACION-FUNCIONAL`, `ARQUITECTURA`, `UX-ARQUITECTURA-INFORMACION`, `ROADMAP`) con 6 de instrucciones y herramientas de IA (`AGENTS.md`, `CLAUDE.md`, `AGENTES`, `AI-BOOTSTRAP-DEBIAN`, `AUDITORIA-SKILLS-LOCALES`, `ORQUESTACION-IA-PROPUESTA`). Esto confirma la inferencia de I-24.
- ORQ:158 impide fusionarla «hasta aprobar especificación y ADR», y el ADR necesita las fuentes aprobadas: es un ciclo.
- Detrás esperan otras dos ramas: la PR de jz-ai M0, que no se fusiona antes que la PR #1 (criterio 6 de su spec §15), y `docs/roadmap-mvp`, que parte de `docs/fase-0-definicion`.

**PH0-07 · Mecanismo de aprobación: registro de decisiones del responsable.** Aprobación requerida (I-24 B). Las decisiones de H0-a se aprueban en este registro, con fecha, commit y autoría del responsable, sin esperar a ninguna fusión. Así se rompe el ciclo.

**PH0-08 · Desbloqueo de la PR #1.** Aprobación requerida; hay que elegir una opción.

- **Opción A (recomendada): cerrar la Fase 0 con un commit y fusionar.** Un commit de cierre en `docs/fase-0-definicion`, autorizado de forma expresa porque ese worktree no se edita sin permiso, que haga tres cosas:
  1. Cambiar la línea de estado de cada documento: producto «aprobado como base, con pendientes enumerados»; `ARQUITECTURA.md` «hipótesis hasta ADR-0001»; documentos de IA «propuesta de herramientas, no vinculante para el carril del producto».
  2. Sustituir la condición de ORQ:158 por la independencia de PH0-09.
  3. Corregir RDM:18 (I-25).

  Después se fusiona la PR #1 y, a continuación, la del roadmap y la de M0.
- **Opción B: dividir la PR #1** en una PR de producto y otra de IA, como recomendaba I-24 A. Separa mejor las aprobaciones, pero obliga a rehacer ramas y a rebasar las dos PR dependientes.
- **Por qué cambia la recomendación respecto del análisis:** la opción A consigue la misma separación con las líneas de estado, sin reescribir historia.
- **Numeración de ADR:** `docs/adr/0001` queda reservado para el stack (ARQ:20). jz-ai M0 ya usa `0002`, así que no hay conflicto (I-25 A).

## 3. Independencia respecto de jz-ai y fases de orquestación

**PH0-09 · El carril del producto (H0 a H7) no depende de ORQ §9 (0A–0E), de jz-ai M1–M3, de Caveman ni de la actualización de Node.** Indicada por el responsable; falta el registro formal (I-23 A).

- La POC no requiere «tres ejecutores colaborando».
- Se mantiene sólo el control de seguridad de ORQ:97 para tareas autónomas (ver PH0-14).
- Quedan superados los pasajes 1 a 6 de la tabla 5.2 del análisis.

**PH0-10 · Modelo de trabajo del producto.** Indicada por el responsable el 2026-10-15.

- Claude Code y OpenCode actúan como orquestadores autónomos con los perfiles `jz-*` validados.
- Se aplica Superpowers con TDD.
- Hay un solo escritor por worktree.
- Se hacen commits por funcionalidad completa.
- Hay una revisión exhaustiva independiente por hito funcional, no por commit.
- La revisión cruzada por proveedor de ORQ:94 es opcional para el producto; la revisión humana es obligatoria.
- jz-ai M1–M3 no se amplía por ahora.

**PH0-11 · Disponibilidad de los perfiles `jz-*` en los worktrees del producto.** Aprobación requerida.

- **Situación:** los perfiles están en la rama `chore/jz-agents`, que todavía no está fusionada.
- **Propuesta:** las ramas de POC parten de `chore/jz-agents`, porque son desechables y así tienen los perfiles sin copiarlos. Antes de H2, `chore/jz-agents` se fusiona por su propia PR.
- **Límites conocidos** (`docs/AGENTES-JZ.md` de esa rama):
  - `jz-qa` es de sólo lectura y no ejecuta pruebas.
  - El orquestador de OpenCode necesita `deny` en las ejecuciones no interactivas.
  - El ejecutor aislado de pruebas sigue sin definir.

**Fuera de H0:** la comparación completa entre `gpt-5.6-sol` y `gpt-6.1-sol` (30 sesiones) queda como tarea posterior. Cuando H0-a esté resuelto se puede hacer una comparación reducida con E3 y E5. `gpt-5.6-sol` sigue como modelo predeterminado.

## 4. POC necesarias para arquitectura y stack

No se elige ninguna tecnología. Las POC producen la evidencia; el responsable decide en el ADR.

| POC | Pregunta | Decisiones que informa | Requisito previo |
|---|---|---|---|
| POC-1a: Candidata A, contenido | ¿Contenido publicable, medios privados y sesión de administrador con autorización en servidor por cada canal? | D-01, D-02, D-04, D-05 (medición del bundle), D-06 (control de acceso), D-07 (mecanismo), D-10, D-15 | PH0-06, PH0-12; matriz de versiones verificada |
| POC-1b: Candidata A, reglas de negocio | ¿Puede el CMS imponer las transiciones de PH0-01, ocultar el campo de PH0-02 por cada canal y garantizar el evento de sólo inserción de PH0-03? | D-02, D-03 (constraints y transacciones) | PH0-01 a PH0-03 |
| POC-3: intake seguro | Campos administrativos rechazados, antiabuso, antiduplicados, servicio desactivado y logs sin PII | D-08, D-09, D-16 (logs) | POC-1b en el mismo stack |
| POC-2 reducida: Candidata B | ¿Aporta B ventajas públicas medibles frente a tener dos superficies? | D-01, D-04 | Las dos páginas y los datos sintéticos de POC-1a; PH0-06 (I-20 A) |
| POC-4: despliegue | ¿Despliegue reproducible, backup cifrado, restauración en limpio y rollback? | D-03, D-11, D-12 (sólo staging), D-17 | PH0-13 (entorno y destino de backup provisionales); artefacto de POC-1 y POC-3 |
| POC-C (condicional) | ¿Resuelve C los bloqueos de A y de B? | D-01, D-02 | Sólo si POC-1 cumple su criterio de fracaso y POC-2 no ofrece alternativa |

**Añadidos respecto del roadmap:**

- Medios privados en POC-1a: subida de una imagen a un borrador y descarga anónima denegada (I-16 A).
- Reglas de negocio en POC-1b (I-17 A).

**Sin POC (decidibles por documento o ADR breve antes de H2, I-19 A):**

- D-14 (CI).
- D-18 (escaneo de dependencias).
- El runner unitario de D-15.
- D-12 de staging, una vez hecha POC-4.

**Diferibles a H7 o más tarde:**

- D-12 de producción.
- D-13 (CDN o túnel).
- D-19 (correo transaccional).
- La herramienta de alertas de D-16.

**Batería de contrato común (propuesta):** antes de POC-1a se escribe una batería de pruebas de caja negra, independiente del stack, contra HTTP y navegador.

- Cubre lo que ya fijan las fuentes: E2E de F3 y F1 con Playwright (ARQ:41) y pruebas negativas por canal.
- Las mismas pruebas sirven para A, B y C, de modo que la comparación es homogénea.
- Después se convierten en pruebas del producto, como ya prevé el criterio de salida de H4.

## 5. Seguridad, datos y despliegue

**PH0-12 · Autorización escrita de las POC.** Aprobación requerida (I-22 A).

- Cada POC tiene su worktree y su rama `poc/*`.
- Sólo datos sintéticos; nada de producción, DNS ni datos reales; no se importa nada de `ProyectoST_Portfolio`.
- El código es desechable: no pasa a ser scaffold sin el ADR.
- El alcance es el de la sección 4.
- Sin push salvo autorización.

**PH0-13 · Entorno no productivo y destino de backup provisionales para POC-4.** Aprobación requerida (I-18 A). El responsable designa:

- El host (por ejemplo, una VM o un LXC en Proxmox, con o sin Coolify).
- El aislamiento de red y el acceso restringido.
- Un destino de backup fuera de ese host.
- Quién custodia la clave de cifrado.

Ninguna de estas designaciones es la decisión final de D-12 ni de D-17.

**PH0-14 · Aislamiento de las tareas autónomas** (ORQ:97). Aprobación requerida.

- **Contexto:** los agentes corren como root y un worktree no es una sandbox.
- **Propuesta:** los servicios de cada POC (base de datos, aplicación) se ejecutan en contenedores o en una VM sin acceso a secretos reales, con secretos de un solo uso generados para la POC y nunca versionados.
- **Límites para los agentes:** no tocan la configuración global del host, DNS, producción ni el destino de backup real.

**PH0-15 · Puntos de la Fase 0 de `ROADMAP.md`, por hito.** Aprobación requerida antes de H2 (I-02 C).

- Antes de H2: el entorno de staging y la lista de contenidos con sus responsables.
- Antes de H3: la dirección visual.
- Antes de H7: la política de privacidad, el contenido real y el hosting de producción.

**PH0-16 · Retención y borrado.** Diferible a H6 (I-14 A).

- Borrar una solicitud cerrada, por retención, elimina en cascada sus observaciones y eventos.
- Los backups caducan dentro de un plazo declarado en la política.

**PH0-17 · Publicación del MVP antes de v0.2.** Diferible a H7 (I-03 A). Se propone que sí.

## 6. Secuencia de ejecución de las POC

Empieza cuando el responsable aprueba H0-a.

1. **Preparación (sin código).**
   - Se crean los worktrees `poc/candidata-a` y `poc/candidata-b` desde `chore/jz-agents` (PH0-11).
   - `jz-architect` escribe el plan Superpowers de las POC, con los criterios de éxito y de fracaso de la sección 4.
   - `jz-explorer` prepara la matriz de versiones de D-10, con sus fuentes oficiales y changelogs, sin instalar nada.
   - El responsable revisa la matriz antes de que se instale ninguna dependencia.
2. **Batería de contrato.** En `poc/candidata-a`, el implementador escribe primero las pruebas negativas y las E2E de F3 y F1, y comprueba que fallan. Se hace un commit con las pruebas en rojo.
3. **POC-1a.**
   - Alcance: Proyecto con borrador, publicación, retirada y vista previa; las páginas públicas de lista y detalle; la sesión de administrador; medios privados.
   - Hasta que la batería esté en verde, se miden bundle, CWV de laboratorio, tiempo de propagación y HTML sin JavaScript.
   - **Parada:** si el control de acceso nativo hay que desactivarlo o eludirlo, se para y se informa al responsable.
4. **POC-1b**, en el mismo worktree.
   - Alcance: transiciones de PH0-01, campo de PH0-02 y eventos de PH0-03.
   - TDD: primero 3 transiciones válidas y 3 inválidas, las pruebas de exposición por canal y el intento de modificar un evento.
   - Se revisa con `jz-security`.
5. **POC-3**, en el mismo worktree: los cinco puntos (a) a (e) del roadmap, accesibilidad del formulario incluida. Se revisa con `jz-security`.
6. **POC-2 reducida**, en `poc/candidata-b`, con otro escritor. Puede empezar en paralelo en cuanto POC-1a haya fijado las dos páginas, el conjunto de datos sintéticos y el método de medición.
7. **POC-4**, en el entorno de PH0-13: imagen multi-stage, migración, backup cifrado, restauración en limpio, rollback y tiempo medido. Otro agente ejecuta el procedimiento escrito siguiendo sólo el documento.
8. **Consolidación (revisión de hito).**
   - Se reúnen las mediciones reales.
   - Se redacta el borrador de `docs/adr/0001-stack.md` (D-01 a D-04 y D-10) y los ADR breves de entrada en H2.
   - Hay una única revisión independiente exhaustiva.
   - Decide el responsable.
   - POC-C sólo entra si se cumple su condición.

**Reglas comunes a todos los pasos:**

- El orquestador puede ser Claude Code u OpenCode.
- Hay un implementador `jz-*` por worktree.
- `jz-qa` revisa la evidencia sin ejecutar nada.
- Cada paso termina con un commit local del incremento completo y su evidencia: comando, recuentos y código de salida.
- No hay push ni merge.

## 7. Primer flujo vertical recomendado (después de H2)

**Recomendación: solicitud técnica de extremo a extremo (F2 y luego F4), en su versión mínima.**

1. Formulario público accesible en `/servicios/solicitar`, con un servicio activo de semilla o sin servicio.
2. Validación en servidor, antiabuso y antiduplicados, según lo decidido tras POC-3.
3. Se crea una Solicitud en `recibida` y se devuelve una confirmación genérica.
4. Bandeja de administración con los filtros de estado y de motivo.
5. Detalle con las observaciones internas.
6. Transiciones `recibida → en_gestion → cerrada`, con motivo y un evento de sólo inserción por cada una.

**Criterios de aceptación:**

- E2E de F2 y de F4.
- Pruebas de integración: 3 transiciones válidas y 3 inválidas, además de los rechazos anónimos y sin sesión.
- Ni las observaciones ni los eventos aparecen en ninguna respuesta pública, log ni sitemap.
- Un visitante anónimo no puede listar ni leer solicitudes por ningún canal.

**Por qué este y no el portafolio (F3 y F1):**

- Es el flujo de más riesgo: PII y los patrones inseguros del prototipo (R-03).
- Ejercita justo las decisiones de H0-a.
- Reutiliza las pruebas de POC-1b y POC-3.
- No depende de H0-b (dirección visual) ni del contenido real (R-01), que son lo que frena el portafolio.

Si el responsable prefiere priorizar la visibilidad pública, la alternativa es F3 y luego F1 con datos sintéticos, aceptando que la parte visual se rehará con los tokens de H0-b.

## 8. Resumen de lo que necesita la decisión del responsable

| Bloquea | Propuesta | Decisión pedida |
|---|---|---|
| H0-a | PH0-00 | Dividir H0 en H0-a y H0-b |
| H0-a | PH0-01 | Estados `recibida`, `en_gestion` y `cerrada`, sus nombres y los motivos de cierre |
| H0-a | PH0-02 | Campo único de observaciones privadas |
| H0-a | PH0-03 | Eventos de transición de sólo inserción y la excepción por retención |
| H0-a | PH0-04 | Un único administrador |
| H0-a | PH0-05 | Sin avisos de nuevas solicitudes en el MVP |
| H0-a | PH0-06 | Formulación de la métrica de publicación |
| H0-a | PH0-07 | Registro de decisiones como mecanismo de aprobación |
| H0-a | PH0-08 | Opción A o B para la PR #1 (A requiere autorizar un commit en `docs/fase-0-definicion`) |
| H0-a | PH0-11 | Ramas de POC desde `chore/jz-agents` |
| H0-a | PH0-12 | Autorización escrita de las POC |
| POC-4 | PH0-13 | Entorno y destino de backup provisionales |
| POC | PH0-14 | Aislamiento de las tareas autónomas |
| H2 | PH0-15 | Puntos de la Fase 0 asignados a cada hito |
| Registrar | PH0-09, PH0-10 | Ya indicadas; confirmar el texto |
| Más tarde | PH0-16, PH0-17 y los diferibles de la sección 1 | — |
