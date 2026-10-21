# Roadmap del MVP — jozeuzz.cl

> **Estado:** propuesta de Fase 0 para revisión del responsable del proyecto. Fecha: 2026-10-15.
> **Naturaleza:** especificación y plan. No autoriza scaffold, instalación de dependencias ni despliegues (AGENTS.md, «Estado actual» y «Fase 0»).
> **Fuentes:** `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/PRODUCTO.md`, `docs/ESPECIFICACION-FUNCIONAL.md`, `docs/ARQUITECTURA.md`, `docs/UX-ARQUITECTURA-INFORMACION.md`, `docs/ROADMAP.md` y `docs/AGENTES.md`. `docs/ORQUESTACION-IA-PROPUESTA.md` se consultó solo para delimitar la relación con jz-ai.

## Índice

0. [Convenciones de este documento](#0-convenciones-de-este-documento)
1. [Alcance del MVP](#1-alcance-del-mvp)
2. [Funcionalidades del MVP](#2-funcionalidades-del-mvp)
3. [Modelo de dominio](#3-modelo-de-dominio)
4. [Arquitectura propuesta](#4-arquitectura-propuesta)
5. [Decisiones pendientes de stack](#5-decisiones-pendientes-de-stack)
6. [POC propuestas](#6-poc-propuestas)
7. [Despliegue y entornos](#7-despliegue-y-entornos)
8. [Hitos del MVP](#8-hitos-del-mvp)
9. [Riesgos y supuestos](#9-riesgos-y-supuestos)
10. [Relación con jz-ai](#10-relación-con-jz-ai)
11. [Preguntas abiertas y contradicciones de las fuentes](#11-preguntas-abiertas-y-contradicciones-de-las-fuentes)
12. [Anexo: trazabilidad de requisitos](#12-anexo-trazabilidad-de-requisitos)

---

## 0. Convenciones de este documento

### 0.1 Etiquetas

Cada afirmación relevante lleva una de estas etiquetas:

- **[Definido]**: lo establece un documento fuente; se cita el archivo y la sección. Hereda el estado de aprobación de ese documento.
- **[Propuesto]**: lo propone este roadmap para cerrar un hueco o concretar un requisito. No vale como decisión hasta que lo apruebe el responsable del proyecto.
- **[Pendiente]**: las fuentes no lo definen, lo dejan abierto o se contradicen. Se registra en la sección 5 (stack) o en la sección 11 (producto). No se resuelve aquí.

### 0.2 Estado real de las fuentes

Ningún documento fuente está aprobado formalmente. `PRODUCTO.md` es una «Propuesta para revisión», `ESPECIFICACION-FUNCIONAL.md` es un «borrador de Fase 0, sujeto a aprobación», `ARQUITECTURA.md` es una «Hipótesis a validar» y `UX-ARQUITECTURA-INFORMACION.md` es un «Borrador de arquitectura de información». Tampoco existe todavía ninguna ADR: `docs/adr/0001-stack.md` figura como pendiente (ARQUITECTURA.md, «Validación POC obligatoria», punto 7). Por lo tanto, **[Definido]** significa «definido en una fuente vigente de Fase 0», no «aprobado de forma irrevocable». Aprobar las fuentes es parte del hito H0 (sección 8).

### 0.3 Forma de citar

Las citas usan el formato `ARCHIVO.md › sección`. Por ejemplo, `ESPECIFICACION-FUNCIONAL.md › §3 RF-06` o `PRODUCTO.md › Fuera del MVP`.

### 0.4 Relación con `ROADMAP.md`

`ROADMAP.md` define las fases generales del proyecto (Fase 0 a Fase 4). Este documento detalla el tramo que corresponde a la versión v0.1 de `PRODUCTO.md` y no reemplaza a `ROADMAP.md`. La correspondencia entre fases e hitos está en la sección 8.4.

---

## 1. Alcance del MVP

### 1.1 Propósito

**[Definido]** El MVP v0.1 une un portafolio profesional, que es la entrada principal a la identidad jozeuzz.cl, con una sección de servicio técnico que capta solicitudes y se administra internamente. Ambas partes comparten infraestructura y diseño, pero no deben mezclar públicos, accesos ni procesos (PRODUCTO.md › Visión; ESPECIFICACION-FUNCIONAL.md › §1). Además, el portafolio no debe depender funcionalmente del sistema de reparaciones (PRODUCTO.md › Visión).

### 1.2 Qué entra

| # | Elemento del alcance | Estado | Fuente |
|---|---|---|---|
| A-01 | Inicio profesional con identidad, especialidades y acceso a proyectos y servicios | [Definido] | PRODUCTO.md › MVP v0.1; ESPECIFICACION-FUNCIONAL.md › §3 RF-01 |
| A-02 | Perfil: presentación, formación, experiencia y competencias basadas en datos autorizados | [Definido] | PRODUCTO.md › MVP v0.1; ESPECIFICACION-FUNCIONAL.md › §3 RF-02 |
| A-03 | Catálogo de proyectos publicados y página de detalle (caso de estudio) | [Definido] | ESPECIFICACION-FUNCIONAL.md › §3 RF-03, RF-04 |
| A-04 | Catálogo de servicios técnicos editables y categorizados | [Definido] | PRODUCTO.md › MVP v0.1; ESPECIFICACION-FUNCIONAL.md › §3 RF-05 |
| A-05 | Formulario público de solicitud con validación en servidor, antiabuso, aviso de privacidad, confirmación y almacenamiento seguro | [Definido] | PRODUCTO.md › MVP v0.1; ESPECIFICACION-FUNCIONAL.md › §3 RF-06, RF-07, RF-13 |
| A-06 | Contacto profesional por canales autorizados, separado del formulario de reparaciones | [Definido] | ESPECIFICACION-FUNCIONAL.md › §3 RF-11 |
| A-07 | Panel autenticado para editar perfil, proyectos, servicios, medios y textos sin tocar código | [Definido] | PRODUCTO.md › MVP v0.1; ESPECIFICACION-FUNCIONAL.md › §3 RF-08, §7 |
| A-08 | Panel autenticado para listar y gestionar solicitudes con cambios de estado restringidos | [Definido] | PRODUCTO.md › MVP v0.1; ESPECIFICACION-FUNCIONAL.md › §3 RF-09, RF-14 |
| A-09 | Lectura pública exclusiva de contenido publicado; borradores protegidos en backend, API y medios | [Definido] | ESPECIFICACION-FUNCIONAL.md › §3 RF-10 |
| A-10 | SEO: metadatos por página, sitemap, robots, OpenGraph, canonical, datos estructurados apropiados y páginas de error | [Definido] | PRODUCTO.md › MVP v0.1; ESPECIFICACION-FUNCIONAL.md › §3 RF-12 |
| A-11 | Accesibilidad (objetivo WCAG 2.2 AA), diseño responsive y móvil primero | [Definido] | PRODUCTO.md › MVP v0.1; ESPECIFICACION-FUNCIONAL.md › §6 «Web» |
| A-12 | Página de privacidad accesible desde los formularios | [Definido] | ESPECIFICACION-FUNCIONAL.md › §3 RF-13; UX-ARQUITECTURA-INFORMACION.md › §1 |
| A-13 | Observabilidad mínima, monitoreo básico, backup y restauración verificables, pruebas automatizadas y pipeline de CI | [Definido] | PRODUCTO.md › MVP v0.1; ESPECIFICACION-FUNCIONAL.md › §6 «Operación», §7 |
| A-14 | Filtros básicos de proyectos y servicios por categorías administrables | [Definido], prioridad *Should* | ESPECIFICACION-FUNCIONAL.md › §3 RF-15 |
| A-15 | Vista previa de contenido no publicado, restringida a usuarios autorizados | [Definido], prioridad *Should* | ESPECIFICACION-FUNCIONAL.md › §3 RF-16; aparece como paso de F3 en §4 |

**[Propuesto]** Los elementos *Should* (A-14 y A-15) entran en el MVP, pero se pueden diferir si al cerrar el hito correspondiente comprometen los *Must*. Cualquier aplazamiento se registra de forma explícita. La vista previa (A-15) tiene una tensión con el flujo F3 que se describe en la sección 11 (C-04).

### 1.3 Qué no entra y por qué

| Excluido del MVP | Motivo según las fuentes | Fuente |
|---|---|---|
| Pago en línea y facturación electrónica | Se declaran fuera del MVP («no prometer») | PRODUCTO.md › Fuera del MVP; ESPECIFICACION-FUNCIONAL.md › §3 «No incluidos» |
| Reservas automáticas | Una cita no equivale a una solicitud; los modelos deben estar separados | PRODUCTO.md › Reglas fundamentales, 4; ESPECIFICACION-FUNCIONAL.md › §5 «Límites explícitos» |
| Órdenes de trabajo y modelo Cliente–Equipo–Solicitud–OrdenTrabajo | Corresponden a v0.2 y a la Fase 3 | PRODUCTO.md › V0.2; ROADMAP.md › Fase 3; ESPECIFICACION-FUNCIONAL.md › §3 «No incluidos» |
| Presupuestos o cotizaciones aprobables | Corresponden a v0.3; el cliente nunca controla precio ni presupuesto | PRODUCTO.md › V0.3 y v1.0; PRODUCTO.md › Reglas fundamentales, 2 |
| Inventario | Fuera del MVP | PRODUCTO.md › Fuera del MVP |
| Seguimiento público de solicitudes, portal de cliente y autenticación de clientes finales | Riesgo de exponer datos de terceros; el portal solo se consideraría en v0.2 con identidad comprobada | PRODUCTO.md › Reglas fundamentales, 1; PRODUCTO.md › V0.2; ESPECIFICACION-FUNCIONAL.md › §2 |
| Roles de técnico o de cliente autenticado | «No crear estos roles preventivamente» | ESPECIFICACION-FUNCIONAL.md › §2 |
| Varios técnicos, sucursales o multitenancy | Solo si hay necesidad demostrada | PRODUCTO.md › Fuera del MVP |
| Flujo de aprobación entre varios administradores | Fuera de v0.1 | ESPECIFICACION-FUNCIONAL.md › §3 «No incluidos» |
| Integración con WhatsApp y chat público de IA | Fuera del MVP | PRODUCTO.md › Fuera del MVP |
| Automatizaciones que modifiquen solicitudes | Fuera del MVP; los cambios de estado son operaciones del administrador | PRODUCTO.md › Fuera del MVP; ESPECIFICACION-FUNCIONAL.md › §4 F4 |
| Fotos y adjuntos en solicitudes, diagnóstico y asignación interna | Corresponden a v0.2 | PRODUCTO.md › V0.2 |
| Notificaciones transaccionales | Corresponden a v0.3; el correo transaccional sigue sin resolverse | PRODUCTO.md › V0.3 y v1.0; ESPECIFICACION-FUNCIONAL.md › §8 |
| Artículos o notas técnicas (RF-17, *Could*) | No se activan hasta que haya contenido editorial | ESPECIFICACION-FUNCIONAL.md › §3 RF-17 |
| Redis, colas, microservicios y Kubernetes | No se usan mientras no estén justificados | ARQUITECTURA.md › Políticas técnicas; README.md › Principios |
| Importación de datos de `ProyectoST_Portfolio` | Solo con revisión y autorización; en demostración, solo datos sintéticos | ESPECIFICACION-FUNCIONAL.md › §6 «Datos de demostración» |

**[Pendiente]** El idioma secundario no está definido (PRODUCTO.md › Pendientes de producto). Mientras no se decida, el MVP se plantea solo en español (**[Propuesto]**).

### 1.4 Criterios globales de aceptación del MVP

**[Definido]** Son las métricas de PRODUCTO.md › Métricas de aceptación del MVP y la definición de terminado de ESPECIFICACION-FUNCIONAL.md › §7:

1. Un editor autorizado crea y publica un proyecto sin hacer commit.
2. Una persona encuentra el portafolio y el servicio técnico desde el móvil.
3. Una solicitud válida se registra una sola vez y el usuario recibe confirmación.
4. Un visitante anónimo no puede consultar ni modificar solicitudes ajenas, administrar servicios ni enumerar datos personales.
5. Las pruebas unitarias, de integración y E2E críticas pasan en CI, y el despliegue y la restauración están documentados.
6. Los flujos F1–F4 se pueden completar y demostrar.
7. Los controles de permisos tienen pruebas negativas.
8. La carga y el acceso a medios están verificados.
9. El CI incluye pruebas significativas, build y análisis de dependencias.
10. Despliegue, backup y restauración están comprobados en un entorno no productivo.
11. Antes de publicar se revisan el contenido real, los enlaces, la privacidad, el SEO y la accesibilidad.

---

## 2. Funcionalidades del MVP

Cada funcionalidad indica sus requisitos de origen, su flujo principal y sus criterios de aceptación. Los flujos F1–F4 están **[Definidos]** en ESPECIFICACION-FUNCIONAL.md › §4. Cuando un criterio concreta un requisito de forma verificable, figura como **[Propuesto]** y conserva su fuente. Las rutas son tentativas y dependen del diseño UX (ARQUITECTURA.md › Rutas tentativas; UX-ARQUITECTURA-INFORMACION.md › §1).

### MVP-01. Inicio profesional

- **Origen:** RF-01; UX-ARQUITECTURA-INFORMACION.md › §2, §3.
- **Flujo principal (F1, pasos 1–2):** el visitante llega a `/` desde un buscador o un enlace, ve la identidad, la propuesta profesional y los proyectos destacados, y elige entre el CTA primario «Explorar proyectos» y el secundario «Ver servicios técnicos».
- **Criterios de aceptación:**
  1. [Definido] El inicio muestra la identidad, las especialidades y accesos directos a proyectos y a servicios (RF-01).
  2. [Definido] El servicio técnico tiene una entrada visible e independiente, con copy y CTA distintos de los del portafolio (UX §1).
  3. [Propuesto] Si no hay proyectos destacados publicados, el bloque no se muestra o muestra un estado vacío pertinente, nunca tarjetas de relleno (UX §4).
  4. [Definido] Desde el inicio se llega a un caso de estudio en pocos pasos, con teclado y en móvil (UX §6, criterios 1 y 3).

### MVP-02. Perfil profesional («Sobre mí» y experiencia)

- **Origen:** RF-02; UX §1 y §3; PRODUCTO.md › MVP v0.1.
- **Flujo principal:** el visitante abre `/sobre-mi` y consulta presentación, formación, experiencia y competencias. Puede seguir a proyectos o a contacto.
- **Criterios de aceptación:**
  1. [Definido] Todo el contenido sale de la entidad editorial Perfil, que se edita desde el panel (RF-02, RF-08; ESPECIFICACION-FUNCIONAL.md › §5).
  2. [Definido] No aparecen experiencia, títulos, clientes, testimonios ni certificaciones inventados (ESPECIFICACION-FUNCIONAL.md › §1).
  3. [Definido] Las secciones opcionales sin datos no se muestran vacías (criterio de RF-04, aplicado aquí por analogía: **[Propuesto]**).
  4. [Pendiente] Que `/experiencia` sea una página propia o una parte de `/sobre-mi` (UX §1). Se decide con los wireframes.

### MVP-03. Catálogo de proyectos

- **Origen:** RF-03, RF-10, RF-15 (*Should*); UX §3 y §4.
- **Flujo principal (F1, paso 3):** el visitante abre `/proyectos`, filtra por categoría si existe el filtro y abre un proyecto.
- **Criterios de aceptación:**
  1. [Definido] Solo aparecen proyectos publicados. Un proyecto en borrador o inactivo nunca aparece ni se puede consultar de forma anónima (F1, «Aceptación»; RF-10).
  2. [Propuesto] Una petición anónima a un proyecto no publicado, por ruta pública o por API, obtiene la misma respuesta que un slug inexistente, para no revelar que existe (ESPECIFICACION-FUNCIONAL.md › §6 «Seguridad», prevención de enumeración).
  3. [Definido] Sin proyectos publicados, se muestra un estado vacío sin tarjetas de relleno (UX §4).
  4. [Definido] La lista es indexable (UX §3; ESPECIFICACION-FUNCIONAL.md › §6 «SEO»).
  5. [Propuesto] Si se implementa RF-15, las categorías se administran desde el panel y no se muestran filtros que darían un resultado vacío.

### MVP-04. Detalle de proyecto (caso de estudio)

- **Origen:** RF-04; UX §3 y §5.
- **Flujo principal (F1, pasos 3–4):** el visitante abre `/proyectos/[slug]`, lee el contexto, la contribución, el stack, las decisiones, los resultados y los medios, y sigue a un repositorio o demo, a GitHub, a LinkedIn o a contacto, solo si esos enlaces están configurados.
- **Criterios de aceptación:**
  1. [Definido] Los campos opcionales vacíos no generan secciones vacías (RF-04).
  2. [Definido] Los enlaces externos solo aparecen si están configurados (F1, paso 4).
  3. [Definido] La página tiene metadatos propios, canonical y OpenGraph (RF-12).
  4. [Definido] Las imágenes tienen texto alternativo (ESPECIFICACION-FUNCIONAL.md › §6 «Web»).
  5. [Definido] Se priorizan las evidencias de trabajo frente a las listas de logos de tecnologías (UX §5).

### MVP-05. Catálogo de servicios técnicos

- **Origen:** RF-05, RF-15; PRODUCTO.md › Reglas fundamentales, 3; UX §3 y §4.
- **Flujo principal (F2, paso 1):** el visitante abre `/servicios`, consulta la oferta, el alcance, las condiciones y las preguntas frecuentes, y pulsa «Solicitar revisión».
- **Criterios de aceptación:**
  1. [Definido] Los servicios desactivados no se muestran ni se pueden seleccionar al solicitar (RF-05; UX §4).
  2. [Definido] Los precios se muestran en CLP como referencia o como «a cotizar», según la política definida, y nunca con los valores de ejemplo en `USD` del prototipo (PRODUCTO.md › Reglas fundamentales, 3; UX §5).
  3. [Pendiente] Si se mostrarán precios y con qué política (ESPECIFICACION-FUNCIONAL.md › §8). Mientras no se decida, el modelo admite ambas modalidades y el contenido real decide.
  4. [Definido] Sin servicios activos, se muestra un estado vacío pertinente (UX §4).
  5. [Definido] La presentación evita equiparar el servicio técnico a una competencia profesional o a una certificación (UX §1).

### MVP-06. Solicitud pública de servicio técnico

- **Origen:** RF-06, RF-07, RF-13, RF-14; F2; PRODUCTO.md › Reglas fundamentales, 1, 2 y 4; ARQUITECTURA.md › Dominios y límites («intake»), Seguridad relevante heredada del prototipo.
- **Flujo principal (F2):**
  1. El visitante abre `/servicios/solicitar`, ya sea directamente o desde un servicio.
  2. Rellena los datos mínimos: identificación y contacto, categoría o equipo y descripción del problema. Puede elegir un servicio activo. Ve el aviso de privacidad.
  3. El servidor valida tipos, longitudes, origen, límites, que el servicio esté activo y el antispam, y rechaza cualquier campo administrativo.
  4. El servidor guarda la solicitud con un identificador interno, el estado inicial asignado en servidor, las marcas de tiempo y una señal antiduplicados.
  5. El visitante recibe una confirmación genérica que no expone datos personales.
- **Criterios de aceptación:**
  1. [Definido] Las entradas inválidas o abusivas se rechazan (F2, «Aceptación»).
  2. [Propuesto] Si un envío incluye campos como estado, notas, precio, presupuesto, fechas de auditoría o identificador, la solicitud se rechaza o esos campos se ignoran. Una prueba de integración verifica que el registro guardado no los contiene (PRODUCTO.md › Reglas fundamentales, 2; ARQUITECTURA.md › Seguridad heredada).
  3. [Definido] El estado inicial y las fechas los asigna el servidor (RF-14).
  4. [Propuesto] Enviar dos veces la misma solicitud válida, por doble clic o por reintento tras un error de red, deja un único registro (RF-07; PRODUCTO.md › Métricas, 3). El mecanismo concreto está pendiente (D-09).
  5. [Definido] La confirmación es genérica y no habilita consultas por correo electrónico (F2, paso 5; PRODUCTO.md › Reglas fundamentales, 1).
  6. [Propuesto] Al superar el límite de envíos por origen, la respuesta es una denegación comprensible y la prueba lo verifica (ESPECIFICACION-FUNCIONAL.md › §6 «Seguridad», rate limit).
  7. [Definido] El formulario cubre los estados de carga, error de validación por campo, error de red, éxito, doble clic y reintento (UX §4).
  8. [Definido] El aviso de privacidad es accesible desde el formulario (RF-13).
  9. [Definido] El formulario no pide contraseñas ni otra información innecesaria (ESPECIFICACION-FUNCIONAL.md › §6 «Privacidad»).
  10. [Definido] No se registra información personal en errores ni trazas (ESPECIFICACION-FUNCIONAL.md › §6 «Privacidad»; AGENTS.md › Disciplina obligatoria).
  11. [Definido] Ninguna ruta pública permite listar ni leer solicitudes (ESPECIFICACION-FUNCIONAL.md › §2; ARQUITECTURA.md › Seguridad heredada).
  12. [Pendiente] Si al llegar una solicitud se notifica al administrador, y por qué canal (ver C-07).

### MVP-07. Contacto profesional

- **Origen:** RF-11; UX §3.
- **Flujo principal:** el visitante abre `/contacto` y usa un canal autorizado, como un correo o un enlace externo.
- **Criterios de aceptación:**
  1. [Definido] El contacto profesional está separado del formulario de reparaciones (RF-11; UX §3).
  2. [Definido] Solo se muestran canales aprobados por el titular (PRODUCTO.md › Pendientes de producto; UX §2, «Footer»).
  3. [Propuesto] En el MVP, el contacto profesional no guarda datos personales en el sistema; usa canales externos (RF-11, «inicialmente»).

### MVP-08. Privacidad

- **Origen:** RF-13; UX §1; ESPECIFICACION-FUNCIONAL.md › §6 «Privacidad».
- **Flujo principal:** el visitante abre `/privacidad` desde el formulario o desde el pie de página.
- **Criterios de aceptación:**
  1. [Definido] La política y los plazos de retención están aprobados antes de producción (RF-13; UX §1).
  2. [Propuesto] La retención y la eliminación descritas en la política tienen un procedimiento operativo documentado y probado en staging (ESPECIFICACION-FUNCIONAL.md › §6 «Privacidad»: «retención y eliminación definidas»).
  3. [Pendiente] El texto legal y los plazos. Ningún agente debe redactarlos como definitivos (PRODUCTO.md › Pendientes de producto).

### MVP-09. Acceso administrativo

- **Origen:** F3, paso 1; ESPECIFICACION-FUNCIONAL.md › §2, §5 (UsuarioAdmin), §6 «Seguridad»; ARQUITECTURA.md › Dominios y límites («identity»).
- **Flujo principal:** el administrador abre `/admin`, inicia sesión y accede al panel. Al terminar la sesión, o si caduca, vuelve al login.
- **Criterios de aceptación:**
  1. [Definido] Todo `/admin` y toda operación administrativa, sea por API, UI, REST, GraphQL, formularios o acciones de servidor, exige sesión y autorización comprobadas en el servidor (ESPECIFICACION-FUNCIONAL.md › §2; ARQUITECTURA.md › Políticas técnicas).
  2. [Definido] El acceso se deniega por defecto (ESPECIFICACION-FUNCIONAL.md › §6 «Seguridad»).
  3. [Definido] El login tiene rate limit, las cookies o sesiones están bien configuradas y hay protección CSRF acorde al mecanismo (ESPECIFICACION-FUNCIONAL.md › §6 «Seguridad»).
  4. [Definido] `/admin` no es indexable, sin tratar `robots` como medida de seguridad (ESPECIFICACION-FUNCIONAL.md › §6 «SEO»; PRODUCTO.md › Reglas fundamentales, 5).
  5. [Definido] La UX cubre la sesión expirada, el acceso denegado y los errores recuperables (UX §4).
  6. [Pendiente] El mecanismo de autenticación y las medidas adicionales de protección, como el segundo factor (D-07). La cantidad de administradores iniciales también está pendiente (ESPECIFICACION-FUNCIONAL.md › §8).

### MVP-10. Administración de contenido y medios

- **Origen:** RF-08, RF-10, RF-16; F3; PRODUCTO.md › Métricas, 1.
- **Flujo principal (F3):** el administrador crea o edita un proyecto (o el perfil), sube imágenes, fija el estado de publicación, previsualiza, publica y comprueba el resultado público. Más tarde puede retirar la publicación sin borrar el registro.
- **Criterios de aceptación:**
  1. [Definido] Un editor autorizado crea y publica un proyecto sin hacer commit (PRODUCTO.md › Métricas, 1).
  2. [Definido] La API no permite leer borradores de forma anónima (F3, «Aceptación»; RF-10).
  3. [Definido] Retirar una publicación no elimina el registro (F3, paso 4).
  4. [Propuesto] El slug de un proyecto es único, y el sistema rechaza un slug duplicado con un error comprensible (ESPECIFICACION-FUNCIONAL.md › §5).
  5. [Propuesto] Los medios asociados solo a contenido no publicado no se pueden descargar de forma anónima, aunque se conozca su URL (RF-10, «medios privados»).
  6. [Definido] La carga y el acceso a medios están verificados con pruebas (ESPECIFICACION-FUNCIONAL.md › §7).
  7. [Definido, *Should*] La vista previa solo está disponible para usuarios autorizados (RF-16).
  8. [Propuesto] Los cambios publicados se reflejan en el sitio público sin redesplegar; el tiempo máximo de propagación se fija en la POC (depende de D-04).

### MVP-11. Administración del catálogo de servicios

- **Origen:** RF-05, RF-08; PRODUCTO.md › MVP v0.1.
- **Flujo principal:** el administrador crea o edita un servicio (nombre, descripción, categoría, modalidad de precio y orden), lo activa o lo desactiva y comprueba el catálogo público.
- **Criterios de aceptación:**
  1. [Definido] Un servicio desactivado desaparece del catálogo y del selector del formulario (RF-05; UX §4).
  2. [Propuesto] Desactivar un servicio no borra ni altera las solicitudes que lo referencian.
  3. [Definido] La modalidad de precio es «CLP referencial» o «a cotizar» (ESPECIFICACION-FUNCIONAL.md › §5).
  4. [Definido] Un visitante no puede crear, editar ni desactivar servicios (ESPECIFICACION-FUNCIONAL.md › §2; PRODUCTO.md › Métricas, 4).

### MVP-12. Gestión interna de solicitudes

- **Origen:** RF-09, RF-14; F4; ESPECIFICACION-FUNCIONAL.md › §5 (Solicitud, EventoSolicitud).
- **Flujo principal (F4):** el administrador revisa la bandeja con los filtros permitidos, abre el detalle, añade observaciones privadas y cambia la solicitud a un estado permitido. La operación registra autor, fecha y transición.
- **Criterios de aceptación:**
  1. [Definido] Fallan los cambios de estado inválidos, los no autenticados y los que no tienen permiso (F4, «Aceptación»).
  2. [Definido] Las notas privadas nunca llegan a interfaces públicas (F4, «Aceptación»).
  3. [Definido] Los filtros de la bandeja están definidos explícitamente; no se aceptan filtros arbitrarios desde parámetros de consulta (RF-09; ARQUITECTURA.md › Seguridad heredada, filtros enviados desde query params).
  4. [Definido] Cada transición registra autor, fecha y transición cuando corresponda (F4, paso 3).
  5. [Pendiente] El conjunto de estados y sus transiciones. Ninguna fuente los define (ver C-01).
  6. [Pendiente] Si el registro de transiciones usa la entidad EventoSolicitud o campos de la propia Solicitud (ver C-02).
  7. [Propuesto] Las pruebas negativas de integración cubren el acceso anónimo, el acceso con sesión no administrativa, las transiciones no permitidas y la inyección de filtros.

### MVP-13. SEO y páginas de error

- **Origen:** RF-12; PRODUCTO.md › MVP v0.1; ESPECIFICACION-FUNCIONAL.md › §6 «SEO»; UX §4.
- **Criterios de aceptación:**
  1. [Definido] Cada página pública tiene metadatos propios, canonical y OpenGraph; existen sitemap y robots (RF-12).
  2. [Definido] Las páginas públicas se sirven con HTML indexable donde corresponda (ESPECIFICACION-FUNCIONAL.md › §6 «SEO»).
  3. [Propuesto] El sitemap solo contiene URLs públicas publicadas; nunca borradores ni `/admin`.
  4. [Definido] Se usan datos estructurados apropiados (PRODUCTO.md › MVP v0.1). [Pendiente] Qué tipos concretos se usan.
  5. [Definido] La página 404 ofrece volver al inicio o a proyectos (UX §4).

### MVP-14. Requisitos transversales de experiencia

- **Origen:** ESPECIFICACION-FUNCIONAL.md › §6 «Web» y «Rendimiento»; UX §2, §4 y §5.
- **Criterios de aceptación:**
  1. [Definido] El objetivo es WCAG 2.2 AA, comprobado con pruebas manuales y automatizadas: teclado, foco perceptible, textos alternativos y contraste.
  2. [Definido] Las acciones principales se pueden completar en móvil y con teclado (UX §6, 3).
  3. [Definido] Las animaciones respetan la preferencia de movimiento reducido (UX §5).
  4. [Definido] El contenido público se puede leer sin JavaScript en la medida que permita la arquitectura aprobada (UX §4). [Pendiente] Cuánto, porque depende de D-04.
  5. [Pendiente] Los presupuestos de rendimiento y las metas de Core Web Vitals se fijan después de la POC (ESPECIFICACION-FUNCIONAL.md › §6 «Rendimiento»).
  6. [Definido] Ninguna ruta ni CTA lleva a secciones vacías (UX §6, 5).

### MVP-15. Operación y calidad

- **Origen:** PRODUCTO.md › MVP v0.1; ESPECIFICACION-FUNCIONAL.md › §6 «Calidad», «Operación» y §7; ARQUITECTURA.md › Políticas técnicas.
- **Criterios de aceptación:**
  1. [Definido] Lint, typecheck, pruebas, build y escaneo de dependencias se exigen antes de fusionar (ARQUITECTURA.md › Políticas técnicas).
  2. [Definido] Hay pruebas unitarias, de integración de permisos y E2E de F1–F4 en CI (ESPECIFICACION-FUNCIONAL.md › §6 «Calidad»).
  3. [Definido] Los logs son estructurados, con correlación y sin PII, y hay alertas (ARQUITECTURA.md › Políticas técnicas).
  4. [Definido] Hay backup de la base de datos y de los medios, cifrado y un simulacro de restauración; un snapshot del contenedor no basta (ARQUITECTURA.md › Políticas técnicas).
  5. [Definido] Las migraciones están versionadas y el rollback está documentado (ESPECIFICACION-FUNCIONAL.md › §6 «Operación»).
  6. [Definido] Los secretos están fuera de Git (ARQUITECTURA.md › Políticas técnicas; AGENTS.md › Disciplina obligatoria).

---

## 3. Modelo de dominio

### 3.1 Entidades

**[Definido]** Las entidades y sus atributos mínimos vienen de ESPECIFICACION-FUNCIONAL.md › §5. Se agrupan según los dominios de ARQUITECTURA.md › Dominios y límites.

| Entidad | Dominio | Atributos mínimos según la fuente | Observaciones |
|---|---|---|---|
| **Perfil** | content | resumen, presentación, educación y experiencia, enlaces externos, competencias | Entidad editorial única |
| **Proyecto** | content | título, slug único, resumen, contenido detallado, etiquetas o tecnologías, medios, enlaces verificables, visibilidad, SEO | RF-04 añade contexto, contribución, decisiones y resultados como contenido opcional |
| **Servicio** | service-catalog | nombre, slug, descripción, categoría, estado público, modalidad de precio (CLP referencial o «a cotizar»), orden | — |
| **Solicitud** | intake / operations | id, nombre y canal de contacto, tipo de equipo, descripción, referencia opcional a un servicio activo, estado interno inicial, fechas | El solicitante nunca aporta estado, notas ni cotización |
| **EventoSolicitud** | operations / identity | actor administrativo, evento, marca de tiempo | «Opcional en MVP pero recomendable» (ver C-02) |
| **Media** | content | archivo, tipo, visibilidad, propietario o editor, restricciones de acceso | — |
| **UsuarioAdmin** | identity | identidad administrativa, mínimo privilegio, mecanismos de protección | El número inicial de usuarios está pendiente |

**[Pendiente]** Las fuentes nombran conceptos que §5 no modela como entidad:

- **Categoría o taxonomía.** RF-05 pide servicios «categorizados», RF-15 habla de «categorías administrables» y ARQUITECTURA.md › Dominios y límites incluye «taxonomías». Falta decidir si las categorías de proyectos y de servicios son una entidad administrable o un valor fijo, y si ambas comparten taxonomía.
- **Nota interna de una solicitud.** RF-09 y F4 permiten registrar notas privadas, pero el modelo de Solicitud no tiene un atributo para ellas (ver C-03).
- **Publicaciones o artículos** (RF-17, *Could*). Quedan fuera del MVP (sección 1.3).

### 3.2 Relaciones

| Relación | Cardinalidad | Estado | Fuente |
|---|---|---|---|
| Proyecto — Media | Un proyecto tiene 0..N medios; un medio puede usarse en 0..N proyectos | [Propuesto] cardinalidad; [Definido] la relación | ESPECIFICACION-FUNCIONAL.md › §5 (Proyecto: «medios») |
| Perfil — Media | El perfil tiene 0..N medios | [Propuesto] | UX §3 («CV opcional»); ESPECIFICACION-FUNCIONAL.md › §3 RF-08 |
| Servicio — Categoría | Cada servicio pertenece a una categoría | [Definido] la relación; [Pendiente] si la categoría es una entidad | RF-05; ESPECIFICACION-FUNCIONAL.md › §5 |
| Proyecto — Etiqueta o tecnología | 0..N | [Definido] la relación; [Pendiente] si es una entidad | ESPECIFICACION-FUNCIONAL.md › §5 |
| Solicitud — Servicio | Una solicitud referencia 0..1 servicio, que debe estar activo al crearla | [Definido] | ESPECIFICACION-FUNCIONAL.md › §5; F2, paso 3 |
| Solicitud — EventoSolicitud | Una solicitud tiene 0..N eventos | [Definido] la relación; [Pendiente] si es obligatoria | ESPECIFICACION-FUNCIONAL.md › §5; F4, paso 3 |
| EventoSolicitud — UsuarioAdmin | Cada evento tiene un actor administrativo | [Definido] | ESPECIFICACION-FUNCIONAL.md › §5 |
| Media — UsuarioAdmin | Cada medio tiene un propietario o editor | [Definido] | ESPECIFICACION-FUNCIONAL.md › §5 |

### 3.3 Invariantes

| ID | Invariante | Estado y fuente |
|---|---|---|
| INV-01 | El contenido no publicado (proyectos, borradores, medios privados, notas) nunca se entrega a un actor no autenticado, por ningún canal | [Definido] RF-10; ESPECIFICACION-FUNCIONAL.md › §2 |
| INV-02 | El slug de un proyecto es único | [Definido] ESPECIFICACION-FUNCIONAL.md › §5 |
| INV-03 | [Propuesto] El slug de un servicio es único | Extensión de INV-02; el modelo de Servicio incluye slug (§5) |
| INV-04 | Una solicitud solo se puede crear con un servicio activo o sin servicio | [Definido] F2, paso 3; ESPECIFICACION-FUNCIONAL.md › §5 |
| INV-05 | El estado, las notas, el precio, el presupuesto y los campos de auditoría de una solicitud nunca vienen del solicitante | [Definido] PRODUCTO.md › Reglas fundamentales, 2; ESPECIFICACION-FUNCIONAL.md › §5 |
| INV-06 | El estado inicial y las marcas de tiempo de la solicitud los asigna el servidor | [Definido] RF-14; F2, paso 4 |
| INV-07 | El estado de una solicitud solo cambia por una transición permitida que ejecuta un administrador autenticado | [Definido] RF-09; F4. [Pendiente] El conjunto de transiciones (C-01) |
| INV-08 | Toda transición de estado queda registrada con autor y fecha | [Definido] F4, paso 3 (ver C-02 sobre su obligatoriedad) |
| INV-09 | Una solicitud válida reenviada no crea duplicados | [Definido] RF-07; PRODUCTO.md › Métricas, 3. [Pendiente] El mecanismo (D-09) |
| INV-10 | Una solicitud no es una reserva ni una orden de trabajo; ninguna entidad del MVP representa ambas cosas | [Definido] PRODUCTO.md › Reglas fundamentales, 4; ESPECIFICACION-FUNCIONAL.md › §5 «Límites explícitos» |
| INV-11 | Un servicio desactivado no es visible públicamente ni seleccionable | [Definido] RF-05; UX §4 |
| INV-12 | Retirar la publicación de un contenido no elimina el registro | [Definido] F3, paso 4 |
| INV-13 | Las solicitudes nunca se exponen por correo electrónico sin verificar la identidad | [Definido] PRODUCTO.md › Reglas fundamentales, 1 |
| INV-14 | Los precios públicos son CLP referenciales o «a cotizar» | [Definido] PRODUCTO.md › Reglas fundamentales, 3 |
| INV-15 | Los logs y las trazas no contienen PII | [Definido] ESPECIFICACION-FUNCIONAL.md › §6 «Privacidad»; ARQUITECTURA.md › Políticas técnicas |
| INV-16 | [Propuesto] Desactivar un servicio no modifica las solicitudes existentes que lo referencian | Derivado de RF-14 (integridad del registro interno) |

### 3.4 Estados

- **Proyecto.** [Definido] Existen al menos los estados borrador o no publicado y publicado, y la publicación se puede retirar sin borrar (F1, F3). F1 menciona «borrador/inactivo». [Pendiente] Si «inactivo» o «retirado» es un estado distinto de «borrador».
- **Servicio.** [Definido] Activo o desactivado (RF-05).
- **Solicitud.** [Pendiente] Ninguna fuente define los estados ni las transiciones. Cualquier propuesta debe cumplir estas restricciones: el estado inicial lo asigna el servidor (RF-14); ningún estado debe implicar reserva, presupuesto aprobado ni orden de trabajo (PRODUCTO.md › Reglas fundamentales, 4; sección 1.3); y el diseño debe permitir migrar al modelo de v0.2 (PRODUCTO.md › V0.2, «migración de datos desde MVP»).

---

## 4. Arquitectura propuesta

### 4.1 Forma general

**[Definido]**

- **Monolito modular** desplegable en un contenedor, sin microservicios prematuros (ARQUITECTURA.md › Candidata A; README.md › Principios). Es la forma de la Candidata A, que es la preferida para la POC; la Candidata B implicaría dos superficies separadas (ARQUITECTURA.md › Candidata B).
- **Separación entre el sitio público y el backoffice** (ESPECIFICACION-FUNCIONAL.md › §1).
- **Autorización deny-by-default en el servidor** para toda operación (ARQUITECTURA.md › Políticas técnicas).

**[Propuesto]** El roadmap describe la arquitectura sin depender de la tecnología, de modo que valga para cualquier candidata que gane el ADR.

### 4.2 Módulos y responsabilidades

**[Definido]** Los dominios son los de ARQUITECTURA.md › Dominios y límites. **[Propuesto]** Las responsabilidades y dependencias del MVP son estas:

| Módulo | Responsabilidad en el MVP | Depende de | No debe |
|---|---|---|---|
| `public-site` | Rutas públicas, renderizado, SEO y estados vacíos y de error | `content`, `service-catalog` (solo lectura de lo publicado), `intake` (envío) | Leer de `operations` ni contenido no publicado |
| `content` | Perfil, proyectos, medios, taxonomías, publicación y vista previa | `identity` | Depender de `operations` (el portafolio no depende de reparaciones, según PRODUCTO.md › Visión) |
| `service-catalog` | Servicios, visibilidad y modalidad de precio | `identity` | Exponer servicios desactivados |
| `intake` | Esquema mínimo del formulario, validación, antiabuso e idempotencia; crea la Solicitud | `service-catalog` (validar servicio activo) | Aceptar campos administrativos; devolver datos de solicitudes |
| `operations` | Bandeja, detalle, notas, estados y transiciones | `identity` | Exponerse en rutas públicas |
| `identity` | Sesión, rol de administrador, autorización y auditoría | — | Crear roles de cliente o de técnico en el MVP |
| `notifications` | Fuera del MVP salvo decisión en contrario (C-07) | — | Enviar datos sensibles innecesarios |

### 4.3 Flujos de datos

```text
Visitante ──► public-site ──► content / service-catalog   (solo lectura de contenido publicado)
Visitante ──► public-site ──► intake ──► Solicitud         (solo creación; respuesta genérica)
Admin ──► /admin ──► identity (sesión + autorización en servidor)
                     ├─► content / service-catalog        (lectura y escritura, publicación, vista previa)
                     └─► operations                       (bandeja, notas, transiciones + registro)
Todos ──► almacén de datos transaccional + almacenamiento de medios
```

### 4.4 Persistencia y medios

- **[Definido]** Las migraciones están versionadas, con índices y constraints, transacciones donde corresponda y control de estados válidos (ARQUITECTURA.md › Políticas técnicas).
- **[Definido]** Los medios se guardan de forma persistente mediante un adaptador soportado: un filesystem controlado en desarrollo y almacenamiento compatible con S3 «si procede» (ARQUITECTURA.md › Candidata A).
- **[Pendiente]** El motor de base de datos (D-03), el almacenamiento de medios en staging y producción (D-06) y el ORM o capa de acceso a datos (D-02).

### 4.5 Políticas técnicas vinculantes

**[Definido]** Vienen de ARQUITECTURA.md › Políticas técnicas: validar y normalizar las entradas en el servidor; protegerse contra abuso y CSRF; redactar la PII en los registros; separar staging de producción; mantener los secretos fuera de Git; dar acceso mínimo a la base de datos; usar HTTPS; tener backups cifrados con simulacro; usar logs estructurados con correlación y alertas sin PII; y no añadir herramientas innecesarias. Además, la reconstrucción no debe repetir ninguno de los patrones inseguros del prototipo (ARQUITECTURA.md › Seguridad relevante heredada del prototipo).

---

## 5. Decisiones pendientes de stack

**[Definido]** No hay stack aprobado. ARQUITECTURA.md presenta las candidatas A, B y C como hipótesis, y AGENTS.md › Estado actual prohíbe el scaffold hasta que el stack se apruebe mediante POC y ADR. La tabla no elige ninguna tecnología: solo enumera las opciones que mencionan las fuentes o, si las fuentes no dan opciones, la naturaleza de la decisión.

En todas las filas, el **responsable** es el responsable del proyecto. Los agentes pueden preparar evidencia, pero no decidir (AGENTS.md › Fase 0; AGENTES.md › Principio).

| ID | Decisión | Opciones (según las fuentes) | Criterios | Qué la desbloquea | Responsable |
|---|---|---|---|---|---|
| D-01 | Arquitectura de aplicación y framework | A: Next.js + React + TypeScript estricto + Payload CMS + PostgreSQL. B: Astro para lo público + backend y panel independientes. C: React Router Framework Mode + backend propio (ARQUITECTURA.md › Candidatas) | Cumplimiento de F1–F4 y RF-10; superficie de despliegue; SEO y HTML indexable; esfuerzo de mantener el panel; complejidad de actualización; coste; experiencia de desarrollo con agentes (ARQUITECTURA.md › Validación POC, 6) | POC-1, POC-2 y, si hiciera falta, POC-C; ADR `docs/adr/0001-stack.md` | Responsable del proyecto |
| D-02 | CMS, panel administrativo y capa de acceso a datos | CMS integrado que también sirve de panel (Payload, en la Candidata A); panel propio sobre un backend (B y C); en A, «no añadir ORM paralelo por defecto» | Reglas de acceso por rol y por campo, borradores y publicación, vista previa, protección de medios, servicios de negocio explícitos para las solicitudes | POC-1 (CRUD de Proyecto y de Solicitud con reglas de acceso) | Responsable del proyecto |
| D-03 | Motor de base de datos | PostgreSQL (Candidata A); B y C no lo especifican | Constraints, transacciones, migraciones versionadas, backup y restauración, operación | POC-1 y POC-4 | Responsable del proyecto |
| D-04 | Estrategia de renderizado y de propagación de cambios | SSR, estático o híbrido «apropiado» (ARQUITECTURA.md › Validación POC, 4); contenido estático en B | HTML indexable, lectura sin JavaScript (UX §4), bundle público, Core Web Vitals, publicación sin redespliegue (PRODUCTO.md › Métricas, 1) | POC-1 y POC-2 con mediciones | Responsable del proyecto |
| D-05 | Estilos y componentes de UI | Tailwind CSS y componentes accesibles (Candidata A); sin opción en B y C | WCAG 2.2 AA, peso del bundle, tokens de diseño tras explorar 2–3 direcciones visuales (UX §5) | POC-1 (medición del bundle) y exploración visual en H0 | Responsable del proyecto |
| D-06 | Almacenamiento de medios en staging y producción | Filesystem controlado; almacenamiento compatible con S3 «si procede» (Candidata A). Proveedor no decidido | Protección de medios privados, backup y restauración conjunta con la base de datos, coste, hosting elegido | POC-3 y POC-4 | Responsable del proyecto |
| D-07 | Autenticación administrativa y protección de cuentas | «Mecanismo seguro compatible con el stack» (F3, paso 1); depende de D-01 y D-02. Ninguna fuente nombra opciones concretas | Sesiones y cookies seguras, CSRF, rate limit del login, prevención de enumeración, mínimo privilegio, recuperación de acceso | POC-1 (reglas de acceso), con revisión de seguridad | Responsable del proyecto |
| D-08 | Mecanismo antiabuso del formulario | Ninguna fuente fija mecanismo ni proveedor. Hay dos familias: controles propios en servidor (rate limit y validaciones) o un servicio externo de desafío, sin proveedor decidido | Eficacia frente a spam, accesibilidad del formulario, privacidad (datos enviados a terceros), dependencia externa | POC-3 | Responsable del proyecto |
| D-09 | Idempotencia y antiduplicados de solicitudes | «Señal anti-duplicados razonable» (F2, paso 4); mecanismo sin definir | Un solo registro por envío válido, ningún bloqueo indebido de reenvíos legítimos, ninguna PII adicional | POC-3 | Responsable del proyecto |
| D-10 | Runtime y versiones exactas | Compatibilidad de Node, framework, CMS y base de datos según la documentación oficial vigente (ARQUITECTURA.md › Validación POC, 1); no se deben asumir versiones (AGENTS.md › Disciplina obligatoria) | Soporte oficial, ventana de mantenimiento, compatibilidad cruzada y con el host | POC-1, con la evidencia de versiones registrada | Responsable del proyecto |
| D-11 | Empaquetado y orquestación del despliegue | Contenedor (Candidata A); Docker multi-stage detrás de un proxy o de Coolify (ARQUITECTURA.md › Validación POC, 5; ROADMAP.md › Fase 1) | Reproducibilidad, migraciones, variables de entorno, rollback | POC-4 | Responsable del proyecto |
| D-12 | Hosting de staging y de producción | Desarrollo y staging «podrían» ir en Proxmox/Coolify; producción, entre VPS administrado y homelab (ARQUITECTURA.md › Hosting). Proveedor de VPS no decidido | Disponibilidad, energía, conectividad, recuperación, coste | POC-4, más la evaluación de disponibilidad del homelab | Responsable del proyecto |
| D-13 | CDN o túnel delante del sitio | Cloudflare Tunnel o CDN «pueden complementar» (ARQUITECTURA.md › Hosting) | Que no sustituya autenticación ni backups; impacto en privacidad y caché de páginas privadas | POC-4 | Responsable del proyecto |
| D-14 | Plataforma de CI | GitHub es la fuente de verdad de CI (AGENTES.md › Herramientas); GitHub Actions figura como tarea de la Fase 1 (ROADMAP.md › Fase 1), sin ADR | Ejecutar lint, typecheck, pruebas, build y escaneo de dependencias; gestión de secretos | Tarea de la Fase 1 (H2); no requiere POC propia si se confirma | Responsable del proyecto |
| D-15 | Herramientas de prueba | Playwright para E2E (ARQUITECTURA.md › Políticas técnicas); runner de pruebas unitarias y de integración sin definir | Cobertura de F1–F4, pruebas negativas de permisos, ejecución en CI | POC-1 (una prueba E2E y una negativa) | Responsable del proyecto |
| D-16 | Observabilidad y monitoreo | Logs estructurados con correlación y alertas sin PII (ARQUITECTURA.md › Políticas técnicas); herramienta sin definir | Redacción de PII, coste, operación en el hosting elegido | POC-4 | Responsable del proyecto |
| D-17 | Backups: herramienta, destino y cifrado | Backups cifrados de la base de datos y de los medios, con simulacro (ARQUITECTURA.md › Políticas técnicas); destino sin definir | Restauración comprobada, separación del host principal, retención compatible con la política de privacidad | POC-4 | Responsable del proyecto |
| D-18 | Escaneo de dependencias | Requerido antes de fusionar (ARQUITECTURA.md › Políticas técnicas); herramienta sin definir | Integración con el CI, ruido, cobertura del ecosistema elegido | H2 | Responsable del proyecto |
| D-19 | Correo transaccional | «Si se necesitara» (ESPECIFICACION-FUNCIONAL.md › §8); proveedor sin definir | Depende de C-07; privacidad y datos mínimos (ARQUITECTURA.md › Dominios, «notifications») | Decisión de producto C-07 y, solo después, una evaluación propia | Responsable del proyecto |

**[Propuesto]** D-01 a D-04 y D-10 se resuelven juntas en el ADR 0001, porque dependen unas de otras. Las demás se registran en el mismo ADR o en ADR posteriores, según AGENTS.md › Disciplina obligatoria («Documentar decisiones importantes mediante ADR»).

---

## 6. POC propuestas

**[Definido]** Hay una POC obligatoria antes de fijar dependencias, con siete puntos de validación (ARQUITECTURA.md › Validación POC obligatoria). ROADMAP.md › Fase 0 la sitúa en una rama separada y pide además comparar con Astro.

**[Propuesto]** Este roadmap divide esa validación en POC acotadas. Todas cumplen estas reglas:

- Se hacen en rama o worktree propios, con datos sintéticos, sin producción, sin DNS y sin datos reales (AGENTS.md › Disciplina obligatoria; ESPECIFICACION-FUNCIONAL.md › §6 «Datos de demostración»).
- Son desechables: el código de una POC no se convierte en scaffold sin pasar por el ADR (AGENTS.md › Estado actual).
- Su resultado son mediciones reales y una recomendación, registradas en `docs/adr/0001-stack.md` (ARQUITECTURA.md › Validación POC, 7). Nunca resultados supuestos (AGENTS.md › Disciplina obligatoria).

### POC-1. Candidata A: compatibilidad y corte vertical

- **Pregunta:** ¿puede la Candidata A, con versiones compatibles verificadas, implementar contenido publicable y solicitudes privadas con autorización en servidor, sin exponer borradores ni solicitudes?
- **Alcance mínimo:**
  - Registro de las versiones elegidas y de su compatibilidad según la documentación oficial y los changelogs (validación POC, 1).
  - Entidad Proyecto con borrador, publicación, retirada y vista previa; entidad Solicitud con creación pública y lectura solo administrativa (validación POC, 2).
  - Una página pública de lista y otra de detalle, con metadatos (validación POC, 4).
  - Un administrador con sesión.
  - Una prueba E2E del flujo F3 y pruebas negativas de integración: lectura anónima de borradores y de solicitudes por cada canal expuesto (REST, GraphQL si está habilitado, acciones de servidor).
- **Criterio de éxito:**
  - Todas las pruebas negativas fallan como se espera, con acceso denegado, y la E2E pasa.
  - Un cambio publicado en el panel aparece en el sitio sin redespliegue.
  - El HTML público es indexable.
  - Las versiones quedan registradas con sus fuentes.
  - Se miden el bundle público y Core Web Vitals en laboratorio, para fijar después los presupuestos (ESPECIFICACION-FUNCIONAL.md › §6 «Rendimiento»).
  - **Criterio de fracaso:** si para proteger borradores o solicitudes hay que desactivar o eludir el control de acceso nativo del CMS, se documenta y se considera bloqueante para A.

### POC-2. Candidata B: comparativa de la superficie pública

- **Pregunta:** ¿aporta la Candidata B (Astro para lo público con un backend y panel independientes) ventajas medibles de rendimiento o de simplicidad pública que compensen tener dos superficies y despliegues adicionales (ARQUITECTURA.md › Candidata B)?
- **Alcance mínimo:** las mismas dos páginas públicas de POC-1 (lista y detalle de proyecto) alimentadas con datos sintéticos equivalentes, más una estimación documentada (no una implementación) de lo que costarían el panel, la autenticación y el despliegue doble.
- **Criterio de éxito:** una comparación con las mismas métricas que POC-1 (bundle, Core Web Vitals de laboratorio, HTML sin JavaScript) y una tabla de costes operativos, suficientes para que el responsable decida si B merece una POC completa. No hace falta que B «gane».
- **Nota:** ROADMAP.md › Fase 0 exige la comparación, pero no dice si basta con una comparación parcial (ver C-09).

### POC-3. Intake seguro

- **Pregunta:** ¿puede el stack candidato recibir solicitudes públicas que rechacen campos administrativos, frenen el abuso, eviten duplicados y no filtren PII a los registros?
- **Alcance mínimo:** el endpoint o la acción del formulario de solicitud del stack de POC-1, con validación en servidor, rate limit por origen, al menos una opción antiabuso de cada familia de D-08 evaluada en el papel y una implementada, el mecanismo antiduplicados de D-09 y logs estructurados.
- **Criterio de éxito:**
  - Hay pruebas automatizadas que demuestran estos cinco puntos: (a) un envío con campos administrativos no los guarda; (b) un doble envío deja un solo registro; (c) superar el límite produce una denegación; (d) un envío con un servicio desactivado se rechaza; (e) los logs del proceso no contienen los valores de nombre, contacto ni descripción.
  - El formulario sigue siendo usable con teclado y lector de pantalla.

### POC-4. Despliegue, backup y restauración

- **Pregunta:** ¿se puede desplegar el stack candidato de forma reproducible en un entorno no productivo, y restaurar la base de datos y los medios desde un backup cifrado?
- **Alcance mínimo:**
  - Imagen multi-stage, despliegue detrás de un proxy o de Coolify en un entorno no productivo (validación POC, 5), variables de entorno sin secretos en Git y una migración versionada aplicada.
  - Backup cifrado de la base de datos y de los medios, borrado del entorno y restauración en limpio.
  - Rollback a la versión anterior de la aplicación.
- **Criterio de éxito:**
  - El procedimiento está escrito y otra persona o agente lo ejecuta siguiendo solo el documento.
  - Tras la restauración, los proyectos, las solicitudes y los medios coinciden con los de antes del backup.
  - El tiempo de restauración queda medido.
  - El rollback funciona.
  - Los costes y la complejidad de actualización quedan registrados (validación POC, 6).

### POC-C. Candidata C (condicional)

- **Pregunta:** ¿resuelve la Candidata C los bloqueos que hayan aparecido en A y B?
- **Alcance mínimo:** solo se ejecuta si POC-1 tiene un criterio de fracaso bloqueante y POC-2 no ofrece una alternativa viable. El alcance es el mismo que el de POC-1.
- **Criterio de éxito:** el mismo que el de POC-1, más una estimación del esfuerzo de construir o integrar el CMS y la administración (ARQUITECTURA.md › Candidata C).

### Salida común

**[Definido]** El resultado común es `docs/adr/0001-stack.md` con las mediciones y la decisión (ARQUITECTURA.md › Validación POC, 7). El ADR se acepta solo con la aprobación del responsable del proyecto (AGENTS.md › Fase 0).

---

## 7. Despliegue y entornos

### 7.1 Entornos

| Entorno | Propósito | Datos | Estado y fuente |
|---|---|---|---|
| Local de desarrollo | Implementar y hacer pruebas unitarias y de integración | Solo sintéticos | [Definido] datos sintéticos (ESPECIFICACION-FUNCIONAL.md › §6); [Propuesto] el entorno |
| CI | Lint, typecheck, pruebas, build y escaneo de dependencias en cada PR | Sintéticos y efímeros | [Definido] ARQUITECTURA.md › Políticas técnicas; [Pendiente] la plataforma (D-14) |
| Staging (no productivo) | Validar despliegues, E2E, migraciones y simulacros de restauración | Sintéticos; nunca datos reales de clientes | [Definido] separar staging de producción (ARQUITECTURA.md › Políticas técnicas) y comprobar el despliegue y la restauración en un entorno no productivo (ESPECIFICACION-FUNCIONAL.md › §7). [Pendiente] El hosting: «podrían» ser Proxmox/Coolify (ARQUITECTURA.md › Hosting; D-12) |
| Producción | Sitio público y panel reales | Reales, bajo la política de privacidad aprobada | [Pendiente] El hosting (VPS administrado o homelab), el dominio y el DNS (ARQUITECTURA.md › Hosting; PRODUCTO.md › Pendientes de producto; D-12) |

### 7.2 Flujo de promoción

**[Definido]** El flujo estándar es: issue, plan, rama de feature, implementación, checks, revisión, PR, CI, aprobación humana y merge. Nunca se hace push directo a `main` (AGENTES.md › Flujo estándar y Reglas entre herramientas).

**[Propuesto]** El flujo del MVP sería:

1. El PR pasa los checks obligatorios en CI.
2. Tras la aprobación humana y el merge, se despliega en staging con la misma imagen que se usaría en producción.
3. En staging se ejecutan las E2E de F1–F4 y se verifican las migraciones.
4. El paso a producción requiere una autorización humana explícita en cada ocasión. Los agentes no despliegan en producción, no aplican migraciones irreversibles y no modifican DNS (AGENTS.md › Disciplina obligatoria; AGENTES.md › Reglas entre herramientas).

### 7.3 Reglas operativas

**[Definido]**

- Los secretos están fuera de Git, con acceso mínimo a la base de datos y HTTPS (ARQUITECTURA.md › Políticas técnicas).
- Los backups de la base de datos y de los medios están cifrados y tienen simulacros de restauración; un snapshot del contenedor no basta (ARQUITECTURA.md › Políticas técnicas).
- Una CDN o un túnel complementan, pero no sustituyen, la autenticación ni los backups (ARQUITECTURA.md › Hosting).

**[Propuesto]**

- Staging no es indexable y tiene acceso restringido. Como `robots` no es seguridad (ESPECIFICACION-FUNCIONAL.md › §6 «SEO»), la restricción debe ser efectiva y no solo declarativa.
- El procedimiento de rollback se ensaya en staging antes de la primera puesta en producción.
- Ningún proveedor de hosting, de almacenamiento de objetos, de correo, de antispam ni de monitoreo se nombra como elegido hasta que tenga su ADR (decisiones D-06, D-08, D-12, D-13, D-16, D-17 y D-19).

---

## 8. Hitos del MVP

**[Definido]** Las fechas y los esfuerzos están pendientes de planificación (ROADMAP.md, introducción). **[Propuesto]** Los hitos son secuenciales: cada uno empieza cuando el anterior ha cumplido su criterio de salida, salvo que se indique otra cosa.

### H0. Cierre de definición

- **Contenido:** aprobar o corregir `PRODUCTO.md`, `ESPECIFICACION-FUNCIONAL.md` y `UX-ARQUITECTURA-INFORMACION.md`, y resolver las preguntas de producto de la sección 11 que bloquean el diseño: estados de la solicitud (C-01), registro de transiciones (C-02), notas (C-03), número de administradores (C-06) y notificaciones (C-07). Además, wireframes de baja fidelidad y contenido fuente real aprobado (UX §6, «Siguiente artefacto»), y la exploración de 2–3 direcciones visuales (UX §5).
- **Criterio de salida:** documentos fuente marcados como aprobados por el responsable; preguntas bloqueantes respondidas por escrito; wireframes revisados con los criterios de UX §6. El contenido real (perfil, proyectos autorizados y servicios) puede seguir incompleto, pero su lista y su responsable quedan definidos.

### H1. POC y ADR de stack

- **Contenido:** POC-1 a POC-4 (y POC-C si procede) según la sección 6.
- **Dependencias:** H0 para el modelo de Solicitud. Las POC pueden empezar con supuestos explícitos si H0 se retrasa, pero el ADR no se acepta sin H0 cerrado.
- **Criterio de salida:** `docs/adr/0001-stack.md` aceptado por el responsable, con las mediciones reales y resolviendo al menos D-01 a D-04 y D-10. Es la condición de AGENTS.md › Estado actual para empezar el scaffold.

### H2. Base técnica

- **Contenido (ROADMAP.md › Fase 1):** scaffold aprobado, locks de dependencias, entornos local y CI, contenedor, lint y typecheck, pruebas, plantillas de PR, acceso de administrador con su rol mínimo, backups con restauración verificada y procedimientos de handoff.
- **Criterio de salida:**
  - El CI ejecuta en verde lint, typecheck, pruebas, build y escaneo de dependencias sobre un esqueleto vacío.
  - Un administrador inicia sesión.
  - Una prueba negativa demuestra que `/admin` y la API rechazan peticiones anónimas.
  - El despliegue en staging es reproducible.
  - Un simulacro de backup y restauración en staging está documentado y superado.

### H3. Portafolio público y administración de contenido

- **Contenido:** MVP-01, MVP-02, MVP-03, MVP-04, MVP-10, MVP-13 (para estas páginas) y MVP-14. Diseño visual responsive según los tokens decididos en H0 (ROADMAP.md › Fase 2).
- **Criterio de salida:**
  - El flujo F1 se completa en E2E y el flujo F3 también.
  - Un editor crea y publica un proyecto sin commit (PRODUCTO.md › Métricas, 1).
  - Las pruebas negativas de borradores y medios privados pasan.
  - La auditoría automatizada de accesibilidad no muestra errores críticos y la revisión manual con teclado está registrada.
  - Los presupuestos de rendimiento fijados tras H1 se cumplen.

### H4. Servicios y solicitud pública

- **Contenido:** MVP-05, MVP-06, MVP-07, MVP-08 (estructura de la página; el texto legal sigue pendiente) y MVP-11.
- **Criterio de salida:**
  - El flujo F2 se completa en E2E.
  - Las pruebas de POC-3, convertidas en pruebas del producto, pasan: campos administrativos, duplicados, rate limit, servicio desactivado y logs sin PII.
  - Un visitante anónimo no puede listar ni leer solicitudes por ningún canal (PRODUCTO.md › Métricas, 4).

### H5. Gestión interna de solicitudes

- **Contenido:** MVP-12, más el registro de transiciones según la resolución de C-02.
- **Criterio de salida:**
  - El flujo F4 se completa en E2E.
  - Las transiciones inválidas, no autenticadas o sin permiso fallan en las pruebas de integración.
  - Las notas no aparecen en ninguna respuesta pública.
  - Los filtros de la bandeja son solo los definidos.

### H6. Candidato a liberación

- **Contenido:** observabilidad mínima y alertas sin PII, monitoreo básico, revisión de seguridad independiente (AGENTES.md › Roles lógicos, *security-reviewer*), SEO completo, revisión de accesibilidad y procedimiento de retención y eliminación.
- **Criterio de salida:** se cumple la definición de terminado de ESPECIFICACION-FUNCIONAL.md › §7 en staging, punto por punto y con evidencia enlazada, y las métricas 1 a 5 de la sección 1.4.

### H7. Puesta en producción del MVP (condicionada)

- **Contenido:** hosting de producción, dominio, DNS, política de privacidad aprobada, contenido real revisado y despliegue con autorización humana.
- **Dependencias:** H6 y las decisiones D-12, D-13 y D-17. La política de privacidad y la retención deben estar aprobadas (RF-13).
- **Criterio de salida:**
  - Despliegue en producción autorizado y verificado con los E2E de F1–F4.
  - Un simulacro de restauración de producción documentado.
  - Revisión final del contenido real, los enlaces, la privacidad, el SEO y la accesibilidad (ESPECIFICACION-FUNCIONAL.md › §7).
- **[Pendiente]** Si H7 forma parte del MVP o si la producción queda en la Fase 4 de ROADMAP.md, después de la Fase 3 (ver C-05).

### 8.4 Correspondencia con `ROADMAP.md`

| Hito | Fase de ROADMAP.md |
|---|---|
| H0 | Fase 0 (identidad visual, contenido y servicios reales; privacidad y hosting) |
| H1 | Fase 0 (POC y ADR) |
| H2 | Fase 1 |
| H3, H4, H5, H6 | Fase 2 |
| H7 | Fase 4 (parcial); ver C-05 |
| (fuera del MVP) | Fase 3: corresponde a v0.2 de PRODUCTO.md |

---

## 9. Riesgos y supuestos

### 9.1 Riesgos

| ID | Riesgo | Impacto | Mitigación (propuesta) |
|---|---|---|---|
| R-01 | El contenido real (perfil, proyectos autorizados, servicios, precios, canales) no está disponible a tiempo | El MVP no se puede publicar; hay tentación de usar datos de relleno | No inventar datos (PRODUCTO.md › Pendientes de producto); estados vacíos honestos (UX §4); H7 condicionado a la revisión del contenido |
| R-02 | El control de acceso nativo del CMS candidato no cubre todos los canales (REST, GraphQL, acciones de servidor) | Exposición de borradores o de solicitudes | Pruebas negativas por canal en POC-1 y en CI; deshabilitar los canales que no se usen; deny-by-default |
| R-03 | Se reproducen patrones inseguros del prototipo (rutas públicas de solicitudes, campos administrativos aceptados, búsqueda por email, filtros desde query params) | Fuga de PII | Pruebas específicas por patrón (ARQUITECTURA.md › Seguridad heredada); revisión de seguridad en H6 |
| R-04 | Spam o abuso del formulario | Saturación de la bandeja, coste, ruido | POC-3; rate limit; D-08 |
| R-05 | La política de privacidad y la retención no se aprueban | Bloquea la producción (RF-13) | Tratarlas como bloqueo explícito de H7 desde H0 |
| R-06 | Hosting en homelab con disponibilidad, energía o conectividad insuficientes | Caídas y pérdida de datos | Evaluación de D-12 con criterios de ARQUITECTURA.md › Hosting; backups fuera del host; restauración ensayada |
| R-07 | Incompatibilidades de versiones entre el runtime, el framework, el CMS y la base de datos | Retrasos y actualizaciones costosas | Verificar con documentación oficial (D-10); locks de dependencias en H2 |
| R-08 | El MVP crece con funciones de v0.2 o v0.3 (órdenes, presupuestos, portal) | Retraso y deuda de seguridad | Respetar la sección 1.3; cualquier cambio de alcance pasa por el responsable y queda registrado |
| R-09 | El modelo de Solicitud del MVP no se puede migrar al modelo separado de v0.2 | Migración costosa | Estados y registro de transiciones definidos en H0 pensando en PRODUCTO.md › V0.2 |
| R-10 | Se confunde el portafolio con el servicio técnico en la navegación o en el copy | Daño a la marca profesional | Criterios de UX §1 y §6 en la revisión de wireframes (H0) |
| R-11 | Las herramientas de desarrollo con IA (jz-ai) se convierten de hecho en un requisito previo | Bloqueo del producto por trabajo de tooling | Sección 10: independencia explícita |
| R-12 | Hay un único responsable y un único administrador | Cuello de botella y riesgo de perder el acceso | Procedimiento de recuperación de acceso como parte de D-07 |

### 9.2 Supuestos

| ID | Supuesto | Estado |
|---|---|---|
| S-01 | Habrá un solo rol privilegiado (administrador) en el MVP | [Definido] PRODUCTO.md › Usuarios; ESPECIFICACION-FUNCIONAL.md › §2 |
| S-02 | Inicialmente habrá un solo usuario administrador | [Pendiente] ESPECIFICACION-FUNCIONAL.md › §8 (C-06) |
| S-03 | El MVP será solo en español | [Propuesto]; el idioma secundario está pendiente (PRODUCTO.md › Pendientes de producto) |
| S-04 | El dominio jozeuzz.cl estará disponible para producción | [Pendiente] El «dominio DNS» figura como pendiente (PRODUCTO.md › Pendientes de producto) |
| S-05 | En el MVP, el contacto profesional no guarda datos en el sistema | [Propuesto] (MVP-07) |
| S-06 | Las solicitudes del MVP no llevan adjuntos | [Definido] Los adjuntos corresponden a v0.2 (PRODUCTO.md › V0.2) |
| S-07 | GitHub sigue siendo la fuente de verdad del código, los PR y el CI | [Definido] AGENTES.md › Herramientas del desarrollador |

---

## 10. Relación con jz-ai

**[Definido]**

- jz-ai es una herramienta de desarrollo **opcional** para coordinar agentes: locks, estado, handoff y failover (AGENTES.md › Próxima fase para wf-ai).
- Es un plano de control para el desarrollo, no un componente del producto. «jz-ai no es un cuarto LLM» (ORQUESTACION-IA-PROPUESTA.md › §2).
- Su CLI debe ser reemplazable y no debe guardar información que solo exista en su memoria local (AGENTES.md › Próxima fase para wf-ai).

**Declaración expresa de este roadmap:**

1. **jz-ai es una herramienta de desarrollo independiente de jozeuzz.cl.** El producto no la ejecuta, no la despliega, no la importa y no depende de ella en tiempo de ejecución.
2. **Avanzar en jz-ai M1, M2 o M3 NO es requisito previo para ningún hito del MVP (H0 a H7).** Ningún criterio de salida de la sección 8 exige que exista, funcione o esté terminado ningún hito de jz-ai.
3. Los requisitos de proceso que el MVP sí impone (un escritor por rama o worktree, handoff versionado, revisión humana, CI) se cumplen con los procedimientos manuales de AGENTS.md y de AGENTES.md › Reglas entre herramientas y › Flujo estándar. jz-ai puede ayudar a cumplirlos, pero no es la única forma de hacerlo.
4. El punto «Configuración efectiva de agentes y handoff» de ROADMAP.md › Fase 1, que se recoge en H2, se cumple con instrucciones y plantillas de handoff en el repositorio, sin depender de jz-ai.
5. jz-ai y el MVP pueden avanzar en paralelo en worktrees separados, sin compartir archivos del producto (AGENTES.md › Principio).

**[Pendiente]** Esta independencia choca con el orden de ORQUESTACION-IA-PROPUESTA.md › §9, que sitúa el «piloto jz-ai mínimo» (0D) antes de la «arquitectura del producto» (POC, 0E). Ver C-08. Además, los hitos M1–M3 de jz-ai no están definidos en los documentos de esta rama.

---

## 11. Preguntas abiertas y contradicciones de las fuentes

### 11.1 Contradicciones y tensiones

Nota (2026-10-21): varias preguntas quedaron resueltas por el registro H0-a; su estado actual está en [docs/ESTADO-PROYECTO.md](ESTADO-PROYECTO.md) §3.

| ID | Descripción | Documentos | Resolución propuesta (no vinculante) |
|---|---|---|---|
| C-01 | Ninguna fuente define los estados de la solicitud ni sus transiciones, aunque RF-09, RF-14, F2 y F4 dependen de ellos | ESPECIFICACION-FUNCIONAL.md › §3, §4, §5 | Decidirlo en H0 respetando las restricciones de la sección 3.4 |
| C-02 | F4 (paso 3) exige registrar autor, fecha y transición, pero §5 declara EventoSolicitud «opcional en MVP» y PRODUCTO.md › V0.2 sitúa el «historial de eventos» en v0.2 | ESPECIFICACION-FUNCIONAL.md › §4 F4, §5; PRODUCTO.md › V0.2 | Decidir en H0 si el registro mínimo de transiciones es obligatorio en el MVP y con qué forma |
| C-03 | La especificación incluye notas privadas de la solicitud en el MVP (tabla de permisos de §2, «Modificar estado y notas de solicitud»; F4, paso 2), pero PRODUCTO.md › V0.2 sitúa las «notas internas» en v0.2; además, el modelo de Solicitud de §5 no tiene campo de notas | ESPECIFICACION-FUNCIONAL.md › §2, §4 F4, §5; PRODUCTO.md › V0.2 | Aclarar si el MVP tiene una observación simple y v0.2 notas con historial, o si las notas se aplazan |
| C-04 | La vista previa es *Should* (RF-16), pero forma parte del flujo F3 («Previsualiza, publica…»), cuyo cumplimiento es condición de terminado (§7) | ESPECIFICACION-FUNCIONAL.md › §3 RF-16, §4 F3, §7 | Confirmar si la vista previa es obligatoria para cerrar F3 |
| C-05 | La producción figura en ROADMAP.md › Fase 4, después de la Fase 3 (v0.2), y PRODUCTO.md › V0.3 y v1.0 habla de «despliegue productivo verificable»; sin embargo, las métricas del MVP y ESPECIFICACION-FUNCIONAL.md › §7 («antes de hacer público») implican que el MVP se publica | ROADMAP.md › Fases 2–4; PRODUCTO.md › Métricas, V0.3 y v1.0; ESPECIFICACION-FUNCIONAL.md › §7 | Decidir si el MVP sale a producción antes de v0.2 (H7) |
| C-06 | PRODUCTO.md fija un «único rol privilegiado», pero no cuántos usuarios; la tabla de §2 habla de «administrar cuentas de acceso: sólo permisos explícitos» sin definir quién los concede | PRODUCTO.md › Usuarios; ESPECIFICACION-FUNCIONAL.md › §2, §8 | Confirmar el número de administradores y el procedimiento de alta y baja |
| C-07 | ARQUITECTURA.md incluye el dominio «notifications», PRODUCTO.md sitúa las notificaciones transaccionales en v0.3 y la especificación deja abierto el correo transaccional; no se define si el administrador recibe aviso de nuevas solicitudes en el MVP | ARQUITECTURA.md › Dominios y límites; PRODUCTO.md › V0.3 y v1.0; ESPECIFICACION-FUNCIONAL.md › §8 | Decidir en H0; si no hay aviso, el MVP depende de que el administrador revise la bandeja |
| C-08 | ORQUESTACION-IA-PROPUESTA.md › §9 ordena 0D (piloto jz-ai) antes de 0E (POC del producto), mientras que este roadmap declara que jz-ai no es requisito previo. Además, AI-BOOTSTRAP-DEBIAN.md aclara que el bootstrap «no implica que la POC del producto esté autorizada» | ORQUESTACION-IA-PROPUESTA.md › §9; AI-BOOTSTRAP-DEBIAN.md (final) | Que el responsable confirme por escrito que las fases 0A–0D no bloquean H0–H1 |
| C-09 | ROADMAP.md › Fase 0 exige «comparar con Astro», pero ARQUITECTURA.md solo hace obligatoria la POC de la Candidata A y no dice si la comparación con B requiere implementación | ROADMAP.md › Fase 0; ARQUITECTURA.md › Candidata B, Validación POC | Adoptar POC-2 reducida, sujeta a aprobación |
| C-10 | Las rutas no coinciden: UX incluye `/privacidad` y `/404`, que ARQUITECTURA.md › Rutas tentativas no recoge; `/experiencia` es opcional en UX | ARQUITECTURA.md › Rutas tentativas; UX-ARQUITECTURA-INFORMACION.md › §1 | Tomar el mapa de UX como referencia y cerrarlo con los wireframes |
| C-11 | CLAUDE.md pide «leer las ADR vigentes», pero no existe ninguna (`docs/adr/` no existe) | CLAUDE.md; ARQUITECTURA.md › Validación POC, 7 | La primera ADR la produce H1 |
| C-12 | El encargo habla de «definiciones ya aprobadas», pero todos los documentos fuente se declaran propuesta, borrador o hipótesis | Encabezados de PRODUCTO.md, ESPECIFICACION-FUNCIONAL.md, ARQUITECTURA.md y UX-ARQUITECTURA-INFORMACION.md | Aprobación formal en H0 (sección 0.2) |
| C-13 | En la sección 2, «Visitante» «filtra proyectos/servicios» sin condiciones, mientras que RF-15 (filtros) es *Should* | ESPECIFICACION-FUNCIONAL.md › §2, §3 RF-15 | Tratar los filtros como *Should*, como dice RF-15 |

### 11.2 Huecos de producto (no inventar; los decide el responsable)

Recogidos de PRODUCTO.md › Pendientes de producto y ESPECIFICACION-FUNCIONAL.md › §8:

- Nombre comercial del servicio técnico y en qué se diferencia visualmente de jozeuzz.cl.
- Marca, logo, tipografía, tono editorial y dirección visual.
- Currículum y proyectos autorizados, con datos verificables.
- Canales de contacto.
- Servicios, cobertura geográfica, horarios, precios y si se muestran.
- Política de atención.
- Aviso de privacidad, retención y eliminación de datos.
- Idioma secundario.
- Dominio, DNS y alojamiento definitivo.
- Tipos de datos estructurados para el SEO.
- Taxonomía de categorías de proyectos y servicios (sección 3.1).
- Presupuestos de rendimiento (después de H1).

---

## 12. Anexo: trazabilidad de requisitos

| Requisito | Prioridad | Funcionalidad | Hito |
|---|---|---|---|
| RF-01 | Must | MVP-01 | H3 |
| RF-02 | Must | MVP-02 | H3 |
| RF-03 | Must | MVP-03 | H3 |
| RF-04 | Must | MVP-04 | H3 |
| RF-05 | Must | MVP-05, MVP-11 | H4 |
| RF-06 | Must | MVP-06 | H4 |
| RF-07 | Must | MVP-06 | H4 |
| RF-08 | Must | MVP-10, MVP-11 | H3, H4 |
| RF-09 | Must | MVP-12 | H5 |
| RF-10 | Must | MVP-03, MVP-10 | H3 |
| RF-11 | Must | MVP-07 | H4 |
| RF-12 | Must | MVP-13 | H3 (páginas de portafolio), H4 (servicios), H6 (revisión completa) |
| RF-13 | Must | MVP-06, MVP-08 | H4 (estructura), H7 (texto aprobado) |
| RF-14 | Must | MVP-06, MVP-12 | H4, H5 |
| RF-15 | Should | MVP-03, MVP-05 | H3, H4 |
| RF-16 | Should | MVP-10 | H3 |
| RF-17 | Could | Fuera del MVP | — |
| F1 | — | MVP-01 a MVP-04 | H3 |
| F2 | — | MVP-05, MVP-06 | H4 |
| F3 | — | MVP-09, MVP-10 | H2 (acceso), H3 |
| F4 | — | MVP-12 | H5 |
| No funcionales (§6) | — | MVP-14, MVP-15 | H2 a H6 |
