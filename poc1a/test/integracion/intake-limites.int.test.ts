import config from '@payload-config'
import { sql } from 'drizzle-orm'
import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { vaciarBase } from '../../src/lib/base'
import { contarCreacion, contarIntento, schemaIntake } from '../../src/lib/intake/limites'
import { purgarIntake } from '../../src/lib/intake/purga'

let payload: Payload
const claveIp = 'c'.repeat(64)
type Drizzle = { execute: (consulta: unknown) => Promise<{ rows: Array<Record<string, unknown> & { n: number; reintentar_en_s: number }> }> }
const drizzle = () => payload.db.drizzle as unknown as Drizzle
const schema = () => (payload.db as unknown as { schemaName?: string }).schemaName ?? 'public'
const tabla = (nombre: string) => sql`${sql.identifier(schema())}.${sql.identifier(nombre)}`

beforeAll(async () => { payload = await getPayload({ config }); await vaciarBase(payload) })
afterAll(async () => payload?.destroy())
beforeEach(async () => { await vaciarBase(payload) })

describe('límites intake contra la base real', () => {
  it('el schema se toma del adaptador', () => {
    expect(schemaIntake(payload.db)).toBe(schema())
  })

  it('contarIntento deja una fila en la tabla del schema del adaptador', async () => {
    await expect(contarIntento(drizzle(), claveIp, schema())).resolves.toMatchObject({ permitido: true })
    const { rows } = await drizzle().execute(sql`SELECT n, tipo FROM ${tabla('intake_limite')} WHERE clave_hmac = ${claveIp}`)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ n: 1, tipo: 'intento' })
  })

  it('la 31.ª llamada se bloquea con Retry-After dentro de la ventana y n=31', async () => {
    for (let i = 1; i <= 30; i += 1) expect((await contarIntento(drizzle(), claveIp, schema())).permitido).toBe(true)
    const bloqueada = await contarIntento(drizzle(), claveIp, schema())
    expect(bloqueada.permitido).toBe(false)
    expect(bloqueada.reintentarEnS).toBeGreaterThanOrEqual(1)
    expect(bloqueada.reintentarEnS).toBeLessThanOrEqual(600)
    const { rows } = await drizzle().execute(sql`SELECT n FROM ${tabla('intake_limite')} WHERE clave_hmac = ${claveIp} AND tipo = 'intento'`)
    expect(rows[0]?.n).toBe(31)
  })

  it('contarCreacion cuenta aparte del tipo intento', async () => {
    await contarIntento(drizzle(), claveIp, schema())
    await expect(contarCreacion(drizzle(), claveIp, schema())).resolves.toMatchObject({ permitido: true })
    const { rows } = await drizzle().execute(sql`SELECT tipo FROM ${tabla('intake_limite')} WHERE clave_hmac = ${claveIp} ORDER BY tipo`)
    expect(rows.map((fila) => fila.tipo)).toEqual(['creacion', 'intento'])
  })

  it('la purga elimina filas viejas (incluidas de tipo intento sin creaciones) en el schema del adaptador', async () => {
    const vieja = 'd'.repeat(64)
    await drizzle().execute(sql`INSERT INTO ${tabla('intake_limite')} (clave_hmac, tipo, ventana, n) VALUES (${vieja}, 'intento', now() - interval '1 hour', 3)`)
    await drizzle().execute(sql`INSERT INTO ${tabla('intake_envio')} (clave, creada_en) VALUES (${vieja}, now() - interval '5 hours')`)
    await contarIntento(drizzle(), claveIp, schema())

    await purgarIntake(drizzle(), () => { throw new Error('purga falló') }, schema())

    const limites = await drizzle().execute(sql`SELECT clave_hmac FROM ${tabla('intake_limite')}`)
    expect(limites.rows.map((fila) => fila.clave_hmac)).toEqual([claveIp])
    expect((await drizzle().execute(sql`SELECT clave FROM ${tabla('intake_envio')}`)).rows).toHaveLength(0)
  })
})
