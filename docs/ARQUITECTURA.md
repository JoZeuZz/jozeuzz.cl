# Arquitectura candidata — ADR preliminar
Estado: **Hipótesis a validar**, no selección irrevocable.

## Candidata A (preferente para POC)
Next.js + React + TypeScript estricto + Payload CMS + PostgreSQL. UI: Tailwind CSS y componentes accesibles. Un monolito modular desplegable en contenedor, con almacenamiento persistente de medios por adaptador soportado (filesystem controlado en desarrollo; S3-compatible si procede). Payload centralizaría edición de contenido y panel; funcionalidades de negocio requerirán servicios explícitos y reglas de acceso propias. No añadir ORM paralelo por defecto.

## Candidata B (comparativa)
Astro para presentación pública + backend/panel independiente para procesos transaccionales. Ventajas: contenido y renderizado estático; coste: dos superficies y despliegues adicionales. Considerar si el portafolio adquiere mucho mayor peso que la gestión técnica.

## Candidata C
React Router Framework Mode y backend propio. Alternativa React full stack con control total; implica crear o integrar CMS y administración.

## Validación POC obligatoria (antes de fijar dependencias)
1. Compatibilidad exacta de Node, Next.js, Payload y PostgreSQL según documentación oficial vigente y changelogs.
2. CRUD de contenido (Proyecto) y CRUD privado (Solicitud), reglas de acceso por rol, borradores y publicación.
3. Subida y despliegue de medios, protección de datos personales, procesamiento de formularios y antiabuso.
4. Renderizado SSR/estático apropiado, SEO, bundle público, desempeño y accesibilidad.
5. Docker multi-stage, migraciones, restauración DB y medios, despliegue detrás de proxy/Coolify, variables de entorno.
6. Costes de operación, complejidad de actualizaciones, seguridad y experiencia de desarrollo de agentes.
7. Documentar resultados medidos y decisión en docs/adr/0001-stack.md (pendiente).

## Dominios y límites
- public-site: rutas de portafolio, formación, habilidades, casos, servicios, SEO.
- content: proyectos, publicaciones opcionales, perfil, medios, taxonomías.
- service-catalog: catálogo, visibilidad y precios referenciales.
- intake: formulario público con esquema mínimo e idempotencia.
- operations: solicitudes, estados, notas internas y futuros equipos/órdenes.
- identity: sesión, roles, autorización y auditoría.
- notifications: eventual envío externo desacoplado y sin datos sensibles innecesarios.

## Rutas tentativas
`/`, `/sobre-mi`, `/proyectos`, `/proyectos/[slug]`, `/experiencia`, `/servicios`, `/servicios/solicitar`, `/contacto`; `/admin` privado. Nombres sujetos a UX.

## Políticas técnicas
- Privacidad y autorización deny-by-default, incluso en endpoints internos, Server Actions, REST y GraphQL si se habilita.
- Validar y normalizar entradas del servidor; proteger contra abuso y CSRF según sesión; registros con redacción de PII.
- Migraciones versionadas, índices/constraints, transacciones donde corresponda, control de estados válido.
- Separar staging de producción, secretos fuera de Git, acceso mínimo a base de datos, HTTPS.
- Backups de DB y medios, cifrado y simulacro de restauración; no basta con snapshot de contenedor.
- Evitar herramientas innecesarias: no Redis, colas, microservicios ni Kubernetes hasta justificar.
- Testing: unitarias, integración de autorización y Playwright para procesos principales.
- Lint, typecheck, test, build y escaneo de dependencias requeridos antes de fusionar.
- Observabilidad prudente con logs estructurados, correlación y alertas sin PII.

## Hosting
Desarrollo y staging podrían ejecutarse en Proxmox/Coolify; para producción evaluar VPS administrado vs homelab con criterios de disponibilidad, energía, conectividad y recuperación. Cloudflare Tunnel y CDN pueden complementar, no sustituir autenticación ni backups.

## Seguridad relevante heredada del prototipo
- Todas las rutas de escritura y lectura de solicitudes eran públicas.
- Se aceptaban campos administrativos desde formularios públicos.
- Búsqueda por email sin verificar identidad.
- Filtros MongoDB enviados directamente desde query params.
La reconstrucción no debe reproducir ninguno de estos patrones.
