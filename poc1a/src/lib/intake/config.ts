export class ErrorConfigIntake extends Error {
  constructor(readonly codigo: string) {
    super(codigo)
    this.name = 'ErrorConfigIntake'
  }
}

export type ConfigIntake = {
  secretoHex: string
  origenPublico: string
  tiempoMinimoMs: number
}

export function cargarConfigIntake(env: Record<string, string | undefined>): ConfigIntake {
  const secretoHex = env.INTAKE_SECRETO
  if (!secretoHex || !/^[0-9a-fA-F]{64,}$/.test(secretoHex) || secretoHex.length % 2 !== 0 || secretoHex === env.PAYLOAD_SECRET) throw new ErrorConfigIntake('secreto_invalido')

  const origenPublico = env.INTAKE_ORIGEN_PUBLICO
  let url: URL
  try {
    url = new URL(origenPublico ?? '')
  } catch {
    throw new ErrorConfigIntake('origen_invalido')
  }
  if (!origenPublico || url.protocol !== 'https:' || url.origin !== origenPublico) throw new ErrorConfigIntake('origen_invalido')

  const tiempo = env.INTAKE_TIEMPO_MINIMO_MS ?? '3000'
  if (!/^(0|[1-9][0-9]*)$/.test(tiempo)) throw new ErrorConfigIntake('tiempo_minimo_invalido')
  const tiempoMinimoMs = Number(tiempo)
  if (!Number.isInteger(tiempoMinimoMs) || tiempoMinimoMs > 60_000 || (env.NODE_ENV === 'production' && tiempoMinimoMs === 0)) throw new ErrorConfigIntake('tiempo_minimo_invalido')

  return { secretoHex, origenPublico, tiempoMinimoMs }
}
