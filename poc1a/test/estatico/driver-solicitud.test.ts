import { describe, expect, it } from 'vitest'

import { servicioDeSolicitud } from '../../driver/servicio-solicitud.mjs'

const idPorSlug = { 'proyecto:p1': '7', 'servicio:svc-a': '11', 'servicio:svc-b': '12', 'solicitud:s1': '11' }

describe('servicioDeSolicitud (B-1)', () => {
  it('traduce el id numérico de la REST al slug aunque la semilla guarde el id como texto', () => {
    expect(servicioDeSolicitud({ servicio: 11 }, idPorSlug)).toBe('svc-a')
    expect(servicioDeSolicitud({ servicio: '12' }, idPorSlug)).toBe('svc-b')
  })

  it('sólo considera claves servicio: (un id compartido con otra colección no se confunde)', () => {
    expect(servicioDeSolicitud({ servicio: 7 }, idPorSlug)).toBe('7')
    expect(servicioDeSolicitud({ servicio: 11 }, idPorSlug)).toBe('svc-a')
    expect(servicioDeSolicitud({ servicio: 5 }, { 'solicitud:s0': 5, 'servicio:x': 6 })).toBe('5')
  })

  it('usa el slug de un servicio poblado, devuelve null sin servicio y el id si no hay mapeo', () => {
    expect(servicioDeSolicitud({ servicio: { id: 11, slug: 'svc-a' } }, idPorSlug)).toBe('svc-a')
    expect(servicioDeSolicitud({ servicio: null }, idPorSlug)).toBeNull()
    expect(servicioDeSolicitud({}, idPorSlug)).toBeNull()
    expect(servicioDeSolicitud({ servicio: 99 }, idPorSlug)).toBe('99')
  })
})
