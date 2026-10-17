export class ErrorCuerpoIntake extends Error {
  constructor(readonly codigo: 'cuerpo_demasiado_grande' | 'cuerpo_invalido') {
    super(codigo)
    this.name = 'ErrorCuerpoIntake'
  }
}

export const MAX_CUERPO_BYTES = 32_768

async function bytesDe(request: Request): Promise<Uint8Array> {
  const largo = request.headers.get('content-length')
  if (largo !== null && (!/^[0-9]+$/.test(largo) || Number(largo) > MAX_CUERPO_BYTES)) throw new ErrorCuerpoIntake(largo !== null && /^[0-9]+$/.test(largo) ? 'cuerpo_demasiado_grande' : 'cuerpo_invalido')
  if (!request.body) return new Uint8Array()
  const reader = request.body.getReader()
  const partes: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const siguiente = await reader.read()
      if (siguiente.done) break
      total += siguiente.value.byteLength
      if (total > MAX_CUERPO_BYTES) {
        await reader.cancel()
        throw new ErrorCuerpoIntake('cuerpo_demasiado_grande')
      }
      partes.push(siguiente.value)
    }
  } catch (error) {
    if (error instanceof ErrorCuerpoIntake) throw error
    throw new ErrorCuerpoIntake('cuerpo_invalido')
  }
  const salida = new Uint8Array(total)
  let offset = 0
  for (const parte of partes) { salida.set(parte, offset); offset += parte.byteLength }
  return salida
}

export async function leerCuerpoIntake(request: Request, tipo: 'application/json' | 'application/x-www-form-urlencoded'): Promise<Record<string, unknown>> {
  let texto: string
  try { texto = new TextDecoder('utf-8', { fatal: true }).decode(await bytesDe(request)) } catch (error) {
    if (error instanceof ErrorCuerpoIntake) throw error
    throw new ErrorCuerpoIntake('cuerpo_invalido')
  }
  if (tipo === 'application/json') {
    try {
      const valor: unknown = JSON.parse(texto)
      if (valor === null || typeof valor !== 'object' || Array.isArray(valor) || Object.getPrototypeOf(valor) !== Object.prototype) throw new Error()
      return valor as Record<string, unknown>
    } catch { throw new ErrorCuerpoIntake('cuerpo_invalido') }
  }
  const parametros = new URLSearchParams(texto)
  const salida: Record<string, unknown> = Object.create(null)
  for (const [clave, valor] of parametros) {
    if (Object.hasOwn(salida, clave)) throw new ErrorCuerpoIntake('cuerpo_invalido')
    salida[clave] = valor
  }
  return salida
}
