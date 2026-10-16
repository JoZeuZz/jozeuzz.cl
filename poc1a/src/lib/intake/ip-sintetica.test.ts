import { describe, expect, it } from 'vitest'

import { ipSintetica } from '../../../driver/ip-sintetica.mjs'
import { normalizarIp } from './ip'

describe('ipSintetica', () => {
  it('mapea N a IPv6 de documentación con /64 distinto', () => {
    expect(ipSintetica('origen-sintetico-1')).toBe('2001:db8:0:1::1')
    expect(ipSintetica('origen-sintetico-2')).toBe('2001:db8:0:2::1')
    expect(normalizarIp(ipSintetica('origen-sintetico-1'))).not.toBe(normalizarIp(ipSintetica('origen-sintetico-2')))
  })

  it('asigna /64 únicos dentro de 2001:db8::/32 para 1..20000 y límite', () => {
    const prefijos = new Set<string>()
    for (let n = 1; n <= 20_000; n += 1) prefijos.add(normalizarIp(ipSintetica(`origen-sintetico-${n}`))!)
    const limite = normalizarIp(ipSintetica('origen-sintetico-4294901759'))!

    expect(prefijos).toHaveLength(20_000)
    expect(limite).toBe('2001:db8:fffe:ffff::/64')
    expect([...prefijos, limite].every((ip) => ip.startsWith('2001:db8:'))).toBe(true)
  })

  it('es determinista para otros orígenes y rechaza índices fuera de rango', () => {
    expect(ipSintetica('https://otro.example')).toBe(ipSintetica('https://otro.example'))
    expect(() => ipSintetica('origen-sintetico-0')).toThrow()
    expect(() => ipSintetica('origen-sintetico-4294901760')).toThrow()
  })
})
