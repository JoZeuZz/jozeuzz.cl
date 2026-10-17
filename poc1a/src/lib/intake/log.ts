import type { LoggerOptions } from 'pino'

// Logs sin PII (diseño §5.1). Los errores de Payload, Drizzle y pg llevan valores del envío en `message`,
// `params`, `query`, `detail` y `stack`; pino además copia `err.message` a `msg`. Ningún error se
// registra tal cual: sólo su clase y sus códigos (`name`, `code`, `pg_code`).

export type ErrorSerializado = { name: string; code?: string; pg_code?: string }

const NOMBRE = /^[A-Za-z]{1,40}$/
const CODIGO = /^[A-Z0-9_]{1,40}$/
const CODIGO_PG = /^[0-9A-Z]{5}$/
const MENSAJE_OMITIDO = 'mensaje omitido'
const PROFUNDIDAD_MAXIMA = 4
// Claves de objetos de log que arrastran valores cuando hay un error en la llamada.
const CLAVES_CON_VALORES = new Set(['msg', 'message', 'stack', 'query', 'params', 'detail', 'where'])

const esObjeto = (valor: unknown): valor is Record<string, unknown> => typeof valor === 'object' && valor !== null
const esLiteral = (valor: object) => { const proto = Object.getPrototypeOf(valor); return proto === Object.prototype || proto === null }
const texto = (valor: unknown, patron: RegExp): string | undefined => (typeof valor === 'string' && patron.test(valor) ? valor : undefined)

/** `Error`, o un objeto con `message`/`stack` de tipo cadena (p. ej. errores de pg ya serializados). */
export function pareceError(valor: unknown): boolean {
  return valor instanceof Error || (esObjeto(valor) && (typeof valor.message === 'string' || typeof valor.stack === 'string'))
}

/** Idempotente: pino vuelve a aplicar este serializador a la salida que el hook ya sustituyó. */
export function serializarError(valor: unknown): ErrorSerializado {
  if (!esObjeto(valor)) return { name: 'Error' }
  const literal = esLiteral(valor)
  const nombre = texto(literal ? valor.name : (valor.constructor as { name?: unknown } | undefined)?.name, NOMBRE) ?? 'Error'
  const causa = esObjeto(valor.cause) ? valor.cause : undefined
  const code = texto(valor.code, CODIGO)
  const pg = texto(causa?.code, CODIGO_PG) ?? texto(valor.code, CODIGO_PG) ?? texto(valor.pg_code, CODIGO_PG)
  return { name: nombre, ...(code ? { code } : {}), ...(pg ? { pg_code: pg } : {}) }
}

/** Metadatos de un error capturado por el manejador: sólo nombre de clase y código de PostgreSQL. */
export function metadatosError(error: unknown): { err_name?: string; pg_code?: string } {
  if (!esObjeto(error)) return {}
  const nombre = texto((error.constructor as { name?: unknown } | undefined)?.name, NOMBRE)
  const pg = texto(esObjeto(error.cause) ? error.cause.code : undefined, CODIGO_PG) ?? texto(error.code, CODIGO_PG)
  return { ...(nombre ? { err_name: nombre } : {}), ...(pg ? { pg_code: pg } : {}) }
}

/** Sustituye todo valor error-like (cualquier nivel hasta PROFUNDIDAD_MAXIMA, incluidos arrays y `cause`). */
function sanearValor(valor: unknown, profundidad: number, visto: { error: boolean }): unknown {
  if (pareceError(valor)) {
    visto.error = true
    // Un error desnudo como argumento de la llamada se envolvería en la raíz del registro y pisaría `name` del logger.
    return profundidad === 0 ? { err: serializarError(valor) } : serializarError(valor)
  }
  if (profundidad >= PROFUNDIDAD_MAXIMA || !esObjeto(valor)) return valor
  if (Array.isArray(valor)) return valor.map((elemento) => sanearValor(elemento, profundidad + 1, visto))
  if (!esLiteral(valor)) return valor
  return Object.fromEntries(Object.entries(valor).map(([clave, elemento]) => [clave, sanearValor(elemento, profundidad + 1, visto)]))
}

/**
 * Argumentos de una llamada a `logger.<nivel>(…)` sin errores crudos. Si algún argumento es un error (o lleva uno
 * en cualquier nivel de un objeto o array), además se descartan las claves que arrastran valores del primer nivel
 * (`msg`, `message`, `stack`, `query`, `params`, `detail`, `where`) y toda cadena suelta pasa a «mensaje omitido».
 * Las llamadas sin errores (p. ej. el registro `evento: 'intake'`) no se alteran. No muta los argumentos recibidos.
 */
export function sanearArgumentosLog(argumentos: readonly unknown[]): unknown[] {
  const visto = { error: false }
  const saneados = argumentos.map((argumento) => sanearValor(argumento, 0, visto))
  if (!visto.error) return [...argumentos]
  return saneados.map((argumento) => {
    if (typeof argumento === 'string') return MENSAJE_OMITIDO
    if (esObjeto(argumento) && !Array.isArray(argumento)) return Object.fromEntries(Object.entries(argumento).filter(([clave]) => !CLAVES_CON_VALORES.has(clave)))
    return argumento
  })
}

/** Opciones de pino para `payload.config.ts` (`logger: { options }`): JSON a stdout, sin `pino-pretty` ni transporte. */
export function opcionesLogger(): LoggerOptions {
  return {
    serializers: { err: serializarError, error: serializarError },
    hooks: {
      logMethod(argumentos, metodo) {
        metodo.apply(this, sanearArgumentosLog(argumentos) as Parameters<typeof metodo>)
      },
    },
  }
}
