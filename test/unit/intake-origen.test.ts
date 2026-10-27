/**
 * test/unit/intake-origen.test.ts
 * RED — todos deben fallar por módulo faltante.
 *
 * Cubre:
 * - Own Origin → true
 * - Foreign Origin → false
 * - Malformed Origin → false (fail closed)
 * - Absent Origin con own Referer → true (fallback)
 * - Absent Origin con foreign Referer → false
 * - Absent Origin con absent Referer → false (fail closed)
 * - Forwarded / X-Forwarded-For ignorados por validarOrigen
 * - obtenerIpConfiable: solo x-jozeuzz-client-ip
 * - obtenerIpConfiable: ausente → null
 * - obtenerIpConfiable: Forwarded ignorado
 * - obtenerIpConfiable: X-Forwarded-For ignorado
 */
import { describe, expect, it } from 'vitest'
import { validarOrigen, obtenerIpConfiable } from '@/modules/intake/origen'

const SERVER = 'https://jozeuzz.cl'

describe('validarOrigen', () => {
  it('own Origin → true', () => {
    const h = new Headers({ origin: 'https://jozeuzz.cl' })
    expect(validarOrigen(h, SERVER)).toBe(true)
  })

  it('own Origin con path → true (solo origin usado)', () => {
    const h = new Headers({ origin: 'https://jozeuzz.cl' })
    expect(validarOrigen(h, SERVER)).toBe(true)
  })

  it('foreign Origin → false', () => {
    const h = new Headers({ origin: 'https://evil.example.com' })
    expect(validarOrigen(h, SERVER)).toBe(false)
  })

  it('malformed Origin → false (fail closed)', () => {
    const h = new Headers({ origin: 'not-a-url' })
    expect(validarOrigen(h, SERVER)).toBe(false)
  })

  it('empty Origin → false (fail closed)', () => {
    const h = new Headers({ origin: '' })
    expect(validarOrigen(h, SERVER)).toBe(false)
  })

  it('absent Origin con own Referer → true (fallback)', () => {
    const h = new Headers({ referer: 'https://jozeuzz.cl/servicios/solicitar' })
    expect(validarOrigen(h, SERVER)).toBe(true)
  })

  it('absent Origin con foreign Referer → false', () => {
    const h = new Headers({ referer: 'https://evil.example.com/page' })
    expect(validarOrigen(h, SERVER)).toBe(false)
  })

  it('absent Origin con malformed Referer → false (fail closed)', () => {
    const h = new Headers({ referer: 'not-a-url' })
    expect(validarOrigen(h, SERVER)).toBe(false)
  })

  it('absent Origin y absent Referer → false (fail closed)', () => {
    const h = new Headers()
    expect(validarOrigen(h, SERVER)).toBe(false)
  })

  it('Forwarded header presente no afecta validarOrigen (ignorado)', () => {
    // Con origin propio, Forwarded no debe causar rechazo
    const h = new Headers({
      origin: 'https://jozeuzz.cl',
      forwarded: 'for=1.2.3.4;host=evil.com',
    })
    expect(validarOrigen(h, SERVER)).toBe(true)
  })
})

describe('obtenerIpConfiable', () => {
  it('devuelve x-jozeuzz-client-ip si presente', () => {
    const h = new Headers({ 'x-jozeuzz-client-ip': '10.0.0.1' })
    expect(obtenerIpConfiable(h)).toBe('10.0.0.1')
  })

  it('ausente → null', () => {
    const h = new Headers()
    expect(obtenerIpConfiable(h)).toBeNull()
  })

  it('X-Forwarded-For ignorado → null si no hay x-jozeuzz-client-ip', () => {
    const h = new Headers({ 'x-forwarded-for': '1.2.3.4' })
    expect(obtenerIpConfiable(h)).toBeNull()
  })

  it('Forwarded ignorado → null', () => {
    const h = new Headers({ forwarded: 'for=1.2.3.4' })
    expect(obtenerIpConfiable(h)).toBeNull()
  })

  it('solo x-jozeuzz-client-ip cuenta incluso si XFF presente', () => {
    const h = new Headers({
      'x-jozeuzz-client-ip': '10.0.0.2',
      'x-forwarded-for': '9.9.9.9',
    })
    expect(obtenerIpConfiable(h)).toBe('10.0.0.2')
  })
})
