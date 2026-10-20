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

  it('volumes-init es el único servicio con root, sin red o con privilegios recortados', async () => {
    const cfg = await compose()
    for (const [nombre, service] of Object.entries(cfg.services)) {
      if (nombre === 'volumes-init') continue
      expect(service.user === '0:0' || service.user === '0' || service.user === 'root', nombre).toBe(false)
      expect(service.network_mode, nombre).toBeUndefined()
      expect(service.privileged, nombre).toBeUndefined()
    }
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

  it('HOME es /tmp (tmpfs) en el entorno efectivo de los cuatro servicios', async () => {
    const cfg = await compose()
    for (const nombre of ['deps', 'app', 'app-prod', 'e2e']) expect(cfg.services[nombre].environment?.HOME, nombre).toBe('/tmp')
  })

  it('asigna sólo rutas funcionales necesarias', async () => {
    const cfg = await compose()
    const resumen = (nombre: string) => Object.fromEntries(Object.entries(porDestino(cfg.services[nombre])).map(([target, mount]) => [target, `${mount.source}:${mount.read_only === true ? 'ro' : 'rw'}`]))
    expect(resumen('deps')).toEqual({ '/app': '.:ro', '/app/node_modules': 'node_modules:rw', '/app/.npm-cache': 'npm_cache:rw' })
    expect(resumen('app')).toEqual({
      '/app': '.:ro',
      '/app/node_modules': 'node_modules:ro',
      '/app/next-env.d.ts': './contenedor/next-env.dev.txt:ro',
      '/app/.next': 'next_dev:rw',
      '/app/media-store': 'media_dev:rw',
      '/app/media-store-test': 'media_test:rw',
      '/app/media-store-prod': 'media_prod:rw',
    })
    expect(resumen('app-prod')).toEqual({
      '/app': '.:ro',
      '/app/node_modules': 'node_modules:ro',
      '/app/next-env.d.ts': './contenedor/next-env.prod.txt:ro',
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

  it('next-env.d.ts se monta como bind de archivo RO (Next no puede escribirlo en /app RO)', async () => {
    const cfg = await compose()
    expect(porDestino(cfg.services.app)['/app/next-env.d.ts']).toEqual({ type: 'bind', source: './contenedor/next-env.dev.txt', target: '/app/next-env.d.ts', read_only: true })
    expect(porDestino(cfg.services['app-prod'])['/app/next-env.d.ts']).toEqual({ type: 'bind', source: './contenedor/next-env.prod.txt', target: '/app/next-env.d.ts', read_only: true })
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
