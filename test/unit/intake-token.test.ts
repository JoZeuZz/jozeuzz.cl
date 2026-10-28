/**
 * test/unit/intake-token.test.ts
 * RED — todos deben fallar por módulo faltante.
 *
 * Cubre:
 * - Token válido: estructura, campos, nonceHash
 * - Verificación válida dentro de 30 minutos
 * - Expiración exacta a los 30 minutos (1ms después falla)
 * - Emisión futura rechazada
 * - Firma modificada rechazada
 * - Cookie A / token A presentado con cookie B rechazado
 * - timingSafeEqual: longitudes distintas no lanzan
 * - base64url sin padding (sin = al final)
 * - nonceHash es SHA-256 del nonce en base64url
 */
import { describe, expect, it } from 'vitest'
import { crearToken, verificarToken } from '@/modules/intake/token'

const CLAVE = 'clave-servidor-test-32bytesxxxxxxx'
const COOKIE_A = 'cookie-secret-a-test-32bytesxxx'
const COOKIE_B = 'cookie-secret-b-test-32bytesxxx'
const AHORA = 1_000_000_000_000 // epoch ms fijo

describe('crearToken', () => {
  it('devuelve token, nonceHash y emitidoEn', () => {
    const r = crearToken(CLAVE, COOKIE_A, AHORA)
    expect(typeof r.token).toBe('string')
    expect(typeof r.nonceHash).toBe('string')
    expect(r.emitidoEn).toBe(AHORA)
  })

  it('token es base64url sin padding (sin =) — formato payload.sig', () => {
    const { token } = crearToken(CLAVE, COOKIE_A, AHORA)
    expect(token).not.toMatch(/=/)
    // Formato: payloadB64url.sigB64url — separador es punto, cada parte es base64url
    const parts = token.split('.')
    expect(parts).toHaveLength(2)
    for (const part of parts) {
      expect(part).toMatch(/^[A-Za-z0-9_-]+$/)
    }
  })

  it('nonceHash es base64url sin padding', () => {
    const { nonceHash } = crearToken(CLAVE, COOKIE_A, AHORA)
    expect(nonceHash).not.toMatch(/=/)
    expect(nonceHash).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('dos tokens con el mismo reloj difieren (nonce aleatorio)', () => {
    const a = crearToken(CLAVE, COOKIE_A, AHORA)
    const b = crearToken(CLAVE, COOKIE_A, AHORA)
    expect(a.token).not.toBe(b.token)
    expect(a.nonceHash).not.toBe(b.nonceHash)
  })
})

describe('verificarToken — casos válidos', () => {
  it('verifica token recién emitido (ok: true)', () => {
    const { token } = crearToken(CLAVE, COOKIE_A, AHORA)
    const r = verificarToken(CLAVE, COOKIE_A, token, AHORA + 1000)
    expect(r.ok).toBe(true)
  })

  it('verifica token a los 29m59s (ok: true)', () => {
    const { token } = crearToken(CLAVE, COOKIE_A, AHORA)
    const treintaMenosUno = 29 * 60 * 1000 + 59 * 1000
    const r = verificarToken(CLAVE, COOKIE_A, token, AHORA + treintaMenosUno)
    expect(r.ok).toBe(true)
  })

  it('verifica exactamente a los 30m (expirado)', () => {
    const { token } = crearToken(CLAVE, COOKIE_A, AHORA)
    const treinta = 30 * 60 * 1000
    const r = verificarToken(CLAVE, COOKIE_A, token, AHORA + treinta)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.razon).toMatch(/expir/i)
  })

  it('verifica 1ms después de 30m (expirado)', () => {
    const { token } = crearToken(CLAVE, COOKIE_A, AHORA)
    const r = verificarToken(CLAVE, COOKIE_A, token, AHORA + 30 * 60 * 1000 + 1)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.razon).toMatch(/expir/i)
  })
})

describe('verificarToken — rechazos', () => {
  it('emisión futura rechazada', () => {
    const { token } = crearToken(CLAVE, COOKIE_A, AHORA + 5000)
    const r = verificarToken(CLAVE, COOKIE_A, token, AHORA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.razon).toMatch(/futur/i)
  })

  it('firma modificada rechazada', () => {
    const { token } = crearToken(CLAVE, COOKIE_A, AHORA)
    const tampered = token.slice(0, -4) + 'XXXX'
    const r = verificarToken(CLAVE, COOKIE_A, tampered, AHORA + 1000)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.razon).toMatch(/firma|invalid/i)
  })

  it('cookie A / token A → cookie B: rechazado', () => {
    const { token } = crearToken(CLAVE, COOKIE_A, AHORA)
    const r = verificarToken(CLAVE, COOKIE_B, token, AHORA + 1000)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.razon).toMatch(/firma|invalid/i)
  })

  it('payload malformado rechazado', () => {
    const r = verificarToken(CLAVE, COOKIE_A, 'no-es-base64url-valido!!!', AHORA)
    expect(r.ok).toBe(false)
  })

  it('token vacío rechazado', () => {
    const r = verificarToken(CLAVE, COOKIE_A, '', AHORA)
    expect(r.ok).toBe(false)
  })

  it('longitudes distintas no lanzan (timingSafeEqual seguro)', () => {
    // token muy corto no debe lanzar excepción
    expect(() => verificarToken(CLAVE, COOKIE_A, 'abc', AHORA)).not.toThrow()
    const r = verificarToken(CLAVE, COOKIE_A, 'abc', AHORA)
    expect(r.ok).toBe(false)
  })
})

describe('verificarToken — nonceHash en resultado ok', () => {
  it('devuelve nonceHash en resultado ok', () => {
    const { token } = crearToken(CLAVE, COOKIE_A, AHORA)
    const r = verificarToken(CLAVE, COOKIE_A, token, AHORA + 1000)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(typeof r.nonceHash).toBe('string')
      expect(r.nonceHash).toMatch(/^[A-Za-z0-9_-]+$/)
    }
  })
})
