import { sql } from 'drizzle-orm'
import { getPayload } from 'payload'

import config from '../src/payload.config'

const esperada = process.argv[2]
if (!/^poc1b_[a-z0-9_]+$/.test(esperada ?? '')) {
  throw new Error('base POC-1b explícita requerida')
}

const payload = await getPayload({ config })
try {
  const db = payload.db as unknown as { drizzle: { execute: (query: unknown) => Promise<{ rows: { current_database: string }[] }> } }
  const actual = (await db.drizzle.execute(sql`SELECT current_database()`)).rows[0]?.current_database
  if (actual !== esperada) throw new Error(`base inesperada: ${actual ?? 'sin resultado'}`)
  console.log(`DATABASE_OK:${actual}`)
} finally {
  await payload.destroy()
}
process.exit(0)
