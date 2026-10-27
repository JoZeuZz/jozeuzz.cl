# ADR-0001: Stack de aplicación para MVP v0.1

## Estado

Aceptado el 2026-10-27 por el responsable del producto en la conversación de entrega `JOZEUZZ-MVP-DELIVERY`.

La aceptación dispensa el gate Docker histórico y POC-2 como precondiciones del scaffold. No los declara superados: reemplaza POC-2 por la decisión documentada de no separar la superficie pública y traslada los controles pendientes de POC-3 a gates obligatorios del producto I1. La restauración pendiente de POC-4 permanece como condición anterior a staging.

## Contexto

`jozeuzz.cl` necesita una superficie pública indexable, un CMS con borradores, un panel autenticado y reglas transaccionales para solicitudes privadas. El repositorio evaluó tres opciones:

1. Next.js, Payload CMS y PostgreSQL como monolito modular.
2. Astro para la superficie pública y un backend/panel independiente.
3. React Router Framework Mode con backend y administración propios.

La POC de la primera opción demostró publicación sin commit, borradores protegidos, administración, PostgreSQL, transiciones atómicas y acceso denegado por defecto. La evidencia histórica registra 43/43 casos de contrato en POC-1a y 44/44 casos explícitos en POC-1b, además de pruebas unitarias, HTTP y E2E. La POC-3 implementó intake seguro, pero su gate Docker se detuvo en D07. Ese gate histórico continúa no aprobado.

Astro reduciría JavaScript público, pero añadiría otra superficie de despliegue y dejaría por elegir o construir CMS, panel y autenticación. La orden de entrega del 2026-10-27 autorizó cerrar esta comparación sin otra POC salvo impedimento material.

## Decisión

Construir el MVP como monolito modular con:

- Node.js 24.22.x, restringido a `>=24.22.0 <25`.
- Next.js 16.4.1.
- React y React DOM 19.2.9.
- Payload CMS 3.90.2.
- `@payloadcms/db-postgres` 3.90.2.
- PostgreSQL 18.6.
- TypeScript 5.9.x.
- Playwright 1.64.x.
- Tailwind CSS 4 para la interfaz pública a partir del incremento visual; el parche exacto se fijará al incorporarlo tras verificar documentación y advisories vigentes.

Payload administra contenido, autenticación y colecciones. Las reglas de negocio viven en módulos explícitos. No se añade otro ORM. GraphQL permanece desactivado. Las rutas públicas propiedad del producto transforman documentos a DTO definidos por allowlist. Los canales genéricos de Payload aplican acceso por colección y campo y se cubren con pruebas negativas; ninguna ruta de producto devuelve documentos Payload sin proyección.

El producto se crea como scaffold limpio. La POC es referencia de sólo lectura. Se pueden portar selectivamente reglas o pruebas con trazabilidad Git, pero no copiar su estructura completa, scripts experimentales, variables `POC_*`, bases ni evidencia.

## Alternativas descartadas

### Astro con backend separado

Descartada para v0.1. Su ventaja de menor JavaScript no compensa dos superficies, dos ciclos operativos y un panel/backend aún sin seleccionar. Se reabre si el monolito incumple el presupuesto de rendimiento público o si el portafolio pasa a dominar claramente el producto.

### React Router con backend propio

Descartada. Exige construir o integrar CMS, panel y autenticación sin evidencia comparable. Se reabre sólo si Payload presenta un impedimento material de seguridad o mantenimiento.

### Convertir la POC en producto

Descartada. La POC fue declarada desechable y contiene arneses, parches y procedimientos ligados a experimentos. Promoverla dificultaría distinguir garantías de producto de evidencia histórica.

## Condiciones y consecuencias

- POC-3 no se declara aprobada. Sus controles se reimplementan y verifican como gates del incremento I1.
- La corrección histórica de Drizzle puede servir como referencia. Su gate Docker D07 no se reescribe ni se declara verde.
- POC-4 se reemplaza por una verificación de producto antes de staging: imagen reproducible, migración, backup cifrado y restauración completa de base y medios.
- Los riesgos B7 y M3 se cierran en el producto separando medios públicos/privados y deshabilitando recuperación pública de contraseña.
- El único administrador inicial se crea mediante procedimiento operativo antes de exponer el servicio.
- Publicación usa SSR dinámico al inicio. ISR o caché requieren una medición posterior.
- Versiones exactas permanecen fijadas en lockfile. Cualquier actualización exige pruebas de regresión y revisión de advisories.
- Tailwind no bloquea I1; su parche se fija cuando I3 incorpore el sistema visual completo.

## Evidencia

- `docs/ARQUITECTURA.md`
- `docs/MATRIZ-TECNOLOGIAS-POC.md`
- `docs/REGISTRO-DECISIONES-H0A.md`
- `docs/ESPECIFICACION-FUNCIONAL.md`
- POC de referencia: `poc/candidata-a-3@40e4e5667e6049d2ab951fe0dd9cd5f58f58d541`
- Corrección D07 de referencia: `feat/jozeuzz-avance-nocturno@5d8a9d918d0fb25bcd4d9c153a39cc5b7c603689`

## Señales para reconsiderar

- Advisory sin parche dentro del rango compatible entre Next.js y Payload.
- Control de acceso que requiera eludir Payload.
- Restauración incompleta de datos o medios.
- Incumplimiento sostenido del presupuesto de rendimiento público.
- Coste de actualización desproporcionado frente a separar la superficie pública.
