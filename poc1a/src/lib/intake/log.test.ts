import { DrizzleQueryError } from 'drizzle-orm'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import pino from 'pino'
import { describe, expect, it } from 'vitest'

import { metadatosError, opcionesLogger, sanearArgumentosLog, serializarError } from './log'

// Pino real (el que usa Payload, con las mismas opciones) y destino en memoria.
function crearLogger() {
  const lineas: string[] = []
  const logger = pino({ ...opcionesLogger(), name: 'payload', level: 'trace' }, { write: (linea: string) => { lineas.push(linea) } })
  return { logger, salida: () => lineas.join('') }
}

function errorDrizzle(): DrizzleQueryError {
  const causa = Object.assign(new Error('el valor SNT-causa viola la restricción'), { code: '23514', detail: 'Failing row contains (SNT-detalle)', severity: 'ERROR' })
  return new DrizzleQueryError('insert into "solicitudes" ("nombre") values ($1)', ['SNT-param', 'SNT-otro'], causa)
}

const PROHIBIDOS = ['SNT-', 'stack', 'params', 'Failed query', 'detail', 'DETAIL', 'viola']

function sinFuga(salida: string) {
  expect(salida.length).toBeGreaterThan(0)
  for (const texto of PROHIBIDOS) expect(salida, `fuga de «${texto}»`).not.toContain(texto)
}

describe('logger de Payload sin PII', () => {
  const casos: [string, (logger: pino.Logger, err: Error) => void][] = [
    ['error(err)', (l, e) => l.error(e)],
    ['error({err})', (l, e) => l.error({ err: e })],
    ['error({err, msg: err.message})', (l, e) => l.error({ err: e, msg: e.message })],
    ['error({cause: err})', (l, e) => l.error({ cause: e })],
    ["error('x', err)", (l, e) => (l.error as (...a: unknown[]) => void)('x', e)],
    ['error({error: err})', (l, e) => l.error({ error: e })],
    ["info({err}, 'texto con SNT-x')", (l, e) => l.info({ err: e }, 'texto con SNT-x')],
    ['error({err: {cause: err}})', (l, e) => l.error({ err: { cause: e } })],
    ['error({errores: [err]})', (l, e) => l.error({ errores: [e] })],
    ['error({err: <objeto con message y stack>})', (l, e) => l.error({ err: { message: e.message, stack: e.stack, params: ['SNT-p'] } }, 'SNT-m')],
    ['error({err: <cadena>})', (l) => l.error({ err: 'SNT-cadena' })],
  ]

  for (const [nombre, emitir] of casos) {
    it(`no filtra valores ni stack en logger.${nombre}`, () => {
      const { logger, salida } = crearLogger()
      emitir(logger, errorDrizzle())
      sinFuga(salida())
    })
  }

  it('conserva el nombre de la clase y el código de PostgreSQL', () => {
    const { logger, salida } = crearLogger()
    logger.error({ err: errorDrizzle() })
    const registro = JSON.parse(salida().trim()) as { err: Record<string, unknown> }
    expect(registro.err).toEqual({ name: 'DrizzleQueryError', pg_code: '23514' })
  })

  it('un Error desnudo conserva el name del logger y su clase queda en err.name', () => {
    const { logger, salida } = crearLogger()
    logger.error(errorDrizzle())
    const registro = JSON.parse(salida().trim()) as { name: string; err: Record<string, unknown> }
    expect(registro.name).toBe('payload')
    expect(registro.err).toEqual({ name: 'DrizzleQueryError', pg_code: '23514' })
  })

  it('conserva intacto el registro de evento del manejador', () => {
    const { logger, salida } = crearLogger()
    logger.info({ evento: 'intake', codigo: 'creada', duracion_ms: 1, correlacion: 'c' })
    const registro = JSON.parse(salida().trim()) as Record<string, unknown>
    expect(registro).toMatchObject({ evento: 'intake', codigo: 'creada', duracion_ms: 1, correlacion: 'c' })
    expect(registro.msg).toBeUndefined()
  })

  it('un registro de error de intake con err_name y pg_code pasa intacto', () => {
    const { logger, salida } = crearLogger()
    logger.error({ evento: 'intake', codigo: 'interno', duracion_ms: 3, correlacion: 'c', err_name: 'DrizzleQueryError', pg_code: '23514' })
    expect(JSON.parse(salida().trim())).toMatchObject({ evento: 'intake', codigo: 'interno', err_name: 'DrizzleQueryError', pg_code: '23514' })
  })

  it('el getLogger de Payload con {options} aplica nuestras opciones (NV-9)', async () => {
    const dir = path.dirname(createRequire(import.meta.url).resolve('payload'))
    const { getLogger } = await import(/* @vite-ignore */ pathToFileURL(path.join(dir, 'utilities/logger.js')).href) as { getLogger: (nombre: string, logger: unknown) => pino.Logger }
    const lineas: string[] = []
    const logger = getLogger('payload', { options: opcionesLogger(), destination: { write: (linea: string) => { lineas.push(linea) } } })
    logger.error({ err: errorDrizzle(), msg: 'SNT-msg' })
    logger.info({ evento: 'intake', codigo: 'creada' })
    sinFuga(lineas.join(''))
    expect(lineas.join('')).toContain('"evento":"intake"')
    expect(lineas.join('')).toContain('"name":"payload"')
  })

  it('no usa transporte ni pino-pretty', () => {
    const opciones = opcionesLogger() as Record<string, unknown>
    expect(opciones.transport).toBeUndefined()
    expect(JSON.stringify(Object.keys(opciones))).not.toContain('pretty')
  })
})

describe('serializarError', () => {
  it('devuelve sólo name, code y pg_code', () => {
    const conCodigo = Object.assign(new Error('SNT-x'), { code: '23514', detail: 'SNT-d', query: 'SNT-q' })
    expect(serializarError(conCodigo)).toEqual({ name: 'Error', code: '23514', pg_code: '23514' })
  })

  it('descarta nombres y códigos fuera de formato', () => {
    class Raro extends Error { code = 'SNT-no válido' }
    const valor = serializarError(new Raro('SNT-x'))
    expect(valor).toEqual({ name: 'Raro' })
  })

  it('no filtra valores no-Error', () => {
    expect(serializarError('SNT-cadena')).toEqual({ name: 'Error' })
    expect(serializarError(undefined)).toEqual({ name: 'Error' })
  })

  it('es idempotente (el serializador vuelve a ver su propia salida)', () => {
    const una = serializarError(errorDrizzle())
    expect(serializarError(una)).toEqual(una)
  })
})

describe('sanearArgumentosLog', () => {
  it('no altera argumentos sin errores', () => {
    const args = [{ evento: 'intake', codigo: 'creada' }, 'texto']
    expect(sanearArgumentosLog(args)).toEqual(args)
  })

  it('no muta los objetos recibidos', () => {
    const err = errorDrizzle()
    const objeto = { err, msg: err.message }
    sanearArgumentosLog([objeto])
    expect(objeto.err).toBe(err)
    expect(objeto.msg).toBe(err.message)
  })
})

describe('metadatosError', () => {
  it('extrae sólo err_name y pg_code', () => {
    expect(metadatosError(errorDrizzle())).toEqual({ err_name: 'DrizzleQueryError', pg_code: '23514' })
    expect(metadatosError('SNT-x')).toEqual({})
  })
})
