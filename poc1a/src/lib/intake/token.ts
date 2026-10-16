import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

import { derivarClaves } from './claves'
import type { ConfigIntake } from './config'

export const TOKEN_TTL_MS = 7_200_000
const FUTURO_MAXIMO_MS = 5_000

type CuerpoToken = { v: 1; k: '1'; n: string; e: number; x: number }

function firmar(clave: Buffer, parte: string): string {
  return createHmac('sha256', clave).update(`intake-token|${parte}`).digest('base64url')
}

export function emitirToken(config: ConfigIntake, ahora: number): string {
  const claves = derivarClaves(config.secretoHex)
  const cuerpo: CuerpoToken = { v: 1, k: claves.kid, n: randomBytes(16).toString('base64url'), e: ahora, x: ahora + TOKEN_TTL_MS }
  const parte = Buffer.from(JSON.stringify(cuerpo)).toString('base64url')
  return `${parte}.${firmar(claves.token, parte)}`
}

function esNonceValido(nonce: unknown): nonce is string {
  if (typeof nonce !== 'string' || !/^[A-Za-z0-9_-]+$/.test(nonce)) return false
  const bytes = Buffer.from(nonce, 'base64url')
  return bytes.length === 16 && bytes.toString('base64url') === nonce
}

export function verificarToken(config: ConfigIntake, token: string, ahora: number): { n: string; e: number } | null {
  if (typeof token !== 'string' || token.length > 512) return null
  const partes = token.split('.')
  if (partes.length !== 2 || !partes[0] || !partes[1] || !/^[A-Za-z0-9_-]+$/.test(partes[0]) || !/^[A-Za-z0-9_-]+$/.test(partes[1])) return null

  const claves = derivarClaves(config.secretoHex)
  const firma = Buffer.from(partes[1], 'base64url')
  const esperada = Buffer.from(firmar(claves.token, partes[0]), 'base64url')
  if (firma.length !== esperada.length || !timingSafeEqual(firma, esperada)) return null

  let cuerpo: unknown
  try {
    cuerpo = JSON.parse(Buffer.from(partes[0], 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (!cuerpo || typeof cuerpo !== 'object') return null
  const { v, k, n, e, x } = cuerpo as Partial<CuerpoToken>
  if (v !== 1 || k !== claves.kid || !esNonceValido(n) || typeof e !== 'number' || typeof x !== 'number' || !Number.isSafeInteger(e) || !Number.isSafeInteger(x)) return null
  if (x - e !== TOKEN_TTL_MS || e > ahora + FUTURO_MAXIMO_MS || ahora >= x) return null
  return { n, e }
}
