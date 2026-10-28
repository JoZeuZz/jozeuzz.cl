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

## Triage npm audit 2026-10-27 (reevaluación I1)

Ejecutado: `npm audit --omit=dev` sobre imagen `node@sha256:91acba...` en contenedor aislado.
Resultado: **0 critical, 4 high, 10 moderate** (sin cambio respecto a registro anterior).

### High: undici 7.0.0–7.30.0 (undici@7.29.0)
- **Cadena**: `payload@3.90.2` → `undici@7.29.0`
- **CVEs**: GHSA-3wwx-pv8p-q78v (DoS WebSocket), GHSA-pmjh-fq2x-6v4x (DoS orphaned RetryHandler),
  GHSA-r53p-7pc4-xj5r (response splitting retry), GHSA-rfgv-xxqx-mfg5 (DoS WebSocket subprotocol),
  GHSA-3xpg-4rpp-hhhm (DoS decompression), GHSA-2jfj-6hjv-fm6j (cookie disclosure),
  GHSA-2gqq-gqf2-x968 (response truncation), GHSA-w293-vg96-wgc3 (TLS bypass),
  GHSA-8436-99hf-9mmv (unsafe HTTP methods caching), GHSA-rx4f-c7p8-82vq (DoS WebSocketStream),
  GHSA-4qv8-2p9j-2685 (DoS EventSource), GHSA-f72v-6w45-q472 (SRI bypass),
  GHSA-xjj6-f33q-929c (DoS content-encodings)
- **Reachability**: undici es dependencia de runtime de payload (HTTP client interno). En MVP I1 no hay endpoints externos ni WebSocket expuesto. La mayoría son DoS en funciones WebSocket/EventSource no usadas en SSR. Sin override posible sin cambiar payload (exigiría `payload@≥3.92.0`).
- **Decisión**: diferir. Evaluar al actualizar payload. No aplicar --force.

### High: esbuild ≤0.24.2 (esbuild@0.28.2 — GHSA-67mh-4wv8-2f99)
- **Cadena**: `@payloadcms/db-postgres@3.90.2` → `drizzle-kit@0.31.7` → `esbuild-register@3.6.0` → `esbuild@~0.28.0`; también `payload@3.90.2` → `tsx@4.22.4` → `esbuild@~0.28.0`
- **CVE**: advisory permite sitio web enviar peticiones al dev server y leer respuesta
- **Reachability**: afecta **solo entorno de desarrollo** (drizzle-kit CLI, tsx transpiler). No alcanza runtime de producción. No hay dev server expuesto en CI ni producción.
- **Decisión**: diferir. No aplicar override (requeriría cambiar drizzle-kit/tsx vía payloadcms).

### High: happy-dom ≤20.14.6 (happy-dom@20.14.6 — GHSA-834v-8h66-3h79)
- **Cadena**: `@payloadcms/richtext-lexical@3.90.2` → `@lexical/headless@0.50.0` → `happy-dom@20.14.6`; también peerOptional de vitest (dev)
- **CVE**: Incomplete fix CVE-2026-33943, unsanitized import alias → host code execution
- **Reachability**: `@lexical/headless` se usa para serializar richtext en Lexical editor (admin UI). En MVP I1 no hay contenido richtext en ninguna colección. La vía de vitest es devDependency.
- **Decisión**: diferir hasta que richtext-lexical publique parche compatible.

### Moderate: cadena payload/drizzle/undici (10 entradas)
- Todas son transitivas de las mismas tres HIGH anteriores o variantes moderate de undici.
- Misma decisión: diferir, evaluar al actualizar payload.

**Próxima revisión**: al actualizar payload/richtext-lexical a versión ≥3.92.0.

## Workaround de migración

- Payload `3.90.2` generó imports ESM de `MigrateUpArgs` y `MigrateDownArgs` como valores. `@payloadcms/drizzle/dist/postgres/types.d.ts` los declara tipos; bajo `verbatimModuleSyntax` el binario no elimina esos imports y falla en runtime.
- Se corrigió sólo el encabezado generado a `type` imports; SQL y JSON generados permanecen intactos. La prueba `test/unit/migraciones.test.ts` evita regresión. Reevaluar al actualizar Payload.

## Task4: APIs verificadas 2026-10-27

- **Node crypto (randomBytes, createHmac, timingSafeEqual)**: Node.js 24.x built-in, sin dependencia externa.
  - https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptorandombytessize-callback
  - https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptotimingsafeequala-b
  - Verificado: `randomBytes(32)` → 32 bytes; `Buffer.toString('base64url')` disponible Node 24.
- **Next.js 16.4.1 middleware / proxy**:
  - `NextRequest` / `NextResponse` desde `'next/server'`.
  - `NextResponse.next({ request: { headers } })` inyecta headers en request hacia Server Components.
  - `response.cookies.set(name, value, opts)` — genera `Set-Cookie` con flags correctos verificado contra `next/dist/server/web/spec-extension/response`.
  - `__Host-` prefix cookie: requiere `Secure`, `Path=/`, sin `Domain` — cumple SameSite=Strict, HttpOnly.
  - Fuente: https://nextjs.org/docs/app/building-your-application/routing/middleware (Next.js 16 docs)
  - Verificado localmente: `r.cookies.set('test','val',{httpOnly:true,secure:true,sameSite:'strict',path:'/'})` → `set-cookie: test=val; Path=/; Secure; HttpOnly; SameSite=strict`.
  - `NextResponse.rewrite(url, { request: { headers } })` pasa headers al Server Component destino.
