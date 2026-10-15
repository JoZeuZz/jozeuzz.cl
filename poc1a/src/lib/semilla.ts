import { randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { Payload } from 'payload'

import { vaciarBase } from './base'

type Semilla = {
  proyectos: { clave: string; slug: string; titulo: string; resumen: string; estado: string; medios: string[] }[]
  medios: { clave: string; id: string; contenido: string; visibilidad: 'publico' | 'privado' }[]
  servicios: { clave: string; slug: string; titulo: string; descripcion: string; activo: boolean }[]
  solicitudes: {
    clave: string
    nombre: string
    contacto: string
    tipo_equipo: string
    descripcion: string
    servicio: string | null
    estado: string
    motivo_cierre: string | null
    observaciones_internas: string
  }[]
}

export const EMAIL_ADMIN = 'admin@example.invalid'

async function vaciarMedios(raiz: string) {
  for (const sub of ['publicos', 'privados']) {
    await fs.rm(path.join(raiz, sub), { recursive: true, force: true })
  }
}

/**
 * Borra todo y carga la semilla con la Local API. Es un script de operador (no una ruta pública),
 * por eso usa overrideAccess:true. La contraseña del admin es aleatoria y sólo se devuelve al llamante.
 */
export async function reiniciarYSembrar(payload: Payload, semilla: Semilla) {
  await vaciarBase(payload)
  await vaciarMedios(process.env.POC_MEDIA_DIR ?? '/app/media-store')

  const password = randomBytes(18).toString('hex')
  await payload.create({
    collection: 'users',
    data: { email: EMAIL_ADMIN, password },
    overrideAccess: true,
  })

  const refs: Record<string, string> = {}
  const ids: Record<string, string> = {}
  const idMedio: Record<string, { coleccion: 'medios-publicos' | 'medios-privados'; id: number }> = {}

  for (const m of semilla.medios) {
    const coleccion = m.visibilidad === 'publico' ? 'medios-publicos' : 'medios-privados'
    const data = Buffer.from(m.contenido, 'utf8')
    const doc = await payload.create({
      collection: coleccion,
      data: { alt: m.clave },
      file: { data, mimetype: 'text/plain', name: `${m.id}.txt`, size: data.length },
      overrideAccess: true,
    })
    idMedio[m.clave] = { coleccion, id: doc.id }
    refs[`medio_${m.clave}`] = m.id
    ids[`medio_${m.clave}`] = String(doc.id)
  }

  for (const s of semilla.servicios) {
    const doc = await payload.create({
      collection: 'servicios',
      data: { slug: s.slug, titulo: s.titulo, descripcion: s.descripcion, activo: s.activo },
      overrideAccess: true,
    })
    refs[`servicio_${s.clave}`] = s.slug
    ids[`servicio_${s.clave}`] = String(doc.id)
  }

  for (const p of semilla.proyectos) {
    const publicado = p.estado === 'publicado'
    const doc = await payload.create({
      collection: 'proyectos',
      data: {
        slug: p.slug,
        titulo: p.titulo,
        resumen: p.resumen,
        medios: p.medios.map((clave) => ({ relationTo: idMedio[clave].coleccion, value: idMedio[clave].id })),
        _status: publicado ? 'published' : 'draft',
      },
      draft: !publicado,
      overrideAccess: true,
    })
    refs[`proyecto_${p.clave}`] = p.slug
    ids[`proyecto_${p.clave}`] = String(doc.id)
  }

  for (const s of semilla.solicitudes) {
    const doc = await payload.create({
      collection: 'solicitudes',
      data: {
        nombre: s.nombre,
        contacto: s.contacto,
        tipo_equipo: s.tipo_equipo,
        descripcion: s.descripcion,
        estado: s.estado as 'recibida',
        observaciones_internas: s.observaciones_internas,
      },
      overrideAccess: true,
    })
    refs[`solicitud_${s.clave}`] = String(doc.id)
    ids[`solicitud_${s.clave}`] = String(doc.id)
  }

  return { refs, ids, password, email: EMAIL_ADMIN }
}
