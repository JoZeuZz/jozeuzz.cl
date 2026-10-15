import config from '@payload-config'
import { sql } from 'drizzle-orm'
import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { vaciarBase } from '../../src/lib/base'

let payload: Payload
const MARCA = 'snt-marcador-migracion'

type Db = { schemaName?: string; drizzle: { execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }> } }
const db = () => payload.db as unknown as Db
const schema = () => db().schemaName ?? 'public'
const filasMarca = async () =>
  (await db().drizzle.execute(sql.raw(`SELECT name FROM "${schema()}"."payload_migrations" WHERE name = '${MARCA}'`))).rows.length

beforeAll(async () => {
  payload = await getPayload({ config })
})

afterAll(async () => {
  if (payload) {
    await db().drizzle.execute(sql.raw(`DELETE FROM "${schema()}"."payload_migrations" WHERE name = '${MARCA}'`))
    await payload.destroy()
  }
})

describe('vaciarBase', () => {
  it('vacía los datos pero conserva el registro de migraciones (payload_migrations)', async () => {
    await db().drizzle.execute(
      sql.raw(`INSERT INTO "${schema()}"."payload_migrations" (name, batch) VALUES ('${MARCA}', 999)`),
    )
    await payload.create({
      collection: 'servicios',
      data: { slug: 'snt-base-test', titulo: 'SNT-BASE', activo: true },
      overrideAccess: true,
    })
    await vaciarBase(payload)
    expect((await payload.count({ collection: 'servicios', overrideAccess: true })).totalDocs).toBe(0)
    expect(await filasMarca()).toBe(1)
  })
})
