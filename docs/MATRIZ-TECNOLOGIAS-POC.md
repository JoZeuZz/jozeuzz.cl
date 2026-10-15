# Matriz de tecnologías candidatas para las POC — jozeuzz.cl

> **Estado:** pendiente de aprobación del responsable. **No selecciona ninguna de las decisiones D-01 a D-19.** Fija qué versiones se probarían si se aprueba, y qué hay que comprobar en cada POC.
> **Fecha de las fuentes:** 2026-10-15. Se usaron fuentes oficiales: documentación, páginas de versiones y repositorios de cada proyecto; endoflife.date sólo como contraste. Se volvieron a comprobar a mano tres datos: el EOL de Node 20, los requisitos de Payload y su control de acceso por defecto. El resto viene de una investigación delegada, de sólo lectura, y conviene confirmarlo al fijar cada versión.
> **Host (comprobado):** Debian 13.7, 6 CPU, 8 GB de RAM, unos 50 GB libres, Docker 29.9.0 ya instalado y Node 20.19.2. El repositorio `JoZeuZz/jozeuzz.cl` es público.

## 1. Hallazgo que condiciona todas las candidatas: el runtime

- **Node 20 está en EOL** desde el 30 de abril de 2026; su última versión es 20.20.2, del 24 de marzo de 2026 ([nodejs.org](https://nodejs.org/en/about/previous-releases)). El host usa 20.19.2.
- Las tres candidatas necesitan o recomiendan Node 22 o posterior:
  - Astro 7 y React Router 8 exigen Node 22.22 o superior.
  - Playwright documenta Node 22, 24 y 26.
  - Next 16 y Payload aceptan Node 20 formalmente, pero no tiene sentido montar una POC sobre un runtime sin parches.
- **Propuesta:** las POC usan **Node 24 LTS** (soporte de seguridad hasta el 30 de abril de 2028) **dentro de su imagen de contenedor**, sin tocar el Node del host. La alternativa es subir el host a Node 22 o 24, que es una decisión de host distinta y sigue pendiente.
- La batería de contrato no tiene dependencias y corre en el Node del host. Pasará al Node de la POC cuando se use contra un stack.

## 2. Matriz

| Pieza | Candidatas | Versión a probar | Requisitos | Dependencias y costo | Riesgos principales | Fuente |
|---|---|---|---|---|---|---|
| Runtime | todas | Node 24.22.0 LTS; 26.x pasará a LTS más adelante | Imagen oficial `node:24` (por aprobar) | MIT, sin costo | El host en EOL; cambio de calendario de releases desde Node 27 | nodejs.org/en/about/previous-releases |
| Framework web (A) | A | Next.js 16.x, en el rango que admita Payload (hoy 16.3.3 o superior y menor que 17) | Node 20.9 o superior; TypeScript 5.1 o superior; React 19 | MIT | Muchas advisories críticas en 2025–2026 (bypass de middleware CVE-2025-29927, RCE en RSC CVE-2025-66478, varias RCE en 2026), así que parchear con rapidez es obligatorio; ruptura entre majors; 15.x sale de soporte hacia el 21 de octubre de 2026 | nextjs.org/docs, nextjs.org/support-policy, GitHub releases |
| CMS y panel (A) | A | Payload 3.90.x (v4 está en beta y no se usa) | Node 20.18.1 o superior; Next en los rangos documentados («Not all Next.js 15/16 releases are compatible») | MIT; adapter `@payloadcms/db-postgres` (Drizzle) | Defaults inseguros que hay que cerrar: GraphQL activo, Local API sin control de acceso por defecto (`overrideAccess`), borradores legibles si no se filtra `_status`; la 3.90.0 exigió una migración; la v4 se acerca | payloadcms.com/docs (installation, access-control, drafts, upload, graphql) |
| Base de datos | A (B y C no la fijan) | PostgreSQL 18.x (soporte hasta el 14 de noviembre de 2030) | Imagen oficial `postgres:18` (por aprobar) | PostgreSQL License | Payload no publica una matriz de versiones de Postgres; hay que validarlo en la POC | postgresql.org/support/versioning |
| Superficie pública (B) | B | Astro 7.x con `@astrojs/node` para renderizado bajo demanda | Node 22.12 o superior según la documentación (`engines` pide 22.22 o superior) | MIT; el panel y el backend van aparte, sin elegir | Cadencia rápida de majors; dos superficies y dos autenticaciones | docs.astro.build |
| Framework full stack (C) | C | React Router 8.x en framework mode | Node 22.22 o superior; React 19.2.7 o superior; Vite 7 | MIT; el CMS y la administración se construyen | v8 reciente; todo el panel queda por construir | reactrouter.com, GitHub releases |
| Estilos | A (opcional en B y C) | Tailwind CSS 4.x | Navegadores modernos (Chrome 111, Safari 16.4, Firefox 128) | MIT | Excluye navegadores antiguos; no se usa con Sass ni Less | tailwindcss.com/docs/compatibility |
| E2E | todas | Playwright 1.64.x | Debian 12/13 (el host cumple); Node 22, 24 o 26 | Apache-2.0; descarga los navegadores al instalarse | Depende de la versión del sistema; sus navegadores ocupan disco | playwright.dev/docs/intro |
| Contenedores | todas | Docker 29.9.0, ya presente en el host | — | Sin costo | Las imágenes base requieren aprobación y fijar el digest | — |
| Despliegue en staging | POC-4 | Coolify v4.4.x | Linux, 2 CPU, 2 GB de RAM y 10 GB de disco como mínimo; root y SSH | La licencia no está verificada | Corre con privilegios altos; no está claro si la v4 se considera estable | coolify.io/docs |
| Backup cifrado | POC-4 | restic 0.19.x (archivos y volcados) o pgBackRest 2.59.3 o superior (Postgres) | Un destino fuera del host | BSD-2 / MIT | pgBackRest tuvo una crisis de mantenimiento en 2026 y una advisory de cifrado (exige 2.59.3 o superior) | restic docs, pgbackrest.org |
| Escaneo de dependencias | todas | Dependabot, `npm audit` y OSV-Scanner | GitHub; repositorio público | Sin costo en repositorios públicos | Ruido de alertas; hace falta una política de parches | docs.github.com/en/code-security |

## 3. Recomendaciones justificadas (provisionales)

1. **POC-1 con la Candidata A sobre Node 24, Next 16 en el rango de Payload, Payload 3.90.x y PostgreSQL 18.** Las fuentes del proyecto la consideran preferente. Además, Payload ofrece control de acceso por colección y por campo, borradores y archivos privados, que es justo lo que miden POC-1a y POC-1b. **Condición:** POC-1a debe probar el endurecimiento explícito de los defaults:
   - GraphQL desactivado o cubierto por la batería;
   - `read` público filtrado por `_status`;
   - ningún uso de la Local API sin `overrideAccess: false` en rutas públicas;
   - archivos privados sin `disablePayloadAccessControl`.

   Si alguno de estos puntos exige eludir el control nativo, se aplica el criterio de rechazo de POC-1a.
2. **Fijar versiones exactas (parche) y el digest de las imágenes en la primera tarea de POC-1a**, comprobando en ese momento las advisories abiertas de Next y Payload. Esta matriz fija rangos, no parches.
3. **POC-2 con Astro 7** sólo para las dos páginas públicas y con el mismo método de medición. Astro admite renderizado bajo demanda, así que puede cumplir el criterio de «sin commit» sin regenerar el sitio.
4. **Candidata C:** sin POC salvo que se active POC-C.
5. **POC-4:** Coolify v4 y restic o pgBackRest sólo se deciden antes de POC-4 (H0A-14). Antes hay que verificar la licencia y la estabilidad de Coolify.
6. **CI:** Dependabot y OSV-Scanner son gratuitos porque el repositorio es público. Se deciden por ADR breve antes de H2, sin POC.

## 4. Qué autorización se pide

- Usar Node 24 LTS y PostgreSQL 18 mediante imágenes oficiales de contenedor, con el digest fijado y servicios enlazados sólo a `localhost`.
- Instalar en `poc/candidata-a`, y sólo ahí, las dependencias npm de la Candidata A en las versiones de la sección 2, con lockfile versionado y `npm audit` registrado.
- Instalar Playwright y sus navegadores en esa misma POC.

Sin esta autorización no se instala nada. La subida de Node en el host queda fuera de esta petición.

## 5. Preguntas abiertas que verifica la POC

1. ¿Payload 3.90.x funciona con el último Next 16 de su rango?
2. ¿Payload funciona con PostgreSQL 18, y con migraciones en CI sin `push`?
3. ¿Cómo se propaga el contenido sin redespliegue (revalidación en Next frente a renderizado bajo demanda en Astro)? Se mide con CO-05.
4. ¿Qué canales expone Payload por defecto (REST, GraphQL, Local API y rutas de archivos)? Hay que declararlos todos en el driver de la batería.
5. ¿Qué licencia tiene Coolify y si su v4 se considera estable? Se responde antes de POC-4.
