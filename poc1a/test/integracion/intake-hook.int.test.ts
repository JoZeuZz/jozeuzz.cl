import config from '@payload-config'
import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { vaciarBase } from '../../src/lib/base'
import { listarServiciosPublicos, resolverServicioActivo } from '../../src/lib/publico'

let payload: Payload

beforeAll(async () => {
  payload = await getPayload({ config })
  await vaciarBase(payload)
})

afterAll(async () => payload?.destroy())

describe('hook de intake', () => {
  it('elimina valores administrativos forjados en create de intake', async () => {
    const creadaEn = '2000-01-01T00:00:00.000Z'
    const actualizadaEn = '2000-01-01T00:00:00.000Z'
    const solicitud = await payload.create({
      collection: 'solicitudes',
      data: {
        nombre: 'Intake',
        contacto: 'intake@example.invalid',
        tipo_equipo: 'notebook',
        descripcion: 'Solicitud',
        estado: 'cerrada',
        motivo_cierre: 'spam',
        observaciones_internas: 'forjada',
        id: 999999,
        createdAt: creadaEn,
        updatedAt: actualizadaEn,
      } as never,
      overrideAccess: true,
      req: { context: { canal: 'intake' } } as never,
    })

    expect(solicitud.estado).toBe('recibida')
    expect(solicitud.motivo_cierre).toBeNull()
    expect(solicitud.observaciones_internas).toBe('')
    expect(solicitud.id).not.toBe(999999)
    expect(solicitud.createdAt).not.toBe(creadaEn)
    expect(solicitud.updatedAt).not.toBe(actualizadaEn)
  })

  it('conserva observaciones internas en create administrativo', async () => {
    const solicitud = await payload.create({
      collection: 'solicitudes',
      data: { nombre: 'Admin', contacto: 'admin@example.invalid', tipo_equipo: 'pc', descripcion: 'Solicitud', observaciones_internas: 'nota admin' } as never,
      overrideAccess: true,
    })

    expect(solicitud.observaciones_internas).toBe('nota admin')
  })

  it('resuelve sólo servicios activos', async () => {
    const activo = await payload.create({ collection: 'servicios', data: { slug: 'activo', titulo: 'Activo', activo: true }, overrideAccess: true })
    await payload.create({ collection: 'servicios', data: { slug: 'inactivo', titulo: 'Inactivo', activo: false }, overrideAccess: true })

    expect(await resolverServicioActivo('activo')).toBe(activo.id)
    expect(await resolverServicioActivo('inactivo')).toBeNull()
    expect(await resolverServicioActivo('inexistente')).toBeNull()
    await expect(listarServiciosPublicos()).resolves.toEqual([{ slug: 'activo', titulo: 'Activo', descripcion: '' }])
  })
})
