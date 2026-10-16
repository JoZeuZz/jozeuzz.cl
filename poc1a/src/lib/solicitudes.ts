export const ESTADOS = ['recibida', 'en_gestion', 'cerrada'] as const
export const MOTIVOS_CIERRE = ['atendida', 'descartada', 'duplicada', 'spam'] as const

type Estado = (typeof ESTADOS)[number]
type Motivo = (typeof MOTIVOS_CIERRE)[number]

export type SolicitudPublica = { nombre: unknown; contacto: unknown; tipo_equipo: unknown; descripcion: unknown; servicio: unknown }
export type DatosSolicitudPublica = { nombre: string; contacto: string; tipo_equipo: string; descripcion: string; servicio: string | undefined }
export type ResultadoValidacionSolicitud =
  | { ok: true; datos: DatosSolicitudPublica }
  | { ok: false; codigo: 'campos_no_permitidos' }
  | { ok: false; codigo: 'datos_invalidos'; campos: string[] }

const CAMPOS_PERMITIDOS = new Set(['nombre', 'contacto', 'tipo_equipo', 'descripcion', 'servicio', 'token', 'sitio_web'])
const CAMPOS_OBLIGATORIOS = [
  ['nombre', 120],
  ['contacto', 200],
  ['tipo_equipo', 120],
  ['descripcion', 4000],
] as const
const SLUG_SERVICIO = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function solicitudPublica(input: unknown): SolicitudPublica {
  const value = input as Record<string, unknown>
  return { nombre: value.nombre, contacto: value.contacto, tipo_equipo: value.tipo_equipo, descripcion: value.descripcion, servicio: value.servicio }
}

export function validarSolicitudPublica(input: unknown): ResultadoValidacionSolicitud {
  if (input === null || typeof input !== 'object') return { ok: false, codigo: 'datos_invalidos', campos: CAMPOS_OBLIGATORIOS.map(([campo]) => campo) }
  const value = input as Record<string, unknown>
  if (Object.keys(value).some((campo) => !CAMPOS_PERMITIDOS.has(campo))) return { ok: false, codigo: 'campos_no_permitidos' }

  const camposInvalidos = CAMPOS_OBLIGATORIOS
    .filter(([campo, maximo]) => {
      const contenido = value[campo]
      return typeof contenido !== 'string' || contenido.trim() === '' || contenido.includes('\u0000') || [...contenido].length > maximo
    })
    .map(([campo]) => campo)
  if (camposInvalidos.length > 0) return { ok: false, codigo: 'datos_invalidos', campos: camposInvalidos }

  const servicio = value.servicio
  if (servicio !== undefined && (typeof servicio !== 'string' || (servicio !== '' && (!SLUG_SERVICIO.test(servicio) || [...servicio].length > 80)))) {
    return { ok: false, codigo: 'datos_invalidos', campos: ['servicio'] }
  }

  return {
    ok: true,
    datos: {
      nombre: value.nombre as string,
      contacto: value.contacto as string,
      tipo_equipo: value.tipo_equipo as string,
      descripcion: value.descripcion as string,
      servicio: servicio === '' ? undefined : servicio as string | undefined,
    },
  }
}

export function validarTransicion(desde: Estado, hacia: string, motivo: unknown): { motivo_cierre: Motivo | null } {
  if (!ESTADOS.includes(hacia as Estado)) throw new Error('estado inválido')
  if (!((desde === 'recibida' && (hacia === 'en_gestion' || hacia === 'cerrada')) || (desde === 'en_gestion' && hacia === 'cerrada'))) {
    throw new Error('transición inválida')
  }
  if (hacia !== 'cerrada') {
    if (motivo != null) throw new Error('motivo sólo al cerrar')
    return { motivo_cierre: null }
  }
  if (!MOTIVOS_CIERRE.includes(motivo as Motivo)) throw new Error('motivo de cierre inválido')
  return { motivo_cierre: motivo as Motivo }
}
