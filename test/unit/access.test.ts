import { describe, expect, it } from 'vitest'
import { soloAdmin, usuarioPropio } from '@/modules/identity/access'
import { servicioActivoPorGateway } from '@/modules/catalog/publico'

describe('acceso', () => {
  it('niega anónimo y permite admin autenticado', () => {
    expect(soloAdmin({ req: { user: null } } as never)).toBe(false)
    expect(soloAdmin({ req: { user: { collection: 'usuarios' } } } as never)).toBe(true)
  })

  it('cierra canal genérico: servicioActivoPorGateway sin capability retorna false', () => {
    expect(servicioActivoPorGateway({ req: { user: null, context: {} } } as never)).toBe(false)
    expect(usuarioPropio({ req: { user: { id: 'u1', collection: 'usuarios' } }, id: 'u2' } as never)).toBe(false)
  })
})
