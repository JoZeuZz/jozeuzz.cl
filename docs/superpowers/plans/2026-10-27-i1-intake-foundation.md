# I1 Intake Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a production-buildable vertical slice where a visitor submits one protected service request and an authenticated administrator can review it without exposing requests to anonymous actors.

**Architecture:** Build a clean Next.js and Payload monolith backed by PostgreSQL. Keep HTTP adaptation, intake domain logic, persistence, authorization, and logging in separate modules. Reuse POC behavior and tests selectively from the pinned read-only commit, never its scaffold or experimental operations.

**Tech Stack:** Node.js 24.22.x, Next.js 16.4.1, React 19.2.9, Payload CMS 3.90.2, PostgreSQL 18.6, TypeScript 5.9.3, Vitest 4.1.11, Playwright 1.64.1.

## Global Constraints

- Work only in `/home/proyectos/jozeuzz-producto-base` on `feat/mvp-v0.1`.
- Start from documentation commit produced from `producto/base@4302e2d47ba7c7a8119e99b2ed807e83ac8ca716`.
- One implementer is the only writer; QA and Security are read-only.
- Do not modify `/home/proyectos/jozeuzz-poc-candidata-a`, `/home/proyectos/jozeuzz/worktrees/historico/poc-drizzle-fix`, `/home/proyectos/jozeuzz-jz-agents`, or `poc/candidata-a-3`.
- Do not read `.env` files. Use only `.env.example` and disposable test values created by commands.
- Verify official compatibility and advisories before installing. Stop only for a material incompatibility or unresolved critical runtime advisory.
- Install only dependencies listed in Task 1. Any additional package requires a documented reason in the same commit.
- Do not add another ORM, Redis, queues, external antiabuse, email, analytics, or telemetry services.
- Disable GraphQL. Never use Payload Local API for public data without `overrideAccess: false`.
- Use versioned migrations. Never use `drizzle push` in CI, staging, or production.
- Tests use synthetic `.invalid` contacts and sentinel strings; no real personal data.
- Every behavioral task follows red, green, refactor and records the failing command before implementation.
- Every task ends with diff inspection, affected gates, and one atomic commit.
- Pin the exact npm version reported by the accepted Node image in `packageManager`; CI verifies the same version.

## Contract

**Objective:** Implement I1 exactly as specified in `docs/superpowers/specs/2026-10-27-i1-intake-foundation-design.md`.

**In scope:** scaffold, admin authentication, services, requests, protected intake, read-only admin review, sanitized logs, migrations, local containers, CI, production E2E, accessibility.

**Out of scope:** portfolio, state transitions, request events, internal notes editing, notifications, attachments, staging, production, DNS, backup destination, real content.

**Allowed paths:** root project manifests and configs; `src/**`; `test/**`; `e2e/**`; `scripts/**`; `tooling/**`; `.github/workflows/ci.yml`; `docs/operacion/**`; documentation files already created for I1.

**Acceptance:** all 19 criteria in the I1 design pass with recorded commands, counts, and exit codes.

---

## File Map

| Path | Responsibility |
|---|---|
| `src/payload.config.ts` | Payload, database, admin, GraphQL closure and collections |
| `src/collections/Usuarios.ts` | Single-admin authentication and account access |
| `src/collections/Servicios.ts` | Public-active/admin-all catalog policy |
| `src/collections/Solicitudes.ts` | Private, server-created request records |
| `src/modules/identity/access.ts` | Reusable deny-by-default access functions |
| `src/modules/intake/tipos.ts` | Stable intake input, context, result and repository interfaces |
| `src/modules/intake/validar.ts` | Strict allowlist and normalization |
| `src/modules/intake/token.ts` | Signed nonce creation and verification |
| `src/modules/intake/origen.ts` | Origin/referrer and trusted-proxy IP policy |
| `src/modules/intake/limite.ts` | Rate-window calculations and derived keys |
| `src/modules/intake/repositorio-payload.ts` | Transactional nonce, limit and request persistence |
| `src/modules/intake/procesar.ts` | Intake orchestration independent of HTTP |
| `src/modules/observability/intake-log.ts` | Structured allowlisted events |
| `src/app/api/intake/route.ts` | HTTP adapter |
| `src/app/(frontend)/servicios/solicitar/page.tsx` | No-JavaScript form and token cookie |
| `src/app/(frontend)/servicios/solicitar/confirmacion/page.tsx` | Generic success page |
| `src/migrations/**` | Versioned PostgreSQL schema |
| `test/unit/**` | Pure contracts |
| `test/integration/**` | PostgreSQL and Payload behavior |
| `test/http/**` | Deployed HTTP authorization and privacy |
| `e2e/intake.spec.ts` | Production flow, keyboard, no-JS and axe |

### Task 1: Create reproducible application foundation

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Create: `.npmrc`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `tsconfig.json`
- Create: `next-env.d.ts`
- Create: `next.config.mjs`
- Create: `eslint.config.mjs`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `Dockerfile`
- Create: `tooling/node-image.txt`
- Create: `scripts/run-node`
- Create: `scripts/verify-external-worktrees.sh`
- Create: `docs/operacion/dependency-evidence.md`
- Create: `src/app/(frontend)/layout.tsx`
- Create: `src/app/(frontend)/page.tsx`
- Test: `test/foundation/fundacion.test.mjs`

**Interfaces:**
- Consumes: Node `>=24.22.0 <25` and PostgreSQL connection through `DATABASE_URL`.
- Produces: scripts `dev`, `build`, `start`, `lint`, `typecheck`, `test:unit`, `test:integration`, `test:http`, `test:e2e`, `test`.

- [ ] **Step 1: Verify versions and advisories before installation**

Resolve official Node image first, record exact digest, and run every npm command through that image:

```bash
docker pull node:24.22.0-bookworm-slim
NODE_IMAGE="$(docker image inspect node:24.22.0-bookworm-slim --format '{{index .RepoDigests 0}}')"
docker run --rm "$NODE_IMAGE" node --version
docker run --rm "$NODE_IMAGE" npm --version
docker run --rm "$NODE_IMAGE" npm view next@16.4.1 version engines peerDependencies
docker run --rm "$NODE_IMAGE" npm view payload@3.90.2 version engines peerDependencies
docker run --rm "$NODE_IMAGE" npm view @payloadcms/db-postgres@3.90.2 version
```

Write digest, Node version, npm version, source URLs, access date and advisory findings to `docs/operacion/dependency-evidence.md`. Also inspect official Payload compatibility documentation, GitHub Security Advisories and OSV records for Next.js, Payload, `graphql` and PostgreSQL adapter. Expected: Node is within `>=24.22.0 <25`; requested versions exist and Payload accepts Next 16.4.1. `Dockerfile` starts from recorded digest, never mutable tag.

- [ ] **Step 2: Write foundation test first**

```js
// test/foundation/fundacion.test.mjs
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import test from 'node:test'

test('fija runtime, stack y gates obligatorios', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'))
  assert.equal(pkg.engines.node, '>=24.22.0 <25')
  assert.match(pkg.packageManager, /^npm@\d+\.\d+\.\d+$/)
  assert.equal(pkg.dependencies.next, '16.4.1')
  assert.equal(pkg.dependencies.payload, '3.90.2')
  assert.equal(pkg.dependencies['@payloadcms/db-postgres'], '3.90.2')
  for (const gate of ['build', 'lint', 'typecheck', 'test']) {
    assert.equal(typeof pkg.scripts[gate], 'string')
  }
  assert.equal(Object.hasOwn(pkg.dependencies, 'drizzle-orm'), false)
})
```

- [ ] **Step 3: Run red test**

Run:

```bash
docker run --rm -v "$PWD:/app" -w /app "$NODE_IMAGE" node --test test/foundation/fundacion.test.mjs
```

Expected: FAIL because `package.json` does not yet define the product stack or Vitest is unavailable. Record command, failure count and exit code.

- [ ] **Step 4: Create manifests and install exact dependencies**

Use this dependency set:

```json
{
  "name": "jozeuzz-cl",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint . --max-warnings=0",
    "typecheck": "tsc --noEmit --incremental false",
    "test:unit": "vitest run test/unit",
    "test:integration": "vitest run test/integration",
    "test:http": "vitest run test/http",
    "test:e2e": "playwright test",
    "test:foundation": "node --test test/foundation/*.test.mjs",
    "test": "npm run test:foundation && npm run test:unit && npm run test:integration && npm run test:http"
  },
  "engines": { "node": ">=24.22.0 <25" },
  "dependencies": {
    "@payloadcms/db-postgres": "3.90.2",
    "@payloadcms/next": "3.90.2",
    "@payloadcms/richtext-lexical": "3.90.2",
    "@payloadcms/ui": "3.90.2",
    "graphql": "16.14.2",
    "next": "16.4.1",
    "payload": "3.90.2",
    "react": "19.2.9",
    "react-dom": "19.2.9",
    "sharp": "0.35.5"
  },
  "devDependencies": {
    "@axe-core/playwright": "4.13.0",
    "@playwright/test": "1.64.1",
    "@types/node": "24.19.2",
    "@types/react": "19.2.18",
    "@types/react-dom": "19.2.7",
    "eslint": "9.38.0",
    "eslint-config-next": "16.4.1",
    "typescript": "5.9.3",
    "vite-tsconfig-paths": "6.1.1",
    "vitest": "4.1.11"
  },
  "overrides": {
    "dompurify": "3.4.17"
  }
}
```

Write `$NODE_IMAGE` exactly to `tooling/node-image.txt`. Create executable `scripts/run-node`: it reads that digest and runs commands inside the pinned image with current UID/GID, repository mounted at `/app`, working directory `/app`, and host networking only for disposable localhost test databases. Obtain npm version through this wrapper, then set `packageManager` through it; foundation test verifies exact numeric form. Set `.npmrc` to `save-exact=true`, `engine-strict=true`, `ignore-scripts=true`, and `audit=true`. Apply exact override `dompurify: 3.4.17` to remediate GHSA-cg2g-xh64-v4q7 through the Payload admin dependency graph; document source and date. Run installation through `scripts/run-node`, review package lifecycle needs, then run only required trusted rebuilds explicitly. Do not disable signature or integrity verification.

Capture each protected reference worktree's HEAD plus SHA-256 of `git status --porcelain=v1 -z` for `/home/proyectos/jozeuzz-poc-candidata-a`, `/home/proyectos/jozeuzz/worktrees/historico/poc-drizzle-fix` and `/home/proyectos/jozeuzz-jz-agents`. Generate `scripts/verify-external-worktrees.sh` with those exact baseline values; it reads only Git metadata and exits 1 on any later difference.

- [ ] **Step 5: Add strict configuration and minimal semantic page**

`tsconfig.json` enables `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax`, path alias `@/* -> src/*`, and excludes `.next`. `next.config.mjs` sets `output: 'standalone'`, `poweredByHeader: false`, production source maps off, `X-Frame-Options: DENY`, and `Content-Security-Policy: frame-ancestors 'none'` for `/admin/:path*`. The home page contains one `main`, one `h1`, and links to `/servicios/solicitar` and `/admin`.

- [ ] **Step 6: Run green foundation gates**

Run:

```bash
./scripts/run-node npm run test:foundation
./scripts/run-node npm run typecheck
./scripts/run-node npm run lint
./scripts/run-node npm run build
./scripts/run-node npm audit --omit=dev
```

Expected: foundation test 1/1 PASS; typecheck, lint and build exit 0; audit result recorded with exact counts. Critical runtime advisories block continuation.

- [ ] **Step 7: Commit foundation**

```bash
git add package.json package-lock.json .npmrc .gitignore .env.example tsconfig.json next-env.d.ts next.config.mjs eslint.config.mjs vitest.config.ts playwright.config.ts Dockerfile tooling/node-image.txt scripts/run-node scripts/verify-external-worktrees.sh docs/operacion/dependency-evidence.md src/app test/foundation/fundacion.test.mjs
git diff --staged --check
git commit -m "feat: establish MVP application foundation"
```

### Task 2: Add Payload authentication and private collections

**Files:**
- Create: `src/payload.config.ts`
- Create: `src/collections/Usuarios.ts`
- Create: `src/collections/Servicios.ts`
- Create: `src/collections/Solicitudes.ts`
- Create: `src/modules/identity/access.ts`
- Create: `src/modules/catalog/publico.ts`
- Create: `src/migrations/index.ts`
- Create: `src/migrations/20261027_112804.ts`
- Create: `src/app/(payload)/admin/[[...segments]]/page.tsx`
- Create: `src/app/(payload)/admin/importMap.js`
- Create: `src/app/(payload)/layout.tsx`
- Create: `src/app/(payload)/api/[...slug]/route.ts`
- Test: `test/unit/access.test.ts`
- Test: `test/integration/colecciones.int.test.ts`

**Interfaces:**
- Produces: `soloAdmin`, `usuarioPropio`, `servicioActivoPorGatewayOAdmin`, Payload slugs `usuarios`, `servicios`, `solicitudes`.
- Produces: `listarServiciosPublicos(payload): Promise<readonly ServicioPublico[]>` with a closed DTO and module-private gateway capability.
- Produces: requests default to `estado: 'recibida'`; generic collection create/update/delete remain denied.

- [ ] **Step 1: Write red access tests**

```ts
import { describe, expect, it } from 'vitest'
import { servicioActivoPorGatewayOAdmin, soloAdmin, usuarioPropio } from '@/modules/identity/access'

describe('acceso', () => {
  it('niega anónimo y permite admin autenticado', () => {
    expect(soloAdmin({ req: { user: null } } as never)).toBe(false)
    expect(soloAdmin({ req: { user: { collection: 'usuarios' } } } as never)).toBe(true)
  })

  it('cierra canal genérico y permite gateway con capacidad interna', () => {
    expect(servicioActivoPorGatewayOAdmin({ req: { user: null, context: {} } } as never)).toBe(false)
    expect(usuarioPropio({ req: { user: { id: 'u1', collection: 'usuarios' } }, id: 'u2' } as never)).toBe(false)
  })
})
```

- [ ] **Step 2: Run red access test**

Run: `./scripts/run-node npm run test:unit -- --run test/unit/access.test.ts`

Expected: FAIL with missing module. Record exit code 1.

- [ ] **Step 3: Implement minimal access functions and make unit test green**

```ts
// src/modules/identity/access.ts
import type { Access } from 'payload'

export const soloAdmin: Access = ({ req }) => req.user?.collection === 'usuarios'

export const usuarioPropio: Access = ({ id, req }) =>
  req.user?.collection === 'usuarios' && req.user.id === id

export const nadie: Access = () => false
```

Implement gateway capability as a module-private `Symbol`; only `listarServiciosPublicos` can attach it to Local API context. `servicioActivoPorGatewayOAdmin` returns active filter only for that capability, true for admin, false otherwise. Run `./scripts/run-node npm run test:unit -- --run test/unit/access.test.ts`; expected 2/2 PASS.

- [ ] **Step 4: Write and run red PostgreSQL/channel tests**

Before creating collections, test with disposable database that anonymous REST/Local API cannot list, count, filter or read `solicitudes`; generic REST cannot read services; public gateway returns only active DTO fields; admin can read; direct request create/update/delete fails for anonymous and admin; GraphQL routes are closed. Run `./scripts/run-node npm run test:integration -- --run test/integration/colecciones.int.test.ts` and record expected failures from missing collections/config.

- [ ] **Step 5: Implement collections, generated foundation migration, gateway and Payload wiring**

Gateway returns only `id`, `nombre`, `slug` and `descripcion`.

`Usuarios` uses `auth` with `maxLoginAttempts: 5`, `lockTime: 10 * 60 * 1000`, own-session read, and denies HTTP create/delete plus identity-field updates. `Servicios` exposes active data only through gateway and admin mutations. `Solicitudes` allows only admin reads; create/update/delete all use `nadie`; `estado` and administrative fields also deny field updates. Fields match I1 design and set `estado` server-side with no public write access.

Configure `graphQL.disable: true`, Postgres adapter, Lexical editor, CSRF from `NEXT_PUBLIC_SERVER_URL`, secret from `PAYLOAD_SECRET`, generated TypeScript types and official import map. Generate, inspect and apply the foundation migration to a disposable PostgreSQL database twice; first execution applies it and second has no pending migrations. Expose only Payload admin and REST routes required by Next integration.

Run: `./scripts/run-node npm run test:integration -- --run test/integration/colecciones.int.test.ts`.

Expected: all cases PASS against PostgreSQL. Do not replace integration with mocks. Run `./scripts/run-node npm run build` and smoke `/admin` to prove import map and admin bundle.

- [ ] **Step 6: Commit access boundary**

```bash
git add src/payload.config.ts src/collections src/modules/identity src/modules/catalog src/app/\(payload\) test/unit/access.test.ts test/integration/colecciones.int.test.ts
git diff --staged --check
git commit -m "feat: enforce private Payload boundaries"
```

### Task 3: Implement strict public-input validation

**Files:**
- Create: `src/modules/intake/tipos.ts`
- Create: `src/modules/intake/validar.ts`
- Test: `test/unit/intake-validar.test.ts`

**Interfaces:**
- Produces: `validarSolicitud(input: unknown): ResultadoValidacion`.
- Produces: normalized `DatosSolicitudValidada` without `website` or `token`.

- [ ] **Step 1: Write table-driven red tests**

Cover valid input, missing fields, wrong types, unknown keys, whitespace normalization, all field-length boundaries, administrative keys (`estado`, `motivoCierre`, `observacionesInternas`, `createdAt`), non-empty honeypot, and token absence. Assert errors mention only public field names. Raw 16 KiB transport limit belongs to Task 7 HTTP parser, not this object validator.

- [ ] **Step 2: Run red validation tests**

Run: `./scripts/run-node npm run test:unit -- --run test/unit/intake-validar.test.ts`

Expected: FAIL because `validarSolicitud` is missing.

- [ ] **Step 3: Implement closed types and validator**

```ts
export type DatosSolicitudValidada = Readonly<{
  nombre: string
  contacto: string
  tipoEquipo: string
  descripcion: string
  servicio?: string
}>

export type ResultadoValidacion =
  | Readonly<{ ok: true; datos: DatosSolicitudValidada; token: string }>
  | Readonly<{ ok: false; campos: Readonly<Record<string, string>> }>
```

Parse only exact keys `nombre`, `contacto`, `tipoEquipo`, `descripcion`, `servicio`, `website`, `token`. Reject any additional key. Normalize Unicode to NFC, trim edges, collapse repeated horizontal whitespace outside `descripcion`, and apply design limits.

- [ ] **Step 4: Run green validation tests and refactor**

Run: `./scripts/run-node npm run test:unit -- --run test/unit/intake-validar.test.ts`

Expected: all table cases PASS. Keep validator dependency-free.

- [ ] **Step 5: Commit validation contract**

```bash
git add src/modules/intake/tipos.ts src/modules/intake/validar.ts test/unit/intake-validar.test.ts
git commit -m "feat: validate public service requests"
```

### Task 4: Implement nonce, CSRF, origin and trusted IP policy

**Files:**
- Create: `src/modules/intake/token.ts`
- Create: `src/modules/intake/origen.ts`
- Create: `src/proxy.ts`
- Test: `test/unit/intake-token.test.ts`
- Test: `test/unit/intake-origen.test.ts`

**Interfaces:**
- Produces: `crearToken(claveServidor, secretoCookie, ahora): { token; nonceHash; emitidoEn }`.
- Produces: `verificarToken(claveServidor, secretoCookie, tokenFormulario, ahora): VerificacionToken`.
- Produces: `validarOrigen(headers, serverUrl): boolean`.
- Produces: `obtenerIpConfiable(headers): string | null`.

- [ ] **Step 1: Write red cryptographic and origin tests**

Use fixed keys and clocks. Cover valid token, modification, token signed with cookie A presented with cookie B, expiration at 30 minutes, future issuance, constant-length signature and timing-insensitive mismatch path, own Origin, foreign Origin, own Referer fallback, absent headers, ignored public forwarding headers and missing internal IP. Test Next proxy behavior: first visit creates secure strict cookie and injected request header; later tabs reuse cookie while receiving distinct form nonce. Network-proxy stripping and final cookie headers through Caddy are tested in Task 9.

- [ ] **Step 2: Run red security tests**

Run: `./scripts/run-node npm run test:unit -- --run test/unit/intake-token.test.ts test/unit/intake-origen.test.ts`

Expected: both suites fail due missing modules.

- [ ] **Step 3: Implement using Node crypto only**

Use `randomBytes(32)`, `createHmac('sha256', key)`, base64url encoding and `timingSafeEqual`. Stable cookie secret lasts 30 minutes; each signed payload is versioned JSON containing a fresh nonce and epoch milliseconds. Hash nonce before returning persistence control. Origin parsing uses `URL.origin`; malformed values fail closed. IP accepts only internal `x-jozeuzz-client-ip` inserted by proxy and rejects absence. `src/proxy.ts` sets `__Host-jozeuzz-csrf` with `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, no Domain, and forwards its value to the form Server Component in an internal request header without exposing it to browser JavaScript.

- [ ] **Step 4: Run green security tests**

Run the command from Step 2. Expected: all cases PASS, exit 0.

- [ ] **Step 5: Commit request security primitives**

```bash
git add src/modules/intake/token.ts src/modules/intake/origen.ts src/proxy.ts test/unit/intake-token.test.ts test/unit/intake-origen.test.ts
git commit -m "feat: protect intake origin and nonce"
```

### Task 5: Implement transactional intake repository

**Files:**
- Create: `src/modules/intake/limite.ts`
- Create: `src/modules/intake/repositorio.ts`
- Create: `src/modules/intake/repositorio-payload.ts`
- Create: `src/collections/IntakeNonces.ts`
- Create: `src/collections/IntakeLimites.ts`
- Create: `scripts/intake-purge.mjs`
- Modify: `src/payload.config.ts`
- Test: `test/unit/intake-limite.test.ts`
- Test: `test/integration/intake-persistencia.int.test.ts`

**Interfaces:**
- Produces: `derivarClaveLimite(secret, ip): string`.
- Produces: `RepositorioIntake.crearSolicitud(datos, control): Promise<ResultadoPersistencia>` using the discriminated union from the I1 design.

- [ ] **Step 1: Write red rate-window unit tests**

Cover first through fifth distinct nonces accepted, sixth rejected, exact-window reset, HMAC-derived keys, no raw IP in output and `Retry-After` rounded upward with `Math.ceil`. Cover completed nonce replay without quota consumption and cleanup that retains current rows while deleting nonce and rate rows after their 24-hour expiry.

- [ ] **Step 2: Write red PostgreSQL integration tests**

Use real concurrent transactions. Prove same nonce under two simultaneous calls produces one request and consumes one quota; replay after completion returns success without increasing quota; six distinct nonces reach the limit; inactive service rolls back nonce and counter; injected request failure leaves no nonce/counter/request; anonymous/admin REST cannot access internal nonce or limit collections.

- [ ] **Step 3: Run red repository tests**

Run:

```bash
./scripts/run-node npm run test:unit -- --run test/unit/intake-limite.test.ts
./scripts/run-node npm run test:integration -- --run test/integration/intake-persistencia.int.test.ts
```

Expected: missing implementation failures, exit 1.

- [ ] **Step 4: Implement private persistence collections and repository**

Collections hide admin UI and deny every REST operation. `nonceHash` has unique index. Limit key and window start form unique identity. Repository is imported only by `procesar.ts`; a static dependency test rejects imports from route files. Repository starts one Payload/Postgres transaction, reserves nonce first, resolves a completed conflict as `reintento` without quota, then locks/increments rate row, validates active service through a capability confined to `repositorio-payload.ts`, creates request with `estado: 'recibida'`, marks nonce completed, and commits. Conflict with an in-flight nonce waits and rechecks completion. Other results map to `limite`, `servicio_invalido` or sanitized `error`; all failures roll back. `scripts/intake-purge.mjs` deletes only rows whose indexed `expiraEn` is older than current database time.

- [ ] **Step 5: Run green repository tests**

Run commands from Step 3. Expected: unit and integration suites PASS against PostgreSQL, including concurrency and rollback.

- [ ] **Step 6: Commit transactional intake**

```bash
git add src/modules/intake/limite.ts src/modules/intake/repositorio.ts src/modules/intake/repositorio-payload.ts src/collections/IntakeNonces.ts src/collections/IntakeLimites.ts src/payload.config.ts scripts/intake-purge.mjs test/unit/intake-limite.test.ts test/integration/intake-persistencia.int.test.ts
git commit -m "feat: persist intake atomically"
```

### Task 6: Add sanitized observability and intake orchestration

**Files:**
- Create: `src/modules/observability/intake-log.ts`
- Create: `src/modules/intake/procesar.ts`
- Test: `test/unit/intake-log.test.ts`
- Test: `test/unit/intake-procesar.test.ts`

**Interfaces:**
- Produces: `registrarIntake(evento: EventoIntake): void`.
- Produces: `procesarIntake(input, contexto, dependencias): Promise<ResultadoIntake>`.

- [ ] **Step 1: Write red orchestration and sentinel tests**

Assert validation short-circuits persistence; invalid origin or missing trusted IP returns `origen_invalido`; expired token and submissions before 800 ms fail without persistence; rate rejection returns seconds; valid and repeated nonce return `{ ok: true }`; repository `servicio_invalido` and sanitized failure map correctly; repository failure returns `interno` plus correlation. Inject sentinel name, contact and description into every error path and assert captured stdout/stderr never contains them.

- [ ] **Step 2: Run red orchestration tests**

Run: `./scripts/run-node npm run test:unit -- --run test/unit/intake-log.test.ts test/unit/intake-procesar.test.ts`

Expected: missing modules fail.

- [ ] **Step 3: Implement allowlisted events**

```ts
export type EventoIntake = Readonly<{
  evento: 'intake_recibido' | 'intake_rechazado' | 'intake_creado' | 'intake_reintento' | 'intake_error'
  codigo?: string
  duracion_ms?: number
  correlacion?: string
  err_name?: string
  pg_code?: string
}>

export function registrarIntake(evento: EventoIntake): void {
  process.stdout.write(`${JSON.stringify(evento)}\n`)
}
```

Never pass unknown error objects to logger. Extract only class name and allowlisted PostgreSQL code. Orchestrator depends on injected clock, token verifier, origin policy, repository and logger for deterministic tests.

- [ ] **Step 4: Run green orchestration tests**

Run command from Step 2. Expected: all cases PASS and sentinel scan finds zero matches.

- [ ] **Step 5: Commit orchestration**

```bash
git add src/modules/observability src/modules/intake/procesar.ts test/unit/intake-log.test.ts test/unit/intake-procesar.test.ts
git commit -m "feat: orchestrate intake without PII logs"
```

### Task 7: Expose protected HTTP route and no-JavaScript form

**Files:**
- Create: `src/app/api/intake/route.ts`
- Create: `src/app/(frontend)/servicios/solicitar/page.tsx`
- Create: `src/app/(frontend)/servicios/solicitar/confirmacion/page.tsx`
- Create: `src/app/(frontend)/servicios/solicitar/formulario.tsx`
- Create: `src/app/(frontend)/styles.css`
- Modify: `src/app/(frontend)/layout.tsx`
- Test: `test/http/intake.http.test.ts`
- Test: `e2e/intake-smoke.spec.ts`

**Interfaces:**
- Consumes: `procesarIntake`, `crearToken` and Payload repository.
- Produces: `GET /servicios/solicitar`, `POST /api/intake`, `GET /servicios/solicitar/confirmacion`.

- [ ] **Step 1: Write red HTTP contract tests**

Test HTML labels, method and hidden token; `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/` cookie flags with no Domain; first visit and two-tab token behavior; `Cache-Control: no-store` on GET and every POST response; JSON valid POST 201; HTML valid POST 303; JSON errors use closed bodies; HTML validation/origin/limit errors return complete accessible forms without reemitting submitted values; inactive service 400; trusted IP missing 403; honeypot and submission before 800 ms persist nothing; sixth distinct nonce 429 plus integer `Retry-After >= 1`; same completed nonce twice succeeds and leaves one DB row plus one quota; admin fields rejected; body of exactly 16,384 bytes reaches parser while 16,385 bytes is rejected before parsing; ambiguous content negotiation returns fixed `tipo_no_soportado` body with 415/406. Every response omits submitted values, request ID, internal status and administrative fields.

Write `e2e/intake-smoke.spec.ts` before UI implementation. It navigates by keyboard, checks form labels and submits one synthetic request against production build. Its initial run must fail because page/route do not exist.

- [ ] **Step 2: Run red HTTP tests**

Run:

```bash
./scripts/run-node npm run test:http -- --run test/http/intake.http.test.ts
./scripts/run-node npm run build && ./scripts/run-node npm run test:e2e -- e2e/intake-smoke.spec.ts
```

Expected: route/page missing or contract failures.

- [ ] **Step 3: Implement progressive-enhancement form**

Form posts standard `application/x-www-form-urlencoded` fields to `/api/intake`. Route handles both form and JSON through one parser with a 16 KiB streaming limit and sets `Cache-Control: no-store`. JSON requires JSON `Content-Type` and `Accept`; HTML requires form content type and HTML-compatible `Accept`. JSON clients receive fixed bodies. Successful HTML receives 303. HTML failures receive a complete accessible empty form rendered from a shared server renderer, with field errors but no submitted values; nothing enters URL or cookies. Ambiguous combinations fail before domain processing with fixed `tipo_no_soportado` response.

CSS provides responsive single-column layout, 44 px targets, visible two-pixel focus, error summary, field errors linked by `aria-describedby`, and reduced-motion-safe transitions. Use system fonts and verified color tokens from “Técnica precisa”.

- [ ] **Step 4: Run green HTTP tests**

Run Step 2 commands. Expected: HTTP contract and smoke E2E PASS against production build.

- [ ] **Step 5: Commit vertical HTTP flow**

```bash
git add src/app/api/intake src/app/\(frontend\)/servicios src/app/\(frontend\)/styles.css src/app/\(frontend\)/layout.tsx test/http/intake.http.test.ts e2e/intake-smoke.spec.ts
git commit -m "feat: add protected service request flow"
```

### Task 8: Harden administrator lifecycle and generic channels

**Files:**
- Create: `scripts/admin-create.mjs`
- Create: `scripts/admin-recover.mjs`
- Create: `src/modules/identity/cerrar-recuperacion.ts`
- Modify: `src/app/(payload)/api/[...slug]/route.ts`
- Test: `test/http/canales-privados.http.test.ts`
- Test: `test/integration/admin-lifecycle.int.test.ts`
- Create: `docs/operacion/admin-access.md`

**Interfaces:**
- Produces: local scripts requiring explicit email/password arguments from process input without logging values.
- Produces: HTTP closure for first-register, user init disclosure and forgot-password.

- [ ] **Step 1: Write red channel tests**

Probe `/api/solicitudes`, count, IDs, filters, sort/select/depth, direct admin `POST /api/solicitudes`, generic service REST, `/api/intake-nonces`, `/api/intake-limites`, GraphQL paths, admin RSC/HTML, `/api/usuarios/init`, first-register and forgot-password. Anonymous bodies and locations must contain no synthetic admin email, request sentinels, IDs or capability details. Test admin cannot mutate request fields in I1 and cannot read/update another user identity. Assert `/admin`, Payload REST and disabled lifecycle routes include `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'`.

Integration tests launch two concurrent `admin-create.mjs` processes and assert one admin. Open a database connection with `application_name = 'jozeuzz-app'`, run recovery and assert it refuses without changes; close connection, rerun recovery and assert audited replacement succeeds without printing email/password.

- [ ] **Step 2: Run red channel tests**

Run:

```bash
./scripts/run-node npm run test:http -- --run test/http/canales-privados.http.test.ts
./scripts/run-node npm run test:integration -- --run test/integration/admin-lifecycle.int.test.ts
```

Expected: at least recovery or initialization exposure fails before hardening.

- [ ] **Step 3: Close lifecycle endpoints and add procedures**

Intercept disabled endpoints before Payload handlers and return generic 404. Keep login endpoint. Creation script acquires PostgreSQL advisory lock and transaction. Recovery `--replace` refuses while `pg_stat_activity` has any `application_name = 'jozeuzz-app'`, records timestamp and replaced user ID to stdout without email/password, reads password from hidden stdin or ephemeral environment, and never prints it. Document create, lock recovery, password rotation, offline requirement and verification commands using synthetic examples only.

- [ ] **Step 4: Run green channel tests**

Run Step 2 commands. Expected: every anonymous channel closed, admin positive read passes, singleton holds under concurrency and online recovery fails closed.

- [ ] **Step 5: Commit identity hardening**

```bash
git add scripts/admin-create.mjs scripts/admin-recover.mjs src/modules/identity/cerrar-recuperacion.ts src/app/\(payload\)/api/\[...slug\]/route.ts test/http/canales-privados.http.test.ts test/integration/admin-lifecycle.int.test.ts docs/operacion/admin-access.md
git commit -m "fix: close public admin lifecycle endpoints"
```

### Task 9: Add migrations and hardened local containers

**Files:**
- Modify: `src/migrations/index.ts`
- Create: `src/migrations/20261027_000000_i1.ts`
- Modify: `Dockerfile`
- Create: `.dockerignore`
- Create: `compose.yaml`
- Create: `Caddyfile`
- Create: `scripts/migrate-check.mjs`
- Create: `docs/operacion/local-development.md`
- Test: `test/integration/migracion.int.test.ts`
- Test: `test/unit/contenedor.test.ts`
- Test: `test/http/proxy.http.test.ts`

**Interfaces:**
- Produces: multi-stage standalone image; edge network with Caddy only; internal app network with Caddy and app; isolated data network with app, PostgreSQL and purge worker; Caddy HTTPS as only localhost-published entry; trusted IP header policy, healthchecks and named data volume.

- [ ] **Step 1: Write red static container and migration tests**

Assert image uses Node 24 digest recorded in Task 1, non-root runtime, `read_only`, `no-new-privileges`, dropped capabilities, no `.env` copy, internal database network, localhost proxy binding, no app/database host port, Postgres 18.6 digest, healthchecks and no `drizzle push`. Assert Caddy removes client `x-jozeuzz-client-ip`, `Forwarded` and `X-Forwarded-For`, then inserts `x-jozeuzz-client-ip` from connection metadata. Integration test applies migration to empty database, verifies tables/indexes/constraints, reruns with no pending changes, and rolls back only in disposable database. Compose includes `intake-purge` service using same image, database-only network and 24-hour loop; static test verifies command and runtime test verifies one purge execution.

- [ ] **Step 2: Run red tests**

Run:

```bash
./scripts/run-node npm run test:unit -- --run test/unit/contenedor.test.ts
./scripts/run-node npm run test:integration -- --run test/integration/migracion.int.test.ts
./scripts/run-node npm run test:http -- --run test/http/proxy.http.test.ts
```

Expected: missing artifacts fail.

- [ ] **Step 3: Implement migration and containers**

Generate migration through Payload against disposable schema, inspect SQL, and commit generated code. Use migration command at startup as separate one-shot service; application never auto-pushes. Docker build accepts no secrets as arguments. Runtime filesystem is read-only with explicit temporary mounts for `/tmp` and required Next cache only. Caddy is sole published service at `https://127.0.0.1`; local test certificate is disposable and never committed. App accepts only Caddy traffic over internal app network and is absent from edge network. Playwright trusts only that disposable local certificate for test run. Through-Caddy tests verify final CSRF cookie has no `Domain=`, HTTP plaintext port is closed, spoofed forwarding/internal headers cannot choose rate key, and request succeeds only through HTTPS Caddy. Runtime network test verifies `docker compose port app 3000` is empty and an untrusted probe container attached only to edge network cannot resolve/connect to app.

- [ ] **Step 4: Run green migration and image gates**

Run:

```bash
./scripts/run-node npm run test:unit -- --run test/unit/contenedor.test.ts
./scripts/run-node npm run test:integration -- --run test/integration/migracion.int.test.ts
./scripts/run-node npm run test:http -- --run test/http/proxy.http.test.ts
docker compose config --quiet
docker compose build --pull app
docker compose up -d
docker compose ps
test -z "$(docker compose port app 3000)"
if curl --fail http://127.0.0.1:80; then exit 1; fi
docker history --no-trunc jozeuzz-cl-i1
```

Expected: tests pass, Compose config exits 0, image builds, history contains no disposable secret values. Record image ID and exit codes. Do not modify historical POC Docker evidence.

- [ ] **Step 5: Commit deployment foundation**

```bash
git add src/migrations Dockerfile .dockerignore compose.yaml Caddyfile scripts/migrate-check.mjs docs/operacion/local-development.md test/integration/migracion.int.test.ts test/unit/contenedor.test.ts test/http/proxy.http.test.ts
git commit -m "chore: add reproducible database runtime"
```

### Task 10: Prove production behavior and add CI

**Files:**
- Create: `e2e/intake.spec.ts`
- Create: `e2e/intake-no-js.spec.ts`
- Create: `.github/workflows/ci.yml`
- Create: `scripts/scan-sentinels.mjs`
- Modify: `playwright.config.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: production image, migrated PostgreSQL and synthetic seed values `admin-ci@example.invalid`, `Servicio de prueba CI` and non-real descriptions generated by workflow environment.
- Produces: CI gate with lint, typecheck, unit, integration, HTTP, build, production E2E, axe, audit and sentinel scan.

- [ ] **Step 1: Write red production E2E**

Test keyboard-only form completion, invalid summary focus, successful 303 confirmation, double submit, no-JavaScript submission, two open tabs, sub-800 ms rejection without persistence, inaccessible anonymous request URLs, admin login and read-only request review. Run axe on form, HTML error, confirmation and login; fail on serious or critical violations.

- [ ] **Step 2: Run E2E against production build and capture red**

Run:

```bash
./scripts/run-node npm run build
./scripts/run-node npm run test:e2e
```

Expected: new E2E initially exposes missing wiring or configuration. Record failing test names and exit code before fixes.

- [ ] **Step 3: Fix only E2E-proven gaps and create CI**

Workflow uses pinned Node 24 image, verifies `npm --version` equals `packageManager`, runs `npm ci --ignore-scripts`, explicit trusted rebuild, PostgreSQL 18.6 service, migrations, all gates, production server through Caddy and Playwright. Cache npm download data only; never cache `.next`, DB or secrets. Generate test-only Payload signing values at runtime. Seed values remain neutral synthetic strings in workflow environment and contain no personal or production data.

`scripts/scan-sentinels.mjs` captures UTF-8 output from `docker compose logs app proxy db`, scans case-insensitively for exact synthetic name, contact and description sentinels plus their JSON-escaped forms, reports source service and exits 1 on any match. It never prints surrounding log content because that could repeat PII.

- [ ] **Step 4: Run complete local release gate**

Run:

```bash
./scripts/run-node npm run lint
./scripts/run-node npm run typecheck
./scripts/run-node npm run test:unit
./scripts/run-node npm run test:integration
./scripts/run-node npm run test:http
./scripts/run-node npm run build
./scripts/run-node npm run test:e2e
./scripts/run-node npm audit --omit=dev
./scripts/run-node node scripts/scan-sentinels.mjs
./scripts/verify-external-worktrees.sh
git diff --check
git status --short
```

Expected: every executable gate exits 0; report exact files/tests passed and audit counts. A failing audit is reported and triaged, never hidden with `--force` or ignored.

- [ ] **Step 5: Independent reviews**

Request read-only QA review of acceptance coverage and test quality. Request read-only Security review of auth, CSRF, inputs, PII, logs, network and writes. Implementer fixes blocking findings with new red tests, reruns affected and full gates, then requests focused re-review.

- [ ] **Step 6: Commit I1 release candidate**

```bash
git add e2e .github/workflows/ci.yml scripts/scan-sentinels.mjs playwright.config.ts README.md
git diff --staged --check
git commit -m "test: verify secure intake in production build"
```

- [ ] **Step 7: Prepare integration checkpoint**

After clean status and green full gate:

```bash
git rev-parse HEAD
git status --short --branch
./scripts/verify-external-worktrees.sh
```

Expected: branch has local checkpoint SHA, status is clean and protected worktrees match baseline. Report branch, SHA, commands, counts, exit codes, decisions, limitations and next increment I2. Push remains blocked by agent policy; provide exact handoff so authorized integration owner can publish normally.

## Plan Self-Review

- Spec coverage: Tasks 1-10 map all 19 I1 acceptance criteria.
- Boundaries: HTTP, domain, persistence, access and logging have separate files and interfaces.
- Type consistency: `DatosSolicitudValidada`, `ResultadoIntake`, `ControlIntake` and `RepositorioIntake` retain one name throughout.
- Scope: no portfolio, transitions, events, notifications, staging or production deployment.
- Verification: every behavioral task has an explicit red command, green command and commit.
- Historical integrity: no task writes to POC worktrees or their evidence.
