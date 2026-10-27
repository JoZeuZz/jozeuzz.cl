import type { Access, Payload } from 'payload'

import { crearAccesoServiciosPorCapabilityOAdmin } from '@/modules/identity/access'

// ── Capability privada ──────────────────────────────────────────────────────
// Este símbolo no se exporta. Solo listarServiciosPublicos puede inyectarlo.
const _capabilidadCatalogo = Symbol('gateway-catalogo')

type ContextoInterno = Record<PropertyKey, unknown>

function _crearContexto(): ContextoInterno {
  return { [_capabilidadCatalogo]: true }
}

function _esCapabilidadActiva(context: ContextoInterno): boolean {
  return context[_capabilidadCatalogo] === true
}

// ── Access exportada para Servicios collection ──────────────────────────────
export const servicioActivoPorGateway: Access =
  crearAccesoServiciosPorCapabilityOAdmin(_esCapabilidadActiva)

// ── DTO público ─────────────────────────────────────────────────────────────
export type ServicioPublico = Readonly<{
  id: string
  nombre: string
  slug: string
  descripcion: string
}>

type DocumentoServicio = Readonly<{
  id: string
  nombre: string
  slug: string
  descripcion: string
}>

export async function listarServiciosPublicos(payload: Payload): Promise<readonly ServicioPublico[]> {
  const resultado = await payload.find({
    collection: 'servicios',
    context: _crearContexto(),
    depth: 0,
    limit: 100,
    overrideAccess: false,
    pagination: false,
  })

  return (resultado.docs as unknown as readonly DocumentoServicio[]).map(
    ({ id, nombre, slug, descripcion }) => ({ id, nombre, slug, descripcion })
  )
}
