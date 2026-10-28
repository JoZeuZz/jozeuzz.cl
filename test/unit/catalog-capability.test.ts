/**
 * Tests: confinamiento de capability catálogo
 *
 * Verifica que:
 * 1. contextoGatewayCatalogo NO está exportado desde identity/access
 * 2. El módulo catalog/publico NO exporta factory/símbolo interno
 * 3. Un contexto externo fabricado manualmente no puede activar el filtro activo
 * 4. Admin sí puede leer (Access retorna true)
 */
import { describe, expect, it } from 'vitest'
import { servicioActivoPorGateway } from '@/modules/catalog/publico'

describe('confinamiento capability catálogo', () => {
  it('identity/access NO exporta contextoGatewayCatalogo', async () => {
    const mod = await import('@/modules/identity/access')
    expect('contextoGatewayCatalogo' in mod).toBe(false)
  })

  it('catalog/publico NO exporta factory de capability ni símbolo', async () => {
    const mod = await import('@/modules/catalog/publico')
    const exports = Object.keys(mod)
    expect(exports).toContain('listarServiciosPublicos')
    expect(exports).toContain('servicioActivoPorGateway')
    // No debe exportar helpers internos de capability
    expect(exports).not.toContain('contextoGatewayCatalogo')
    expect(exports).not.toContain('crearContextoGateway')
    expect(
      exports.filter(k =>
        k.toLowerCase().includes('context') ||
        k.toLowerCase().includes('symbol') ||
        k.toLowerCase().includes('capability') ||
        k.startsWith('_')
      )
    ).toHaveLength(0)
  })

  it('contexto externo vacío no activa filtro activo', () => {
    const resultado = servicioActivoPorGateway({ req: { user: null, context: {} } } as never)
    expect(resultado).toBe(false)
  })

  it('contexto externo con claves genéricas no activa filtro activo', () => {
    // Intento de fabricar capability con nombres obvios — el símbolo privado no puede clonarse
    const resultado = servicioActivoPorGateway({
      req: {
        user: null,
        context: { 'gateway-catalogo': true, activo: true, capability: true },
      },
    } as never)
    expect(resultado).toBe(false)
  })

  it('admin autenticado sí puede leer (retorna true)', () => {
    const resultado = servicioActivoPorGateway({
      req: { user: { collection: 'usuarios' }, context: {} },
    } as never)
    expect(resultado).toBe(true)
  })
})
