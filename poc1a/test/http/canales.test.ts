// Canales que deben estar cerrados (GraphQL) o no filtrar nada: se ejecuta contra dev y contra producción
// (POC_HTTP_BASE=http://app-prod:3000). Complementa a CA-02 de la batería.
import { describe, expect, it } from 'vitest'

const BASE = (process.env.POC_HTTP_BASE ?? 'http://localhost:3000').replace(/\/$/, '')
const SENTINELAS = ['SNT-', '__schema', 'IntrospectionQuery']

async function pedir(metodo: string, ruta: string, cuerpo?: unknown) {
  const res = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: { connection: 'close', ...(cuerpo === undefined ? {} : { 'content-type': 'application/json' }) },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    redirect: 'manual',
  })
  return { status: res.status, texto: await res.text() }
}

describe('GraphQL cerrado', () => {
  const introspeccion = { query: '{ __schema { types { name } } }' }
  const casos: [string, string, unknown?][] = [
    ['POST', '/api/graphql', introspeccion],
    ['POST', '/api/graphql', { query: '{ Proyectos { docs { slug titulo } } }' }],
    ['GET', '/api/graphql?query=%7B__schema%7Btypes%7Bname%7D%7D%7D'],
    ['GET', '/api/graphql-playground'],
    ['POST', '/graphql', introspeccion],
    ['GET', '/graphql'],
  ]
  for (const [m, r, c] of casos) {
    it(`${m} ${r} no responde 2xx ni expone el esquema`, async () => {
      const x = await pedir(m, r, c)
      expect(x.status).toBeGreaterThanOrEqual(400)
      for (const s of SENTINELAS) expect(x.texto).not.toContain(s)
    })
  }
})

describe('rutas inexistentes o internas', () => {
  for (const ruta of ['/media-store/privados/x.txt', '/media-store/publicos/x.txt', '/src/payload.config.ts', '/.env', '/api/access/../users']) {
    it(`GET ${ruta} no sirve contenido`, async () => {
      const x = await pedir('GET', ruta)
      expect(x.status).toBeGreaterThanOrEqual(300)
      expect(x.texto).not.toContain('PAYLOAD_SECRET')
    })
  }
})
