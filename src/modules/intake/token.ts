/**
 * src/modules/intake/token.ts
 *
 * Nonce firmado con HMAC-SHA256.
 * Sin dependencias externas — solo node:crypto.
 *
 * Payload versionado: { v, nonce, iat }
 * Firma cubre: claveServidor + secretoCookie + payload
 * Expiración: 30 minutos exactos (iat + 30*60*1000 <= ahora → expirado)
 * Emisión futura: iat > ahora → rechazada
 * nonceHash: SHA-256(nonce) en base64url — para persistencia sin exponer nonce
 */
import { randomBytes, createHmac, timingSafeEqual, createHash } from 'node:crypto'

const VERSION = 1
const EXPIRY_MS = 30 * 60 * 1000 // 30 minutos

// base64url sin padding
function toB64url(buf: Buffer): string {
  return buf.toString('base64url')
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s, 'base64url')
}

function hmac(claveServidor: string, secretoCookie: string, payload: string): Buffer {
  // Clave compuesta: ambos secretos deben coincidir
  const key = createHmac('sha256', claveServidor).update(secretoCookie).digest()
  return createHmac('sha256', key).update(payload).digest()
}

export interface TokenCreado {
  token: string
  nonceHash: string
  emitidoEn: number
}

export interface VerificacionOk {
  ok: true
  nonceHash: string
}

export interface VerificacionFallo {
  ok: false
  razon: string
}

export type VerificacionToken = VerificacionOk | VerificacionFallo

export function crearToken(
  claveServidor: string,
  secretoCookie: string,
  ahora: number
): TokenCreado {
  const nonce = toB64url(randomBytes(32))
  const payload = JSON.stringify({ v: VERSION, nonce, iat: ahora })
  const payloadB64 = toB64url(Buffer.from(payload))
  const sig = toB64url(hmac(claveServidor, secretoCookie, payloadB64))
  const token = `${payloadB64}.${sig}`
  const nonceHash = toB64url(createHash('sha256').update(nonce).digest())
  return { token, nonceHash, emitidoEn: ahora }
}

export function verificarToken(
  claveServidor: string,
  secretoCookie: string,
  tokenFormulario: string,
  ahora: number
): VerificacionToken {
  // Separar payload y firma
  const dot = tokenFormulario.lastIndexOf('.')
  if (dot < 1) return { ok: false, razon: 'formato inválido' }

  const payloadB64 = tokenFormulario.slice(0, dot)
  const sigRecibida = tokenFormulario.slice(dot + 1)

  // Verificar firma con timingSafeEqual — longitudes deben coincidir
  let sigEsperada: Buffer
  try {
    sigEsperada = hmac(claveServidor, secretoCookie, payloadB64)
  } catch {
    return { ok: false, razon: 'error interno' }
  }

  let sigRecibidaBuf: Buffer
  try {
    sigRecibidaBuf = fromB64url(sigRecibida)
  } catch {
    return { ok: false, razon: 'firma inválida: decodificación fallida' }
  }

  // Igualar longitudes para timingSafeEqual (evita excepción y leak de longitud)
  if (sigRecibidaBuf.length !== sigEsperada.length) {
    // Comparación dummy para tiempo constante antes de retornar
    const dummy = Buffer.alloc(sigEsperada.length)
    timingSafeEqual(dummy, sigEsperada)
    return { ok: false, razon: 'firma inválida: longitud incorrecta' }
  }

  const firmaOk = timingSafeEqual(sigRecibidaBuf, sigEsperada)
  if (!firmaOk) return { ok: false, razon: 'firma inválida' }

  // Decodificar payload
  let parsed: { v: number; nonce: string; iat: number }
  try {
    parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())
  } catch {
    return { ok: false, razon: 'payload malformado' }
  }

  if (parsed.v !== VERSION || typeof parsed.nonce !== 'string' || typeof parsed.iat !== 'number') {
    return { ok: false, razon: 'payload malformado: campos faltantes' }
  }

  // Emisión futura
  if (parsed.iat > ahora) {
    return { ok: false, razon: 'emisión futura rechazada' }
  }

  // Expiración: < 30 minutos estricto
  if (ahora - parsed.iat >= EXPIRY_MS) {
    return { ok: false, razon: 'token expirado' }
  }

  const nonceHash = toB64url(createHash('sha256').update(parsed.nonce).digest())
  return { ok: true, nonceHash }
}
