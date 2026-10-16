import { describe, expect, it } from 'vitest'

import { claveEnvio, claveIp, derivarClaves } from './claves'

const secreto = 'ab'.repeat(32)

describe('claves intake', () => {
  it('deriva dos claves HKDF distintas de 32 bytes y deterministas', () => {
    const primera = derivarClaves(secreto)
    const segunda = derivarClaves(secreto)

    expect(primera.kid).toBe('1')
    expect(primera.token).toHaveLength(32)
    expect(primera.ip).toHaveLength(32)
    expect(primera.token.equals(primera.ip)).toBe(false)
    expect(primera.token.equals(Buffer.from(secreto, 'hex'))).toBe(false)
    expect(primera.token.equals(segunda.token)).toBe(true)
  })

  it('genera claves HMAC separadas en hex lowercase de 64 caracteres', () => {
    const claves = derivarClaves(secreto)
    const envio = claveEnvio(claves, 'nonce')
    const ip = claveIp(claves, '203.0.113.7')

    expect(envio).toMatch(/^[0-9a-f]{64}$/)
    expect(ip).toMatch(/^[0-9a-f]{64}$/)
    expect(envio).not.toBe(ip)
  })
})
