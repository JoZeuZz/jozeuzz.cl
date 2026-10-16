export const ESTADOS = ['recibida', 'en_gestion', 'cerrada'] as const
export const MOTIVOS_CIERRE = ['atendida', 'descartada', 'duplicada', 'spam'] as const

type Estado = (typeof ESTADOS)[number]
type Motivo = (typeof MOTIVOS_CIERRE)[number]

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
