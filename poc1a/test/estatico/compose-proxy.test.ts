import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { load } = createRequire(import.meta.url)('js-yaml') as { load(texto: string): unknown }

type Compose = {
  services: Record<string, { image?: string; networks?: string[]; ports?: string[]; network_mode?: string; command?: string[]; volumes?: string[]; environment?: Record<string, string> }>
  networks: Record<string, { internal?: boolean }>
}

async function leerCompose(nombre: string): Promise<Compose> {
  return load(await readFile(path.join(raiz, nombre), 'utf8')) as Compose
}

describe('topología TLS aislada', () => {
  it('limita override de pruebas al reemplazo IP y enlace directo diseñado', async () => {
    const override = await leerCompose('compose.pruebas.yaml')

    expect(Object.keys(override)).toEqual(['services'])
    expect(Object.keys(override.services)).toEqual(['proxy', 'app'])
    expect(override.services.proxy).toEqual({
      volumes: ['./proxy/ip-cliente.pruebas.conf:/etc/nginx/poc/ip-cliente.conf:ro'],
    })
    expect(override.services.app).toEqual({ networks: ['proxy_prod'] })
  })

  it('expone sólo proxy y separa clientes, apps y bases por red', async () => {
    const compose = await leerCompose('compose.yaml')
    const { app, 'app-prod': appProd, proxy, e2e, deps } = compose.services

    expect(app.ports).toBeUndefined()
    expect(appProd.ports).toBeUndefined()
    expect(app.network_mode).toBeUndefined()
    expect(appProd.network_mode).toBeUndefined()
    expect(app.networks).toEqual(['db_app', 'proxy_app'])
    expect(appProd.networks).toEqual(['db_prod', 'proxy_prod'])
    expect(e2e.networks).toEqual(['e2e'])
    expect(e2e.network_mode).toBeUndefined()
    expect(deps.networks).toEqual(['externa'])
    expect(proxy.image).toBe('nginx:1.30.6-alpine@sha256:970364228b1e4f932abc22d321932816782cca8a20b85a77552a7cfe9acfb3b5')
    expect(proxy.ports).toEqual(['127.0.0.1:3443:3443', '127.0.0.1:3444:3444'])
    expect(proxy.networks).toEqual(['entrada', 'proxy_app', 'proxy_prod', 'e2e'])
    for (const red of ['db_app', 'db_prod', 'proxy_app', 'proxy_prod', 'e2e']) expect(compose.networks[red]).toEqual({ internal: true })
    expect(compose.networks.entrada).toEqual({})
    expect(compose.networks.externa).toEqual({})
  })

  it('configura TLS y origen público sin desactivar validación', async () => {
    const compose = await leerCompose('compose.yaml')
    expect(compose.services.app.environment).toMatchObject({
      POC_SERVER_URL: 'https://127.0.0.1:3443', INTAKE_ORIGEN_PUBLICO: 'https://127.0.0.1:3443', INTAKE_TIEMPO_MINIMO_MS: '200', NODE_EXTRA_CA_CERTS: '/app/.tls/ca.crt',
    })
    expect(compose.services['app-prod'].environment).toMatchObject({
      POC_SERVER_URL: 'https://127.0.0.1:3444', INTAKE_ORIGEN_PUBLICO: 'https://127.0.0.1:3444', INTAKE_TIEMPO_MINIMO_MS: '200', NODE_EXTRA_CA_CERTS: '/app/.tls/ca.crt',
    })
    expect(compose.services.e2e.environment).toMatchObject({ POC_BASE_URL: 'https://127.0.0.1:3443' })
    expect(compose.services.proxy.volumes).toEqual(expect.arrayContaining([
      './proxy/nginx.conf:/etc/nginx/nginx.conf:ro', './proxy/ip-cliente.produccion.conf:/etc/nginx/poc/ip-cliente.conf:ro', './.tls:/etc/nginx/tls:ro',
    ]))
    expect(compose.services.app.environment?.INTAKE_SECRETO).toContain('ejecuta ./poc.sh init')
    expect(compose.services['app-prod'].environment?.INTAKE_SECRETO).toContain('ejecuta ./poc.sh init')
  })

  it('PostgreSQL no escribe sentencias ni valores en sus logs (T-06)', async () => {
    const compose = await leerCompose('compose.yaml')
    expect(compose.services.db.command).toEqual(['postgres', '-c', 'log_min_messages=fatal', '-c', 'log_min_error_statement=panic', '-c', 'log_error_verbosity=terse'])
    const sobreescritura = await leerCompose('compose.pruebas.yaml')
    expect(sobreescritura.services.db).toBeUndefined()
  })

  it('mantiene proxy sin bypass de IP ni cabeceras locales', async () => {
    const [nginx, produccion, pruebas] = await Promise.all([
      readFile(path.join(raiz, 'proxy/nginx.conf'), 'utf8'),
      readFile(path.join(raiz, 'proxy/ip-cliente.produccion.conf'), 'utf8'),
      readFile(path.join(raiz, 'proxy/ip-cliente.pruebas.conf'), 'utf8'),
    ])
    expect(nginx).toContain('ssl_protocols TLSv1.3;')
    expect(nginx).toContain('access_log off;')
    expect(nginx).toContain('error_log stderr crit;')
    expect(nginx).toContain('client_max_body_size 1m;')
    expect(nginx).toContain('client_body_buffer_size 1m;')
    expect(nginx).toContain('resolver 127.0.0.11 valid=10s ipv6=off;')
    expect(nginx).not.toMatch(/real_ip_header|set_real_ip_from/)
    expect(produccion).toContain('proxy_set_header X-Real-IP $remote_addr;')
    expect(produccion).toContain('proxy_set_header X-Forwarded-For "";')
    expect(produccion).toContain('proxy_set_header X-Poc-Ip-Sintetica "";')
    expect(produccion).toContain('proxy_set_header X-Poc-Fallo "";')
    expect(pruebas).toContain('203\\.0\\.113')
    expect(pruebas).toContain('2001:db8:')
    expect(pruebas).toContain('proxy_set_header X-Poc-Fallo $http_x_poc_fallo;')
    for (const bloque of nginx.match(/server \{[\s\S]*?\n  \}/g) ?? []) expect(bloque).not.toContain('proxy_set_header')
  })
})
