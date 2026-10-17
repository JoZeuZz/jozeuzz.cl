import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  contarIntento: vi.fn(),
  purgarIntake: vi.fn(),
  respuestaFormulario: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn() },
  drizzle: { execute: vi.fn() },
}))

vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({ getPayload: async () => ({ db: { schemaName: 'poc_test', drizzle: mocks.drizzle }, logger: mocks.logger }) }))
vi.mock('@/lib/publico', () => ({ resolverServicioActivo: vi.fn() }))
vi.mock('@/lib/solicitudes', () => ({ validarSolicitudPublica: vi.fn() }))
vi.mock('./config', () => ({ cargarConfigIntake: () => ({ origenPublico: 'https://127.0.0.1:3443', tiempoMinimoMs: 0, secretoHex: '' }) }))
vi.mock('./claves', () => ({ derivarClaves: () => ({}), claveIp: () => 'ip-clave', claveEnvio: () => 'envio-clave' }))
vi.mock('./formulario', () => ({ respuestaFormulario: mocks.respuestaFormulario }))
vi.mock('./persistir', () => ({ persistirIntake: vi.fn() }))
vi.mock('./purga', () => ({ purgarIntake: mocks.purgarIntake }))
vi.mock('./limites', async (original) => ({ ...(await original<typeof import('./limites')>()), contarIntento: mocks.contarIntento }))

import { manejarIntake } from './manejador'

const peticion = (tipo: string) => new Request('https://127.0.0.1:3443/api/intake', { method: 'POST', headers: { 'content-type': tipo, 'x-real-ip': '203.0.113.9' }, body: '{}' })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.purgarIntake.mockResolvedValue(undefined)
  mocks.respuestaFormulario.mockResolvedValue(new Response(null, { status: 200 }))
})

describe('manejarIntake: retención y fallos', () => {
  it('purga tras contar el intento, con el schema del adaptador y sin alterar la respuesta', async () => {
    mocks.contarIntento.mockResolvedValue({ permitido: true, reintentarEnS: 5 })

    const respuesta = await manejarIntake(peticion('text/plain'))

    expect(respuesta.status).toBe(415)
    expect(mocks.contarIntento).toHaveBeenCalledWith(mocks.drizzle, 'ip-clave', 'poc_test')
    expect(mocks.purgarIntake).toHaveBeenCalledTimes(1)
    expect(mocks.purgarIntake.mock.calls[0]?.[0]).toBe(mocks.drizzle)
    expect(mocks.purgarIntake.mock.calls[0]?.[2]).toBe('poc_test')
    expect(mocks.contarIntento.mock.invocationCallOrder[0]).toBeLessThan(mocks.purgarIntake.mock.invocationCallOrder[0] as number)
    mocks.purgarIntake.mock.calls[0]?.[1]({ evento: 'intake_purga' })
    expect(mocks.logger.error).toHaveBeenCalledWith({ evento: 'intake_purga' })
  })

  it('purga también cuando el límite de intentos bloquea', async () => {
    mocks.contarIntento.mockResolvedValue({ permitido: false, reintentarEnS: 9 })

    const respuesta = await manejarIntake(peticion('application/json'))

    expect(respuesta.status).toBe(429)
    expect(respuesta.headers.get('retry-after')).toBe('9')
    expect(mocks.purgarIntake).toHaveBeenCalledTimes(1)
  })

  it('un fallo de purga no altera la respuesta', async () => {
    mocks.contarIntento.mockResolvedValue({ permitido: true, reintentarEnS: 5 })
    mocks.purgarIntake.mockRejectedValue(new Error('db'))

    const respuesta = await manejarIntake(peticion('text/plain'))

    expect(respuesta.status).toBe(415)
  })

  it('si respuestaFormulario falla en la rama de límite responde 500 interno en vez de propagar', async () => {
    mocks.contarIntento.mockResolvedValue({ permitido: false, reintentarEnS: 9 })
    mocks.respuestaFormulario.mockRejectedValueOnce(new Error('plantilla'))

    const respuesta = await manejarIntake(peticion('application/x-www-form-urlencoded'))

    expect(respuesta.status).toBe(500)
    expect(mocks.logger.error).toHaveBeenCalledWith(expect.objectContaining({ evento: 'intake', codigo: 'interno' }))
  })
})
