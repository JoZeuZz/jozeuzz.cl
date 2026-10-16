import { describe, expect, it } from 'vitest'

import { normalizarIp } from './ip'

describe('normalizarIp', () => {
  it('conserva IPv4 y convierte IPv4-mapped IPv6', () => {
    expect(normalizarIp('203.0.113.7')).toBe('203.0.113.7')
    expect(normalizarIp('::ffff:203.0.113.7')).toBe('203.0.113.7')
  })

  it('canoniza IPv6 a su prefijo /64', () => {
    expect(normalizarIp('2001:db8:0000:0001:aaaa:bbbb:cccc:dddd')).toBe('2001:db8:0:1::/64')
    expect(normalizarIp('2001:db8:0:1::2')).toBe('2001:db8:0:1::/64')
  })

  it.each([null, '', '1.2.3.4, 5.6.7.8', 'fe80::1%eth0', 'invalida'])('rechaza IP inválida: %s', (ip) => {
    expect(normalizarIp(ip)).toBeNull()
  })
})
