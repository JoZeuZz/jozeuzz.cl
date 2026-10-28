import type { DatosSolicitudValidada, ResultadoValidacion } from './tipos'

const camposPublicos = ['nombre', 'contacto', 'tipoEquipo', 'descripcion', 'servicio'] as const
const claves = new Set([...camposPublicos, 'website', 'token'])

function texto(valor: unknown, colapsar: boolean): string | null {
  if (typeof valor !== 'string') return null
  const normalizado = valor.normalize('NFC').trim()
  return colapsar ? normalizado.replace(/[\t\f\v ]+/g, ' ') : normalizado
}

function dentro(valor: string | null, min: number, max: number): valor is string {
  return valor !== null && valor.length >= min && valor.length <= max
}

export function validarSolicitud(entrada: unknown): ResultadoValidacion {
  if (entrada === null || typeof entrada !== 'object' || Array.isArray(entrada)) return { ok: false, campos: { nombre: 'nombre inválido' } }
  const datos = entrada as Record<string, unknown>
  if (Object.keys(datos).some((clave) => !claves.has(clave)) || datos.website !== '') return { ok: false, campos: { nombre: 'nombre inválido' } }

  const nombre = texto(datos.nombre, true)
  const contacto = texto(datos.contacto, true)
  const tipoEquipo = texto(datos.tipoEquipo, true)
  const descripcion = texto(datos.descripcion, false)
  const servicio = datos.servicio === undefined ? undefined : texto(datos.servicio, true)
  const campos: Record<string, string> = {}
  if (!dentro(nombre, 2, 120)) campos.nombre = 'nombre inválido'
  if (!dentro(contacto, 3, 200)) campos.contacto = 'contacto inválido'
  if (!dentro(tipoEquipo, 2, 120)) campos.tipoEquipo = 'tipoEquipo inválido'
  if (!dentro(descripcion, 20, 4000)) campos.descripcion = 'descripcion inválida'
  if (servicio !== undefined && !dentro(servicio, 1, 120)) campos.servicio = 'servicio inválido'
  if (typeof datos.token !== 'string' || datos.token.length === 0) campos.nombre = 'nombre inválido'
  if (Object.keys(campos).length > 0 || nombre === null || contacto === null || tipoEquipo === null || descripcion === null || servicio === null || typeof datos.token !== 'string') return { ok: false, campos }

  const validados: DatosSolicitudValidada = servicio === undefined
    ? { nombre, contacto, tipoEquipo, descripcion }
    : { nombre, contacto, tipoEquipo, descripcion, servicio }
  return { ok: true, datos: validados, token: datos.token }
}
