import { createHmac, hkdfSync } from 'node:crypto'

export type ClavesIntake = { kid: '1'; token: Buffer; ip: Buffer }

export function derivarClaves(secretoHex: string): ClavesIntake {
  const ikm = Buffer.from(secretoHex, 'hex')
  const salt = 'jozeuzz-poc3-intake'
  return {
    kid: '1',
    token: Buffer.from(hkdfSync('sha256', ikm, salt, 'intake-token-v1', 32)),
    ip: Buffer.from(hkdfSync('sha256', ikm, salt, 'intake-ip-v1', 32)),
  }
}

function hmac(clave: Buffer, valor: string): string {
  return createHmac('sha256', clave).update(valor).digest('hex')
}

export function claveEnvio(claves: ClavesIntake, nonce: string): string {
  return hmac(claves.token, `intake-envio|${nonce}`)
}

export function claveIp(claves: ClavesIntake, normalizada: string): string {
  return hmac(claves.ip, `intake-ip|${normalizada}`)
}
