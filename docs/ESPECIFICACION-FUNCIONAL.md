# Especificación funcional v0.1 — jozeuzz.cl

> **Estado:** borrador de Fase 0, sujeto a aprobación. Basado en `PRODUCTO.md` y la auditoría del prototipo 2025. No autoriza implementar ni fija tecnologías.
> **Propietario del producto:** responsable del repositorio. **Última revisión:** 2026-10-13.

## 1. Propósito y principios

El producto une un **portafolio profesional** como entrada principal a la identidad jozeuzz.cl y una sección de **servicio técnico** con captura de solicitudes y administración interna. La navegación y el lenguaje deben permitir que un reclutador/cliente de desarrollo no confunda el negocio de reparación con la presentación profesional, y viceversa.

Criterios de producto: información verídica y editable; experiencia móvil; accesibilidad; SEO; trazabilidad; mínima exposición de datos personales; funcionalidades incrementales; separación entre sitio público y backoffice. No inventar experiencia laboral, títulos, clientes, casos de éxito, testimonios, precios ni certificaciones.

## 2. Actores y permisos

- **Visitante:** explora contenidos publicados, filtra proyectos/servicios, consulta información de contacto y registra solicitud de servicio; no accede a datos internos.
- **Administrador autenticado:** edita/pública contenidos, servicios, medios y solicita/gestiona datos internos con auditoría básica.
- **Futuro técnico/cliente autenticado:** fuera del MVP; no crear estos roles preventivamente.

| Recurso / operación | Visitante | Administrador |
|---|---|---|
| Perfil, proyectos y servicios publicados: lectura | Sí | Sí |
| Borradores, notas privadas y proyectos no publicados: lectura | No | Sí |
| Crear solicitudes por formulario validado | Sí, entrada explícitamente limitada | Sí |
| Enumerar/leer solicitudes o datos de cliente | No | Sí |
| Modificar estado y notas de solicitud | No | Sí |
| Editar/publicar contenido, tarifas y servicios | No | Sí |
| Acceder al panel administrativo | No | Sí |
| Administrar cuentas de acceso | No | Sólo permisos explícitos |

La autorización debe comprobarse **en servidor para cada operación** (API, UI, REST/GraphQL, formularios y acciones), no únicamente ocultando botones.

## 3. Requisitos funcionales del MVP

| ID | Prioridad | Necesidad verificable |
|---|---|---|
| RF-01 | Must | Inicio profesional con identidad, especialidades y acceso directo a proyectos y servicios. |
| RF-02 | Must | Perfil: presentación, formación, experiencia y competencias, basadas en datos autorizados por el titular. |
| RF-03 | Must | Catálogo de proyectos publicados, con navegación a cada caso de estudio y enlaces verificables opcionales. |
| RF-04 | Must | Página de proyecto con contexto, contribución, stack, decisiones, resultados, imágenes y enlaces según datos disponibles; campos opcionales sin secciones vacías. |
| RF-05 | Must | Catálogo de servicios técnicos editables y categorizados; ocultar servicios desactivados. |
| RF-06 | Must | Solicitud pública de servicio que capture únicamente identificación/contacto, categoría/equipo y descripción necesaria, con aviso de privacidad. |
| RF-07 | Must | Confirmación al finalizar un envío válido; fallos muestran mensajes comprensibles y permiten reintento sin duplicación accidental. |
| RF-08 | Must | Administración autenticada de proyectos, contenidos de perfil, servicios y medios. |
| RF-09 | Must | Administración autenticada de solicitudes con filtros definidos explícitamente y cambio de estado restringido. |
| RF-10 | Must | Lectura pública exclusiva de contenidos publicados; borradores protegidos en backend, API y medios privados. |
| RF-11 | Must | Contacto profesional por canales autorizados (correo o enlace externo inicialmente); separado del formulario de reparaciones. |
| RF-12 | Must | Metadatos SEO por página, sitemap, robots, OpenGraph, canonical y páginas de error. |
| RF-13 | Must | Consentimiento/aviso de privacidad accesible desde formularios; política y períodos de retención por definir antes de producción. |
| RF-14 | Must | Registro interno de fecha y estado de solicitud sin permitir su manipulación desde cliente. |
| RF-15 | Should | Filtros básicos de proyectos y servicios por categorías administrables. |
| RF-16 | Should | Vista previa del contenido pendiente de publicar, restringida a usuarios autorizados. |
| RF-17 | Could | Página de artículos/notas técnicas (no activar hasta disponer de contenido editorial). |

**No incluidos en v0.1:** autenticación de clientes finales; seguimiento público; pagos; reservas automáticas; cotizaciones aprobables; órdenes de trabajo; inventario; facturación; WhatsApp automatizado; chat público de IA; multitenancy y flujo de aprobación entre varios administradores.

## 4. Flujos principales

### F1. Descubrimiento profesional
1. Visita `/` desde buscador/enlace.
2. Encuentra identidad, propuesta profesional y CTA «Ver proyectos»; sección técnica diferenciada.
3. Navega a `/proyectos`, selecciona un proyecto y consulta detalles verificables.
4. Puede seguir a GitHub, LinkedIn o contacto, únicamente cuando sus enlaces estén configurados.
**Aceptación:** un proyecto marcado borrador/inactivo nunca aparece ni se puede consultar anónimamente.

### F2. Solicitud de servicio técnico
1. Visita `/servicios` y consulta oferta disponible.
2. Accede a `/servicios/solicitar`; indica datos mínimos y describe el problema.
3. El servidor valida tipos, longitud, origen, límites, servicio activo y antispam. No acepta campos administrativos.
4. Persiste una solicitud con identificador interno, estado inicial administrado en servidor, marcas temporales y señal anti-duplicados razonable.
5. Devuelve confirmación genérica sin exponer datos personales ni permitir consultas por correo.
**Aceptación:** entradas inválidas y abusivas son rechazadas; una persona no puede leer solicitudes de terceros ni controlar estado/presupuesto/notas.

### F3. Administración de contenido
1. Administrador inicia sesión mediante mecanismo seguro compatible con el stack.
2. Crea o edita proyecto, imágenes y estado de publicación.
3. Previsualiza, publica y verifica contenido público.
4. Puede retirar publicación sin eliminar involuntariamente los registros.
**Aceptación:** la API no permite lectura anónima de borradores; acceso al panel requiere sesión y autorización.

### F4. Gestión interna de solicitudes
1. Administrador autenticado revisa bandeja con filtros permitidos.
2. Abre detalle, registra observaciones privadas y cambia entre estados permitidos.
3. La operación registra autor, fecha y transición cuando corresponda.
**Aceptación:** solicitudes de estado inválidas, no autenticadas o sin permiso fallan; notas privadas no se envían a interfaces públicas.

## 5. Modelo conceptual mínimo

- **Perfil** (entidad editorial única): resumen, presentación, educación/experiencia, enlaces externos, competencias.
- **Proyecto**: título, slug único, resumen, contenido detallado, etiquetas/tecnologías, medios, enlaces verificables, visibilidad y SEO.
- **Servicio**: nombre, slug, descripción, categoría, estado público, modalidad de precio configurada (CLP referencial o «a cotizar»), orden.
- **Solicitud**: id, nombre y canal de contacto, tipo de equipo, descripción, referencia opcional a servicio activo, estado interno inicial, fechas; sin permitir recibir estado/notas/cotización de solicitante.
- **EventoSolicitud**: opcional en MVP pero recomendable: actor administrativo, evento y timestamp.
- **Media**: archivo, tipo, visibilidad, propietario/editor y restricciones de acceso.
- **UsuarioAdmin**: identidad administrativa; mínimo privilegio y mecanismos de protección.

**Límites explícitos:** una cita no equivale a una solicitud; una orden de trabajo tampoco. No usar un único modelo para todo el negocio.

## 6. Criterios no funcionales y de liberación

- **Seguridad:** HTTP seguro, cookies/sesiones configuradas correctamente, CSRF según mecanismo, validación de entradas, rate limit apropiado en solicitud/login, prevención de enumeración, acceso denegado por defecto, secretos fuera del repo.
- **Privacidad:** política explícita antes de producción; evitar datos técnicos que incluyan contraseñas u otra información innecesaria. No registrar PII en errores/trazas; retención y eliminación definidas.
- **Calidad:** TypeScript estricto si stack elegido; lint, typecheck, pruebas unitarias + integración de permisos y E2E de F1–F4 en CI.
- **Web:** móvil primero, navegación por teclado, foco perceptible, textos alternativos y contraste; objetivo WCAG 2.2 AA a comprobar mediante pruebas manuales y automatizadas.
- **Rendimiento:** presupuestos y métricas de Core Web Vitals a fijar tras POC; evitar dependencias pesadas en sitio público.
- **SEO:** páginas públicas servidas con HTML indexable donde corresponda; sitemap, metadatos correctos; `/admin` y páginas privadas excluidas de indexación (sin tratar robots como seguridad).
- **Operación:** despliegue reproducible, logs redactados, migraciones, backup de datos y medios con restauración ensayada y rollback documentado.
- **Datos de demostración:** solamente datos sintéticos; no importar de `ProyectoST_Portfolio` sin revisión y autorización.

## 7. Definición de terminado del MVP

- Se pueden completar y demostrar los flujos F1–F4.
- Se cumplen los controles de permisos con pruebas negativas; no basta la apariencia del panel.
- Un administrador mantiene perfil, proyectos y servicios sin editar código.
- Carga y acceso a medios verificados.
- CI pasa y contiene tests significativos, build y análisis de dependencias.
- Despliegue, copia de seguridad y restauración documentados y comprobados en entorno no productivo.
- Se revisan contenido real, enlaces, privacidad, SEO y accesibilidad antes de hacer público.

## 8. Cuestiones sin resolver (no bloquear documentación, sí publicar)

- Marca comercial del servicio técnico y su diferencia visual respecto de jozeuzz.cl.
- Geografía, horarios, canales de contacto, catálogo y si se exhibirán precios.
- Curriculum y proyectos autorizados a publicar, con datos verificables.
- Logo, tipografía, tono editorial y estilo visual.
- Política de privacidad y retención, hosting y correo transaccional si se necesitara.
- Confirmar si el panel tendrá un único usuario administrador inicialmente.
