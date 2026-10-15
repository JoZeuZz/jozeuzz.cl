import config from '@payload-config'
import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { vaciarBase } from '../../src/lib/base'

let payload: Payload
let admin: { id: number | string; collection: 'users'; email: string }
const ids: Record<string, number | string> = {}

// Lectura «pública»: Local API con access activo y sin usuario.
const anon = { overrideAccess: false as const, user: undefined }

beforeAll(async () => {
  payload = await getPayload({ config })
  await vaciarBase(payload)
  const u = await payload.create({
    collection: 'users',
    data: { email: 'admin-prueba@example.invalid', password: `p-${crypto.randomUUID()}` },
    overrideAccess: true,
  })
  admin = { id: u.id, collection: 'users', email: u.email }
  const pub = await payload.create({
    collection: 'proyectos',
    data: { slug: 'snt-pub', titulo: 'SNT-TITULO-PUBLICADO', resumen: 'r', notas_internas: 'SNT-NOTA', _status: 'published' },
    overrideAccess: true,
  })
  ids.pub = pub.id
  const bor = await payload.create({
    collection: 'proyectos',
    data: { slug: 'snt-bor', titulo: 'SNT-TITULO-BORRADOR', _status: 'draft' },
    draft: true,
    overrideAccess: true,
  })
  ids.bor = bor.id
  await payload.create({
    collection: 'servicios',
    data: { slug: 'snt-act', titulo: 'SNT-SERVICIO-ACTIVO', activo: true },
    overrideAccess: true,
  })
  await payload.create({
    collection: 'servicios',
    data: { slug: 'snt-ina', titulo: 'SNT-SERVICIO-INACTIVO', activo: false },
    overrideAccess: true,
  })
  const sol = await payload.create({
    collection: 'solicitudes',
    data: { nombre: 'SNT-NOMBRE', contacto: 'c@example.invalid', tipo_equipo: 'e', descripcion: 'd', observaciones_internas: 'SNT-OBS-INTERNA' },
    overrideAccess: true,
  })
  ids.sol = sol.id
})

afterAll(async () => {
  await payload?.destroy()
})

describe('proyectos (lectura anónima con access activo)', () => {
  it('find sólo devuelve el publicado', async () => {
    const r = await payload.find({ collection: 'proyectos', ...anon })
    expect(r.docs.map((d) => d.slug)).toEqual(['snt-pub'])
  })

  it('findByID del borrador lanza NotFound', async () => {
    await expect(payload.findByID({ collection: 'proyectos', id: ids.bor, ...anon })).rejects.toMatchObject({ status: 404 })
  })

  it('draft:true no devuelve el borrador al anónimo', async () => {
    const r = await payload.find({ collection: 'proyectos', draft: true, ...anon })
    expect(r.docs.map((d) => d.slug)).toEqual(['snt-pub'])
    await expect(payload.findByID({ collection: 'proyectos', id: ids.bor, draft: true, ...anon })).rejects.toMatchObject({ status: 404 })
  })

  it('where sobre _status del borrador no lo revela', async () => {
    const r = await payload.find({ collection: 'proyectos', where: { _status: { equals: 'draft' } }, draft: true, ...anon })
    expect(r.docs).toEqual([])
  })

  it('el campo notas_internas no se ve sin admin y sí con admin', async () => {
    const a = await payload.findByID({ collection: 'proyectos', id: ids.pub, ...anon })
    expect('notas_internas' in a).toBe(false)
    const b = await payload.findByID({ collection: 'proyectos', id: ids.pub, overrideAccess: false, user: admin })
    expect(b.notas_internas).toBe('SNT-NOTA')
  })

  it('un publicado con borrador pendiente devuelve el título publicado', async () => {
    await payload.update({ collection: 'proyectos', id: ids.pub, data: { titulo: 'SNT-TITULO-EDITADO-BORRADOR', _status: 'draft' }, draft: true, overrideAccess: true })
    const a = await payload.findByID({ collection: 'proyectos', id: ids.pub, ...anon })
    expect(a.titulo).toBe('SNT-TITULO-PUBLICADO')
    const b = await payload.findByID({ collection: 'proyectos', id: ids.pub, draft: true, ...anon })
    expect(b.titulo).toBe('SNT-TITULO-PUBLICADO')
  })

  it('un slug duplicado produce error (INV-02)', async () => {
    await expect(
      payload.create({ collection: 'proyectos', data: { slug: 'snt-pub', titulo: 'otro', _status: 'draft' }, draft: true, overrideAccess: true }),
    ).rejects.toThrow()
  })

  it('retirar fija retiradoEn y no borra; publicar lo vacía (INV-12)', async () => {
    const r = await payload.update({ collection: 'proyectos', id: ids.pub, data: { _status: 'draft' }, overrideAccess: true })
    expect(r._status).toBe('draft')
    expect(r.retiradoEn).toBeTruthy()
    const principal = await payload.findByID({ collection: 'proyectos', id: ids.pub, overrideAccess: true })
    expect(principal.slug).toBe('snt-pub')
    expect(principal._status).toBe('draft')
    expect(await payload.find({ collection: 'proyectos', ...anon }).then((x) => x.docs)).toEqual([])
    const p = await payload.update({ collection: 'proyectos', id: ids.pub, data: { _status: 'published' }, overrideAccess: true })
    expect(p.retiradoEn ?? null).toBeNull()
  })

  it('el anónimo no lee versiones', async () => {
    await expect(payload.findVersions({ collection: 'proyectos', ...anon })).rejects.toMatchObject({ status: 403 })
  })
})

describe('servicios', () => {
  it('el anónimo sólo ve el activo', async () => {
    const r = await payload.find({ collection: 'servicios', ...anon })
    expect(r.docs.map((d) => d.slug)).toEqual(['snt-act'])
  })
})

describe('solicitudes y users', () => {
  it('el anónimo recibe Forbidden en solicitudes', async () => {
    await expect(payload.find({ collection: 'solicitudes', ...anon })).rejects.toMatchObject({ status: 403 })
    await expect(payload.findByID({ collection: 'solicitudes', id: ids.sol, ...anon })).rejects.toMatchObject({ status: 403 })
  })

  it('observaciones_internas es visible para el admin', async () => {
    const s = await payload.findByID({ collection: 'solicitudes', id: ids.sol, overrideAccess: false, user: admin })
    expect(s.observaciones_internas).toBe('SNT-OBS-INTERNA')
  })

  it('el anónimo no lista users', async () => {
    await expect(payload.find({ collection: 'users', ...anon })).rejects.toMatchObject({ status: 403 })
  })
})

describe('caracterización: el valor por defecto de la Local API es peligroso', () => {
  it('sin overrideAccess:false la Local API devuelve el borrador (por eso existe publico.ts)', async () => {
    const r = await payload.find({ collection: 'proyectos', where: { slug: { equals: 'snt-bor' } } })
    expect(r.docs).toHaveLength(1)
  })
})
