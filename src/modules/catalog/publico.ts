import type { Payload } from 'payload'

import { contextoGatewayCatalogo } from '@/modules/identity/access'

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
    context: contextoGatewayCatalogo(),
    depth: 0,
    limit: 100,
    overrideAccess: false,
    pagination: false,
  })

  return (resultado.docs as unknown as readonly DocumentoServicio[]).map(({ id, nombre, slug, descripcion }) => ({
    id,
    nombre,
    slug,
    descripcion,
  }))
}
