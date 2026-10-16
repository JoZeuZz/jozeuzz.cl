// ÚNICO punto por el que la web pública lee de Payload (regla de la Local API).
// La Local API usa overrideAccess:true por defecto: aquí cada llamada lo fija a false de forma literal
// y la prueba estática test/estatico/regla-local-api.test.ts lo verifica con el AST.
import config from '@payload-config'
import { getPayload } from 'payload'

import { esAdmin } from '../access'

export type ProyectoPublico = { slug: string; titulo: string; resumen: string }
export type ServicioPublico = { slug: string; titulo: string; descripcion: string }

const proyecto = (d: { slug: string; titulo: string; resumen?: string | null }): ProyectoPublico => ({
  slug: d.slug,
  titulo: d.titulo,
  resumen: d.resumen ?? '',
})
const servicio = (d: { slug: string; titulo: string; descripcion?: string | null }): ServicioPublico => ({
  slug: d.slug,
  titulo: d.titulo,
  descripcion: d.descripcion ?? '',
})

export async function listarProyectosPublicos(): Promise<ProyectoPublico[]> {
  const payload = await getPayload({ config })
  const r = await payload.find({
    collection: 'proyectos',
    overrideAccess: false,
    user: undefined,
    draft: false,
    depth: 0,
    limit: 100,
    sort: 'titulo',
  })
  return r.docs.map(proyecto)
}

export async function obtenerProyectoPublico(slug: string): Promise<ProyectoPublico | null> {
  const payload = await getPayload({ config })
  const r = await payload.find({
    collection: 'proyectos',
    where: { slug: { equals: slug } },
    overrideAccess: false,
    user: undefined,
    draft: false,
    depth: 0,
    limit: 1,
  })
  return r.docs[0] ? proyecto(r.docs[0]) : null
}

export async function listarServiciosPublicos(): Promise<ServicioPublico[]> {
  const payload = await getPayload({ config })
  const r = await payload.find({
    collection: 'servicios',
    overrideAccess: false,
    user: undefined,
    draft: false,
    depth: 0,
    limit: 100,
    sort: 'titulo',
  })
  return r.docs.map(servicio)
}

export async function obtenerServicioPublico(slug: string): Promise<ServicioPublico | null> {
  const payload = await getPayload({ config })
  const r = await payload.find({
    collection: 'servicios',
    where: { slug: { equals: slug } },
    overrideAccess: false,
    user: undefined,
    draft: false,
    depth: 0,
    limit: 1,
  })
  return r.docs[0] ? servicio(r.docs[0]) : null
}

export async function resolverServicioActivo(slug: string): Promise<number | null> {
  const payload = await getPayload({ config })
  const r = await payload.find({
    collection: 'servicios',
    where: { slug: { equals: slug }, activo: { equals: true } },
    overrideAccess: false,
    user: undefined,
    draft: false,
    depth: 0,
    limit: 1,
  })
  const id = r.docs[0]?.id
  return typeof id === 'number' ? id : null
}

/** Rutas del sitemap: sólo lo que el anónimo puede ver. */
export async function urlsSitemap(): Promise<string[]> {
  const [proyectos, servicios] = await Promise.all([listarProyectosPublicos(), listarServiciosPublicos()])
  return [
    '/proyectos',
    '/servicios',
    ...proyectos.map((p) => `/proyectos/${p.slug}`),
    ...servicios.map((s) => `/servicios/${s.slug}`),
  ]
}

/**
 * Vista previa del borrador: exige un administrador autenticado (cookie/cabecera de la petición) y
 * lee con overrideAccess:false en nombre de ese usuario. Sin admin devuelve null (se responde 404).
 */
export async function obtenerProyectoPreview(slug: string, headers: Headers): Promise<ProyectoPublico | null> {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers })
  if (!esAdmin(user) || !user) return null
  const r = await payload.find({
    collection: 'proyectos',
    where: { slug: { equals: slug } },
    draft: true,
    overrideAccess: false,
    user,
    depth: 0,
    limit: 1,
  })
  return r.docs[0] ? proyecto(r.docs[0]) : null
}
