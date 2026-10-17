import config from '@payload-config'
import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { vaciarBase } from '../../src/lib/base'
import { persistirIntake } from '../../src/lib/intake/persistir'

let payload: Payload
const datos = { nombre: 'Persistir sintético', contacto: 'persistir@example.invalid', tipo_equipo: 'pc', descripcion: 'Prueba' }
const clave = (n: string) => n.padEnd(64, 'a')

beforeAll(async () => { payload = await getPayload({ config }); await vaciarBase(payload) })
afterAll(async () => payload?.destroy())
beforeEach(async () => { await vaciarBase(payload) })

describe('persistirIntake transaccional', () => {
  it('revierte reserva cuando trasReserva falla y reintento crea exactamente una solicitud', async () => {
    await expect(persistirIntake(payload, { datos, claveEnvio: clave('1'), claveIp: clave('i') }, { trasReserva: async () => { throw new Error('sonda') } })).rejects.toThrow('sonda')
    await expect(persistirIntake(payload, { datos, claveEnvio: clave('1'), claveIp: clave('i') })).resolves.toEqual({ tipo: 'creada' })
    expect((await payload.find({ collection: 'solicitudes', overrideAccess: true, limit: 100 })).totalDocs).toBe(1)
  })

  it('dos transacciones del mismo nonce devuelven creada y duplicada', async () => {
    const entrada = { datos, claveEnvio: clave('2'), claveIp: clave('i') }
    const resultado = await Promise.all([persistirIntake(payload, entrada), persistirIntake(payload, entrada)])
    expect(resultado.map((r) => r.tipo).sort()).toEqual(['creada', 'duplicada'])
    expect((await payload.find({ collection: 'solicitudes', overrideAccess: true, limit: 100 })).totalDocs).toBe(1)
  })

  it('devuelve cupo tras rollback de trasCupo y permite quinta creación legítima', async () => {
    const claveIp = clave('i')
    for (const n of ['3', '4', '5', '6']) {
      await expect(persistirIntake(payload, { datos, claveEnvio: clave(n), claveIp })).resolves.toEqual({ tipo: 'creada' })
    }
    await expect(persistirIntake(payload, { datos, claveEnvio: clave('7'), claveIp }, { trasCupo: async () => { throw new Error('sonda-cupo') } })).rejects.toThrow('sonda-cupo')
    await expect(persistirIntake(payload, { datos, claveEnvio: clave('7'), claveIp })).resolves.toEqual({ tipo: 'creada' })
    expect((await payload.find({ collection: 'solicitudes', overrideAccess: true, limit: 100 })).totalDocs).toBe(5)
  })
})
