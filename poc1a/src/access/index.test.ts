import { describe, expect, it } from 'vitest'

import { activoOAdmin, esAdmin, nadie, publicadoOAdmin, soloAdmin, soloAdminCampo } from './index'

const admin = { collection: 'users', id: 1 }
const otro = { collection: 'clientes', id: 2 }
const args = (user: unknown) => ({ req: { user } }) as never

describe('esAdmin', () => {
  it('sólo acepta usuarios de la colección users', () => {
    expect(esAdmin(admin)).toBe(true)
    expect(esAdmin(otro)).toBe(false)
    expect(esAdmin(null)).toBe(false)
    expect(esAdmin(undefined)).toBe(false)
    expect(esAdmin({})).toBe(false)
  })
})

describe('soloAdmin y soloAdminCampo', () => {
  for (const [nombre, fn] of [['soloAdmin', soloAdmin], ['soloAdminCampo', soloAdminCampo]] as const) {
    it(`${nombre}: sólo el admin`, () => {
      expect(fn(args(admin))).toBe(true)
      expect(fn(args(null))).toBe(false)
      expect(fn(args(otro))).toBe(false)
    })
  }
})

describe('nadie', () => {
  it('deniega incluso al admin', () => {
    expect(nadie(args(admin))).toBe(false)
  })
})

describe('publicadoOAdmin', () => {
  it('admin: true; anónimo y otras colecciones: filtro por publicado', () => {
    expect(publicadoOAdmin(args(admin))).toBe(true)
    expect(publicadoOAdmin(args(null))).toEqual({ _status: { equals: 'published' } })
    expect(publicadoOAdmin(args(otro))).toEqual({ _status: { equals: 'published' } })
  })
})

describe('activoOAdmin', () => {
  it('admin: true; anónimo y otras colecciones: filtro por activo', () => {
    expect(activoOAdmin(args(admin))).toBe(true)
    expect(activoOAdmin(args(null))).toEqual({ activo: { equals: true } })
    expect(activoOAdmin(args(otro))).toEqual({ activo: { equals: true } })
  })
})
