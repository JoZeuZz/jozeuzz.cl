# Especificación de navegación y experiencia (UX/IA) — jozeuzz.cl

> Borrador de arquitectura de información, **no diseño visual final**. Alinear con `PRODUCTO.md` y `ESPECIFICACION-FUNCIONAL.md` antes de crear componentes.

## 1. Jerarquía del producto

Se prioriza **marca profesional personal**. El servicio técnico tiene entrada visible e independiente. Compartir header y pie de página, pero utilizar subtítulos, CTA y copy claramente diferenciados. Evitar presentar servicio técnico como una competencia profesional equivalente a una certificación.

### Mapa de navegación propuesto

```text
jozeuzz.cl/
├── /                       Inicio: identidad y rutas a las dos áreas
├── /sobre-mi               Trayectoria, formación, competencias
├── /proyectos              Tarjetas y filtros de proyectos publicados
│   └── /proyectos/[slug]   Caso de estudio individual
├── /experiencia            Trayectoria resumida (opcional, integrable en sobre-mi)
├── /servicios              Catálogo técnico y descripción de modalidad
│   └── /servicios/solicitar Formulario de contacto para servicio técnico
├── /contacto               Canales para consultas profesionales
├── /privacidad             Política de privacidad (debe aprobarse antes de producción)
├── /404                    Error y rutas de recuperación
└── /admin                  Gestión privada, autenticada, nunca pública
```

URLs, términos y agrupación definitivos dependerán del diseño y contenidos reales. No hay necesidad de forzar página separada `/experiencia` si queda mejor integrada.

## 2. Navegación global

- Logo/marca «jozeuzz.cl» lleva a inicio.
- Accesos principales: «Sobre mí», «Proyectos», «Servicios técnicos», «Contacto».
- CTA primario de inicio: «Explorar proyectos»; CTA secundario: «Ver servicios técnicos».
- Navegación accesible en móvil y escritorio, visible con teclado, con estado activo, sin menú infinito.
- Footer: datos de contacto aprobados, privacidad, enlaces profesionales verificables y año dinámico.

## 3. Esqueleto por página

| Página | Bloques clave | Acción principal |
|---|---|---|
| Inicio | Hero profesional, breve descripción, proyectos destacados, capacidades, acceso al área técnica, contacto | Explorar proyectos |
| Sobre mí | Presentación, formación, experiencia, especialidades, hitos reales, CV opcional | Contactar / ver proyectos |
| Proyectos | Lista indexable, categorías simples, tarjetas con contexto y contribución | Abrir caso |
| Detalle de proyecto | Problema, alcance, responsabilidad, stack, enfoque, resultados, medios, enlaces cuando existan | Ver repositorio/demo o contactar |
| Servicios | Oferta, alcance, condiciones, preguntas frecuentes y llamada a solicitar | Solicitar revisión |
| Solicitar servicio | Campos mínimos, errores por campo, consentimiento/aviso, confirmación sin revelar información | Enviar solicitud |
| Contacto | Vías autorizadas, contexto profesional, sin mezclarlo con órdenes de reparación | Contacto profesional |
| Admin | Login, contenidos, medios, servicios, bandeja de solicitudes | Gestión autorizada |

## 4. Estados y errores UX necesarios

- Catálogos vacíos: mensaje pertinente, sin mostrar plantillas/datos falsos.
- Formularios: cargando, error de validación, error de red, éxito, doble clic y reintento.
- No existen proyectos publicados: estado vacío sin tarjetas de relleno.
- Servicio desactivado: no mostrado en catálogo ni seleccionable al solicitar.
- Administración: sesión expirada, denegación de acceso, acciones guardadas y errores recuperables.
- Sin JavaScript: garantizar contenido público legible según posibilidades de la arquitectura aprobada.
- Página no encontrada: volver a inicio o proyectos.

## 5. Diseño visual: lineamientos sin imponer estética

- Calidad editorial antes que animación; tipografía legible, navegación limpia y alto contraste.
- Componentes coherentes, responsive y reutilizables.
- Portafolio debe destacar **evidencias de trabajo** sobre listas de logos de tecnologías.
- No usar datos genéricos como «$20», «TU_URL_DE_CALENDLY», testimonios o empresas ficticias como contenido definitivo.
- Definir tokens de color, espaciado y tipografía tras una exploración de 2–3 direcciones visuales evaluadas con accesibilidad.
- Animaciones sutiles, compatibles con preferencia de movimiento reducido.

## 6. Criterios para wireframes y revisión

1. Un visitante profesional entiende tu perfil y llega a un caso de estudio en pocos pasos.
2. Un cliente de servicio técnico reconoce dónde contratar y cómo explicar su problema.
3. En móvil y con teclado puede completar las acciones principales.
4. La interfaz no revela contenido editorial privado ni solicitudes.
5. Las rutas y CTA no conducen a secciones vacías.

**Siguiente artefacto antes de implementación:** wireframes de baja fidelidad + contenido fuente real aprobado. El agente puede proponerlos, pero no inventar datos personales, proyectos terminados ni condiciones comerciales.
