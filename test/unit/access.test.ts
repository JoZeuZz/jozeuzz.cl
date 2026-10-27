import { describe, expect, it } from 'vitest'
import { servicioActivoPorGatewayOAdmin, soloAdmin, usuarioPropio } from '@/modules/identity/access'

describe('acceso', () => {
  it('niega anónimo y permite admin autenticado', () => {
    expect(soloAdmin({ req: { user: null } } as never)).toBe(false)
    expect(soloAdmin({ req: { user: { collection: 'usuarios' } } } as never)).toBe(true)
  })

  it('cierra canal genérico y permite gateway con capacidad interna', () => {
    expect(servicioActivoPorGatewayOAdmin({ req: { user: null, context: {} } } as never)).toBe(false)
    expect(usuarioPropio({ req: { user: { id: 'u1', collection: 'usuarios' } }, id: 'u2' } as never)).toBe(false)
  })
})
