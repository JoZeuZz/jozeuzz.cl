import { PgDialect } from 'drizzle-orm/pg-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ logger: { error: vi.fn(), info: vi.fn() } }))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({ getPayload: async () => ({ logger: mocks.logger }) }))

import { sondaDePrueba } from './fallos'

const peticion = (fallo?: string) => new Request('https://127.0.0.1:3443/api/intake', { method: 'POST', headers: fallo ? { 'x-poc-fallo': fallo } : {} })
const datos = { nombre: 'SNT-nombre', contacto: 'SNT-contacto', tipo_equipo: 'SNT-tipo', descripcion: 'SNT-descripcion' }
const dialecto = new PgDialect()
const consulta = (objeto: unknown) => dialecto.sqlToQuery(objeto as Parameters<PgDialect['sqlToQuery']>[0])

function txQueFalla() {
  const error = Object.assign(new Error('fallo de BD'), { code: '23514' })
  const execute = vi.fn().mockRejectedValue(error)
  return { tx: { execute, insert: vi.fn() }, execute, error }
}

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('POC_FALLOS_INYECTABLES', '1')
  vi.clearAllMocks()
})
afterEach(() => vi.unstubAllEnvs())

describe('sondaDePrueba: activación', () => {
  it('está desactivada en producción aunque la variable valga 1', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(sondaDePrueba(peticion('intake-pg-check'))).toBeUndefined()
  })

  it('está desactivada sin la variable o con un valor distinto de 1', () => {
    vi.stubEnv('POC_FALLOS_INYECTABLES', '')
    expect(sondaDePrueba(peticion('intake-pg-check'))).toBeUndefined()
    vi.stubEnv('POC_FALLOS_INYECTABLES', '0')
    expect(sondaDePrueba(peticion('intake-pg-check'))).toBeUndefined()
    vi.stubEnv('POC_FALLOS_INYECTABLES', 'true')
    expect(sondaDePrueba(peticion('intake-pg-check'))).toBeUndefined()
  })

  it('ignora una cabecera desconocida o ausente', () => {
    expect(sondaDePrueba(peticion('tras-estado'))).toBeUndefined()
    expect(sondaDePrueba(peticion('INTAKE-PG-CHECK '))).toBeUndefined()
    expect(sondaDePrueba(peticion())).toBeUndefined()
  })
})

describe('sondaDePrueba: comportamientos', () => {
  it('intake-pg-check inserta el nombre como tipo en intake_limite (violación de CHECK)', async () => {
    const sonda = sondaDePrueba(peticion('intake-pg-check'))
    const { tx, execute } = txQueFalla()
    await expect(sonda?.trasCupo?.(tx as never, datos)).rejects.toMatchObject({ code: '23514' })
    const { sql, params } = consulta(execute.mock.calls[0]?.[0])
    expect(sql).toMatch(/insert into .*"intake_limite"/i)
    expect(params).toContain('SNT-nombre')
  })

  it('intake-pg-tipo convierte el nombre a entero (22P02)', async () => {
    const sonda = sondaDePrueba(peticion('intake-pg-tipo'))
    const { tx, execute } = txQueFalla()
    await expect(sonda?.trasCupo?.(tx as never, datos)).rejects.toThrow()
    const { sql, params } = consulta(execute.mock.calls[0]?.[0])
    expect(sql).toMatch(/::integer/)
    expect(params).toContain('SNT-nombre')
  })

  it('intake-fuera añade U+0000 al nombre antes de crear', () => {
    const sonda = sondaDePrueba(peticion('intake-fuera'))
    expect(sonda?.antesDeCrear?.(datos)).toEqual({ ...datos, nombre: 'SNT-nombre\u0000' })
    expect(sonda?.trasCupo).toBeUndefined()
  })

  it('intake-log-crudo registra el error crudo en el logger y lo relanza', async () => {
    const sonda = sondaDePrueba(peticion('intake-log-crudo'))
    const { tx, error } = txQueFalla()
    await expect(sonda?.trasCupo?.(tx as never, datos)).rejects.toBe(error)
    expect(mocks.logger.error).toHaveBeenCalledWith(error)
  })
})
