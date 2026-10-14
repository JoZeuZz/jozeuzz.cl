# Definición del producto — jozeuzz.cl
Estado: **Propuesta para revisión** (Fase 0, 2026-10-13).

## Visión
Una identidad digital profesional que combina (1) portafolio de ingeniería informática y desarrollo y (2) oferta y gestión de servicios técnicos informáticos. El portafolio no debe depender funcionalmente del sistema de reparaciones. Ambos comparten infraestructura y diseño, sin confundir públicos, accesos ni procesos.

## Usuarios
- Visitante profesional: reclutador, cliente de desarrollo, colega; consulta trayectoria, proyectos y contacto.
- Cliente de servicio técnico: descubre servicios y registra solicitud; obtiene confirmación sin acceso a datos de terceros.
- Administrador: único rol privilegiado inicial; edita contenidos, catálogo y gestiona solicitudes.
- Personal técnico (futuro): ve exclusivamente órdenes y datos requeridos por su rol.

## MVP v0.1
- Inicio profesional, presentación, formación, experiencia, conocimientos, proyectos (páginas de detalle), catálogo de servicios, contacto.
- Contenido público editable mediante panel: perfil, proyectos, enlaces, servicios, imágenes y textos.
- Formulario público de solicitud con validación servidor, límites antiabuso, consentimiento/aviso de privacidad, confirmación y almacenamiento seguro.
- Panel autenticado para listar y gestionar solicitudes, registrar cambios de estado y gestionar catálogo.
- SEO: metadatos individuales, sitemap, robots, OpenGraph, canonical, datos estructurados apropiados; accesibilidad y responsive.
- Observabilidad mínima, backup/restauración verificables, monitoreo básico, pruebas automatizadas y pipeline CI.

## Fuera del MVP (no prometer)
- Pago en línea, facturación electrónica, reservas automáticas, inventario, ticket de seguimiento público, portal de cliente, integración WhatsApp, chat de IA público o automatizaciones que modifiquen solicitudes.
- Múltiples técnicos, sucursales o multitenancy, salvo necesidad demostrada.

## V0.2
- Modelo separado Cliente–Equipo–Solicitud–OrdenTrabajo, historial de eventos y transiciones controladas.
- Notas internas, diagnóstico, fotos/adjuntos controlados, asignación interna y permisos; migración de datos desde MVP.
- Considerar portal de clientes solamente con identidad comprobada.

## V0.3 y v1.0
- Presupuestos y aceptación trazable, notificaciones transaccionales, seguimiento autenticado, mejoras operacionales.
- Endurecimiento, monitoreo, pruebas E2E, continuidad y despliegue productivo verificable.

## Reglas fundamentales
1. Nunca exponer solicitudes por email sin verificar identidad; las rutas administrativas exigen autorización.
2. Cliente no controla estado, precio, presupuesto, notas internas ni campos de auditoría.
3. Precios públicos son referenciales y deben mostrarse en CLP o como 'a cotizar' según política definida; no copiar placeholders en USD del prototipo.
4. Separar solicitudes de reservas y órdenes de trabajo: no equivalen.
5. Páginas públicas accesibles sin login; backoffice no indexable ni expuesto innecesariamente.

## Métricas de aceptación del MVP
- Un editor autorizado crea/publica un proyecto sin commit.
- Una persona encuentra portafolio y servicio técnico desde móvil.
- Una solicitud válida se registra una sola vez y el usuario recibe confirmación.
- Un visitante anónimo no puede consultar/modificar solicitudes ajenas, administrar servicios ni enumerar datos personales.
- Pruebas unitarias, integración y E2E crítico pasan en CI; despliegue y restauración documentados.

## Pendientes de producto
Nombre comercial del servicio técnico; marca y diseño visual; contenidos profesionales verificables; canales de contacto; servicios/cobertura/precios; política de atención; aviso privacidad y retención de datos; idioma secundario; dominio DNS y alojamiento definitivo. Ninguno debe inventarse desde un agente.
