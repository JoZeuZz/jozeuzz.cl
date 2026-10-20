# POC-3 Docker Write Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Impedir que `deps`, `app`, `app-prod` o `e2e` modifiquen el repositorio, conservar sólo las escrituras necesarias en volúmenes Docker nombrados y adaptar el gate POC-3 sin ejecutar Docker ni instalar dependencias durante la implementación.

**Architecture:** `poc1a/` se monta en `/app` como bind de sólo lectura y cada contenedor Node/Playwright usa `read_only: true`. Un servicio one-shot `volumes-init`, explícitamente root pero sin bind host ni red, entrega a UID/GID 1000 sólo los volúmenes nombrados aprobados; después, `deps` los puebla y todos los consumidores corren como UID/GID 1000. Pruebas estáticas fijan la matriz y A3f la ejercita con Compose real; `poc.sh` encapsula D21 y la generación futura de manifiestos A4 sin escribir el repositorio.

**Tech Stack:** Docker Compose v2, Node 24.22.0 fijado por digest, PostgreSQL 18.6, Next.js 16.4.1, TypeScript 5.9.3, Vitest 4.1.11, Playwright 1.64.1, POSIX `sh`.

## Global Constraints

- No ejecutar Docker, Compose, `poc.sh`, npm ni operaciones con red durante esta implementación.
- No instalar `@axe-core/playwright` ni modificar `package.json` o `package-lock.json` durante esta implementación.
- No crear ADR ni modificar decisiones de producto, red, puertos o bases.
- Mantener puertos `127.0.0.1:3443:3443` y `127.0.0.1:3444:3444` sólo en `proxy`.
- Mantener redes `entrada`, `externa`, `db_app`, `db_prod`, `proxy_app`, `proxy_prod` y `e2e`, incluidas sus propiedades `internal` actuales.
- Mantener bases permitidas `poc1b_*` y `poc3_*`; D01-D30 siguen usando `poc3_intake` y `poc3_migraciones`.
- Mantener imágenes y digests actuales sin descargar ni sustituir imágenes.
- `volumes-init` usa la imagen Node fijada existente, `user: "0:0"`, `network_mode: none`, raíz RO y sólo montajes de volúmenes nombrados aprobados. No usa bind, `privileged`, socket Docker ni `cap_add`; su única función es `chown 1000:1000` y `chmod 0750` de los puntos de montaje.
- La elevación de `volumes-init` es necesaria porque Docker crea las raíces de volúmenes nombrados como root. Sin bootstrap, `deps`, `app`, `app-prod` y `e2e` bajo UID 1000 reciben `EACCES` en sus únicos destinos RW.
- Ningún servicio recibe bind RW al repositorio. No usar bind propagations, `volumes_from`, volúmenes externos ni `driver_opts` de bind.
- `deps`, `app`, `app-prod` y `e2e` ejecutan como `1000:1000`, con raíz `read_only: true` y `/tmp` en `tmpfs` con `rw,nosuid,nodev,noexec,uid=1000,gid=1000,mode=1777`.
- `node_modules` es volumen nombrado RW sólo en `deps`; `app`, `app-prod` y `e2e` lo montan RO.
- `npm_cache` y `NPM_CONFIG_CACHE=/app/.npm-cache` existen sólo en `deps`.
- Volúmenes funcionales: `next_dev`, `next_prod`, `media_dev`, `media_test`, `media_prod`, `test_results`, `playwright_report` y `blob_report`.
- `app` monta RW `next_dev`, `media_dev`, `media_test` y `media_prod`; `media_prod` es obligatorio porque los resets de la batería de producción se ejecutan dentro de `app`.
- `app-prod` monta RW sólo `next_prod` y `media_prod`, además de `/tmp`.
- `e2e` monta RW sólo `test_results`, `playwright_report` y `blob_report`, además de `/tmp`.
- Orden previo obligatorio: `./poc.sh init`, `./poc.sh init-volumes`, `./poc.sh deps`. La presencia de `poc1a/node_modules` en host no satisface ningún prerrequisito y queda enmascarada por el volumen nombrado.
- Los tests estáticos de implementación pueden leer el `node_modules` host existente mediante `.jz/bin/jz-run`; eso sólo habilita Vitest/TypeScript y no constituye evidencia ni prerrequisito del runtime Docker.
- `tsconfig.json` fija `tsBuildInfoFile` en `/tmp/tsconfig.tsbuildinfo`; D12 repite el argumento explícitamente. Ningún `.tsbuildinfo` se escribe bajo `/app`.
- D21 se ejecuta dentro de un contenedor `app-prod`, porque `.next-prod` vive en `next_prod` y deja de ser visible en el host.
- A4 futuro genera dos manifiestos desde copias en `tmpfs`, dentro de la imagen Node fijada y como UID/GID 1000. Usa `--package-lock-only --ignore-scripts --save-exact --save-dev`; el host validado genera el parche sólo para `poc1a/package.json` y `poc1a/package-lock.json`. No aplica el parche ni instala `node_modules`.
- La aplicación del parche A4 queda como operación humana separada, después de revisar el diff completo. Ningún agente aplica ese parche.
- Toda verificación autónoma usa `.jz/bin/jz-run`. Pruebas con Docker quedan para ejecución humana posterior.
- Comandos Docker y `setpriv` de este plan son instrucciones futuras para el humano. El implementador no los ejecuta mediante el orquestador; sólo ejecuta verificaciones permitidas con `.jz/bin/jz-run` y git local permitido.
- Un solo escritor por worktree. Detenerse si `.jz/bin/jz-state` no informa `REANUDABLE` antes de implementar.

## Threat model e invariantes

**Activo protegido:** todo archivo versionado o ignorado bajo el worktree que un proceso posterior pueda ejecutar como root, especialmente `poc.sh`, Compose, drivers, scripts, pruebas, manifiestos y configuración.

**Frontera:** el daemon Docker es equivalente a root en el CT compartido. Ejecutar Docker como usuario no-root mediante grupo/socket no reduce ese privilegio. Código npm, Next, Payload y Playwright dentro del contenedor se trata como no confiable.

**Abusos que deben fallar:**

1. Un proceso UID 1000 intenta crear, truncar o reemplazar `/app/poc.sh`, `/app/compose.yaml`, `/app/package.json` o cualquier fuente.
2. Un proceso en `app`, `app-prod` o `e2e` intenta modificar `/app/node_modules`.
3. Un proceso fuera de `deps` intenta usar una caché npm persistente.
4. Next, TypeScript o Playwright intenta escribir en una ruta no declarada, o UID 1000 no puede escribir un destino de la allowlist por ownership root del volumen.
5. A4 intenta editar manifiestos mediante el bind del repositorio o ejecutar scripts de paquetes.
6. D21 inspecciona un `.next-prod` del host obsoleto en vez del volumen producido por D20.

**Resultado exigido:** `volumes-init` prepara ownership sin acceso a host ni red; los casos 1-4 reciben filesystem de sólo lectura salvo puntos de montaje declarados; el caso 5 sólo produce dos manifiestos codificados para generar un parche en host; el caso 6 lee `next_prod` dentro de `app-prod`.

## File map

| Archivo | Responsabilidad tras el cambio |
|---|---|
| `poc1a/compose.yaml` | Matriz canónica de raíces RO, bind `/app` RO, `tmpfs` y volúmenes nombrados por servicio. |
| `poc1a/tsconfig.json` | Envía el estado incremental de TypeScript a `/tmp`. |
| `poc1a/poc.sh` | Añade `init-volumes`, `probe-mounts`, `run-prod-en` para D21 y `manifest-patch-axe` para emitir, no aplicar, manifiestos futuros A4. |
| `poc1a/test/estatico/compose-write-isolation.test.ts` | Contrato estructural de montajes, permisos y rutas escribibles. |
| `poc1a/test/estatico/poc-sh-aislamiento.test.ts` | Contrato de D21 y del generador A4 sin ejecutar Docker. |
| `poc1a/test/estatico/docs-write-isolation.test.ts` | Impide que gate, README y evidencia vuelvan a comandos host o instalación directa inseguros. |
| `poc1a/test/build/sin-inyeccion.test.mjs` | Conserva prueba D21 y documenta su nueva precondición dentro de `app-prod`. |
| `docs/GATE-DOCKER-POC-3.md` | Inspección A2, parada dura A3f, clasificación de privilegios, A4 por parche, D12 y D21a dentro de contenedor, D21b host, stop conditions. |
| `poc1a/README.md` | Resumen operativo coherente con volúmenes y comandos canónicos. |
| `poc1a/EVIDENCIA.md` | Comandos esperados actualizados, sin afirmar resultados Docker no ejecutados. |

No modificar `compose.pruebas.yaml`: sólo altera proxy, red de prueba e inyección; hereda la matriz de montajes segura de `compose.yaml`.

---

### Task 1: Fijar por prueba la matriz de escritura

**Files:**
- Create: `poc1a/test/estatico/compose-write-isolation.test.ts`
- Modify: `poc1a/tsconfig.json`
- Modify: `poc1a/compose.yaml`

**Interfaces:**
- Consumes: estructura Compose actual y volumen `db` existente.
- Produces: volúmenes `node_modules`, `npm_cache`, `next_dev`, `next_prod`, `media_dev`, `media_test`, `media_prod`, `test_results`, `playwright_report`, `blob_report`; `tsBuildInfoFile=/tmp/tsconfig.tsbuildinfo`.

**Acceptance criteria:**
- La prueba enumera todos los servicios y todos sus destinos; un volumen adicional o ausente falla.
- `volumes-init` queda fijado como único bootstrap root de los volúmenes de aplicación: sin red, binds, privilegios ampliados, socket ni `cap_add`, y con sólo los diez volúmenes aprobados.
- No existe bind RW.
- Sólo `deps:/app/node_modules` y `deps:/app/.npm-cache` son volúmenes RW de dependencias.
- Cada servicio recibe sólo los volúmenes funcionales indicados en restricciones globales.
- Los cuatro servicios tienen raíz RO y `/tmp` aislado.
- Redes, puertos, base e imágenes no cambian.

- [ ] **Step 1: Escribir el test estructural en rojo**

Crear `poc1a/test/estatico/compose-write-isolation.test.ts` con este contenido:

```ts
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { load } = createRequire(import.meta.url)('js-yaml') as { load(texto: string): unknown }

type Mount = { type: 'bind' | 'volume'; source: string; target: string; read_only?: boolean }
type Service = {
  image?: string
  user?: string
  read_only?: boolean
  network_mode?: string
  privileged?: boolean
  cap_add?: string[]
  cap_drop?: string[]
  security_opt?: string[]
  profiles?: string[]
  command?: string[]
  tmpfs?: string[]
  volumes?: Array<Mount | string>
  environment?: Record<string, string>
}
type Compose = { services: Record<string, Service>; volumes: Record<string, Record<string, never>> }

const TMPFS = '/tmp:rw,nosuid,nodev,noexec,uid=1000,gid=1000,mode=1777'
const VOLUMES = ['blob_report', 'db', 'media_dev', 'media_prod', 'media_test', 'next_dev', 'next_prod', 'node_modules', 'npm_cache', 'playwright_report', 'test_results']

async function compose(): Promise<Compose> {
  return load(await readFile(path.join(raiz, 'compose.yaml'), 'utf8')) as Compose
}

function porDestino(service: Service): Record<string, Mount> {
  return Object.fromEntries((service.volumes ?? []).filter((mount): mount is Mount => typeof mount !== 'string').map((mount) => [mount.target, mount]))
}

describe('aislamiento de escritura Docker', () => {
  it('usa raíz RO, /tmp privado y bind /app RO en cada consumidor de código', async () => {
    const cfg = await compose()
    for (const nombre of ['deps', 'app', 'app-prod', 'e2e']) {
      const service = cfg.services[nombre]
      expect(service.user, nombre).toBe('1000:1000')
      expect(service.read_only, nombre).toBe(true)
      expect(service.tmpfs, nombre).toEqual([TMPFS])
      expect(porDestino(service)['/app'], nombre).toEqual({ type: 'bind', source: '.', target: '/app', read_only: true })
    }
  })

  it('no contiene ningún bind escribible', async () => {
    const cfg = await compose()
    expect(cfg.services.db.volumes).toContain('db:/var/lib/postgresql')
    for (const [nombre, service] of Object.entries(cfg.services)) {
      for (const mount of service.volumes ?? []) {
        if (typeof mount === 'string') {
          const source = mount.split(':', 1)[0]
          if (source.startsWith('.') || source.startsWith('/')) expect(mount.endsWith(':ro'), `${nombre}:${mount}`).toBe(true)
        }
        else if (mount.type === 'bind') expect(mount.read_only, `${nombre}:${mount.target}`).toBe(true)
      }
    }
  })

  it('inicializa ownership con root mínimo, sin host ni red', async () => {
    const cfg = await compose()
    const init = cfg.services['volumes-init']
    expect(init.image).toBe('node:24.22.0-trixie-slim@sha256:7f486cabe892bff8fef04c0f7da8dba84a560be3e4e2740b7a86afc57ebec315')
    expect(init.user).toBe('0:0')
    expect(init.read_only).toBe(true)
    expect(init.network_mode).toBe('none')
    expect(init.security_opt).toEqual(['no-new-privileges:true'])
    expect(init.privileged).toBeUndefined()
    expect(init.cap_add).toBeUndefined()
    expect(init.cap_drop).toEqual(['AUDIT_WRITE', 'FSETID', 'KILL', 'MKNOD', 'NET_BIND_SERVICE', 'NET_RAW', 'SETFCAP', 'SETGID', 'SETPCAP', 'SETUID', 'SYS_CHROOT'])
    expect(init.profiles).toEqual(['volumes-init'])
    expect(init.command).toEqual(['sh', '-ceu', 'chown 1000:1000 /volumes/* && chmod 0750 /volumes/*'])
    expect(init.volumes).toEqual([
      { type: 'volume', source: 'node_modules', target: '/volumes/node_modules' },
      { type: 'volume', source: 'npm_cache', target: '/volumes/npm_cache' },
      { type: 'volume', source: 'next_dev', target: '/volumes/next_dev' },
      { type: 'volume', source: 'next_prod', target: '/volumes/next_prod' },
      { type: 'volume', source: 'media_dev', target: '/volumes/media_dev' },
      { type: 'volume', source: 'media_test', target: '/volumes/media_test' },
      { type: 'volume', source: 'media_prod', target: '/volumes/media_prod' },
      { type: 'volume', source: 'test_results', target: '/volumes/test_results' },
      { type: 'volume', source: 'playwright_report', target: '/volumes/playwright_report' },
      { type: 'volume', source: 'blob_report', target: '/volumes/blob_report' },
    ])
  })

  it('limita node_modules y npm cache a permisos y servicios exactos', async () => {
    const cfg = await compose()
    expect(porDestino(cfg.services.deps)['/app/node_modules']).toEqual({ type: 'volume', source: 'node_modules', target: '/app/node_modules' })
    expect(porDestino(cfg.services.deps)['/app/.npm-cache']).toEqual({ type: 'volume', source: 'npm_cache', target: '/app/.npm-cache' })
    expect(cfg.services.deps.environment?.NPM_CONFIG_CACHE).toBe('/app/.npm-cache')
    for (const nombre of ['app', 'app-prod', 'e2e']) {
      expect(porDestino(cfg.services[nombre])['/app/node_modules'], nombre).toEqual({ type: 'volume', source: 'node_modules', target: '/app/node_modules', read_only: true })
      expect(porDestino(cfg.services[nombre])['/app/.npm-cache'], nombre).toBeUndefined()
      expect(cfg.services[nombre].environment ?? {}, nombre).not.toHaveProperty('NPM_CONFIG_CACHE')
    }
  })

  it('asigna sólo rutas funcionales necesarias', async () => {
    const cfg = await compose()
    const resumen = (nombre: string) => Object.fromEntries(Object.entries(porDestino(cfg.services[nombre])).map(([target, mount]) => [target, `${mount.source}:${mount.read_only === true ? 'ro' : 'rw'}`]))
    expect(resumen('deps')).toEqual({ '/app': '.:ro', '/app/node_modules': 'node_modules:rw', '/app/.npm-cache': 'npm_cache:rw' })
    expect(resumen('app')).toEqual({
      '/app': '.:ro',
      '/app/node_modules': 'node_modules:ro',
      '/app/.next': 'next_dev:rw',
      '/app/media-store': 'media_dev:rw',
      '/app/media-store-test': 'media_test:rw',
      '/app/media-store-prod': 'media_prod:rw',
    })
    expect(resumen('app-prod')).toEqual({
      '/app': '.:ro',
      '/app/node_modules': 'node_modules:ro',
      '/app/.next-prod': 'next_prod:rw',
      '/app/media-store-prod': 'media_prod:rw',
    })
    expect(resumen('e2e')).toEqual({
      '/app': '.:ro',
      '/app/node_modules': 'node_modules:ro',
      '/app/test-results': 'test_results:rw',
      '/app/playwright-report': 'playwright_report:rw',
      '/app/blob-report': 'blob_report:rw',
    })
  })

  it('declara exactamente los volúmenes nombrados aprobados', async () => {
    const cfg = await compose()
    expect(Object.keys(cfg.volumes).sort()).toEqual(VOLUMES)
  })

  it('envía tsbuildinfo a /tmp', async () => {
    const tsconfig = JSON.parse(await readFile(path.join(raiz, 'tsconfig.json'), 'utf8'))
    expect(tsconfig.compilerOptions.incremental).toBe(true)
    expect(tsconfig.compilerOptions.tsBuildInfoFile).toBe('/tmp/tsconfig.tsbuildinfo')
  })
})
```

- [ ] **Step 2: Ejecutar rojo focalizado**

Run:

```sh
.jz/bin/jz-run --cwd poc1a node node_modules/vitest/vitest.mjs run --configLoader runner test/estatico/compose-write-isolation.test.ts
```

Expected: rc=1. Fallan seis casos existentes más `inicializa ownership con root mínimo, sin host ni red`: falta `volumes-init`, los montajes actuales son strings, las raíces no tienen `read_only`, no hay `tmpfs`, faltan diez volúmenes nombrados y `tsBuildInfoFile` no existe. Si falla por sintaxis o carga de `js-yaml`, corregir el test antes de editar Compose.

- [ ] **Step 3: Configurar TypeScript para escribir sólo en `/tmp`**

Añadir dentro de `compilerOptions`, inmediatamente después de `"incremental": true`:

```json
"tsBuildInfoFile": "/tmp/tsconfig.tsbuildinfo",
```

No cambiar `include`, `exclude`, `noEmit` ni otras opciones.

- [ ] **Step 4: Sustituir el ancla y los montajes de Compose**

En `poc1a/compose.yaml`, conservar imágenes, comandos, variables, redes, `depends_on`, proxy, puertos y `db`. Cambiar `x-node` a:

```yaml
x-node: &node
  image: node:24.22.0-trixie-slim@sha256:7f486cabe892bff8fef04c0f7da8dba84a560be3e4e2740b7a86afc57ebec315
  user: "1000:1000"
  working_dir: /app
  read_only: true
  tmpfs:
    - /tmp:rw,nosuid,nodev,noexec,uid=1000,gid=1000,mode=1777
  environment:
    NEXT_TELEMETRY_DISABLED: "1"
```

Definir `volumes-init` antes de `deps`:

```yaml
  volumes-init:
    image: node:24.22.0-trixie-slim@sha256:7f486cabe892bff8fef04c0f7da8dba84a560be3e4e2740b7a86afc57ebec315
    profiles: [volumes-init]
    user: "0:0"
    read_only: true
    network_mode: none
    security_opt: ["no-new-privileges:true"]
    cap_drop: [AUDIT_WRITE, FSETID, KILL, MKNOD, NET_BIND_SERVICE, NET_RAW, SETFCAP, SETGID, SETPCAP, SETUID, SYS_CHROOT]
    command: ["sh", "-ceu", "chown 1000:1000 /volumes/* && chmod 0750 /volumes/*"]
    volumes:
      - { type: volume, source: node_modules, target: /volumes/node_modules }
      - { type: volume, source: npm_cache, target: /volumes/npm_cache }
      - { type: volume, source: next_dev, target: /volumes/next_dev }
      - { type: volume, source: next_prod, target: /volumes/next_prod }
      - { type: volume, source: media_dev, target: /volumes/media_dev }
      - { type: volume, source: media_test, target: /volumes/media_test }
      - { type: volume, source: media_prod, target: /volumes/media_prod }
      - { type: volume, source: test_results, target: /volumes/test_results }
      - { type: volume, source: playwright_report, target: /volumes/playwright_report }
      - { type: volume, source: blob_report, target: /volumes/blob_report }
```

No añadir `privileged`, `cap_add`, red, bind ni socket. `cap_drop` retira capacidades predeterminadas ajenas al cambio de ownership y conserva sólo las predeterminadas necesarias para atravesar, cambiar dueño y ajustar modo (`CHOWN`, `DAC_OVERRIDE`, `FOWNER`). `no-new-privileges` impide ganar privilegios adicionales mediante ejecutables.

Definir en `deps`:

```yaml
    environment:
      NEXT_TELEMETRY_DISABLED: "1"
      NPM_CONFIG_CACHE: /app/.npm-cache
    volumes:
      - type: bind
        source: .
        target: /app
        read_only: true
      - type: volume
        source: node_modules
        target: /app/node_modules
      - type: volume
        source: npm_cache
        target: /app/.npm-cache
```

Definir en `app`, antes de `command`:

```yaml
    volumes:
      - type: bind
        source: .
        target: /app
        read_only: true
      - type: volume
        source: node_modules
        target: /app/node_modules
        read_only: true
      - type: volume
        source: next_dev
        target: /app/.next
      - type: volume
        source: media_dev
        target: /app/media-store
      - type: volume
        source: media_test
        target: /app/media-store-test
      - type: volume
        source: media_prod
        target: /app/media-store-prod
```

Definir en `app-prod`, antes de `command`:

```yaml
    volumes:
      - type: bind
        source: .
        target: /app
        read_only: true
      - type: volume
        source: node_modules
        target: /app/node_modules
        read_only: true
      - type: volume
        source: next_prod
        target: /app/.next-prod
      - type: volume
        source: media_prod
        target: /app/media-store-prod
```

Definir en `e2e`, además de `read_only: true` y el mismo `tmpfs` del ancla:

```yaml
    read_only: true
    tmpfs:
      - /tmp:rw,nosuid,nodev,noexec,uid=1000,gid=1000,mode=1777
    volumes:
      - type: bind
        source: .
        target: /app
        read_only: true
      - type: volume
        source: node_modules
        target: /app/node_modules
        read_only: true
      - type: volume
        source: test_results
        target: /app/test-results
      - type: volume
        source: playwright_report
        target: /app/playwright-report
      - type: volume
        source: blob_report
        target: /app/blob-report
```

Reemplazar el bloque superior `volumes` por:

```yaml
volumes:
  db:
  node_modules:
  npm_cache:
  next_dev:
  next_prod:
  media_dev:
  media_test:
  media_prod:
  test_results:
  playwright_report:
  blob_report:
```

- [ ] **Step 5: Ejecutar verde focalizado y regresión estática de topología**

Run:

```sh
.jz/bin/jz-run --cwd poc1a node node_modules/vitest/vitest.mjs run --configLoader runner test/estatico/compose-write-isolation.test.ts test/estatico/compose-proxy.test.ts
```

Expected: rc=0; ambos archivos pasan sin tests fallidos. `compose-proxy.test.ts` confirma que redes, puertos, imágenes, TLS y proxy no cambiaron.

Run:

```sh
.jz/bin/jz-run --cwd poc1a node node_modules/typescript/bin/tsc --noEmit --incremental false
```

Expected: rc=0, sin errores. Se usa `--incremental false` en esta verificación host para no depender de `/tmp`; D12 conservará incremental y probará la ruta dentro del contenedor.

- [ ] **Step 6: Commit pequeño**

```sh
git add poc1a/compose.yaml poc1a/tsconfig.json poc1a/test/estatico/compose-write-isolation.test.ts
git commit -m "fix(poc-3): isolate container writes"
```

---

### Task 2: Encapsular D21 y el parche futuro A4

**Files:**
- Modify: `poc1a/test/estatico/poc-sh-aislamiento.test.ts`
- Modify: `poc1a/poc.sh`

**Interfaces:**
- Consumes: volumen `next_prod`, imagen Node fijada y guardas `nombre_poc1b`.
- Produces: `./poc.sh init-volumes`, `./poc.sh probe-mounts`, `./poc.sh run-prod-en poc3_intake node --test test/build/sin-inyeccion.test.mjs` y `./poc.sh manifest-patch-axe`.

**Acceptance criteria:**
- `init-volumes` ejecuta sólo `volumes-init`; no acepta argumentos.
- `probe-mounts` prueba como UID 1000 que `/app` y manifiestos son RO, que `node_modules` es RO en consumidores, y que cada servicio escribe exactamente su allowlist.
- `run-prod-en` usa `app-prod`, el perfil `prod`, `run --rm --no-deps`, schema `poc_prod`, `POC_NO_PUSH=1` y la guarda de base.
- `manifest-patch-axe` no acepta argumentos, no monta el repositorio RW y emite un único JSON con los dos manifiestos en base64; npm escribe sólo a stderr.
- A4 usa imagen fijada, UID/GID 1000, raíz RO, `/tmp` tmpfs, dos binds de archivo RO y flags npm exactos. No depende de `diff` dentro de imagen.
- Ninguna de estas cuatro órdenes se ejecuta durante implementación.

- [ ] **Step 1: Añadir tests rojos del arnés**

Agregar al final de `poc1a/test/estatico/poc-sh-aislamiento.test.ts`:

```ts
it('init-volumes ejecuta bootstrap root acotado antes de UID 1000', async () => {
  const script = await readFile(path.join(raiz, 'poc.sh'), 'utf8')
  const rama = ramaCase(script, 'init-volumes')
  expect(rama).toContain('[ "$#" -eq 0 ]')
  expect(rama).toContain('$C --profile volumes-init run --rm --no-deps volumes-init')
  expect(rama).not.toMatch(/docker\.sock|privileged|cap_add/)
})

it('probe-mounts prueba RO de fuente/node_modules y RW sólo en allowlist', async () => {
  const script = await readFile(path.join(raiz, 'poc.sh'), 'utf8')
  const rama = ramaCase(script, 'probe-mounts')
  for (const ruta of ['/app/package.json', '/app/package-lock.json', '/app/poc.sh', '/app/compose.yaml']) expect(rama).toContain(ruta)
  expect(rama).toContain('[ "$(id -u)" -eq 1000 ]')
  expect(rama).toContain('denegar /app')
  expect(rama).toContain('$C --profile deps run --rm --no-deps deps sh -ceu "$PROBE" sh rw /app/.npm-cache /tmp')
  expect(rama).toContain('$C run --rm --no-deps app sh -ceu "$PROBE" sh ro /app/.next /app/media-store /app/media-store-test /app/media-store-prod /tmp')
  expect(rama).toContain('$C --profile prod run --rm --no-deps app-prod sh -ceu "$PROBE" sh ro /app/.next-prod /app/media-store-prod /tmp')
  expect(rama).toContain('$C --profile e2e run --rm --no-deps e2e sh -ceu "$PROBE" sh ro /app/test-results /app/playwright-report /app/blob-report /tmp')
})

it('run-prod-en ejecuta D21 dentro de app-prod y conserva next_prod', async () => {
  const script = await readFile(path.join(raiz, 'poc.sh'), 'utf8')
  const rama = ramaCase(script, 'run-prod-en')
  expect(rama).toContain('nombre_poc1b "$base"')
  expect(rama).toContain('shift')
  expect(rama).toContain('POC_DATABASE_NAME="$base"')
  expect(rama).toContain('POC_DB_SCHEMA=poc_prod')
  expect(rama).toContain('POC_NO_PUSH=1')
  expect(rama).toContain('$C --profile prod run --rm --no-deps app-prod "$@"')
  expect(rama).not.toContain('exec -T')
})

it('manifest-patch-axe emite JSON base64 desde tmpfs sin bind RW ni diff', async () => {
  const script = await readFile(path.join(raiz, 'poc.sh'), 'utf8')
  const rama = ramaCase(script, 'manifest-patch-axe')
  expect(rama).toContain('[ "$#" -eq 0 ]')
  expect(rama).toContain('node:24.22.0-trixie-slim@sha256:7f486cabe892bff8fef04c0f7da8dba84a560be3e4e2740b7a86afc57ebec315')
  expect(rama).toContain('--user 1000:1000')
  expect(rama).toContain('--read-only')
  expect(rama).toContain('--tmpfs /tmp:rw,nosuid,nodev,noexec,uid=1000,gid=1000,mode=0700,size=64m')
  expect(rama).toContain('src="$PWD/package.json",dst=/source/package.json,readonly')
  expect(rama).toContain('src="$PWD/package-lock.json",dst=/source/package-lock.json,readonly')
  expect(rama).toContain('npm install --package-lock-only --ignore-scripts --save-exact --save-dev @axe-core/playwright@4.13.0 >&2')
  expect(rama).toContain('packageJson: fs.readFileSync("package.json").toString("base64")')
  expect(rama).toContain('packageLockJson: fs.readFileSync("package-lock.json").toString("base64")')
  expect(rama).toContain('process.stdout.write(JSON.stringify(salida))')
  expect(rama).not.toMatch(/type=bind[^\n]*dst=\/app(?!\/)/)
  expect(rama).not.toContain('diff ')
  expect(rama).not.toContain('git apply')
})
```

No modificar todavía los arreglos del test existente; primero capturar el rojo de los cuatro tests nuevos.

- [ ] **Step 2: Ejecutar rojo del arnés**

Run:

```sh
.jz/bin/jz-run --cwd poc1a node node_modules/vitest/vitest.mjs run --configLoader runner test/estatico/poc-sh-aislamiento.test.ts
```

Expected: rc=1. Fallan exactamente cuatro tests nuevos porque faltan `init-volumes`, `probe-mounts`, `run-prod-en` y `manifest-patch-axe`.

- [ ] **Step 3: Implementar bootstrap y prueba efectiva de montajes**

Añadir después de `init)`:

```sh
  init-volumes)
    [ "$#" -eq 0 ] || { echo "uso: init-volumes" >&2; exit 2; }
    $C --profile volumes-init run --rm --no-deps volumes-init ;;
  probe-mounts)
    [ "$#" -eq 0 ] || { echo "uso: probe-mounts" >&2; exit 2; }
    PROBE='fallar() { echo "MOUNT_PROBE_FAIL:$1" >&2; exit 1; }
[ "$(id -u)" -eq 1000 ] || fallar "uid-no-1000"
denegar() { ruta="$1"; if touch "$ruta/.jz-write-probe" 2>/tmp/.jz-write-error; then rm -f "$ruta/.jz-write-probe"; fallar "escribible:$ruta"; fi; }
permitir() { ruta="$1"; touch "$ruta/.jz-write-probe" || fallar "no-escribible:$ruta"; rm -f "$ruta/.jz-write-probe"; }
denegar /app
for manifiesto in /app/package.json /app/package-lock.json /app/poc.sh /app/compose.yaml; do [ ! -w "$manifiesto" ] || fallar "manifiesto-escribible:$manifiesto"; done
modo="$1"; shift
if [ "$modo" = ro ]; then denegar /app/node_modules; else permitir /app/node_modules; fi
for ruta in "$@"; do permitir "$ruta"; done
echo MOUNT_PROBE_OK'
    # deps rw /app/node_modules /app/.npm-cache /tmp
    $C --profile deps run --rm --no-deps deps sh -ceu "$PROBE" sh rw /app/.npm-cache /tmp
    # app ro /app/node_modules /app/.next /app/media-store /app/media-store-test /app/media-store-prod /tmp
    $C run --rm --no-deps app sh -ceu "$PROBE" sh ro /app/.next /app/media-store /app/media-store-test /app/media-store-prod /tmp
    # app-prod ro /app/node_modules /app/.next-prod /app/media-store-prod /tmp
    $C --profile prod run --rm --no-deps app-prod sh -ceu "$PROBE" sh ro /app/.next-prod /app/media-store-prod /tmp
    # e2e ro /app/node_modules /app/test-results /app/playwright-report /app/blob-report /tmp
    $C --profile e2e run --rm --no-deps e2e sh -ceu "$PROBE" sh ro /app/test-results /app/playwright-report /app/blob-report /tmp ;;
```

El intento de `touch /app/.jz-write-probe` es una prueba real del mount RO. Si llega a crear el archivo, lo borra inmediatamente, devuelve error y A3f aplica parada dura; no se ejecuta ningún script posterior del árbol.

- [ ] **Step 4: Implementar `run-prod-en`**

Añadir antes de `migrate-create)`:

```sh
  run-prod-en)
    base="${1:?uso: run-prod-en <base-poc1b> <comando>}"; nombre_poc1b "$base"
    shift
    [ "$#" -gt 0 ] || { echo "uso: run-prod-en <base-poc1b> <comando>" >&2; exit 2; }
    POC_DATABASE_NAME="$base" POC_DB_SCHEMA=poc_prod POC_NO_PUSH=1 $C --profile prod run --rm --no-deps app-prod "$@" ;;
```

Esta orden no levanta servicios, no migra y no construye. D21 la usa después de D20 para montar el mismo `next_prod`.

- [ ] **Step 5: Implementar el generador A4 sin aplicación**

Añadir antes de `stats)`:

```sh
  manifest-patch-axe)
    [ "$#" -eq 0 ] || { echo "uso: manifest-patch-axe" >&2; exit 2; }
    docker run --rm --read-only --user 1000:1000 \
      --tmpfs /tmp:rw,nosuid,nodev,noexec,uid=1000,gid=1000,mode=0700,size=64m \
      --mount type=bind,src="$PWD/package.json",dst=/source/package.json,readonly \
      --mount type=bind,src="$PWD/package-lock.json",dst=/source/package-lock.json,readonly \
      --env HOME=/tmp/home --env NPM_CONFIG_CACHE=/tmp/npm-cache \
      --workdir /tmp \
      node:24.22.0-trixie-slim@sha256:7f486cabe892bff8fef04c0f7da8dba84a560be3e4e2740b7a86afc57ebec315 \
      sh -ceu '
        mkdir -p "$HOME" "$NPM_CONFIG_CACHE" /tmp/work
        cp /source/package.json /source/package-lock.json /tmp/work/
        cd /tmp/work
        npm install --package-lock-only --ignore-scripts --save-exact --save-dev @axe-core/playwright@4.13.0 >&2
        node -e '"'"'const fs = require("node:fs"); const salida = { packageJson: fs.readFileSync("package.json").toString("base64"), packageLockJson: fs.readFileSync("package-lock.json").toString("base64") }; process.stdout.write(JSON.stringify(salida))'"'"'
      ' ;;
```

Actualizar el mensaje de uso para incluir `init-volumes`, `probe-mounts`, `run-prod-en <base> <cmd>` y `manifest-patch-axe`. No añadir una orden que aplique el parche.

Ahora añadir `init-volumes`, `probe-mounts`, `run-prod-en` y `manifest-patch-axe` al arreglo `sinPruebas` del test existente. Añadir `run-prod-en` al arreglo de órdenes que deben contener `nombre_poc1b "$base"`.

- [ ] **Step 6: Ejecutar verde del arnés y shell parser**

Run:

```sh
.jz/bin/jz-run --cwd poc1a node node_modules/vitest/vitest.mjs run --configLoader runner test/estatico/poc-sh-aislamiento.test.ts
```

Expected: rc=0, sin tests fallidos.

Run:

```sh
.jz/bin/jz-run --cwd poc1a sh -n poc.sh
```

Expected: rc=0, sin salida.

- [ ] **Step 7: Commit pequeño**

```sh
git add poc1a/poc.sh poc1a/test/estatico/poc-sh-aislamiento.test.ts
git commit -m "fix(poc-3): isolate build and manifest tooling"
```

---

### Task 3: Convertir el gate al modelo sin escritura

**Files:**
- Create: `poc1a/test/estatico/docs-write-isolation.test.ts`
- Modify: `docs/GATE-DOCKER-POC-3.md`
- Modify: `poc1a/README.md`
- Modify: `poc1a/EVIDENCIA.md`
- Modify: `poc1a/test/build/sin-inyeccion.test.mjs`

**Interfaces:**
- Consumes: `run-prod-en`, `manifest-patch-axe` y matriz de volúmenes de Task 1.
- Produces: procedimiento humano único, con privilegios clasificados y stop conditions verificables.

**Acceptance criteria:**
- A2 inspecciona montajes efectivos de todos los perfiles con `--no-interpolate` y enumera matriz esperada.
- A3f deja el `find` host como diagnóstico no vinculante y usa `init-volumes`, `deps` y `probe-mounts` como prueba efectiva con parada dura.
- D12 usa `/tmp/tsconfig.tsbuildinfo` y comprueba que no aparece `.tsbuildinfo` bajo el repo.
- D21a corre mediante `run-prod-en` dentro de `app-prod`; D21b corre en host con `setpriv` porque sólo usa fixtures temporales.
- A4 genera un parche fuera del repositorio; no instala ni aplica nada.
- Documento distingue `setpriv` sin Docker, Docker root-equivalente y root real.
- README y EVIDENCIA no conservan comandos contradictorios.

- [ ] **Step 1: Escribir prueba documental en rojo**

Crear `poc1a/test/estatico/docs-write-isolation.test.ts`:

```ts
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const leer = (ruta: string) => readFile(path.join(raiz, ruta), 'utf8')

it('gate inspecciona mounts, hace A3f duro y ejecuta D12/D21 dentro del límite correcto', async () => {
  const gate = await leer('../docs/GATE-DOCKER-POC-3.md')
  expect(gate).toContain('config --no-interpolate')
  expect(gate).toContain('read_only')
  expect(gate).toContain('A3f (parada dura)')
  expect(gate).not.toContain('A3f (informativo, sin parada)')
  expect(gate).toContain('./poc.sh init-volumes')
  expect(gate).toContain('./poc.sh deps')
  expect(gate).toContain('./poc.sh probe-mounts')
  expect(gate).toContain('find diagnóstico no vinculante')
  expect(gate).not.toContain('test -d node_modules && echo node_modules-ok')
  expect(gate).toContain('npx tsc --noEmit --tsBuildInfoFile /tmp/tsconfig.tsbuildinfo')
  expect(gate).toContain('./poc.sh run-prod-en poc3_intake node --test test/build/sin-inyeccion.test.mjs')
  expect(gate).toContain('setpriv --reuid=1000 --regid=1000 --clear-groups node --test test/build/comprobar-build.test.mjs')
})

it('A4 sólo genera parche y reserva su aplicación al humano', async () => {
  const gate = await leer('../docs/GATE-DOCKER-POC-3.md')
  expect(gate).toContain('./poc.sh manifest-patch-axe > "$S/A4-manifiestos.json"')
  expect(gate).toContain('packageJson')
  expect(gate).toContain('packageLockJson')
  expect(gate).toContain('command -v diff')
  expect(gate).toContain('diff --version')
  expect(gate).toContain('git apply --check "$S/A4-manifiestos.patch"')
  expect(gate).toContain('aplicación humana revisada')
  expect(gate).not.toContain('./poc.sh deps npm install --ignore-scripts --save-dev --save-exact @axe-core/playwright@4.13.0')
})

it('documentación clasifica host sin Docker, Docker root-equivalente y root real', async () => {
  const gate = await leer('../docs/GATE-DOCKER-POC-3.md')
  expect(gate).toContain('setpriv UID 1000, sin grupo docker')
  expect(gate).toContain('Docker: privilegio equivalente a root')
  expect(gate).toContain('root real: `.env`, `.tls` y salidas')
  for (const id of ['D13', 'D16', 'D17', 'D26', 'D27']) expect(gate).toContain(id)
  expect(gate).toContain('el driver llama `poc.sh exec-en`')
  expect(gate).toContain('Sólo D21b')
  expect(gate).toContain('y D30')
})

it('README y EVIDENCIA usan D21 en app-prod y no recomiendan instalación directa', async () => {
  const [readme, evidencia, build] = await Promise.all([leer('README.md'), leer('EVIDENCIA.md'), leer('test/build/sin-inyeccion.test.mjs')])
  for (const texto of [readme, evidencia, build]) expect(texto).toContain('run-prod-en poc3_intake node --test test/build/sin-inyeccion.test.mjs')
  expect(readme).toContain('manifest-patch-axe')
  expect(readme).not.toContain('./poc.sh deps npm install --save-dev --save-exact @axe-core/playwright@4.13.0')
})
```

- [ ] **Step 2: Ejecutar rojo documental**

Run:

```sh
.jz/bin/jz-run --cwd poc1a node node_modules/vitest/vitest.mjs run --configLoader runner test/estatico/docs-write-isolation.test.ts
```

Expected: rc=1. Fallan los cuatro tests porque A3f aún usa permisos host, falta bootstrap de volúmenes, D21 está mal clasificado, A4 instala directamente y falta la clasificación de privilegios.

- [ ] **Step 3: Reescribir A2 y A3f del gate**

Mover la creación de `S` y `/root/jz-gate-poc3` desde A3 hasta A0, inmediatamente después de `umask 077`, para que A2 pueda registrar su salida antes de A3:

```sh
S="/root/jz-gate-poc3/$(date -u +%Y%m%dT%H%M%SZ)"
test ! -L /root/jz-gate-poc3 && install -d -m 700 /root/jz-gate-poc3 "$S" && echo salidas-ok
```

En A3, conservar sólo la comprobación de que `S` existe, es root-owned, tiene modo 700 y no es enlace; no crear una segunda ruta ni cambiar `S`.

En A2c, conservar `--no-interpolate` para no revelar `.env`. Añadir una inspección completa de la salida normalizada de todos los perfiles y exigir esta matriz:

| Servicio | `/app` | RW nombrados | RO nombrados | `/tmp` |
|---|---|---|---|---|
| `volumes-init` | ninguno | los diez volúmenes de aplicación bajo `/volumes/*`, sólo para ownership | ninguno | no necesita |
| `deps` | bind RO | `node_modules`, `npm_cache` | ninguno | tmpfs |
| `app` | bind RO | `next_dev`, `media_dev`, `media_test`, `media_prod` | `node_modules` | tmpfs |
| `app-prod` | bind RO | `next_prod`, `media_prod` | `node_modules` | tmpfs |
| `e2e` | bind RO | `test_results`, `playwright_report`, `blob_report` | `node_modules` | tmpfs |

Usar estos comandos exactos en A2c:

```sh
docker compose -p jozeuzz-poc-a -f compose.yaml -f compose.pruebas.yaml --profile volumes-init --profile prod --profile e2e --profile deps config --no-interpolate > "$S/A2-compose-resuelto.yaml"
sed -n '/^services:/,/^networks:/p' "$S/A2-compose-resuelto.yaml" | grep -nE '^(  [a-z]|    (image|user|profiles|network_mode|security_opt|cap_drop|cap_add|privileged|read_only|tmpfs|volumes):|      (type|source|target|read_only):)'
```

La revisión humana abre `A2-compose-resuelto.yaml` y compara cada montaje con la tabla. Parada dura ante bind sin `read_only: true`, destino no listado, volumen `external`, `driver_opts`, source absoluta no aprobada, `node_modules` RW fuera de `deps`, caché npm fuera de `deps`, falta de `read_only: true` de servicio o falta de `/tmp` tmpfs. Para `volumes-init`, también es parada dura cualquier bind, red distinta de `none`, `privileged`, `cap_add`, socket, volumen ajeno a los diez aprobados, imagen sin digest, usuario distinto de `0:0` o `cap_drop` distinto de la lista fijada en Task 1.

Cambiar el `find` host actual a subsección `A3d · find diagnóstico no vinculante`. Su salida se registra, pero no bloquea: `poc1a/` puede pertenecer a UID 1000 y el bind efectivo sigue siendo RO. No inferir permisos del contenedor desde ownership o mode bits host.

Mover `A3f (parada dura)` después de B1/B1v (`./poc.sh init`) y antes de `db-up`. Ejecutar exactamente:

```sh
r A3f1 ./poc.sh init-volumes
r A3f2 ./poc.sh deps
r A3f3 ./poc.sh probe-mounts
```

- A3f1 crea/monta sólo volúmenes aprobados y corrige ownership a `1000:1000`; es el único bootstrap elevado de volúmenes de aplicación.
- A3f2 puebla el volumen nombrado `node_modules` y su `npm_cache` como UID 1000. El directorio host `poc1a/node_modules` no se consulta ni cuenta como prerrequisito.
- A3f3 lanza cuatro contenedores UID 1000. Cada uno debe imprimir `MOUNT_PROBE_OK`. Deben fallar las escrituras a `/app`, `package.json`, `package-lock.json`, `poc.sh`, `compose.yaml` y `node_modules` en `app`, `app-prod` y `e2e`; deben funcionar sólo los destinos RW de la tabla A2, incluido `media_prod` dentro de `app`.
- Cualquier rc distinto de 0, escritura denegada en allowlist, escritura permitida fuera de allowlist, servicio ejecutado con UID distinto de 1000 o matriz diferente produce parada dura. Conservar servicios y logs; no abrir binds ni ejecutar código posterior del árbol.

- [ ] **Step 4: Añadir clasificación de operaciones host**

Insertar antes de B este cuadro normativo:

| Clase | Operaciones | Regla |
|---|---|---|
| `setpriv UID 1000, sin grupo docker` | Sólo D21b (`node --test test/build/comprobar-build.test.mjs`) y D30 (`env POC_BASE_URL=https://127.0.0.1:3444 node medicion/intake-latencia.mjs`), porque no invocan `poc.sh` ni Docker | Lanzar con `setpriv --reuid=1000 --regid=1000 --clear-groups`. D30 hereda `NODE_EXTRA_CA_CERTS` y necesita leer `.tls/ca.crt`, no socket. Si cualquiera empieza a invocar `poc.sh`, cambia automáticamente a clase Docker. |
| `Docker: privilegio equivalente a root` | Todo `docker compose up/run/exec/logs/down`, `docker image inspect`, `docker stats`, `init-volumes`, `deps`, `probe-mounts`, `run-prod-en`, `manifest-patch-axe` y pasos D01-D29 que los usan. D13, D16, D17, D26 y D27 también pertenecen aquí: el driver llama `poc.sh exec-en` para resetear cada caso | Sólo humano autorizado. Pertenecer al grupo Docker o usar socket como no-root sigue siendo root-equivalente sobre el CT. No delegar a agentes. |
| `root real: .env, .tls y salidas` | `./poc.sh init`, creación/validación de `.env` 600, generación/reemplazo de `.tls` root-owned, creación de `/root/jz-gate-poc3`, `SHA256SUMS`, búsqueda por valores secretos y captura del parche A4 | Ejecutar como root humano con `umask 077`. No abrir ni copiar valores secretos. |
| Compose sin daemon | Comando literal `docker compose -p jozeuzz-poc-a -f compose.yaml -f compose.pruebas.yaml --profile volumes-init --profile prod --profile e2e --profile deps config --no-interpolate` de A2 | Usa el parser Compose y no necesita socket; ejecutarlo sin grupo Docker. Aun así se revisa como configuración que luego consumirá el daemon. |

Añadir stop conditions globales:

- A2 no coincide exactamente con matriz: parada dura.
- A3f1-A3f3 divergen de ownership, UID, denegaciones o allowlist: parada dura. La salida del `find` host A3d no bloquea.
- Cualquier contenedor escribe bajo el bind `/app`: parada dura, conservar evidencia y no ejecutar scripts del árbol.
- D12 crea `.tsbuildinfo` bajo `poc1a/`: parada dura.
- D21 no ve el `BUILD_ID` de `next_prod`, detecta build obsoleto o encuentra marcador: parada dura.
- A4 emite cambios fuera de dos manifiestos, elimina versiones/integridades existentes, agrega paquetes distintos de `@axe-core/playwright` y `axe-core`, usa URL fuera de `https://registry.npmjs.org/` o informa firmas inválidas: no aplicar parche.
- Cualquier `EACCES`/`EROFS` en ruta no declarada se investiga; queda prohibido resolverlo abriendo el bind del repositorio.

- [ ] **Step 5: Reemplazar A4 por generación y aplicación humana separadas**

Sustituir la instalación directa por:

```sh
cd /home/proyectos/jozeuzz-poc-candidata-a/poc1a
alterado="$(g status --porcelain -- $GUARDA)"
test -z "$alterado" || { echo "ARBOL ALTERADO" >&2; exit 99; }
command -v node
node --version
node -e 'const m=Number(process.versions.node.split(".")[0]); if (m < 20) process.exit(1)'
command -v diff
diff_version="$(diff --version | head -n 1)"
printf '%s\n' "$diff_version"
case "$diff_version" in *'GNU diffutils'*) ;; *) echo "diff host no es GNU diffutils" >&2; exit 1 ;; esac
./poc.sh manifest-patch-axe > "$S/A4-manifiestos.json" 2> "$S/A4a.stderr.log"
rc=$?
printf 'rc=%s\n' "$rc" >> "$S/A4a.stderr.log"
sha256sum "$S/A4a.stderr.log" "$S/A4-manifiestos.json" >> "$S/SHA256SUMS"
test "$rc" -eq 0 || exit "$rc"
node - "$S/A4-manifiestos.json" "$S" <<'NODE'
const fs = require('node:fs')
const [entrada, salida] = process.argv.slice(2)
const datos = JSON.parse(fs.readFileSync(entrada, 'utf8'))
if (Object.keys(datos).sort().join(',') !== 'packageJson,packageLockJson') throw new Error('claves A4 inválidas')
function decodificar(nombre, valor) {
  if (typeof valor !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(valor)) throw new Error(`${nombre}: base64 inválido`)
  const contenido = Buffer.from(valor, 'base64')
  if (contenido.toString('base64') !== valor) throw new Error(`${nombre}: base64 no canónico`)
  JSON.parse(contenido.toString('utf8'))
  fs.writeFileSync(`${salida}/${nombre}`, contenido, { flag: 'wx', mode: 0o600 })
}
decodificar('A4-package.json', datos.packageJson)
decodificar('A4-package-lock.json', datos.packageLockJson)
NODE
: > "$S/A4-manifiestos.patch"
diff -u --label a/poc1a/package.json --label b/poc1a/package.json package.json "$S/A4-package.json" >> "$S/A4-manifiestos.patch"
diff_rc=$?
test "$diff_rc" -eq 1 || { echo "A4 package.json sin diff válido: rc=$diff_rc" >&2; exit 1; }
diff -u --label a/poc1a/package-lock.json --label b/poc1a/package-lock.json package-lock.json "$S/A4-package-lock.json" >> "$S/A4-manifiestos.patch"
diff_rc=$?
test "$diff_rc" -eq 1 || { echo "A4 package-lock.json sin diff válido: rc=$diff_rc" >&2; exit 1; }
sha256sum "$S/A4-package.json" "$S/A4-package-lock.json" "$S/A4-manifiestos.patch" >> "$S/SHA256SUMS"
test -s "$S/A4-manifiestos.patch"
g apply --check "$S/A4-manifiestos.patch"
cat "$S/A4-manifiestos.patch"
```

`node --version` debe informar Node 20 o superior. `diff --version` debe identificar GNU diffutils; si falta o no se identifica, A4 se detiene antes de Docker. `manifest-patch-axe` usa red y Docker sólo en futura ejecución humana, copia ambos manifiestos a `/tmp`, corre como UID 1000 con imagen fijada, dirige npm a stderr y emite sólo JSON por stdout. El host valida claves, base64 canónico y JSON, escribe salidas root 600 y genera el parche con la herramienta host ya comprobada. No existe bind RW ni dependencia de `diff` dentro de imagen.

Después de revisar el parche completo, la única aplicación permitida es una **aplicación humana revisada**:

```sh
g apply --check "$S/A4-manifiestos.patch"
g apply "$S/A4-manifiestos.patch"
```

Luego el humano quita `e2e/intake-axe.spec.ts` de `tsconfig.json`, revisa `git diff` y hace el commit A4. `npm ls` y `npm audit signatures` se ejecutan después mediante `deps`; ninguna de estas operaciones forma parte de esta implementación. A4 no se ejecuta, no instala y no aplica nada ahora.

- [ ] **Step 6: Corregir D12 y D21**

Cambiar D12 a:

```sh
find . -name '*.tsbuildinfo' -not -path './node_modules/*' -not -path './.next*/*' -exec sha256sum {} + | sort > "$S/D12-tsbuildinfo-before.txt"
r D12 ./poc.sh exec-en poc3_intake npx tsc --noEmit --tsBuildInfoFile /tmp/tsconfig.tsbuildinfo
find . -name '*.tsbuildinfo' -not -path './node_modules/*' -not -path './.next*/*' -exec sha256sum {} + | sort > "$S/D12-tsbuildinfo-after.txt"
r D12b cmp -s "$S/D12-tsbuildinfo-before.txt" "$S/D12-tsbuildinfo-after.txt"
```

Expected: D12 rc=0; D12b rc=0 y sin salida. Un `.tsbuildinfo` histórico ignorado puede existir, pero su conjunto y contenido no cambian; cualquier divergencia es parada dura.

Cambiar D21 a:

```sh
r D21a ./poc.sh run-prod-en poc3_intake node --test test/build/sin-inyeccion.test.mjs
r D21b setpriv --reuid=1000 --regid=1000 --clear-groups node --test test/build/comprobar-build.test.mjs
```

Expected: D21a rc=0 y `# pass 1`; sólo D21a lee `/app/.next-prod` desde `next_prod`. D21b es unitario con árbol temporal, rc=0, `# pass 9`, y corre en host como UID 1000 sin grupo Docker.

- [ ] **Step 7: Sincronizar README, EVIDENCIA y comentario de prueba**

En README:

- documentar bind `/app` RO, raíz RO, volúmenes nombrados, `/tmp` y motivo de `volumes-init` root acotado;
- reemplazar cualquier prerrequisito `test -d node_modules` por `./poc.sh init-volumes` seguido de `./poc.sh deps`; `node_modules` host no cuenta;
- documentar `./poc.sh probe-mounts` como A3f efectiva y el `find` host como diagnóstico no vinculante;
- reemplazar el D21 host por `./poc.sh run-prod-en poc3_intake node --test test/build/sin-inyeccion.test.mjs`;
- documentar D21b host como `setpriv --reuid=1000 --regid=1000 --clear-groups node --test test/build/comprobar-build.test.mjs`;
- reemplazar instalación A4 directa por `./poc.sh manifest-patch-axe > /root/jz-gate-poc3/A4-manifiestos.json`, indicando decodificación, diff host revisado y aplicación humana posterior;
- cambiar D12 a `npx tsc --noEmit --tsBuildInfoFile /tmp/tsconfig.tsbuildinfo`.
- clasificar D13/D16/D17/D26/D27 como Docker root-equivalente y D30 como elegible para `setpriv` sólo mientras no invoque `poc.sh`.

En EVIDENCIA:

- mantener todos los resultados Docker como `PENDIENTE (no ejecutado)`;
- cambiar fila U7 build a `./poc.sh run-prod-en poc3_intake node --test test/build/sin-inyeccion.test.mjs`;
- cambiar fila U8 axe a “A4 aislado PENDIENTE: manifiestos no generados, parche no aplicado, dependencia no instalada y E2E axe no ejecutado”;
- añadir que aislamiento está validado sólo estáticamente hasta A2/A3f/Docker y que `volumes-init`, `deps` y `probe-mounts` siguen sin ejecutarse.

En `test/build/sin-inyeccion.test.mjs`, reemplazar comentario de ejecución host por:

```js
// después, desde poc1a/: `./poc.sh run-prod-en poc3_intake node --test test/build/sin-inyeccion.test.mjs`.
// D21 debe correr dentro de app-prod porque `.next-prod` vive en el volumen nombrado `next_prod`.
```

- [ ] **Step 8: Ejecutar verde documental**

Run:

```sh
.jz/bin/jz-run --cwd poc1a node node_modules/vitest/vitest.mjs run --configLoader runner test/estatico/docs-write-isolation.test.ts
```

Expected: rc=0; 4 tests pasan.

- [ ] **Step 9: Commit pequeño**

```sh
git add docs/GATE-DOCKER-POC-3.md poc1a/README.md poc1a/EVIDENCIA.md poc1a/test/build/sin-inyeccion.test.mjs poc1a/test/estatico/docs-write-isolation.test.ts
git commit -m "docs(poc-3): harden Docker gate"
```

---

### Task 4: Verificación autónoma final sin Docker

**Files:**
- Test only: `poc1a/test/estatico/compose-write-isolation.test.ts`
- Test only: `poc1a/test/estatico/compose-proxy.test.ts`
- Test only: `poc1a/test/estatico/poc-sh-aislamiento.test.ts`
- Test only: `poc1a/test/estatico/docs-write-isolation.test.ts`
- Test only: `poc1a/test/build/comprobar-build.test.mjs`
- Test only: `poc1a/tsconfig.json`

**Interfaces:**
- Consumes: tres commits anteriores.
- Produces: evidencia `.jz-state/runs.jsonl` del árbol final, sin afirmar comportamiento Docker.

**Acceptance criteria:**
- Todos los contratos estáticos pasan en un árbol sin cambios inesperados.
- TypeScript pasa sin escribir estado incremental al repo.
- Test unitario de inspección de build pasa sin necesitar `.next-prod` real.
- No se ejecuta `sin-inyeccion.test.mjs` autónomamente: requiere volumen Docker real y pertenece a D21 humano.

- [ ] **Step 1: Ejecutar suite estática focalizada**

Run:

```sh
.jz/bin/jz-run --cwd poc1a node node_modules/vitest/vitest.mjs run --configLoader runner test/estatico/compose-write-isolation.test.ts test/estatico/compose-proxy.test.ts test/estatico/poc-sh-aislamiento.test.ts test/estatico/docs-write-isolation.test.ts
```

Expected: rc=0, ningún test fallido.

- [ ] **Step 2: Ejecutar toda la regresión unitaria y estática relevante**

Run:

```sh
.jz/bin/jz-run --cwd poc1a node node_modules/vitest/vitest.mjs run --configLoader runner src test/estatico
```

Expected: rc=0, ningún archivo ni test fallido. Registrar conteo real desde el log; no copiar un conteo histórico.

- [ ] **Step 3: Verificar TypeScript**

Run:

```sh
.jz/bin/jz-run --cwd poc1a node node_modules/typescript/bin/tsc --noEmit --incremental false
```

Expected: rc=0, sin errores.

- [ ] **Step 4: Verificar comprobador D21 sin build real**

Run:

```sh
.jz/bin/jz-run --cwd poc1a node --test test/build/comprobar-build.test.mjs
```

Expected: rc=0, `# pass 9`, `# fail 0`.

- [ ] **Step 5: Verificar sintaxis del arnés**

Run:

```sh
.jz/bin/jz-run --cwd poc1a sh -n poc.sh
```

Expected: rc=0, sin salida.

- [ ] **Step 6: Revisar diff sin ejecutar Docker**

Comprobar que sólo cambiaron archivos permitidos por Tasks 1-3; `package.json`, `package-lock.json`, `compose.pruebas.yaml`, código de producto, redes, puertos, bases e imágenes permanecen iguales. Si aparece otro archivo, detenerse y no restaurarlo automáticamente.

- [ ] **Step 7: Commit de corrección sólo si la verificación exigió ajustes**

Si no hubo ajustes, no crear commit vacío. Si hubo una corrección dentro de los archivos permitidos:

```sh
git add poc1a/compose.yaml poc1a/tsconfig.json poc1a/poc.sh poc1a/test/estatico/compose-write-isolation.test.ts poc1a/test/estatico/compose-proxy.test.ts poc1a/test/estatico/poc-sh-aislamiento.test.ts poc1a/test/estatico/docs-write-isolation.test.ts poc1a/test/build/sin-inyeccion.test.mjs docs/GATE-DOCKER-POC-3.md poc1a/README.md poc1a/EVIDENCIA.md
git commit -m "test(poc-3): verify Docker write isolation"
```

## Gate humano posterior, fuera de esta implementación

Responsable ejecuta `docs/GATE-DOCKER-POC-3.md` desde un árbol limpio. Orden mínimo que valida esta unidad antes de retomar D01-D30:

1. A0-A2: revisión de Git y Compose efectivo sin interpolar secretos.
2. A3d: registrar ownership host sólo como diagnóstico no vinculante; no decide el gate.
3. B1/B1v: `.env` bajo root, sin mostrar valores.
4. A3f1: `init-volumes` prepara ownership sin bind ni red; A3f2: `deps` puebla volúmenes; A3f3: `probe-mounts` valida denegaciones y allowlist. Las tres son operaciones Docker root-equivalente.
5. D04/D10: confirmar que Next inicia con raíz RO y sólo escribe `next_dev`, medios y `/tmp`.
6. D11/D12: confirmar vitest y `tsc`; D12b debe quedar vacío.
7. D13/D16/D17/D26/D27: mantener ejecución root-equivalente porque sus drivers llaman `poc.sh`.
8. D20/D21: build en `next_prod`, D21a dentro de `app-prod` y D21b host con `setpriv`.
9. D18/D28: confirmar resultados Playwright en sus tres volúmenes y ningún artefacto nuevo en repo.
10. D30: ejecutar como `r D30 setpriv --reuid=1000 --regid=1000 --clear-groups env POC_BASE_URL=https://127.0.0.1:3444 node medicion/intake-latencia.mjs` sólo mientras el script no invoque `poc.sh`.
11. K1-K3: integridad, fugas y hashes.

No ejecutar A4 durante esta implementación ni durante el gate de aislamiento. Su procedimiento futuro permanece documentado y sigue bloqueando el cierre de auditoría axe, no la validación del aislamiento de escritura.

## Auto-review del plan

**Cobertura:** bootstrap `volumes-init` root acotado; fuente `/app` RO; raíces RO; `node_modules` RW/RO; caché sólo `deps`; `/tmp`; volúmenes `next_*`, medios y Playwright; reset de producción desde `app`; `tsbuildinfo`; D21a en `app-prod` y D21b host; A4 por JSON/base64 y diff host; clasificación de baterías; A2; A3f runtime duro; `find` host diagnóstico; redes, puertos y bases preservados; stop conditions; TDD; RED/GREEN; commits pequeños.

**Ambigüedades cerradas:** `media_prod` se comparte entre `app` y `app-prod`; `volumes-init` monta exactamente diez volúmenes y nunca `db`; D21a usa `run --rm --no-deps`, D21b no necesita volumen; A4 emite sólo dos manifiestos y no toca `tsconfig`; la retirada del exclude de axe ocurre después, manualmente; `compose.pruebas.yaml` no cambia.

**Afirmaciones no realizadas:** no se afirma que Compose acepte los montajes, que Next funcione con raíz RO, que D21 vea el volumen, que A4 resuelva versiones ni que pruebas Docker pasen. Ésas quedan en gate humano con evidencia real.

**Placeholder scan:** comandos, rutas, versiones, digests, volúmenes, resultados esperados y stop conditions están fijados. No hay pasos de implementación abiertos.

**Revisión de los nueve hallazgos:**

1. `volumes-init` resuelve ownership root inicial con elevación acotada, imagen fijada, red `none`, sin binds/socket/`privileged`/`cap_add`, `cap_drop` explícito y test estático exacto.
2. A3d deja ownership host como diagnóstico; A3f1-A3f3 prueban montajes reales después de `init` y aplican parada dura sólo a divergencias efectivas.
3. Test de binds ignora volúmenes nombrados, acepta `db:/var/lib/postgresql` RW y exige RO sólo a binds.
4. A4 no usa `diff` dentro de imagen: emite JSON/base64; Node host valida/decodifica y GNU diffutils host comprobado genera parche en `S`.
5. D13/D16/D17/D26/D27 quedan como Docker root-equivalente; sólo D21b y D30 pueden usar `setpriv` sin grupo Docker mientras no invoquen `poc.sh`.
6. Runtime ya no consulta `node_modules` host: `init-volumes` prepara y `deps` puebla volumen nombrado.
7. Pruebas estáticas y A3f runtime cubren bootstrap, UID 1000, allowlist RW, fuente RO y `node_modules` RO en consumidores.
8. A4 permanece sin ejecutar: no genera, aplica ni instala durante esta implementación o gate de aislamiento.
9. Comandos Docker/`setpriv` son futuros y humanos; implementador usa sólo `.jz/bin/jz-run` y git local permitido.

## Enmiendas del orquestador (relevo 2026-10-20)

Prevalecen sobre el plan donde choquen.

- **E1 · `next-env.d.ts`.** Next 16.4.1 escribe `<raíz>/next-env.d.ts` si su contenido difiere; con `/app` RO, `npm run build` en `app-prod` fallaría con EROFS. Se crean `poc1a/contenedor/next-env.dev.txt` (distDir `.next/dev`) y `poc1a/contenedor/next-env.prod.txt` (distDir `.next-prod`), con el contenido exacto que genera la función real de Next, fijado por `test/estatico/next-env-contenedor.test.ts` (ejecuta la función de `node_modules/next` en `os.tmpdir()` y compara byte a byte). `app` y `app-prod` montan su archivo como bind `read_only: true` en `/app/next-env.d.ts`. Ningún bind RW. La matriz `resumen` incluye ese destino.
- **E2 · Puntos de montaje.** `poc.sh init` (root humano) prepara sin seguir enlaces: `node_modules .npm-cache .next .next-prod media-store media-store-test media-store-prod test-results playwright-report blob-report` (directorios, `mkdir -p`) y `next-env.d.ts` (vacío, sólo si no existe); un enlace simbólico es error y `exit 1`. El gate indica que `init` los prepara y que A3f depende de ello.
- **E3 · HOME.** `deps`, `app`, `app-prod` y `e2e` tienen `HOME: /tmp` en su `environment` efectivo. `NPM_CONFIG_CACHE` sólo en `deps`; los consumidores usan `/tmp/.npm`.
- **E4 · Conteo.** `comprobar-build.test.mjs` tiene 10 tests: se usa `# pass 10` (no `# pass 9`).
- **E5 · Coherencia literal plan-tests.** Se usa `g apply --check "$S/A4-manifiestos.patch"` en test y gate; la clase `root real: \`.env\`, \`.tls\` y salidas` es igual en tabla y test.
- **E6 · Gate.** Se elimina `test -d node_modules && echo node_modules-ok` y la antigua `r A3d ./poc.sh deps` (deps pasa a A3f2). A2c actualiza "Qué hay que ver" (`volumes-init` sí tiene `network_mode: none`, `security_opt`, `cap_drop`, `user 0:0`, y es el único) y las referencias de línea. Nueva stop condition: EROFS/EACCES en `next-env.d.ts` o en un punto de montaje es parada dura; prohibido resolverlo abriendo el bind.
- **E7 · `migrate-create`.** Con `/app` RO no puede escribir `src/migrations`: rechazo explícito (`exit 2`), test estático y nota en README. `migrate` y `migrate-en` no cambian.
- **E8 · `manifest-patch-axe`.** Además de lo del plan, `docker run` lleva `--cap-drop ALL --security-opt no-new-privileges:true`, con aserción en test.
- **E9 · Riesgo residual (sólo documental, en el gate).** La caché de Vitest (`node_modules/.vite`) y `payload generate:types` (`src/payload-types.ts`) fallan en silencio con RO (no fatal); `importMap` sólo se regenera en HMR; `npm ci` con `node_modules` montado se valida en A3f2; `HOME=/tmp`. El `node_modules` del host se pobló en la era RW y sólo sirve para pruebas estáticas en sandbox, nunca como prerrequisito.

### Ciclo de corrección 1

Tras la revisión de jz-qa y jz-security. Prevalece sobre el plan y sobre E1-E9 donde choque.

- **Q-I1.** Toda invocación de vitest dentro de contenedores lleva `--configLoader runner` (Vite escribe `node_modules/.vite-temp` con el cargador bundle). Prueba en `docs-write-isolation.test.ts` sobre gate, README, EVIDENCIA (órdenes `exec-en`) y diseño.
- **S-I1.** Gate A3e (parada dura, antes de A4 y B1): sin contenedores del proyecto (`down --remove-orphans` sin `-v`) y ningún contenedor del host con el worktree montado en RW; clasificado como Docker root-equivalente.
- **M-1.** `CODEREF` en A1 reemplaza el hash fijo. Commit A con todos los cambios del ciclo y commit B sólo en `docs/GATE-DOCKER-POC-3.md` con el hash del commit A. Las pruebas no fijan el hash.
- **M-2.** Etiquetas `a/poc1a/…` del parche A4 correctas: `git apply` resuelve las rutas desde la raíz del repositorio también desde `poc1a/` (comprobado en un repositorio temporal).
- **M-3.** A4 completo se ejecuta tras B1/B1v y A3f; el primer bloque va en una subshell `( … )`.
- **M-5.** `find … -name '*.tsbuildinfo'` con `-type f` (D12).
- **M-6.** `poc.sh init` crea `next-env.d.ts` con `( set -C; : > next-env.d.ts )` y vuelve a comprobar `-L`.
- **M-7, M-8, M-9, Q-M4, Q-M6, S-M10.** Aclaraciones documentales (root, Compose sin daemon, riesgo del `node_modules` heredado, `destroy`, comandos contradictorios, runc ≥ 1.1.12).
- **Q-M2.** `test/estatico/tsconfig-punto-fijo.test.ts` ejecuta la función real `writeConfigurationDefaults` de Next sobre una copia de `tsconfig.json` en `os.tmpdir()` (dev con `NODE_ENV=development` y `.next/dev`; build con `NODE_ENV=production` y `.next-prod`) y comprueba que no cambia; incluye un control que sí cambia.
- **No se hizo:** M-4, `cap_drop` en servicios, bind recursive ni citas de línea masivas.
