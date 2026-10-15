# Registro de decisiones H0-a — jozeuzz.cl

> **Estado (2026-10-15):** H0A-01 a H0A-16 **aprobadas** por el responsable. Las POC se autorizan una a una: hoy sólo POC-1a (H0A-16a). Una entrada sólo está vigente si su columna «Aprobación» indica fecha y referencia Git.
> **Base:** `docs/PROPUESTA-DECISIONES-H0.md` (`9cc0445`), `docs/ROADMAP-MVP.md` y `docs/ANALISIS-INCONSISTENCIAS-ROADMAP-MVP.md`. Este registro sustituye a la propuesta en lo que contradiga, en particular en PH0-08, PH0-11, PH0-13 y PH0-15.

## Cómo se aprueba

Una entrada queda aprobada cuando el responsable la acepta de forma expresa, ya sea en la conversación, en un comentario de PR o en un commit propio. Al aprobarla se rellena «Aprobación» con tres datos:

- la fecha;
- la referencia Git del commit que contiene el texto que el responsable revisó (nunca el SHA del propio commit que registra la aprobación, que no se puede conocer al escribirlo);
- el medio por el que se dio.

El commit que registra la aprobación se localiza con `git log -- docs/REGISTRO-DECISIONES-H0A.md`. No se exigen firmas criptográficas. Si el responsable aprueba una entrada con precisiones, el texto se ajusta a ellas en el mismo commit que registra la aprobación, y la entrada lo indica.

## Contrato H0-a

| ID | Decisión propuesta | Verificación | Aprobación |
|---|---|---|---|
| H0A-01 | H0 se divide en dos partes. **H0-a** reúne las decisiones técnicas y de dominio de este registro y bloquea las POC y el ADR. **H0-b** reúne wireframes, dirección visual y lista de contenidos, y bloquea H3 pero no H1 ni H2. | Ningún criterio de salida de H1 menciona wireframes, tokens visuales ni contenido real | Aprobada 2026-10-15 · texto revisado en `90a66f3` · conversación |
| H0A-02 | La Solicitud tiene los estados `recibida`, `en_gestion` y `cerrada`. El servidor asigna `recibida`. Las transiciones válidas son `recibida → en_gestion`, `recibida → cerrada` (cierre directo, por ejemplo para descartes) y `en_gestion → cerrada`. Cerrar exige `motivo_cierre` ∈ {`atendida`, `descartada`, `duplicada`, `spam`}; los valores son provisionales. `cerrada` es terminal: no hay reapertura en el MVP. | Pruebas de servidor con 3 transiciones válidas y, como mínimo, 3 inválidas: `cerrada → *`, `en_gestion → recibida` y cerrar sin motivo | Aprobada 2026-10-15 · texto revisado en `90a66f3` · conversación |
| H0A-03 | Cada solicitud tiene un único campo `observaciones_internas`, que sólo el administrador lee y escribe. | Ningún canal público ni anónimo, log o sitemap lo expone | Aprobada 2026-10-15 · texto revisado en `90a66f3` · conversación |
| H0A-04 | `EventoSolicitud` es de sólo inserción. Guarda solicitud, estado anterior, estado nuevo, actor, fecha y motivo, sin texto libre. Cada transición válida genera un evento en la misma transacción, y ningún canal permite editarlo ni borrarlo. Su ciclo de vida lo fija una política de retención explícita (H0A-11). | Pruebas de atomicidad y de rechazo de modificación y borrado | Aprobada 2026-10-15 · texto revisado en `90a66f3` · conversación |
| H0A-05 | Hay un único administrador inicial. El alta y la recuperación del acceso siguen un procedimiento documentado, sin interfaz de gestión de cuentas. | Existe ese procedimiento antes de H2 | Aprobada 2026-10-15 · texto revisado en `90a66f3` · conversación |
| H0A-06 | No hay notificaciones automáticas de solicitudes en el MVP. | No existe código del dominio `notifications` en el MVP | Aprobada 2026-10-15 · texto revisado en `90a66f3` · conversación |
| H0A-07 | Publicar contenido no requiere un commit por publicación. Es un criterio que las POC deben verificar, con el tiempo de propagación medido; no se da por cumplido de antemano. | Medición en POC-1a y POC-2 | Aprobada 2026-10-15 · texto revisado en `90a66f3` · conversación |
| H0A-08 | Las decisiones se registran con aprobación humana explícita, fecha y referencia Git, sin firmas criptográficas. | El formato de este registro | Aprobada 2026-10-15 · texto revisado en `90a66f3` · conversación |
| H0A-09 | El producto (H0 a H7) no depende de jz-ai M1–M3 ni de las fases 0C–0E de `ORQUESTACION-IA-PROPUESTA.md` §9, de Caveman, de la actualización de Node ni de «tres ejecutores». Se mantiene el aislamiento de las tareas autónomas (ORQ:97). | Ningún criterio de salida del MVP menciona jz-ai ni esas fases | Aprobada 2026-10-15 · texto revisado en `90a66f3` · conversación |
| H0A-10 | Hay un solo escritor por worktree, con permisos mínimos. Los revisores son de sólo lectura. Los agentes no tienen acceso a secretos reales, producción, DNS ni configuración global. | Contrato de tarea de cada POC | Aprobada 2026-10-15 · texto revisado en `90a66f3` · conversación |
| H0A-11 | La política de retención se aprueba antes de cargar datos reales, y en todo caso antes de H7. Mientras no lo esté, sólo hay datos sintéticos y los eventos no se borran. La única excepción que se prevé al «sólo inserción» es el borrado por retención, con un procedimiento documentado y no por la API. | Política aprobada antes de usar datos reales | Aprobada 2026-10-15 · texto revisado en `90a66f3` · conversación |
| H0A-12 | Se separan tres aprobaciones (sustituye a PH0-08): (1) **documental**, las fuentes de producto como base de trabajo; (2) **técnica**, las decisiones de este registro; (3) **de stack**, sólo mediante ADR-0001 y con evidencia de las POC. Cerrar la PR #1 no aprueba ninguna tecnología: `ARQUITECTURA.md` sigue como hipótesis y los documentos de IA como propuesta no vinculante para el producto. `docs/fase-0-definicion` no se modifica hasta que el responsable autorice expresamente el cierre de la PR #1. | La PR #1 no cambia el estado de ninguna candidata | Aprobada 2026-10-15 · texto revisado en `90a66f3` · conversación |
| H0A-13 | Base Git del producto (sustituye a PH0-11). Rama `producto/base` y worktree propio desde `docs/roadmap-mvp`, con las fuentes, el roadmap y este registro. No se eliminan ni se recrean ramas existentes: cuando la PR #1 llegue a `main`, la integración de históricos se planifica sin perder commits. Las POC parten de `producto/base`, no de `chore/jz-agents`. Los perfiles se incorporan en un commit único y revisado que copia sólo `.claude/agents/*.md` y `.opencode/agents/*.md` desde `chore/jz-agents`, sin evaluadores experimentales ni dependencias autogeneradas. | `git log producto/base` muestra la procedencia de los perfiles | Aprobada con precisiones 2026-10-15 (sin recrear ramas; sólo los perfiles `*.md`) · texto revisado en `90a66f3` · conversación |
| H0A-14 | Entorno y respaldo de POC-4 (sustituye a PH0-13). La decisión se aplaza hasta antes de POC-4. POC-1 a POC-3 son locales, con servicios en contenedores enlazados a `localhost`, datos sintéticos y secretos desechables. No se exponen a la red ni usan datos reales, y su código no pasa a ser scaffold. | Revisión del contrato de cada POC | Aprobada 2026-10-15 · texto revisado en `90a66f3` · conversación |
| H0A-15 | Criterios mínimos de salida (sustituye a PH0-15; los de H2 se completan después). **H0-a** se cierra cuando H0A-01 a H0A-14 y H0A-16 están aprobadas. No exige fusionar la PR #1 ni cerrar H0-b. **H1** se cierra cuando ADR-0001 está aceptado por el responsable para D-01 a D-04 y D-10, con la evidencia medida de POC-1a, POC-1b, POC-2 y POC-3. Si POC-4 todavía no se ha hecho, D-11 y D-17 quedan pendientes en el ADR y POC-4 pasa a ser condición de entrada en H2. | — | Aprobada 2026-10-15 · texto revisado en `90a66f3` · conversación |
| H0A-16 | Las POC se autorizan **una a una**, no en bloque. Cada autorización fija su alcance, las instalaciones permitidas y sus límites. La autorización de una POC no cubre las demás. | Cada POC tiene su propia entrada de autorización | Aprobada con precisiones 2026-10-15 (autorización individual en lugar de global) · texto revisado en `4302e2d` · conversación |
| H0A-16a | **POC-1a autorizada** (candidata A, sólo local). Stack: Node.js 24 LTS en contenedor, Next.js 16 en una versión concreta compatible y parcheada, Payload CMS 3.90.2, PostgreSQL 18 y Playwright en entorno aislado. Sólo se instalan las dependencias estrictamente necesarias, en el entorno de la POC, después de verificar versiones exactas, compatibilidad, procedencia y scripts de instalación. Sin versiones flotantes: se registran el lockfile y los digests de las imágenes. Compose exclusivo, puertos sólo en `127.0.0.1`, sin socket Docker en la aplicación, sin datos ni credenciales reales. La operación se detiene antes de cualquier cambio de configuración global, script inesperado con privilegios o acceso a recursos productivos. La selección del stack sigue pendiente del ADR-0001. | Evidencia de POC-1a | Aprobada 2026-10-15 · texto revisado en `4302e2d` · conversación |

## Contrato de las POC

**Reglas comunes a todas las POC:**

- Cada POC tiene una rama y un worktree `poc/*` desde `producto/base`, con un escritor.
- Se aplica TDD: las pruebas se escriben en rojo antes que el código.
- No hay push.
- Cada medición es la mediana de 3 ejecuciones en la misma máquina, con el hardware y las versiones registrados.
- Toda prueba informa del comando, los recuentos y el código de salida.
- Los umbrales son objetivos provisionales que se miden, no motivos automáticos de descarte. La decisión pondera además seguridad, cumplimiento funcional, accesibilidad, mantenimiento y costo.
- Las mediciones de rendimiento son comparaciones iniciales de laboratorio. No equivalen a una garantía de rendimiento real para usuarios.

**Regla para repetir una POC:** se repite como máximo una vez, y sólo si el fallo viene de una versión, una configuración o una medición incorrectas y documentables. Un fallo de diseño del candidato no se repite: se rechaza.

### POC-1a · Candidata A, contenido y acceso (prioridad 1)

- **Hipótesis:** la Candidata A cubre F3 y F1 (borradores, publicación, retirada, vista previa, medios privados y sesión de administrador) con un control de acceso nativo que deniega por defecto en todos los canales.
- **Público y privado:** el portafolio y los servicios publicados se consultan de forma anónima. Los borradores, las solicitudes, las observaciones internas y los archivos privados requieren autorización. Las restricciones se comprueban por todos los canales de acceso, no sólo en la interfaz.
- **Candidatos:** la Candidata A de `ARQUITECTURA.md`, con las versiones de la matriz aprobada.
- **Aceptación:**
  - Los proyectos, servicios y medios publicados son visibles de forma anónima en el HTML y en la API.
  - Ninguna lectura anónima de borradores, solicitudes, observaciones internas, medios privados ni `/admin` tiene éxito por ningún canal expuesto: REST, GraphQL si está habilitado, acciones de servidor, rutas de medios y sitemap.
  - La E2E de F3 y F1 pasa.
  - El HTML público es indexable y legible sin JavaScript.
  - El contenido se publica sin commit, con el tiempo de propagación medido. Objetivo provisional: 60 s o menos; si no se alcanza, se registra y se pondera, no descarta la candidata.
- **Seguridad:**
  - Pruebas negativas por canal.
  - Un slug de borrador responde igual que uno inexistente.
  - Cookies con `Secure`, `HttpOnly` y `SameSite`.
  - Protección CSRF en las mutaciones de administración.
  - Límite de intentos de inicio de sesión.
  - Medios privados denegados al acceso anónimo.
- **Funcionalidad:**
  - Crear, editar, publicar, retirar sin borrar (INV-12) y previsualizar.
  - Slug único (INV-02).
- **Mediciones:**
  - JS público de lista y detalle, en KB gzip.
  - LCP, CLS y TBT de laboratorio en móvil.
  - Tiempo de propagación, tiempo de build y tiempo de arranque.
  - Memoria en reposo.
- **Costos y dependencias:**
  - Número de dependencias directas y transitivas, y sus licencias.
  - Servicios necesarios.
  - Ventana de soporte de cada versión, según la documentación oficial.
- **Decisión:**
  - Se acepta si se cumplen todos los criterios de aceptación.
  - Se rechaza si proteger el contenido obliga a desactivar o eludir el control nativo, o si hay una exposición que la configuración no corrige.
  - Se repite según la regla común.
- **Evidencia para ADR-0001:** D-01, D-02, D-04, D-05 (sólo la medición del bundle), D-06 (control de acceso), D-07 (mecanismo), D-10 y D-15. Incluye la matriz de versiones con sus fuentes y la lista de canales con el modo en que se cerró cada uno.

### POC-1b · Candidata A, reglas de negocio (prioridad 1, en el mismo worktree)

- **Hipótesis:** la Candidata A impone en el servidor H0A-02, H0A-03 y H0A-04 sin depender de la interfaz.
- **Candidatos:** la Candidata A.
- **Aceptación:**
  - Las 3 transiciones válidas se aceptan y las inválidas se rechazan.
  - Cada transición genera exactamente un evento.
  - Un fallo simulado a mitad de la operación no deja un estado sin su evento.
  - Modificar o borrar un evento se rechaza por todos los canales.
  - `observaciones_internas` no aparece en respuestas públicas ni en logs.
- **Seguridad:**
  - Los campos administrativos enviados en la creación pública se rechazan o se ignoran.
  - La lectura anónima de una solicitud por su id falla (IDOR).
- **Funcionalidad:** la bandeja filtra por estado y por motivo.
- **Mediciones:** líneas de código propio necesarias fuera del CMS y número de puntos de extensión del control de acceso.
- **Costos y dependencias:** el esfuerzo de mantener esas extensiones al actualizar el CMS.
- **Decisión:**
  - Se rechaza si la inmutabilidad o la atomicidad sólo se pueden garantizar en la interfaz, o si exigen eludir el CMS.
  - Se acepta si se cumplen todos los criterios.
- **Evidencia para ADR-0001:** D-02 y D-03 (constraints y transacciones).

### POC-2 · Candidata B, superficie pública reducida (prioridad 2, en paralelo tras POC-1a)

- **Hipótesis:** una superficie pública separada (Candidata B) mejora el rendimiento lo bastante para compensar tener dos superficies y dos despliegues.
- **Candidatos:** la Candidata B de `ARQUITECTURA.md`, sólo con las dos páginas de POC-1a. El panel, la autenticación y el despliegue doble se estiman; no se implementan.
- **Aceptación:**
  - Se usan los mismos datos sintéticos y el mismo método de medición que en POC-1a.
  - Un borrador presente en el origen de datos nunca acaba en el build público.
- **Seguridad:** la misma prueba de borradores en el build, más la exposición del origen de datos del build.
- **Funcionalidad:** lista y detalle equivalentes a los de POC-1a.
- **Mediciones:** las mismas que POC-1a. Aquí la propagación equivale al tiempo de regeneración.
- **Costos y dependencias:** una tabla de costes operativos estimados (dos despliegues, el panel y la autenticación).
- **Decisión:**
  - Referencia orientativa, no barrera: una mejora del 20 % o más en el LCP de laboratorio o en el JS público frente a A.
  - B también puede justificarse por seguridad, cumplimiento funcional, accesibilidad, mantenimiento o costo. El responsable decide si pasa a POC completa; si no, queda registrada en el ADR.
- **Evidencia para ADR-0001:** D-01 y D-04.

### POC-3 · Intake seguro (prioridad 3, sobre el stack de POC-1)

- **Hipótesis:** el stack candidato recibe solicitudes públicas sin aceptar campos administrativos, frena el abuso, evita duplicados y no filtra PII.
- **Candidatos:**
  - Para el antiabuso (D-08), una opción de cada familia evaluada en el papel y una implementada.
  - Para el antiduplicados (D-09), un mecanismo de diseño propio.
- **Aceptación:** pasan las pruebas (a) a (e) del roadmap:
  - (a) los campos administrativos no se guardan;
  - (b) un doble envío deja un solo registro;
  - (c) superar el límite produce una denegación;
  - (d) un envío con un servicio desactivado se rechaza;
  - (e) los logs, incluidos los de error del framework, no contienen nombre, contacto ni descripción.
  - Además, un reenvío legítimo no queda bloqueado.
- **Seguridad:** las pruebas (a) a (e), más un CSRF o un origen inválido.
- **Funcionalidad:** formulario usable con teclado y lector de pantalla, sin errores críticos en la auditoría automática.
- **Mediciones:** latencia del envío y tasa de falsos positivos del antiduplicados en las pruebas.
- **Costos y dependencias:** datos que un servicio externo de antiabuso recibiría, coste y dependencia de terceros.
- **Decisión:** se rechaza el mecanismo, no el stack, si no se pueden evitar las PII en los logs del framework sin eludirlo. En ese caso, ese punto vuelve a POC-1.
- **Evidencia para el ADR:** D-08, D-09 y D-16 (logs).

### POC-4 · Despliegue, backup y restauración (prioridad 4, requiere decidir el entorno antes)

- **Hipótesis:** el stack se despliega de forma reproducible y se restaura completo desde un backup cifrado.
- **Candidatos:** el stack que resulte de POC-1 y POC-3, en el entorno provisional que designe el responsable.
- **Aceptación:**
  - Tras la restauración en limpio coinciden los recuentos de proyectos y solicitudes y los hashes de los medios.
  - El rollback funciona.
  - Otro agente ejecuta el procedimiento siguiendo sólo el documento.
- **Seguridad:**
  - No hay secretos en Git ni en las capas de la imagen.
  - Staging tiene acceso restringido de forma efectiva, no sólo con `robots`.
  - El backup está cifrado y su clave se guarda fuera del host.
- **Funcionalidad:** se aplica una migración versionada.
- **Mediciones:** tiempo de restauración (RTO), tamaño del backup y CPU, RAM y disco del entorno.
- **Costos y dependencias:** pasos operativos del procedimiento y complejidad de las actualizaciones.
- **Decisión:**
  - Se acepta si se cumplen todos los criterios.
  - Se repite si el fallo viene del entorno y no del stack.
  - Se rechaza si la restauración no es completa.
- **Evidencia para el ADR:** D-03, D-11, D-12 (sólo staging) y D-17.

### POC-C · Candidata C (condicional)

Sólo se ejecuta si POC-1a o POC-1b terminan rechazadas y POC-2 no ofrece una alternativa. Tiene el mismo contrato que POC-1a y POC-1b, más una estimación del esfuerzo de construir el CMS y la administración. Aporta evidencia para D-01 y D-02.

## Secuencia

1. **Aprobación:** el responsable aprueba este registro, o lo aprueba con cambios.
2. **Preparación, sin instalar nada:**
   - Crear `producto/base` (H0A-13) y el worktree `poc/candidata-a`.
   - Preparar la matriz de versiones de la Candidata A con sus fuentes oficiales.
   - El responsable revisa la matriz.
3. **Batería de contrato en rojo:** las pruebas de caja negra de F3, F1, F2 y F4 que usan las POC.
4. **POC-1a, POC-1b y POC-3**, en ese orden y con un escritor. Si POC-1a o POC-1b terminan rechazadas, se informa y se pasa a la condición de POC-C.
5. **POC-2**, en `poc/candidata-b`, en paralelo en cuanto POC-1a haya fijado las páginas, los datos y el método de medición.
6. **POC-4:** el responsable designa el entorno y el destino de backup, y después se ejecuta.
7. **Cierre:** borrador de ADR-0001 con las mediciones, una única revisión independiente de hito y decisión del responsable.
