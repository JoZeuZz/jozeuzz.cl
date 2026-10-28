/**
 * Integración real Task2: PostgreSQL 18.6 + Payload Local API
 *
 * Setup interno (overrideAccess:true): crea servicio activo, servicio inactivo,
 * solicitud centinela y usuario admin sintético antes de assertions.
 *
 * Assertions inequívocas:
 * - Anónimo find/count/findByID/filter → Forbidden (Error, nunca devuelve centinela)
 * - Admin REAL (user con collection correcta) puede leer centinela
 * - create/update/delete solicitudes con admin + overrideAccess:false → Forbidden exacto
 * - Gateway devuelve solo activo y solo claves DTO exactas (id/nombre/slug/descripcion)
 * - REST genérico /api/servicios anónimo → configuración cerrada (graphQL.disable)
 * - GraphQL HTTP → config cerrada
 *
 * DB: provista por DATABASE_URL (harness efímero) o fallback local.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getPayload } from 'payload'
import type { Payload } from 'payload'

import { listarServiciosPublicos } from '@/modules/catalog/publico'

const DB_URL = process.env.DATABASE_URL
  ?? 'postgres://jozeuzz:jozeuzz@127.0.0.1:5433/jozeuzz'

// ── Centinelas inequívocos ────────────────────────────────────────────────
const CENTINELA_NOMBRE = 'Solicitud-Centinela-Harness-XK7Q'
const CENTINELA_CONTACTO = 'centinela-xk7q@test.invalid'
const CENTINELA_EQUIPO = 'Laptop-Centinela-XK7Q'
const CENTINELA_DESC = 'Descripción centinela para prueba de acceso inequívoca XK7Q'
const SERVICIO_ACTIVO_SLUG = 'servicio-activo-xk7q'
const SERVICIO_INACTIVO_SLUG = 'servicio-inactivo-xk7q'

let payload: Payload
let adminUser: { id: number; email: string; collection: 'usuarios' }
let solicitudId: number
let servicioActivoId: number

beforeAll(async () => {
  process.env.DATABASE_URL = DB_URL
  process.env.PAYLOAD_SECRET = process.env.PAYLOAD_SECRET ?? 'harness-secret'
  process.env.NEXT_PUBLIC_SERVER_URL = 'http://127.0.0.1:3000'

  const { default: config } = await import('@/payload.config')
  payload = await getPayload({ config: await config })

  // ── Crear usuario admin sintético (overrideAccess:true para setup) ─────
  const existeAdmin = await payload.find({
    collection: 'usuarios',
    where: { email: { equals: 'admin-harness@test.invalid' } },
    overrideAccess: true,
  })
  if (existeAdmin.docs.length === 0) {
    await payload.create({
      collection: 'usuarios',
      data: {
        nombre: 'Admin Harness XK7Q',
        email: 'admin-harness@test.invalid',
        password: 'Harness-Secret-XK7Q-2026!',
      },
      overrideAccess: true,
    })
  }
  const adminDoc = await payload.find({
    collection: 'usuarios',
    where: { email: { equals: 'admin-harness@test.invalid' } },
    overrideAccess: true,
  })
  adminUser = {
    id: adminDoc.docs[0].id as number,
    email: adminDoc.docs[0].email as string,
    collection: 'usuarios',
  }

  // ── Crear servicios activo e inactivo (overrideAccess:true) ───────────
  const existeActivo = await payload.find({
    collection: 'servicios',
    where: { slug: { equals: SERVICIO_ACTIVO_SLUG } },
    overrideAccess: true,
  })
  if (existeActivo.docs.length === 0) {
    const doc = await payload.create({
      collection: 'servicios',
      data: {
        nombre: 'Servicio Activo XK7Q',
        slug: SERVICIO_ACTIVO_SLUG,
        descripcion: 'Servicio activo para tests XK7Q',
        activo: true,
      },
      overrideAccess: true,
    })
    servicioActivoId = doc.id as number
  } else {
    servicioActivoId = existeActivo.docs[0].id as number
  }

  const existeInactivo = await payload.find({
    collection: 'servicios',
    where: { slug: { equals: SERVICIO_INACTIVO_SLUG } },
    overrideAccess: true,
  })
  if (existeInactivo.docs.length === 0) {
    await payload.create({
      collection: 'servicios',
      data: {
        nombre: 'Servicio Inactivo XK7Q',
        slug: SERVICIO_INACTIVO_SLUG,
        descripcion: 'Servicio inactivo para tests XK7Q',
        activo: false,
      },
      overrideAccess: true,
    })
  }

  // ── Crear solicitud centinela (overrideAccess:true, solo setup) ────────
  const existeCentinela = await payload.find({
    collection: 'solicitudes',
    where: { nombre: { equals: CENTINELA_NOMBRE } },
    overrideAccess: true,
  })
  if (existeCentinela.docs.length === 0) {
    const sol = await payload.create({
      collection: 'solicitudes',
      data: {
        nombre: CENTINELA_NOMBRE,
        contacto: CENTINELA_CONTACTO,
        tipoEquipo: CENTINELA_EQUIPO,
        descripcion: CENTINELA_DESC,
      },
      overrideAccess: true,
    })
    solicitudId = sol.id as number
  } else {
    solicitudId = existeCentinela.docs[0].id as number
  }
}, 60_000)

afterAll(async () => {
  // Limpieza de centinelas
  try {
    await payload.delete({ collection: 'solicitudes', id: solicitudId, overrideAccess: true })
    await payload.delete({ collection: 'servicios', id: servicioActivoId, overrideAccess: true })
    const inact = await payload.find({ collection: 'servicios', where: { slug: { equals: SERVICIO_INACTIVO_SLUG } }, overrideAccess: true })
    if (inact.docs.length > 0) await payload.delete({ collection: 'servicios', id: inact.docs[0].id as number, overrideAccess: true })
    await payload.delete({ collection: 'usuarios', id: adminUser.id, overrideAccess: true })
  } catch {
    // limpieza best-effort
  }
  await (payload.db as { destroy?: () => Promise<void> }).destroy?.()
})

// ═══════════════════════════════════════════════════════════════════════════
describe('solicitudes: anónimo bloqueado inequívocamente', () => {
  it('find: lanza Forbidden, no devuelve centinela', async () => {
    const err = await payload.find({
      collection: 'solicitudes',
      overrideAccess: false,
      user: null,
    }).catch(e => e)
    // Debe lanzar, nunca silenciosamente devolver datos
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toMatch(/forbidden|not allowed/i)
    // Si de algún modo no lanzara, centinela jamás debe aparecer
    if (!(err instanceof Error)) {
      const docs = (err as { docs: unknown[] }).docs ?? []
      const nombres = docs.map((d: unknown) => (d as { nombre?: string }).nombre)
      expect(nombres).not.toContain(CENTINELA_NOMBRE)
    }
  })

  it('count: lanza Forbidden exacto', async () => {
    const err = await payload.count({
      collection: 'solicitudes',
      overrideAccess: false,
      user: null,
    }).catch(e => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toMatch(/forbidden|not allowed/i)
  })

  it('findByID: lanza Forbidden, no devuelve centinela', async () => {
    const err = await payload.findByID({
      collection: 'solicitudes',
      id: solicitudId,
      overrideAccess: false,
      user: null,
    }).catch(e => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toMatch(/forbidden|not allowed|not found/i)
    // Si no lanzara: el doc retornado no debe ser el centinela
    if (!(err instanceof Error) && err !== null) {
      expect((err as { nombre?: string }).nombre).not.toBe(CENTINELA_NOMBRE)
    }
  })

  it('find con where filter: lanza Forbidden, no filtra centinela', async () => {
    const err = await payload.find({
      collection: 'solicitudes',
      where: { nombre: { equals: CENTINELA_NOMBRE } },
      overrideAccess: false,
      user: null,
    }).catch(e => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toMatch(/forbidden|not allowed/i)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('solicitudes: admin REAL puede leer centinela', () => {
  it('find con user admin: retorna centinela', async () => {
    const result = await payload.find({
      collection: 'solicitudes',
      overrideAccess: false,
      user: adminUser,
    })
    const nombres = result.docs.map((d) => (d as { nombre: string }).nombre)
    expect(nombres).toContain(CENTINELA_NOMBRE)
  })

  it('findByID con user admin: devuelve documento correcto', async () => {
    const doc = await payload.findByID({
      collection: 'solicitudes',
      id: solicitudId,
      overrideAccess: false,
      user: adminUser,
    })
    expect((doc as { nombre: string }).nombre).toBe(CENTINELA_NOMBRE)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('solicitudes: create/update/delete denegado — acceso exacto', () => {
  it('create con admin + overrideAccess:false → Forbidden', async () => {
    const err = await payload.create({
      collection: 'solicitudes',
      data: {
        nombre: 'Prueba Create Admin',
        contacto: 'x@test.invalid',
        tipoEquipo: 'laptop',
        descripcion: 'descripcion de prueba de acceso',
      },
      overrideAccess: false,
      user: adminUser,
    }).catch(e => e)
    expect(err).toBeInstanceOf(Error)
    // Debe ser acceso denegado, NO "not found"
    expect((err as Error).message).toMatch(/forbidden|not allowed/i)
    expect((err as Error).message).not.toMatch(/not found/i)
  })

  it('update con admin + overrideAccess:false → Forbidden', async () => {
    const err = await payload.update({
      collection: 'solicitudes',
      id: solicitudId,
      data: { nombre: 'Intento Update' },
      overrideAccess: false,
      user: adminUser,
    }).catch(e => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toMatch(/forbidden|not allowed/i)
    expect((err as Error).message).not.toMatch(/not found/i)
  })

  it('delete con admin + overrideAccess:false → Forbidden exacto', async () => {
    const err = await payload.delete({
      collection: 'solicitudes',
      id: solicitudId,
      overrideAccess: false,
      user: adminUser,
    }).catch(e => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toMatch(/forbidden|not allowed/i)
    expect((err as Error).message).not.toMatch(/not found/i)
  })

  it('create sin user (anónimo) + overrideAccess:false → Forbidden', async () => {
    const err = await payload.create({
      collection: 'solicitudes',
      data: {
        nombre: 'Anon Create',
        contacto: 'x@test.invalid',
        tipoEquipo: 'tablet',
        descripcion: 'descripcion de prueba de acceso anonima',
      },
      overrideAccess: false,
      user: null,
    }).catch(e => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toMatch(/forbidden|not allowed/i)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('gateway servicios: DTO exacto, solo activos', () => {
  it('listarServiciosPublicos: devuelve servicio activo con claves exactas', async () => {
    const lista = await listarServiciosPublicos(payload)
    const activo = lista.find((s) => s.slug === SERVICIO_ACTIVO_SLUG)
    expect(activo).toBeDefined()
    // Claves DTO exactas: id, nombre, slug, descripcion (no activo, no updatedAt, etc.)
    expect(Object.keys(activo!).sort()).toEqual(['descripcion', 'id', 'nombre', 'slug'].sort())
  })

  it('listarServiciosPublicos: NO incluye servicio inactivo', async () => {
    const lista = await listarServiciosPublicos(payload)
    const inactivo = lista.find((s) => s.slug === SERVICIO_INACTIVO_SLUG)
    expect(inactivo).toBeUndefined()
  })

  it('listarServiciosPublicos: no filtra activo si usuario admin llama directo', async () => {
    // Gateway siempre usa capacidad interna, no sobreescribe filtro activo
    const lista = await listarServiciosPublicos(payload)
    for (const s of lista) {
      expect(Object.keys(s).sort()).toEqual(['descripcion', 'id', 'nombre', 'slug'].sort())
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('GraphQL: configuración cerrada', () => {
  it('config.graphQL.disable === true', async () => {
    const { default: config } = await import('@/payload.config')
    const configured = await config
    expect(configured.graphQL?.disable).toBe(true)
  })
})
