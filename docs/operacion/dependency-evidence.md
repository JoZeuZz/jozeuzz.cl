# Evidencia de dependencias I1

Fecha de acceso: 2026-10-27.

## Runtime fijado

- Imagen oficial Node: `node@sha256:91acba91b842bec0bf7ea6f5e09c644c7ccad72c4996ed9616d861d1c7cd60d4`.
- Node informado por imagen: `v24.22.0`.
- npm informado por imagen: `11.19.1`.
- Fuente: https://hub.docker.com/_/node

## Compatibilidad verificada

- Next `16.4.1` declara Node `>=20.9.0`.
- Payload `3.90.2` declara Node `^18.20.2 || >=20.9.0`.
- `@payloadcms/next@3.90.2` acepta Next `>=16.3.3 <17.0.0`; Next `16.4.1` queda dentro del rango.
- Payload declara `graphql ^16.8.1`; versión fijada `16.14.2` queda dentro del rango.
- Fuentes: https://www.npmjs.com/package/next/v/16.4.1, https://www.npmjs.com/package/payload/v/3.90.2, https://www.npmjs.com/package/@payloadcms/next/v/3.90.2, https://www.npmjs.com/package/@payloadcms/db-postgres/v/3.90.2.

## Advisories

- Se consultó GitHub Security Advisories por paquete para `next`, `payload`, `graphql` y `@payloadcms/db-postgres`: https://github.com/advisories.
- OSV: https://osv.dev/list?q=next, https://osv.dev/list?q=payload, https://osv.dev/list?q=graphql, https://osv.dev/list?q=%40payloadcms%2Fdb-postgres.
- RED registrado: `npm audit fix --package-lock-only --omit=dev` informó 16 vulnerabilidades runtime: 11 moderate, 4 high y 1 critical. Critical: `dompurify <=3.4.16`, transitiva de `monaco-editor`; https://github.com/advisories/GHSA-cg2g-xh64-v4q7.
- Mitigación aprobada el 2026-10-27: override exacto `dompurify: 3.4.17`, sin `npm audit fix --force`. El lockfile fija `3.4.17` con integridad `sha512-B/pSlYVHQ58kqISD/yDjuJ1yfzI34m1gF4lAod2bwSRhiN4K5Cl3H8Af7hqB2PmTL911tdEudnnXn5FnhRoz0w==` desde https://registry.npmjs.org/dompurify/-/dompurify-3.4.17.tgz.
- GREEN: `npm audit --omit=dev --json` informa 0 critical, 4 high, 10 moderate y 0 low (14 total); exit 1 por hallazgos restantes.
- High diferidos: `happy-dom` vía `@lexical/headless` y `undici` vía `payload`; ambos exigen cambiar versiones directas I1 fijadas. Moderate diferidos: cadena `payload`/`@payloadcms/db-postgres`/`drizzle-kit` y `esbuild`; parche requiere `@payloadcms/db-postgres@3.92.0`. Se revisan antes de integrar o actualizar dependencias.
