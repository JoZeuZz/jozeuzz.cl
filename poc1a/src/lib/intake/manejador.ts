import { timingSafeEqual } from 'node:crypto'

import configPayload from '@payload-config'
import { getPayload } from 'payload'

import { resolverServicioActivo } from '@/lib/publico'
import { validarSolicitudPublica } from '@/lib/solicitudes'

import { claveEnvio, claveIp, derivarClaves } from './claves'
import { leerCuerpoIntake, ErrorCuerpoIntake } from './cuerpo'
import { cargarConfigIntake } from './config'
import { ErrorIntake, type CodigoIntake } from './errores'
import { respuestaFormulario } from './formulario'
import { normalizarIp } from './ip'
import { contarIntento, schemaIntake } from './limites'
import { origenValido } from './origen'
import { persistirIntake } from './persistir'
import { purgarIntake } from './purga'
import { verificarToken } from './token'

const camposPermitidos = new Set(['nombre', 'contacto', 'tipo_equipo', 'descripcion', 'servicio'])
type CodigoRespuesta = CodigoIntake | 'demasiados_intentos' | 'limite_creaciones'
const estado = (codigo: CodigoRespuesta) => ({ ip_invalida: 400, tipo_no_soportado: 415, origen_invalido: 403, cuerpo_demasiado_grande: 413, cuerpo_invalido: 400, csrf_invalido: 403, envio_rechazado: 400, campos_no_permitidos: 400, datos_invalidos: 400, demasiados_intentos: 429, limite_creaciones: 429, interno: 500 })[codigo]

function cookieToken(headers: Headers): string | null {
  const encontrados = (headers.get('cookie') ?? '').split(';').map((parte) => parte.trim()).filter((parte) => parte.startsWith('__Host-intake='))
  if (encontrados.length !== 1) return null
  const valor = encontrados[0].slice('__Host-intake='.length)
  return valor && !valor.includes('=') ? valor : null
}

function csrfValido(cuerpo: Record<string, unknown>, cookie: string | null, config: ReturnType<typeof cargarConfigIntake>): { n: string; e: number } | null {
  if (typeof cuerpo.token !== 'string' || !cookie || cuerpo.token.length !== cookie.length) return null
  const izquierda = Buffer.from(cuerpo.token)
  const derecha = Buffer.from(cookie)
  if (!timingSafeEqual(izquierda, derecha)) return null
  return verificarToken(config, cuerpo.token, Date.now())
}

function respuestaJson(status: number, cuerpo: object, correlacion: string): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-correlacion': correlacion } })
}

function metadatosError(error: unknown): { err_name?: string; pg_code?: string } {
  const objeto = error && typeof error === 'object' ? error as { constructor?: { name?: unknown }; code?: unknown; cause?: { code?: unknown } } : undefined
  const nombre = objeto?.constructor?.name
  const pg = objeto?.cause?.code ?? objeto?.code
  return {
    ...(typeof nombre === 'string' && /^[A-Za-z]{1,40}$/.test(nombre) ? { err_name: nombre } : {}),
    ...(typeof pg === 'string' && /^[0-9A-Z]{5}$/.test(pg) ? { pg_code: pg } : {}),
  }
}

async function respuestaError(codigo: CodigoRespuesta, campos: string[] | undefined, tipo: 'application/json' | 'application/x-www-form-urlencoded', correlacion: string, config: ReturnType<typeof cargarConfigIntake>, reintentarEnS?: number): Promise<Response> {
  const http = estado(codigo)
  if (tipo === 'application/x-www-form-urlencoded') {
    const formulario = await respuestaFormulario(config, { codigo, campos })
    const headers = new Headers(formulario.headers)
    headers.set('x-correlacion', correlacion)
    if (reintentarEnS) headers.set('retry-after', String(Math.max(1, reintentarEnS)))
    return new Response(formulario.body, { status: http, headers })
  }
  const respuesta = respuestaJson(http, codigo === 'datos_invalidos' ? { error: codigo, campos: (campos ?? []).filter((campo) => camposPermitidos.has(campo)) } : { error: codigo }, correlacion)
  if (reintentarEnS) respuesta.headers.set('retry-after', String(Math.max(1, reintentarEnS)))
  return respuesta
}

export async function manejarIntake(request: Request): Promise<Response> {
  const inicio = Date.now()
  const correlacion = crypto.randomUUID()
  let codigo: CodigoIntake | 'creada' | 'duplicada' | 'limite' = 'interno'
  let payload: Awaited<ReturnType<typeof getPayload>> | undefined
  let config: ReturnType<typeof cargarConfigIntake> | undefined
  let metadatos: { err_name?: string; pg_code?: string } = {}
  try {
    config = cargarConfigIntake(process.env)
    payload = await getPayload({ config: configPayload })
    const ip = normalizarIp(request.headers.get('x-real-ip'))
    if (!ip) throw new ErrorIntake('ip_invalida', 400)
    const claves = derivarClaves(config.secretoHex)
    const drizzle = payload.db.drizzle as unknown as { execute: (consulta: unknown) => Promise<{ rows: { n: number; reintentar_en_s: number }[] }> }
    const schema = schemaIntake(payload.db)
    const limiteIntentos = await contarIntento(drizzle, claveIp(claves, ip), schema)
    const logger = payload.logger
    void Promise.resolve(purgarIntake(drizzle, () => logger.error({ evento: 'intake_purga' }), schema)).catch(() => undefined)
    if (!limiteIntentos.permitido) {
      codigo = 'limite'
      return await respuestaError('demasiados_intentos', undefined, request.headers.get('content-type') === 'application/x-www-form-urlencoded' ? 'application/x-www-form-urlencoded' : 'application/json', correlacion, config, limiteIntentos.reintentarEnS)
    }
    const tipo = request.headers.get('content-type')
    if (tipo !== 'application/json' && tipo !== 'application/x-www-form-urlencoded') throw new ErrorIntake('tipo_no_soportado', 415)
    if (!origenValido(request.headers, config.origenPublico)) throw new ErrorIntake('origen_invalido', 403)
    let cuerpo: Record<string, unknown>
    try { cuerpo = await leerCuerpoIntake(request, tipo) } catch (error) {
      if (error instanceof ErrorCuerpoIntake) throw new ErrorIntake(error.codigo, estado(error.codigo))
      throw error
    }
    const token = csrfValido(cuerpo, cookieToken(request.headers), config)
    if (!token) throw new ErrorIntake('csrf_invalido', 403)
    if (cuerpo.sitio_web !== undefined && cuerpo.sitio_web !== '') throw new ErrorIntake('envio_rechazado', 400)
    if (Date.now() - token.e < config.tiempoMinimoMs) throw new ErrorIntake('envio_rechazado', 400)
    const validacion = validarSolicitudPublica(cuerpo)
    if (!validacion.ok) throw new ErrorIntake(validacion.codigo, estado(validacion.codigo), 'campos' in validacion ? validacion.campos : undefined)
    const servicio = validacion.datos.servicio === undefined ? undefined : await resolverServicioActivo(validacion.datos.servicio)
    if (validacion.datos.servicio !== undefined && servicio === null) throw new ErrorIntake('datos_invalidos', 400, ['servicio'])
    const resultado = await persistirIntake(payload, { datos: { ...validacion.datos, servicio: servicio ?? undefined }, claveEnvio: claveEnvio(claves, token.n), claveIp: claveIp(claves, ip) })
    codigo = resultado.tipo
    if (resultado.tipo === 'limite') return await respuestaError('limite_creaciones', undefined, tipo, correlacion, config, resultado.reintentarEnS)
    if (tipo === 'application/x-www-form-urlencoded') return new Response(null, { status: 303, headers: { location: '/solicitar?estado=recibida', 'cache-control': 'no-store', 'x-correlacion': correlacion } })
    return respuestaJson(201, { ok: true }, correlacion)
  } catch (error) {
    const intake = error instanceof ErrorIntake ? error : new ErrorIntake('interno', 500)
    codigo = intake.codigo
    metadatos = metadatosError(error)
    const tipo = request.headers.get('content-type') === 'application/x-www-form-urlencoded' ? 'application/x-www-form-urlencoded' : 'application/json'
    if (!config) return respuestaJson(500, { error: 'interno' }, correlacion)
    return respuestaError(intake.codigo, intake.campos, tipo, correlacion, config)
  } finally {
    if (payload) payload.logger[codigo === 'interno' ? 'error' : 'info']({ evento: 'intake', codigo, duracion_ms: Date.now() - inicio, correlacion, ...metadatos })
  }
}
