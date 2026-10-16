import config from '@payload-config'
import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { vaciarBase } from '../../src/lib/base'

let payload: Payload
let id: number | string
let admin: any

beforeAll(async () => {
  payload = await getPayload({ config })
  await vaciarBase(payload)
  admin = await payload.create({ collection: 'users', data: { email: 'eventos@example.invalid', password: 'synthetic-password' }, overrideAccess: true })
  const solicitud = await payload.create({
    collection: 'solicitudes',
    data: { nombre: 'SNT', contacto: 'snt@example.invalid', tipo_equipo: 'pc', descripcion: 'd', estado: 'cerrada' },
    overrideAccess: true,
  })
  id = solicitud.id
})
afterAll(async () => payload?.destroy())

describe('solicitudes y eventos', () => {
  it('fuerza recibida, valida transición y crea evento sin actor del payload', async () => {
    expect((await payload.findByID({ collection: 'solicitudes', id, overrideAccess: true })).estado).toBe('recibida')
    await expect(payload.update({ collection: 'solicitudes', id, data: { estado: 'cerrada' }, overrideAccess: true })).rejects.toThrow()
    await payload.update({ collection: 'solicitudes', id, data: { estado: 'en_gestion', actor: 'SNT-FALSO' } as never, overrideAccess: true })
    const eventos = await payload.find({ collection: 'eventos-solicitud', where: { solicitud: { equals: id } }, overrideAccess: true })
    expect(eventos.docs).toHaveLength(1)
    expect(eventos.docs[0].actor).not.toContain('SNT-FALSO')
  })

  it('EV-04 revierte estado y evento tras fallo inyectado', async () => {
    process.env.POC_FALLOS_INYECTABLES = '1'
    const nueva = await payload.create({ collection: 'solicitudes', data: { nombre: 'SNT2', contacto: 's2@example.invalid', tipo_equipo: 'pc', descripcion: 'd' } as any, draft: false, overrideAccess: true })
    await expect(payload.update({ collection: 'solicitudes', id: nueva.id, data: { estado: 'en_gestion' }, overrideAccess: true, req: { headers: new Headers({ 'x-poc-fallo': 'tras-estado' }), user: admin } as any })).rejects.toThrow('fallo inyectado')
    delete process.env.POC_FALLOS_INYECTABLES
    const solicitud = await payload.findByID({ collection: 'solicitudes', id: nueva.id, overrideAccess: true })
    const eventos = await payload.find({ collection: 'eventos-solicitud', where: { solicitud: { equals: nueva.id } }, overrideAccess: true })
    expect(solicitud.estado).toBe('recibida')
    expect(solicitud.motivo_cierre).toBeNull()
    expect(eventos.docs).toHaveLength(0)
  })
})
