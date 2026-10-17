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

import { manejarFormularioIntake, manejarIntake } from './manejador'

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

  it('un fallo síncrono de la purga tampoco altera la respuesta', async () => {
    mocks.contarIntento.mockResolvedValue({ permitido: true, reintentarEnS: 5 })
    mocks.purgarIntake.mockImplementation(() => { throw new Error('síncrono') })

    expect((await manejarIntake(peticion('text/plain'))).status).toBe(415)
  })

  it('la purga sin await no produce unhandledRejection', async () => {
    const huerfanas: unknown[] = []
    const escucha = (motivo: unknown) => { huerfanas.push(motivo) }
    process.on('unhandledRejection', escucha)
    try {
      mocks.contarIntento.mockResolvedValue({ permitido: true, reintentarEnS: 5 })
      mocks.purgarIntake.mockRejectedValue(new Error('SNT-purga'))
      await manejarIntake(peticion('text/plain'))
      await new Promise((resolve) => setTimeout(resolve, 20))
    } finally { process.off('unhandledRejection', escucha) }
    expect(huerfanas).toEqual([])
  })

  it('un fallo del logger al cerrar la petición no altera la respuesta', async () => {
    mocks.contarIntento.mockResolvedValue({ permitido: true, reintentarEnS: 5 })
    mocks.logger.info.mockImplementationOnce(() =>{ throw new Error('logger roto') })

    expect((await manejarIntake(peticion('text/plain'))).status).toBe(415)
  })
})

describe('manejarFormularioIntake (GET /solicitar)', () => {
  const get = (consulta = '') => new Request(`https://127.0.0.1:3443/solicitar${consulta}`)

  it('delega en respuestaFormulario e interpreta ?estado=recibida', async () => {
    const respuesta = await manejarFormularioIntake(get('?estado=recibida'))

    expect(respuesta.status).toBe(200)
    expect(mocks.respuestaFormulario).toHaveBeenCalledWith(undefined, undefined, true)
    await manejarFormularioIntake(get('?estado=otra'))
    expect(mocks.respuestaFormulario).toHaveBeenLastCalledWith(undefined, undefined, false)
    expect(mocks.logger.error).not.toHaveBeenCalled()
  })

  it('si falla responde 500 genérico y registra sólo metadatos sin valores', async () => {
    mocks.respuestaFormulario.mockRejectedValueOnce(Object.assign(new Error('SNT-plantilla'), { code: '23514' }))

    const respuesta = await manejarFormularioIntake(get())

    expect(respuesta.status).toBe(500)
    expect(await respuesta.json()).toEqual({ error: 'interno' })
    expect(respuesta.headers.get('x-correlacion')).toBeTruthy()
    expect(mocks.logger.error).toHaveBeenCalledTimes(1)
    const registro = mocks.logger.error.mock.calls[0]?.[0] as Record<string, unknown>
    expect(Object.keys(registro).sort()).toEqual(['codigo', 'correlacion', 'duracion_ms', 'err_name', 'evento', 'pg_code'])
    expect(registro).toMatchObject({ evento: 'intake', codigo: 'interno', err_name: 'Error', pg_code: '23514' })
    expect(JSON.stringify(registro)).not.toContain('SNT-')
  })

  it('si además falla el logger, responde 500 igualmente', async () => {
    mocks.respuestaFormulario.mockRejectedValueOnce(new Error('config'))
    mocks.logger.error.mockImplementationOnce(() => { throw new Error('logger roto') })

    expect((await manejarFormularioIntake(get())).status).toBe(500)
  })
})
