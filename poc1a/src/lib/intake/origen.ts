export function origenValido(headers: Headers, origenPublico: string): boolean {
  const origin = headers.get('origin')
  if (origin !== null) return origin !== 'null' && origin === origenPublico

  const referer = headers.get('referer')
  if (!referer) return false
  try {
    return new URL(referer).origin === origenPublico
  } catch {
    return false
  }
}
