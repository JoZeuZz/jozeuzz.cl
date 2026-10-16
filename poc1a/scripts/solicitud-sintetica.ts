import { getPayload } from 'payload'
import { sql } from 'drizzle-orm'
import config from '../src/payload.config'
import { solicitudPublica } from '../src/lib/solicitudes'

const target = process.env.POC_TARGET_DATABASE
if (process.env.POC_INTAKE_SINTETICO !== '1' || process.env.POC_TEST_RUN !== '1' || !/^poc(1b|3)_[a-z0-9_]+$/.test(target ?? '') || process.env.POC_DB_SCHEMA === 'poc_prod' || process.env.NODE_ENV === 'production') throw new Error('intake sintético no autorizado')
const input = solicitudPublica(JSON.parse(Buffer.from(process.argv[2] ?? '', 'base64').toString()))
const payload = await getPayload({ config })
try {
  const db = payload.db as unknown as { drizzle: { execute: (q: unknown) => Promise<{ rows: { current_database: string }[] }> } }
  const actual = (await db.drizzle.execute(sql`SELECT current_database()`)).rows[0]?.current_database
  if (actual !== target) throw new Error('base inesperada')
  const doc = await payload.create({ collection: 'solicitudes', data: input as any, draft: false, overrideAccess: true })
  console.log(`RESULTADO:${JSON.stringify({ id: doc.id })}`)
} finally { await payload.destroy() }
process.exit(0)
