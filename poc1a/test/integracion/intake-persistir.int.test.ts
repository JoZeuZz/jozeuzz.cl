import config from '@payload-config'
import { sql } from 'drizzle-orm'
import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { vaciarBase } from '../../src/lib/base'
import { persistirIntake } from '../../src/lib/intake/persistir'

let payload: Payload
const datos = { nombre: 'Persistir sintético', contacto: 'persistir@example.invalid', tipo_equipo: 'pc', descripcion: 'Prueba' }
// Claves HMAC válidas: 64 hex en minúscula (CHECK de intake_envio / intake_limite).
const clave = (n: string) => n.padStart(64, '0')
const claveIpBase = 'b'.repeat(64)
type Drizzle = { execute: (consulta: unknown) => Promise<{ rows: Array<Record<string, unknown>> }> }
const drizzle = () => payload.db.drizzle as unknown as Drizzle
const schema = () => (payload.db as unknown as { schemaName?: string }).schemaName ?? 'public'
const tabla = (nombre: string) => sql`${sql.identifier(schema())}.${sql.identifier(nombre)}`
const total = async () => (await payload.find({ collection: 'solicitudes', overrideAccess: true, limit: 100 })).totalDocs
const contador = async (tipo: string) => (await drizzle().execute(sql`SELECT n FROM ${tabla('intake_limite')} WHERE clave_hmac = ${claveIpBase} AND tipo = ${tipo}`)).rows[0]?.n
const reservas = async (claveEnvio: string) => (await drizzle().execute(sql`SELECT clave FROM ${tabla('intake_envio')} WHERE clave = ${claveEnvio}`)).rows.length

beforeAll(async () => { payload = await getPayload({ config }); await vaciarBase(payload) })
afterAll(async () => payload?.destroy())
beforeEach(async () => { await vaciarBase(payload) })

describe('persistirIntake transaccional', () => {
  it('las claves de prueba cumplen el formato hexadecimal de 64 caracteres', () => {
    for (const valor of [clave('1'), clave('ab'), claveIpBase]) expect(valor).toMatch(/^[0-9a-f]{64}$/)
  })

  it('revierte reserva cuando trasReserva falla y reintento crea exactamente una solicitud', async () => {
    await expect(persistirIntake(payload, { datos, claveEnvio: clave('1'), claveIp: claveIpBase }, { trasReserva: async () => { throw new Error('sonda') } })).rejects.toThrow('sonda')
    await expect(persistirIntake(payload, { datos, claveEnvio: clave('1'), claveIp: claveIpBase })).resolves.toEqual({ tipo: 'creada' })
    expect(await total()).toBe(1)
  })

  it('dos transacciones del mismo nonce devuelven creada y duplicada', async () => {
    const entrada = { datos, claveEnvio: clave('2'), claveIp: claveIpBase }
    const resultado = await Promise.all([persistirIntake(payload, entrada), persistirIntake(payload, entrada)])
    expect(resultado.map((r) => r.tipo).sort()).toEqual(['creada', 'duplicada'])
    expect(await total()).toBe(1)
  })

  it('devuelve cupo tras rollback de trasCupo y permite quinta creación legítima', async () => {
    const claveIp = claveIpBase
    for (const n of ['3', '4', '5', '6']) {
      await expect(persistirIntake(payload, { datos, claveEnvio: clave(n), claveIp })).resolves.toEqual({ tipo: 'creada' })
    }
    await expect(persistirIntake(payload, { datos, claveEnvio: clave('7'), claveIp }, { trasCupo: async () => { throw new Error('sonda-cupo') } })).rejects.toThrow('sonda-cupo')
    await expect(persistirIntake(payload, { datos, claveEnvio: clave('7'), claveIp })).resolves.toEqual({ tipo: 'creada' })
    expect(await total()).toBe(5)
  })

  it('devuelve cupo y reserva cuando la colección rechaza los datos (fallo en la creación)', async () => {
    for (const n of ['3', '4', '5', '6']) {
      await expect(persistirIntake(payload, { datos, claveEnvio: clave(n), claveIp: claveIpBase })).resolves.toEqual({ tipo: 'creada' })
    }
    const { nombre: _omitido, ...sinNombre } = datos
    await expect(persistirIntake(payload, { datos, claveEnvio: clave('7'), claveIp: claveIpBase }, { antesDeCrear: () => sinNombre as never })).rejects.toThrow()

    expect(await contador('creacion')).toBe(4)
    expect(await reservas(clave('7'))).toBe(0)
    await expect(persistirIntake(payload, { datos, claveEnvio: clave('7'), claveIp: claveIpBase })).resolves.toEqual({ tipo: 'creada' })
    expect(await total()).toBe(5)
  })

  it('diez creaciones paralelas de una IP dan cinco creadas y cinco límites sin reservas huérfanas', async () => {
    const nonces = Array.from({ length: 10 }, (_, i) => clave(`a${i}`))
    const resultados = await Promise.all(nonces.map((claveEnvio) => persistirIntake(payload, { datos, claveEnvio, claveIp: claveIpBase })))

    expect(resultados.filter((r) => r.tipo === 'creada')).toHaveLength(5)
    expect(resultados.filter((r) => r.tipo === 'limite')).toHaveLength(5)
    expect(await total()).toBe(5)
    expect(await contador('creacion')).toBe(5)
    const rechazadas = nonces.filter((_, i) => resultados[i]?.tipo === 'limite')
    for (const claveEnvio of rechazadas) expect(await reservas(claveEnvio)).toBe(0)
    expect((await drizzle().execute(sql`SELECT clave FROM ${tabla('intake_envio')}`)).rows).toHaveLength(5)
  })
})
