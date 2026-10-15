# Análisis de inconsistencias del roadmap del MVP — jozeuzz.cl

> **Estado:** análisis de trabajo, no aprobado. No modifica `docs/ROADMAP-MVP.md` ni ninguna fuente; sólo propone decisiones y cambios.
> **Fecha:** 2026-10-15. **Base:** commit `0e57214` (rama `docs/roadmap-mvp`).
> **Objeto:** `docs/ROADMAP-MVP.md`, aceptado por el responsable como borrador de trabajo, contrastado con sus fuentes para convertirlo en un plan ejecutable.

## 0. Método y convenciones

- **Fuentes leídas completas:** `docs/ROADMAP-MVP.md`, `docs/PRODUCTO.md`, `docs/ESPECIFICACION-FUNCIONAL.md`, `docs/ARQUITECTURA.md`, `docs/UX-ARQUITECTURA-INFORMACION.md`, `docs/ROADMAP.md`, `docs/ORQUESTACION-IA-PROPUESTA.md`, `AGENTS.md`, `CLAUDE.md`, `README.md` y `docs/AGENTES.md`. De `docs/AI-BOOTSTRAP-DEBIAN.md` y `docs/AUDITORIA-SKILLS-LOCALES.md` sólo se usan los pasajes que afectan al producto.
- **Abreviaturas de archivo** en las citas: `RM` = ROADMAP-MVP.md, `PROD` = PRODUCTO.md, `ESP` = ESPECIFICACION-FUNCIONAL.md, `ARQ` = ARQUITECTURA.md, `UX` = UX-ARQUITECTURA-INFORMACION.md, `RDM` = ROADMAP.md, `ORQ` = ORQUESTACION-IA-PROPUESTA.md, `BOOT` = AI-BOOTSTRAP-DEBIAN.md, `AUD` = AUDITORIA-SKILLS-LOCALES.md. `AGENTS.md`, `CLAUDE.md`, `README.md` y `AGENTES.md` se citan con su nombre. El formato es `ARCHIVO:línea`, con líneas comprobadas en `0e57214`.
- **Severidad:** *bloqueante H0* (impide cerrar la definición o empezar las POC), *bloqueante H1* (impide que las POC produzcan un ADR aceptable o que se pase a H2), *importante* (afecta al plan o al modelo, pero no detiene el camino crítico), *menor* (coherencia o redacción).
- Cada hallazgo termina con una **pregunta de decisión** con opciones cerradas. La opción marcada como **Recomendación** es una propuesta de este análisis, no una decisión.
- Este documento no elige ninguna tecnología. Cuando menciona una, es porque la nombra una fuente.

### 0.1 Verificación de las contradicciones y supuestos que declara el roadmap

| ID | ¿Se sostiene? | Evidencia comprobada | Matiz que falta en el roadmap |
|---|---|---|---|
| C-01 | Sí | Ningún nombre de estado de solicitud en las fuentes; sólo «estado inicial administrado en servidor» (ESP:68) y «cambia entre estados permitidos» (ESP:81) | Omite que PROD:26 y RDM:28 sitúan las transiciones controladas fuera del MVP (ver I-10) |
| C-02 | Sí | «registra autor, fecha y transición cuando corresponda» (ESP:82); «opcional en MVP pero recomendable» (ESP:91); «historial de eventos» en V0.2 (PROD:26) | Omite RDM:27 («historial» en Fase 3) y la «auditoría básica» del administrador (ESP:15) |
| C-03 | Sí, incompleta | «Modificar estado y notas de solicitud» (ESP:24); «registra observaciones privadas» (ESP:81); «Notas internas» en V0.2 (PROD:27) | Omite ESP:21 («notas privadas»), ESP:90 (que sí presupone notas en Solicitud) y ARQ:27 («operations: solicitudes, estados, notas internas»), que inclinan la balanza hacia el MVP (ver I-12) |
| C-04 | Sí | RF-16 es *Should* (ESP:50); F3 «Previsualiza, publica» (ESP:75); terminado exige F1–F4 (ESP:110) | — |
| C-05 | Sí, reforzable | Producción en Fase 4 (RDM:30-31); «despliegue productivo verificable» en v1.0 (PROD:32); «antes de hacer público» (ESP:116) | Omite RDM:20 («Fase 2 — MVP público») y ESP:118 («no bloquear documentación, sí publicar»), que apuntan a publicar el MVP (ver I-03) |
| C-06 | Sí | «único rol privilegiado inicial» (PROD:10); «Sólo permisos explícitos» (ESP:27); ESP:125 | Omite RDM:17 («roles mínimos», en plural) y PROD:42 («editor autorizado») |
| C-07 | Parcial | ARQ:29 dice «eventual envío externo», lo que ya sugiere algo futuro; PROD:31 lo sitúa en v0.3 | La tensión es menor de lo que el roadmap presenta (ver I-08) |
| C-08 | Sí, más grave de lo descrito | ORQ:155-156 y BOOT:160 | El roadmap no ve que 0D incluye el gate E de Caveman ni que 0E exige «tres ejecutores colaborando» (ver I-23) |
| C-09 | Sí | RDM:11 «comparar con Astro»; ARQ:13-20 sólo obliga a la POC de A | — |
| C-10 | Sí | ARQ:32 no recoge `/privacidad` ni `/404`, que sí están en UX:21-22 | — |
| C-11 | Sí | CLAUDE.md:5 «leer [...] las ADR vigentes»; `docs/adr/` no existe en `0e57214` | — |
| C-12 | Sí | PROD:2, ESP:3, ARQ:2 y UX:3 se declaran propuesta, borrador o hipótesis | El mecanismo de aprobación no está definido (ver I-24) |
| C-13 | Sí | «filtra proyectos/servicios» (ESP:14) frente a RF-15 *Should* (ESP:49) | — |
| S-01 | Sí | PROD:10; ESP:16 | — |
| S-02 | Sí, como pendiente | ESP:125 | — |
| S-03 | Es una propuesta del roadmap | Sólo «idioma secundario» como pendiente (PROD:49) | No hay fuente que fije el español como único idioma |
| S-04 | Sí, como pendiente | «dominio DNS» (PROD:49) | — |
| S-05 | Es una propuesta del roadmap | RF-11 dice «correo o enlace externo inicialmente» (ESP:45) | — |
| S-06 | Sí | «fotos/adjuntos controlados» en V0.2 (PROD:27) | — |
| S-07 | Sí | AGENTES.md:8 | — |

**Supuestos implícitos que el roadmap no declara:** que los hitos son estrictamente secuenciales (RM:552), que el entorno para POC-4 ya existe (RM:490) y que la aprobación de las fuentes es un acto separable de la fusión del PR de Fase 0 (RM:557). Se tratan en I-18, I-24 e I-27.

---

## 1. Alcance real del MVP

### 1.1 Qué afirma cada fuente

| Fuente | Entra en el MVP | No entra | Observación |
|---|---|---|---|
| PROD:13-19 | Páginas profesionales, catálogo, contacto, contenido editable «perfil, proyectos, enlaces, servicios, imágenes y textos», formulario, panel de solicitudes con «registrar cambios de estado», SEO, observabilidad, backup, CI | PROD:22-23 y V0.2 (PROD:26-28): historial, transiciones controladas, notas internas, adjuntos | Es la única fuente que separa por versión |
| ESP:33-53 | RF-01 a RF-16 (RF-17 *Could*, no activo) | ESP:53: clientes autenticados, seguimiento, pagos, reservas, cotizaciones, órdenes, multitenancy, aprobación multiadministrador | Incluye notas privadas (ESP:21, 24, 81) y registro de transiciones (ESP:82) que PROD sitúa en V0.2 |
| ARQ:22-29 | Dominios `operations` con «notas internas» (ARQ:27) e `identity` con «auditoría» (ARQ:28) | «futuros equipos/órdenes» (ARQ:27) | No distingue versiones salvo con «futuros» y «eventual» |
| UX:11-24, 38-47 | Mapa con `/privacidad` y `/404`; Servicios con «alcance, condiciones, preguntas frecuentes» (UX:44); inicio con «proyectos destacados» (UX:40) | — | Introduce contenido que el modelo de ESP §5 no recoge |
| RDM:20-24 | «Fase 2 — MVP público» | Fase 3: historial, transiciones autorizadas, auditoría (RDM:27-28) | Producción en Fase 4 (RDM:30-31) |

### 1.2 Hallazgos

#### I-01 · «Sin commit» reinterpretado como «sin redespliegue»

- **Severidad:** importante.
- **Evidencia:** PROD:42 «Un editor autorizado crea/publica un proyecto sin commit». Ninguna fuente exige propagación sin redespliegue. ARQ:8 presenta la Candidata B por su «contenido y renderizado estático».
- **Roadmap:** convierte la métrica en «publicación sin redespliegue (PRODUCTO.md › Métricas, 1)» en D-04 (RM:423), en MVP-10, criterio 8 (RM:240), y en el criterio de éxito de POC-1 (RM:465).
- **Análisis:** la reinterpretación endurece el requisito y penaliza de antemano a la Candidata B, en la que una publicación puede disparar una regeneración automática sin commit. Sesga la comparación de C-09.
- **Decisión:** ¿cómo se formula el requisito de publicación? **A)** «Sin redespliegue», como requisito nuevo aprobado expresamente. **B)** «Sin commit ni intervención técnica, con un tiempo máximo de propagación medido en la POC», que admite regeneración automática. **C)** Dejarlo a criterio del ADR. **Recomendación: B**, porque respeta la métrica original y permite comparar A y B con el mismo criterio.

#### I-02 · Lo que `ROADMAP.md` pone en la Fase 0 y el roadmap aplaza

- **Severidad:** bloqueante H1 (decide si se puede pasar de H1 a H2).
- **Evidencia:** RDM:9 «Confirmar identidad visual, contenido y servicios reales» y RDM:12 «Confirmar política de privacidad, retención y hosting» están en la Fase 0, antes de la Fase 1 (scaffold). En cambio, ESP:118 dice «no bloquear documentación, sí publicar» y RF-13 fija la política «antes de producción» (ESP:47).
- **Roadmap:** la tabla 8.4 asigna esos puntos a H0 (RM:621), pero el criterio de salida de H0 permite contenido incompleto (RM:557), la privacidad se exige en H7 (RM:610) y el hosting de producción también (D-12, RM:431).
- **Análisis:** según se lea `ROADMAP.md`, el scaffold (H2) queda bloqueado por el contenido real, la política de privacidad y el hosting, o no. El roadmap opta en silencio por la segunda lectura sin corregir `ROADMAP.md`.
- **Decisión:** ¿qué puntos de la Fase 0 deben cerrarse antes del scaffold? **A)** Todos, como dice `ROADMAP.md`. **B)** Ninguno; se trasladan al gate de publicación (H7) y se corrige `ROADMAP.md`. **C)** Mixto: antes de H2, el entorno de staging y la lista de contenidos con responsables; antes de H3, la dirección visual; antes de H7, la política de privacidad, el contenido real y el hosting de producción. **Recomendación: C**, coherente con ESP:118 y con que el scaffold no depende del texto legal.

#### I-03 · ¿El MVP se publica antes de v0.2?

- **Severidad:** importante (no bloquea H0–H2; condiciona H7 y la elección de hosting).
- **Evidencia:** RDM:20 «Fase 2 — MVP público»; PROD:43 «Una persona encuentra portafolio y servicio técnico desde móvil»; ESP:116 «antes de hacer público»; ESP:118 «sí publicar». En contra, RDM:30-31 sitúa la producción en Fase 4, después de la Fase 3 (v0.2).
- **Roadmap:** deja H7 como «condicionada» (RM:607) y [Pendiente] (RM:615; C-05).
- **Decisión:** **A)** El MVP v0.1 sale a producción (H7) antes de v0.2, y la Fase 4 de `ROADMAP.md` pasa a ser el endurecimiento de v1.0. **B)** El MVP termina en staging (H6) y la producción espera a la Fase 3. **C)** Se publica sólo el portafolio y el servicio técnico espera. **Recomendación: A**, porque las métricas de PROD:43 sólo se pueden comprobar con un sitio público; C contradice la visión conjunta de PROD:5.

#### I-04 · Contenido pedido por UX que el modelo no recoge

- **Severidad:** menor.
- **Evidencia:** UX:44 pide en Servicios «Oferta, alcance, condiciones, preguntas frecuentes»; UX:40 pide «proyectos destacados» en el inicio. El modelo de Servicio (ESP:89) y el de Proyecto (ESP:88) no tienen esos campos. PROD:15 pide que los «textos» sean editables.
- **Roadmap:** MVP-05 incluye las preguntas frecuentes en el flujo (RM:167) y MVP-01 los destacados (RM:125, 129), pero la tabla 3.1 no los modela (RM:307-309).
- **Decisión:** **A)** Añadir un bloque editable de textos de la página de servicios y un indicador «destacado» en Proyecto. **B)** Sacar preguntas frecuentes y condiciones del MVP. **C)** Modelarlos como campos de cada Servicio. **Recomendación: A**, que cubre PROD:15 sin ampliar el modelo de negocio.

#### I-05 · Etiquetas [Definido] sin respaldo literal

- **Severidad:** menor.
- **Evidencia y roadmap:** MVP-02, criterio 3, lleva a la vez [Definido] y [Propuesto] (RM:139). MVP-12, criterio 4, es [Definido] (RM:260) mientras el criterio 6 deja pendiente la forma del registro (RM:262). INV-07 e INV-08 se etiquetan [Definido] (RM:344-345), pero dependen de C-01 y C-02. La relación «EventoSolicitud — UsuarioAdmin» es [Definido] (RM:331), aunque la entidad es opcional (ESP:91). S-03 y S-05 son propuestas propias (ver 0.1).
- **Decisión:** **A)** Reetiquetar como [Propuesto] o [Pendiente] todo lo que dependa de una decisión abierta. **B)** Mantener el etiquetado. **Recomendación: A**; si no, un agente puede implementar como «definido» algo que el responsable no ha decidido.

#### I-06 · Número de administradores y gestión de cuentas

- **Severidad:** importante (afecta a D-07 y a H2).
- **Evidencia:** PROD:10 «único rol privilegiado inicial»; ESP:27 «Administrar cuentas de acceso: Sólo permisos explícitos»; ESP:125 «Confirmar si el panel tendrá un único usuario»; RDM:17 «roles mínimos»; PROD:42 habla de «editor autorizado».
- **Roadmap:** C-06 y S-02 lo dejan pendiente; R-12 pide un procedimiento de recuperación (RM:647).
- **Decisión:** **A)** Un único usuario administrador; alta y recuperación por un procedimiento operativo documentado, sin interfaz de gestión de cuentas. **B)** Varios usuarios con el mismo rol y gestión de cuentas en el panel. **C)** Dos roles (administrador y editor). **Recomendación: A** para el MVP; C contradice el «único rol privilegiado» de PROD:10.

#### I-07 · Alcance de la «auditoría básica»

- **Severidad:** menor.
- **Evidencia:** ESP:15 «gestiona datos internos con auditoría básica»; ARQ:28 «identity: [...] autorización y auditoría»; RDM:28 sitúa «auditoría» en la Fase 3. Ninguna fuente define qué se audita.
- **Roadmap:** atribuye la auditoría a `identity` (RM:386) sin definirla.
- **Decisión:** **A)** En el MVP, la auditoría básica cubre las transiciones de solicitudes y los inicios de sesión, sin PII. **B)** Además, la autoría de las ediciones de contenido. **C)** Sólo lo que el stack ofrezca por defecto. **Recomendación: A**; B se puede añadir si el stack lo da sin coste.

#### I-08 · Aviso de nuevas solicitudes

- **Severidad:** menor.
- **Evidencia:** ARQ:29 «notifications: eventual envío externo»; PROD:31 sitúa las notificaciones transaccionales en v0.3; ESP:124 deja el correo transaccional «si se necesitara».
- **Roadmap:** C-07 lo trata como bloqueante de H0 (RM:556).
- **Decisión:** **A)** Sin avisos en el MVP; el administrador revisa la bandeja. **B)** Un aviso interno al administrador, sin datos personales en el mensaje. **Recomendación: A**, y sacarlo de los bloqueantes de H0: sólo afecta a D-19, que es diferible.

---

## 2. Estados y transiciones de las solicitudes

### 2.1 Inventario literal

| Fuente | Texto literal sobre estados de Solicitud | Qué implica |
|---|---|---|
| PROD:17 | «registrar cambios de estado» | Hay más de un estado y cambios manuales en el MVP |
| PROD:22 | «automatizaciones que modifiquen solicitudes» fuera del MVP | Ninguna transición automática |
| PROD:26 | «historial de eventos y transiciones controladas» en V0.2 | Las transiciones *controladas* son de v0.2 |
| PROD:36 | «Cliente no controla estado» | El solicitante nunca fija el estado |
| ESP:43 | RF-09 «cambio de estado restringido» | Restricción en el MVP, sin decir de qué tipo |
| ESP:48 | RF-14 «Registro interno de fecha y estado» | Estado y fecha, como mínimo |
| ESP:68 | «estado inicial administrado en servidor» | Existe un estado inicial, sin nombre |
| ESP:81 | «cambia entre estados permitidos» | Un conjunto cerrado de estados |
| ESP:83 | «solicitudes de estado inválidas [...] fallan» | Hay transiciones inválidas, es decir, un grafo |
| ESP:90 | «estado interno inicial» | Repite ESP:68 |
| ARQ:37 | «control de estados válido» | Validación en servidor o en la base de datos |
| RDM:28 | «Transiciones autorizadas, auditoría» en la Fase 3 | Igual que PROD:26 |

**Nombres de estado:** no aparece ninguno en ninguna fuente. **Estados terminales:** no aparecen en ninguna fuente. **Reapertura, eliminación o archivo:** no aparecen en ninguna fuente. **Quién ejecuta:** el servidor fija el inicial (ESP:68); el resto, sólo el administrador (ESP:24, ESP:83). ESP:22 permite también al administrador crear solicitudes «por formulario validado», por lo que el estado inicial es el mismo para cualquier creador.

Como referencia para otros objetos: Proyecto tiene «borrador/inactivo» (ESP:62), «proyectos no publicados» (ESP:21), «estado de publicación» (ESP:74) y «retirar publicación» (ESP:76); Servicio tiene «estado público» (ESP:89) y «desactivados» (ESP:39). Tampoco ahí hay nombres cerrados.

### 2.2 Hallazgos

#### I-09 · Los estados de la solicitud no existen en ninguna fuente

- **Severidad:** bloqueante H0.
- **Evidencia:** tabla 2.1. RF-09, RF-14, F2 y F4 dependen de ellos (ESP:43, 48, 68, 81-83).
- **Roadmap:** C-01 (RM:689) y la sección 3.4 (RM:359) lo dejan pendiente con tres restricciones correctas: estado inicial en servidor, ningún estado que implique reserva, presupuesto u orden, y migrabilidad a v0.2.
- **Análisis:** sin estados no se pueden escribir las pruebas negativas de F4, ni definir los filtros explícitos de la bandeja (ESP:43), ni probar en POC-1 el «control de estados válido» (ARQ:37). La retención (ESP:100) también necesita saber cuándo una solicitud está terminada.
- **Decisión:** **A)** Adoptar la PROPUESTA P-A (2.3). **B)** Adoptar la PROPUESTA P-B (2.3). **C)** Ejecutar las POC con P-A como supuesto y decidir antes del ADR. **Recomendación: A**, por ser la mínima que cumple las tres restricciones; C es aceptable si el responsable no puede decidir ya.

#### I-10 · ¿Grafo de transiciones en el MVP o en v0.2?

- **Severidad:** importante.
- **Evidencia:** el MVP exige «estados permitidos» y que las «solicitudes de estado inválidas» fallen (ESP:81, 83), además de «control de estados válido» (ARQ:37). Pero PROD:26 y RDM:28 sitúan las «transiciones controladas/autorizadas» en v0.2 y en la Fase 3.
- **Roadmap:** INV-07 («solo cambia por una transición permitida», RM:344) da por hecho el grafo en el MVP sin mencionar PROD:26.
- **Decisión:** **A)** MVP con un conjunto cerrado de estados y cualquier cambio entre estados no terminales; el grafo llega en v0.2. **B)** MVP con un grafo explícito validado en servidor. **C)** Estado como texto libre. **Recomendación: B** con P-A: con tres estados, el grafo tiene tres aristas y su coste es mínimo, y así se cumple ESP:83 de forma literal. C incumple RF-09.

#### I-11 · Estados terminales, reapertura y eliminación

- **Severidad:** importante.
- **Evidencia:** ninguna fuente define el cierre. ESP:100 exige «retención y eliminación definidas»; RF-13 fija los períodos «antes de producción» (ESP:47).
- **Roadmap:** no lo trata; MVP-08, criterio 2, pide un procedimiento de retención (RM:213), pero no lo vincula a ningún estado.
- **Decisión:** **A)** Los estados terminales son definitivos; un nuevo contacto genera una solicitud nueva; la eliminación sólo afecta a solicitudes terminadas y la aplica el procedimiento de retención. **B)** Se permite reabrir (de terminal a en gestión), registrándolo como transición. **Recomendación: A** para el MVP: es más simple de probar y fija un punto de inicio claro para el plazo de retención.

### 2.3 Propuestas de máquina de estados mínima (PROPUESTA, pendiente de decisión)

Los nombres son provisionales y deben aprobarse. Ninguno evoca reserva, presupuesto ni orden de trabajo (PROD:38; ESP:95).

**PROPUESTA P-A: tres estados con motivo de cierre**

```text
            (servidor)
 creación ──────────► recibida ──► en_gestion ──► cerrada
                          │                          ▲
                          └──────────────────────────┘
 cerrada exige motivo_cierre ∈ {atendida, descartada, duplicada, spam}
```

- **Transiciones válidas (3):** `recibida → en_gestion`, `recibida → cerrada`, `en_gestion → cerrada`. Las demás se rechazan en servidor.
- **Ejecutor:** el servidor fija `recibida`; el administrador hace el resto. No hay transiciones automáticas (PROD:22).
- **Terminal:** `cerrada`; marca el inicio del plazo de retención (I-11).
- **Implicaciones:** la bandeja tiene tres filtros de estado más uno de motivo. Las pruebas de F4 cubren tres transiciones válidas y tres inválidas, más las de sesión y permisos. La migración a v0.2 es directa: las solicitudes `en_gestion` son las candidatas a convertirse en OrdenTrabajo. El inconveniente es que `en_gestion` no distingue «esperando al cliente» de «revisando».

**PROPUESTA P-B: cinco estados orientados a v0.2**

```text
 creación ─► recibida ─► en_revision ─► contactada ─► cerrada
                 │             │             │
                 └─────────────┴─────────────┴──► descartada
```

- **Transiciones válidas (6):** `recibida → en_revision`, `en_revision → contactada`, `contactada → cerrada` y las tres hacia `descartada`.
- **Terminales:** `cerrada` y `descartada`.
- **Implicaciones:** la bandeja es más expresiva y `contactada` anticipa el punto en que v0.2 crearía una OrdenTrabajo. A cambio, hay seis transiciones válidas y catorce inválidas que probar, `contactada` depende de un contacto que ocurre fuera del sistema y sin registro, y existe la tentación de añadir estados como «presupuestada», prohibidos por INV-10 (RM:347). El riesgo de que el MVP crezca (R-08, RM:643) es mayor.

**Recomendación:** P-A. Cumple ESP:81-83 y ARQ:37 con el menor número de pruebas y deja el modelado fino para v0.2, que es donde PROD:26 lo sitúa.

---

## 3. Notas privadas e historial de eventos (EventoSolicitud)

### 3.1 Inventario

| Fuente | Notas | Historial o eventos |
|---|---|---|
| PROD | «Notas internas» en V0.2 (PROD:27); el cliente no las controla (PROD:36) | «historial de eventos» en V0.2 (PROD:26) |
| ESP | Lectura de «notas privadas» por el administrador (ESP:21); «Modificar estado y notas» (ESP:24); «registra observaciones privadas» (ESP:81); no llegan a interfaces públicas (ESP:83); el solicitante no puede enviarlas (ESP:90) | «registra autor, fecha y transición cuando corresponda» (ESP:82); EventoSolicitud «opcional en MVP pero recomendable: actor administrativo, evento y timestamp» (ESP:91); «auditoría básica» (ESP:15) |
| ARQ | `operations` incluye «notas internas» (ARQ:27), sin «futuros» | `identity` incluye «auditoría» (ARQ:28) |
| RDM | — | «historial» y «auditoría» en la Fase 3 (RDM:27-28) |
| UX, AGENTS, README | No aparecen | No aparecen |

ESP pone notas y registro de transiciones en el MVP, y ARQ incluye las notas internas en el dominio actual sin marcarlas como futuras; PROD y RDM las sitúan después. ESP declara basarse en PROD (ESP:3), pero en este punto amplía su alcance.

### 3.2 Hallazgos

#### I-12 · ¿Hay notas privadas en el MVP?

- **Severidad:** bloqueante H0 (determina el modelo de Solicitud y la prueba de acceso por campo en POC-1).
- **Evidencia:** tabla 3.1.
- **Roadmap:** C-03 (RM:691) y la sección 3.1 (RM:318) lo dejan pendiente, sin citar ESP:21, ESP:90 ni ARQ:27.
- **Decisión:** **A)** El MVP tiene un único campo de observaciones internas por solicitud, editable sólo por el administrador; las notas con historial llegan en v0.2. **B)** No hay notas en el MVP y se corrigen ESP:24, ESP:81 y ARQ:27. **C)** Las notas son eventos inmutables desde el MVP (ver I-13, opción N-3). **Recomendación: A**: cumple F4 sin adelantar v0.2, y B deja la bandeja sin contexto operativo.

#### I-13 · ¿EventoSolicitud entra en el MVP, y con qué forma?

- **Severidad:** bloqueante H0.
- **Evidencia:** ESP:82 exige registrar cada transición «cuando corresponda»; ESP:91 la declara opcional; PROD:26 y RDM:27 llevan el historial a v0.2 y a la Fase 3.
- **Roadmap:** C-02 (RM:690) la deja pendiente, pero INV-08 (RM:345) y MVP-12, criterio 4 (RM:260), ya la dan por obligatoria.
- **Alternativas y consecuencias:**

| Opción | Modelo | Cumple ESP:82 | Impacto en privacidad | Impacto en H5 | Migración a v0.2 |
|---|---|---|---|---|---|
| **N-1** Sin EventoSolicitud | Solicitud con `estado`, `estado_cambiado_en` y `estado_cambiado_por` | Sólo la última transición | Mínimo | Mínimo | Sin historial que migrar |
| **N-2** Eventos sólo de transición | EventoSolicitud de sólo inserción: solicitud, estado anterior, estado nuevo, actor, fecha y motivo de cierre opcional. Las notas son un campo de Solicitud (I-12 A) | Sí | Bajo: los eventos no llevan texto libre | Más pruebas: un evento no se puede editar ni borrar por API, nunca se expone en público y cada transición genera exactamente uno | El historial se migra tal cual |
| **N-3** Eventos de transición y de nota | Igual que N-2, con eventos de nota de texto libre | Sí | Alto: texto libre con PII en un registro pensado para no borrarse | Interfaz de historial y pruebas de borrado en cascada | Adelanta las «notas internas» de v0.2 |

- **Decisión:** **A)** N-1. **B)** N-2. **C)** N-3. **Recomendación: B**: cumple ESP:82 de forma literal, sigue la recomendación de ESP:91, no añade texto libre al registro inmutable y deja hecha la base del «historial de eventos» de PROD:26. N-3 adelanta trabajo de v0.2 (riesgo R-08).

#### I-14 · Privacidad de notas y eventos

- **Severidad:** importante (bloquea H6 y H7, no H0 ni H1).
- **Evidencia:** ESP:100 pide evitar «contraseñas u otra información innecesaria», no registrar PII en trazas y definir «retención y eliminación»; ARQ:39 exige backups cifrados. Cómo se eliminan los eventos o las notas, y qué ocurre con los backups que conservan datos borrados, no aparece en ninguna fuente.
- **Roadmap:** MVP-08, criterio 2 (RM:213) exige un procedimiento de retención, pero no menciona notas, eventos ni backups.
- **Análisis:** las observaciones de un servicio técnico tienden a recoger contraseñas de equipos o datos de terceros. Con N-2, los eventos no llevan texto libre, pero sí el actor y las fechas.
- **Decisión:** **A)** Borrar una solicitud elimina en cascada sus notas y eventos; los backups caducan dentro de un plazo declarado en la política; el formulario de notas advierte de que no se escriban credenciales. **B)** Al borrar se anonimiza la solicitud y se conservan los eventos sin datos personales. **Recomendación: A**, más simple de verificar; B sólo se justifica si hace falta estadística histórica, y eso no aparece en ninguna fuente.

#### I-15 · El actor de EventoSolicitud es siempre administrativo

- **Severidad:** menor.
- **Evidencia:** ESP:91 «actor administrativo»; la creación la hace un visitante anónimo (ESP:14, ESP:22).
- **Roadmap:** «Cada evento tiene un actor administrativo» [Definido] (RM:331).
- **Decisión:** **A)** La creación no es un evento; queda en la fecha de creación de la Solicitud. **B)** El actor admite el valor «sistema». **Recomendación: A**, coherente con ESP:91 y con N-2.

### 3.3 Efecto en H5

El criterio de salida de H5 (RM:597-600) presupone que hay notas («Las notas no aparecen en ninguna respuesta pública») y un registro de transiciones sin forma definida. Con I-12 A e I-13 B, hay que añadir: (1) cada transición válida crea exactamente un evento; (2) ningún evento se puede modificar ni borrar por ningún canal; (3) las notas y los eventos no aparecen en respuestas públicas, en logs ni en el sitemap; (4) borrar una solicitud por retención borra sus notas y eventos.

---

## 4. Decisiones de stack y POC

### 4.1 Clasificación de D-01 a D-19

Clases: **(a)** requiere POC antes de decidir; **(b)** decidible por documento o ADR sin POC (aunque una POC la pueda confirmar); **(c)** diferible a después del MVP o al gate de producción.

| ID | Clase | POC que la cierra | Observación |
|---|---|---|---|
| D-01 Arquitectura y framework | a | POC-1, POC-2 y, si procede, POC-C | Obligatoria según ARQ:13 |
| D-02 CMS, panel y acceso a datos | a | POC-1 | Debe incluir acceso por campo a notas y eventos inmutables (I-17) |
| D-03 Base de datos | a, como validación | POC-1 y POC-4 | Ninguna fuente ofrece una alternativa: se valida, no se compara. Si gana B o C, pasa a (b) |
| D-04 Renderizado y propagación | a | POC-1 y POC-2 | Con el criterio corregido de I-01 |
| D-05 Estilos y componentes | b | — | La medición del bundle en POC-1 basta; los tokens dependen de la exploración visual (UX:65), no de una POC |
| D-06 Medios en staging y producción | a para el control de acceso; c para el proveedor de producción | Ninguna POC actual cubre la subida ni el acceso privado (I-16) | El roadmap atribuye su cierre a POC-3 (RM:425), pero POC-3 no tiene medios (S-06) |
| D-07 Autenticación administrativa | a para el mecanismo; b para el segundo factor y la recuperación | POC-1 | Depende de I-06 |
| D-08 Antiabuso | b | POC-3 valida | La familia de mecanismo se puede decidir por criterios de privacidad (RM:427); no bloquea ADR-0001 |
| D-09 Idempotencia | b | POC-3 valida | Decisión de diseño; no bloquea ADR-0001 |
| D-10 Runtime y versiones | a, junto con D-01 | POC-1 | ARQ:14 |
| D-11 Empaquetado y despliegue | a | POC-4 | ARQ:18 |
| D-12 Hosting | b para staging (antes de POC-4, ver I-18); c para producción (H7) | POC-4 sólo para staging | El roadmap trata ambos como uno (RM:431) |
| D-13 CDN o túnel | c | — | Sólo afecta a producción |
| D-14 Plataforma de CI | b | — | AGENTES.md:8 y RDM:16 ya la orientan |
| D-15 Herramientas de prueba | b | POC-1 confirma | El E2E ya está fijado en ARQ:41; el runner unitario depende de D-01 |
| D-16 Observabilidad | b mínima en H2; c herramienta de alertas | — | Logs sin PII validados en POC-3 |
| D-17 Backups | a el simulacro de restauración; b el destino provisional (ver I-18) | POC-4 | ARQ:18 y ARQ:39 |
| D-18 Escaneo de dependencias | b | — | Antes de H2 (RM:569) |
| D-19 Correo transaccional | c | — | Depende de I-08 |

**Cobertura:** las POC-1 a POC-4 y POC-C cubren todas las decisiones de clase (a) excepto dos huecos: la protección de medios privados (D-06, ARQ:16 punto 3) y la validación de transiciones, notas y eventos en el CMS candidato (D-02, ARQ:5 y ARQ:37). Además, POC-4 necesita un entorno que el roadmap pretende decidir con la propia POC-4.

### 4.2 Hallazgos

#### I-16 · Ninguna POC cubre la subida y la protección de medios

- **Severidad:** bloqueante H1.
- **Evidencia:** ARQ:16 hace obligatoria la «Subida y despliegue de medios, protección de datos personales»; RF-10 exige proteger los «medios privados» (ESP:44).
- **Roadmap:** el alcance de POC-1 (RM:457-462) no incluye medios; POC-3 es el formulario y no tiene adjuntos (S-06); POC-4 sólo hace backup de medios (RM:491). Aun así, D-06 dice que la desbloquean «POC-3 y POC-4» (RM:425).
- **Decisión:** **A)** Ampliar POC-1 con la subida de una imagen asociada a un borrador y una prueba negativa de descarga anónima. **B)** Crear una POC-5 específica. **C)** Aplazarlo a H3 y aceptar el riesgo. **Recomendación: A**: es la misma superficie de control de acceso que ya prueba POC-1, y C contradice ARQ:13 («antes de fijar dependencias»).

#### I-17 · POC-1 no prueba la lógica de negocio de las solicitudes

- **Severidad:** bloqueante H1.
- **Evidencia:** ARQ:5 «funcionalidades de negocio requerirán servicios explícitos y reglas de acceso propias»; ARQ:37 «control de estados válido».
- **Roadmap:** POC-1 sólo crea solicitudes y las lee como administrador (RM:459). El criterio de fracaso (RM:469) sólo se fija en borradores y solicitudes.
- **Análisis:** el riesgo principal del CMS candidato no está en el CRUD, sino en imponer transiciones en servidor, ocultar un campo a ciertos canales y garantizar que un registro sea de sólo inserción.
- **Decisión:** **A)** Añadir a POC-1 una transición válida y otra inválida de la máquina elegida, el campo de notas con acceso restringido por cada canal y un evento que no se pueda modificar. **B)** Dejarlo para H5. **Recomendación: A**. Requiere que I-09, I-12 e I-13 estén decididas o se tomen como supuesto explícito.

#### I-18 · POC-4 depende de decisiones que, según el roadmap, decide ella misma

- **Severidad:** bloqueante H1.
- **Evidencia:** ARQ:18 pide desplegar «detrás de proxy/Coolify»; ARQ:46 dice que staging «podría» ejecutarse en Proxmox/Coolify.
- **Roadmap:** POC-4 necesita «un entorno no productivo» y un «backup cifrado» (RM:490-491), pero D-12 y D-17 figuran como desbloqueadas por POC-4 (RM:431, 436).
- **Decisión:** **A)** El responsable designa, antes de POC-4, un entorno no productivo provisional y un destino de backup provisional, sin que eso sea la decisión final de D-12 ni de D-17. **B)** POC-4 se hace sólo en local con contenedores, y el despliegue tras el proxy pasa a H2. **C)** POC-4 se aplaza a H2. **Recomendación: A**. B y C dejan sin validar el punto 5 de ARQ:18 antes del ADR.

#### I-19 · Alcance de ADR-0001 frente a lo que necesita H2

- **Severidad:** importante.
- **Evidencia:** AGENTS.md:6 condiciona el scaffold a «aprobar el stack mediante prueba de concepto y registrar ADR». AGENTS.md:21 pide documentar las decisiones importantes en ADR.
- **Roadmap:** ADR-0001 resuelve D-01 a D-04 y D-10 (RM:440, 563), pero el criterio de salida de H2 (RM:569-573) necesita además D-07, D-11, D-12 (staging), D-14, D-15, D-17 y D-18.
- **Decisión:** **A)** ADR-0001 cubre D-01 a D-04 y D-10, y la entrada en H2 exige además ADR breves (o una sección del ADR-0001) para D-07, D-11, D-12 (staging), D-14, D-15, D-17 y D-18. **B)** Todo en ADR-0001. **Recomendación: A**: así ADR-0001 no se retrasa por decisiones de clase (b).

#### I-20 · Alcance de la comparación con la Candidata B

- **Severidad:** importante.
- **Evidencia:** RDM:11 «Medir POC, comparar con Astro»; ARQ:8 plantea B como comparativa y ARQ:13-20 sólo obliga a la POC de A.
- **Roadmap:** POC-2 reducida (RM:471-476; C-09).
- **Decisión:** **A)** POC-2 reducida, como propone el roadmap y con el criterio de I-01. **B)** Comparación sólo documental. **C)** POC completa de B. **Recomendación: A**: B no produce «mediciones» como pide RDM:11, y C duplica el esfuerzo sin indicios de que A vaya a fracasar.

---

## 5. Dependencias entre H0, H1 y H2

### 5.1 Qué bloquea cada paso según las fuentes

- **Empezar las POC (salida de H0):** ninguna fuente lo condiciona a aprobar los documentos de producto. RDM:10 sitúa la POC en la Fase 0 y en «rama separada». Sin embargo, BOOT:160 dice que el bootstrap «no implica que la POC del producto esté autorizada», lo que presupone una autorización expresa que no se ha dado por escrito. ORQ:155-156 coloca además la POC después del piloto de jz-ai (ver I-23).
- **Pasar de H1 a H2 (scaffold):** AGENTS.md:6 y AGENTS.md:25 exigen un stack aprobado mediante POC y un ADR registrado. RDM:9-12 añade, según se lea, el contenido, la identidad visual, la privacidad y el hosting (I-02). El roadmap añade que el ADR no se acepta sin H0 cerrado (RM:562), y H0 incluye wireframes y exploración visual (RM:556).
- **Pasar de H2 a H3:** los tokens visuales (RM:577), que dependen de UX:65, y los wireframes (UX:76).

### 5.2 Verificación de C-08 y de la regla «el producto no se bloquea por jz-ai M1–M3»

Los hitos M1–M3 de jz-ai no aparecen en ninguna fuente de esta rama (búsqueda sin resultados fuera de RM). La regla del responsable, por tanto, sólo se puede contrastar con lo que las fuentes dicen sobre jz-ai y sobre la orquestación en general. Pasajes que la contradicen o pueden leerse en su contra:

| # | Pasaje | Por qué choca con la regla |
|---|---|---|
| 1 | ORQ:155-156: «0D piloto jz-ai mínimo [...] gates A–E» antes de «0E arquitectura del producto: POC» | Ordena el piloto de jz-ai antes de la POC del producto. **C-08 queda confirmada.** |
| 2 | ORQ:149 (gate E: Caveman «off → record → compress») y ORQ:138 (Caveman requiere Node ≥ 22.13) | Como 0D incluye los gates A–E, la POC del producto quedaría también bloqueada por el piloto de Caveman y por la actualización de Node, que BOOT:152 aún no da por aprobada |
| 3 | ORQ:156: POC «con tres ejecutores colaborando sobre trabajo controlado» | Hace depender la POC de que funcionen los tres ejecutores (fase 0C, ORQ:154) |
| 4 | ORQ:140: «Experimento de aceptación (antes de escalar)» | Si la POC se considera «escalar», queda bloqueada por los pilotos A–E |
| 5 | BOOT:158-160: gate de fase B, «Después: [...] pequeño piloto de `jz-ai`» y la POC «no» está autorizada | No bloquea por sí mismo, pero refuerza el orden de ORQ §9 |
| 6 | RDM:18: «Configuración efectiva de agentes y handoff» en la Fase 1 | Si se lee como jz-ai configurado, bloquea el paso a la Fase 2. El roadmap lo neutraliza en RM:676, pero sin corregir `ROADMAP.md` |
| 7 | ORQ:94: «al menos una revisión cruzada por proveedor distinto en tareas relevantes» | No es jz-ai, pero si se exige para cada PR del producto, éste depende de que OpenCode con dos proveedores funcione |
| 8 | ORQ:152 y ORQ:158: la propuesta de orquestación se incorpora al PR #1, que no se fusiona «hasta aprobar especificación y ADR» | Acopla la aprobación de los documentos del producto con la de la propuesta de IA (ver I-24) |
| 9 | ORQ:72 y ORQ:75: los subagentes `jz-backend` y `jz-devops` se definen sobre «Payload» y «Coolify» | No bloquea, pero presupone la Candidata A antes del ADR |

En cambio, AGENTES.md:40 («`jz-ai` opcional») y RM:671-677 son compatibles con la regla. **Nota:** ORQ:97 exige ejecutar «tareas autónomas en aislamiento técnico real» antes de escalar. Eso es un control de seguridad del host (fase 0B), no un hito de jz-ai, y sí puede aplicarse legítimamente a una POC ejecutada por agentes.

### 5.3 Hallazgos

#### I-21 · H0 acopla al ADR decisiones que no le afectan

- **Severidad:** bloqueante H0.
- **Evidencia:** ninguna fuente exige wireframes, exploración visual ni la aprobación de UX para decidir el stack. UX:76 sitúa los wireframes «antes de implementación», no antes del ADR.
- **Roadmap:** H0 incluye wireframes, de dos a tres direcciones visuales y todas las preguntas de producto (RM:556), y el ADR no se acepta sin H0 cerrado (RM:562).
- **Decisión:** **A)** Mantener H0 como está. **B)** Dividir H0 en **H0-a** (decisiones de dominio que necesitan las POC: I-06, I-09, I-10, I-12, I-13; autorización de las POC; alcance de POC-2; entorno provisional; independencia de jz-ai) y **H0-b** (wireframes, dirección visual, lista de contenidos y responsables), de modo que H1 dependa sólo de H0-a y H3 de H0-b. **Recomendación: B**. Es el cambio que más acorta el camino crítico.

#### I-22 · No hay una autorización escrita para empezar las POC

- **Severidad:** bloqueante H0.
- **Evidencia:** BOOT:160 «El bootstrap **no** implica que la POC del producto esté autorizada»; AGENTS.md:25 «la implementación requiere decisión de arquitectura aprobada»; RDM:10 prevé la POC «en rama separada».
- **Roadmap:** las reglas comunes de las POC (RM:450-452) son correctas, pero no dicen quién las autoriza.
- **Decisión:** **A)** El responsable autoriza por escrito las POC: worktree propio, datos sintéticos, sin producción ni DNS, código desechable y alcance de la sección 6 con los añadidos de I-16 e I-17. **B)** Esperar a cerrar H0 completo. **Recomendación: A**. Una POC no es el scaffold que prohíbe AGENTS.md:6, pero conviene que la autorización conste.

#### I-23 · C-08: el orden de ORQ §9 contradice la regla del responsable

- **Severidad:** bloqueante H0.
- **Evidencia:** pasajes 1 a 5 de la tabla 5.2.
- **Roadmap:** C-08 (RM:696) propone confirmar que «las fases 0A–0D no bloquean H0–H1», pero no menciona el gate E ni la condición de «tres ejecutores» de 0E, y no cubre H2 en adelante.
- **Decisión:** **A)** El responsable declara que el carril del producto (H0 a H7) es independiente de ORQ §9 (0A a 0E) y de jz-ai M1–M3, que la POC no requiere tres ejecutores y que sólo se mantiene como requisito el control de seguridad de ORQ:97 para tareas autónomas. **B)** Mantener el orden de ORQ §9. **C)** Exigir sólo 0B antes de la POC. **Recomendación: A**, que incluye lo razonable de C sin acoplar el producto a Caveman, a la actualización de Node ni a los pilotos multiejecutor.

#### I-24 · El mecanismo de aprobación de las fuentes puede crear un bloqueo circular

- **Severidad:** bloqueante H0.
- **Evidencia:** README.md:9 dice que se trabaja en `docs/fase-0-definicion` «mediante pull request». ORQ:152 incorpora la propuesta de IA al PR #1, y ORQ:158 dice «No fusionar PR #1 [...] hasta aprobar especificación y ADR». Que el PR #1 sea el de `docs/fase-0-definicion` es una inferencia: ninguna fuente lo afirma de forma explícita.
- **Roadmap:** H0 exige «documentos fuente marcados como aprobados» (RM:557), y H1 que el ADR no se acepte sin H0 cerrado (RM:562).
- **Análisis:** si «aprobado» significa fusionado, el PR espera al ADR y el ADR espera a la aprobación: un ciclo. Además, aprobar el producto arrastraría la aprobación de la propuesta de orquestación.
- **Decisión:** **A)** Aprobar los documentos de producto en un PR propio, que cambie su línea de estado e indique fecha y commit, separado de los documentos de IA. **B)** Un registro de decisiones del responsable que apruebe secciones concretas sin fusionar. **C)** Fusionar el PR #1 tal cual. **Recomendación: A**, con B como complemento para las decisiones de H0-a; C contradice ORQ:158.

#### I-25 · Otros pasajes que pueden bloquear el producto por herramientas

- **Severidad:** importante.
- **Evidencia:** pasajes 6, 7 y 9 de la tabla 5.2, y AUD:379 («La ubicación y el lenguaje de `jz-ai` (ADR) antes de su primer incremento»), que puede competir por la numeración de `docs/adr/` con el `0001-stack.md` que ARQ:20 reserva.
- **Roadmap:** RM:676 resuelve RDM:18 sólo dentro del roadmap y no trata ORQ:94 ni la numeración de ADR.
- **Decisión:** **A)** Corregir RDM:18 («instrucciones y plantilla de handoff en el repositorio»), declarar opcional para el producto la revisión cruzada de ORQ:94 (con la revisión humana como requisito) y reservar `docs/adr/0001` para el stack, con otro espacio para los ADR de jz-ai. **B)** Dejarlo como está. **Recomendación: A**.

#### I-26 · ORQ remite a unas contradicciones «C1–C9» que no existen en la rama

- **Severidad:** menor.
- **Evidencia:** ORQ:152 «revisar contradicciones C1–C9 señaladas por Claude en docs». No aparecen en ningún documento de `0e57214`; no coinciden con C-01 a C-13 del roadmap.
- **Decisión:** **A)** El responsable localiza ese listado y se concilia con C-01 a C-13. **B)** Se declara sustituido por la sección 11 del roadmap y por este análisis. **Recomendación: B**, salvo que el listado original contenga algo que no esté aquí.

#### I-27 · Hitos estrictamente secuenciales

- **Severidad:** menor.
- **Evidencia:** RDM:3 dice que las fases son «incrementales, no compromisos de entrega». No hay ninguna fuente que exija que el portafolio preceda al servicio técnico; PROD:5 pide además que no dependan entre sí.
- **Roadmap:** «Los hitos son secuenciales» (RM:552).
- **Decisión:** **A)** Tras H2, H3 y H4 pueden avanzar en paralelo, y H5 depende de H4. **B)** Mantener la secuencia estricta. **Recomendación: A**, coherente con la independencia que pide PROD:5 y con worktrees separados (AGENTES.md:11).

### 5.4 Camino crítico mínimo propuesto

```text
H0-a  decisiones I-06, I-09, I-10, I-12, I-13, I-18, I-20, I-22, I-23, I-24
  │
  ├─► POC-1 (con I-16 e I-17) ─► POC-3 (mismo stack) ─┐
  ├─► POC-2 reducida ─────────────────────────────────┤
  └─► POC-4 (en el entorno provisional de I-18) ──────┴─► ADR-0001 (D-01–D-04, D-10)
                                                              │
                     ADR breves D-07, D-11, D-12 staging, D-14, D-15, D-17, D-18
                                                              │
                                                              ▼
                                                     H2 base técnica
H0-b (wireframes, dirección visual, lista de contenidos) ─── en paralelo ───► H3
```

Ningún nodo depende de jz-ai, de los pilotos A–E de ORQ ni de Caveman.

---

## 6. Cierre

### 6.1 Decisiones requeridas, ordenadas por el momento en que bloquean

| Bloquea | Hallazgo | Pregunta | Recomendación |
|---|---|---|---|
| H0 | I-24 | ¿Cómo se aprueban las fuentes sin depender del PR #1? | A: PR propio de producto, con registro de decisiones |
| H0 | I-23 | ¿El carril del producto es independiente de ORQ §9 y de jz-ai M1–M3? | A: sí, salvo el aislamiento de ORQ:97 |
| H0 | I-21 | ¿Se divide H0 en H0-a y H0-b? | B: sí |
| H0 | I-22 | ¿Se autorizan por escrito las POC? | A: sí, con las reglas de RM:450-452 |
| H0 | I-09 | Máquina de estados de la Solicitud | A: P-A |
| H0 | I-12 | ¿Hay notas privadas en el MVP? | A: un campo único de observaciones |
| H0 | I-13 | Forma de EventoSolicitud | B: N-2, eventos sólo de transición |
| H1 | I-16 | Cobertura de medios privados en la POC | A: ampliar POC-1 |
| H1 | I-17 | Transiciones, notas y eventos en la POC | A: ampliar POC-1 |
| H1 | I-18 | Entorno y destino de backup provisionales para POC-4 | A: los designa el responsable |
| H1 | I-02 | Puntos de la Fase 0 que bloquean el scaffold | C: mixto, por hito |
| H1 | I-06 | Número de administradores y gestión de cuentas | A: uno, con procedimiento documentado |
| H1 | I-20 | Alcance de la comparación con B | A: POC-2 reducida |
| H1 | I-01 | Formulación de la métrica de publicación | B: sin commit, con tiempo de propagación medido |
| H1 | I-10 | ¿Grafo de transiciones en el MVP? | B: sí, con P-A |
| H2 | I-19 | ADR necesarios para entrar en H2 | A: ADR-0001 y ADR breves |
| H2 | I-25 | Corregir RDM:18, ORQ:94 y la numeración de ADR | A |
| H2+ | I-11 | Estados terminales y reapertura | A: sin reapertura |
| H2+ | I-27 | Paralelismo de H3 y H4 | A |
| H2+ | I-04 | Textos de servicios y proyectos destacados | A |
| H2+ | I-07 | Alcance de la auditoría básica | A |
| H2+ | I-15 | Actor de EventoSolicitud | A |
| H6–H7 | I-14 | Borrado de notas, eventos y backups | A |
| H7 | I-03 | ¿El MVP se publica antes de v0.2? | A |
| — | I-08 | Avisos de nuevas solicitudes | A: no hay en el MVP |
| — | I-05 | Reetiquetado de [Definido] | A |
| — | I-26 | Listado C1–C9 de ORQ | B: se da por sustituido |

### 6.2 Cambios propuestos al roadmap, una vez decididos (no aplicados)

1. Cambiar el encabezado a «borrador de trabajo» y enlazar este análisis.
2. Sección 8: dividir H0 en H0-a y H0-b; H1 depende sólo de H0-a y H3 de H0-b (I-21). Permitir H3 en paralelo con H4 (I-27).
3. Sección 3.4: añadir la máquina de estados elegida, con nombres, transiciones, terminales y ejecutor (I-09 a I-11). Reetiquetar INV-07 e INV-08 según la decisión (I-05).
4. Secciones 3.1 y 3.2: añadir el campo de observaciones internas (I-12), la forma de EventoSolicitud (I-13) y corregir la relación con UsuarioAdmin (I-15). Añadir los textos de servicios y el indicador «destacado» (I-04).
5. MVP-12 y H5: añadir los cuatro criterios de la sección 3.3.
6. MVP-08 y H6: incluir notas, eventos y backups en el procedimiento de retención (I-14).
7. D-04, MVP-10 criterio 8 y POC-1: sustituir «sin redespliegue» por la formulación elegida (I-01).
8. Sección 5: añadir una columna de clase (a), (b) o (c) según la tabla 4.1; corregir D-06 (no la cierra POC-3) y dividir D-12 en staging y producción (I-16, I-18).
9. Sección 6: ampliar POC-1 con medios privados, transiciones, notas y eventos (I-16, I-17); añadir a POC-4 el requisito previo del entorno provisional (I-18).
10. Sección 5, al final, y H2: ADR-0001 más los ADR breves de entrada en H2 (I-19).
11. Sección 8.4 y H0: alinear con la decisión de I-02, y proponer la corrección correspondiente de `ROADMAP.md`.
12. H7 y sección 8.4: reflejar la decisión de I-03 y, si es A, proponer que la Fase 4 de `ROADMAP.md` pase a ser el endurecimiento de v1.0.
13. Sección 10: enumerar los pasajes de la tabla 5.2 que quedan superados por la decisión de I-23 e I-25, y ampliar C-08 a H2–H7.
14. Sección 11: completar C-01, C-02, C-03, C-05, C-06 y C-08 con la evidencia de la tabla 0.1; rebajar C-07 (I-08); retirar C-12 una vez resuelto I-24.
15. MVP-09 y D-07: reflejar la decisión de I-06.

### 6.3 Propuesta de criterio de salida de H0 (verificable)

H0 (H0-a, si se acepta I-21) se considera cerrado cuando **todas** estas comprobaciones dan resultado positivo:

1. **Registro de decisiones:** existe en el repositorio un documento firmado por el responsable, con fecha y commit, que responde por escrito a I-06, I-09, I-10, I-12, I-13, I-18, I-20, I-22, I-23 e I-24. Se comprueba con `git log` sobre ese archivo, cuyo autor debe ser el responsable.
2. **Fuentes aprobadas:** `PRODUCTO.md` y `ESPECIFICACION-FUNCIONAL.md` muestran en su línea de estado «Aprobado» con fecha, o enumeran expresamente qué secciones siguen en borrador, mediante un PR que no contiene documentos de orquestación de IA (I-24).
3. **Dominio cerrado:** `ESPECIFICACION-FUNCIONAL.md` §4 y §5 contienen los nombres literales de los estados, la tabla de transiciones válidas, los estados terminales y la decisión sobre notas y EventoSolicitud. Una búsqueda de «estado» en §5 devuelve los nombres decididos.
4. **POC autorizadas:** el registro del punto 1 contiene la autorización, con el alcance de POC-1 a POC-4 incluyendo los añadidos de I-16 e I-17, el alcance de POC-2 y el entorno y destino de backup provisionales de POC-4.
5. **Independencia de jz-ai:** `AGENTS.md`, o una nota fechada en `ORQUESTACION-IA-PROPUESTA.md` §9, declara que el carril del producto no depende de 0A–0E ni de jz-ai M1–M3. Se comprueba con una búsqueda del texto en esos archivos.
6. **Roadmap actualizado:** `ROADMAP-MVP.md` incorpora los cambios 2, 3, 4, 8 y 9 de la sección 6.2, y ningún criterio de salida de H0 a H2 menciona jz-ai, Caveman ni los pilotos A–E de ORQ.

H0-b (que no bloquea H1 ni H2) se cierra con los wireframes revisados con los cinco criterios de UX:70-74, la dirección visual elegida y la lista de contenidos con su responsable, que es lo que RM:557 ya pide.
