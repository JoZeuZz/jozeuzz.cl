/**
 * src/modules/intake/origen.ts
 *
 * Validación de origen/referer y extracción de IP confiable.
 * Sin dependencias externas.
 *
 * - validarOrigen: usa Origin; fallback Referer solo si Origin ausente.
 *   Malformed/foreign/absent → false (fail closed).
 * - obtenerIpConfiable: solo x-jozeuzz-client-ip (insertado por proxy).
 *   Ignora Forwarded, X-Forwarded-For y cualquier otro header.
 */

/**
 * Compara el origin de la petición contra el serverUrl conocido.
 * Retorna true solo si coinciden exactamente.
 */
export function validarOrigen(headers: Headers, serverUrl: string): boolean {
  let serverOrigin: string
  try {
    serverOrigin = new URL(serverUrl).origin
  } catch {
    return false
  }

  const origin = headers.get('origin')
  if (origin !== null && origin !== '') {
    try {
      const parsed = new URL(origin)
      return parsed.origin === serverOrigin
    } catch {
      return false
    }
  }

  // Fallback: Referer solo cuando Origin está ausente
  const referer = headers.get('referer')
  if (referer !== null && referer !== '') {
    try {
      const parsed = new URL(referer)
      return parsed.origin === serverOrigin
    } catch {
      return false
    }
  }

  // Fail closed
  return false
}

/**
 * Extrae IP del header interno x-jozeuzz-client-ip (insertado por proxy/Caddy).
 * Ignora X-Forwarded-For, Forwarded y cualquier otro header público.
 * Retorna null si el header está ausente.
 */
export function obtenerIpConfiable(headers: Headers): string | null {
  return headers.get('x-jozeuzz-client-ip')
}
