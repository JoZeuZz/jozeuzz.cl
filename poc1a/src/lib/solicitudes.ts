export const ESTADOS = ['recibida', 'en_gestion', 'cerrada'] as const
export const MOTIVOS_CIERRE = ['atendida', 'descartada', 'duplicada', 'spam'] as const

type Estado = (typeof ESTADOS)[number]
type Motivo = (typeof MOTIVOS_CIERRE)[number]

export type SolicitudPublica = { nombre: unknown; contacto: unknown; tipo_equipo: unknown; descripcion: unknown; servicio: unknown }

export function solicitudPublica(input: unknown): SolicitudPublica {
  const value = input as Record<string, unknown>
  return { nombre: value.nombre, contacto: value.contacto, tipo_equipo: value.tipo_equipo, descripcion: value.descripcion, servicio: value.servicio }
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
