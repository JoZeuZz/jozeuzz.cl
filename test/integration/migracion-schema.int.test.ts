/**
 * Integración: verificación de schema migrado
 *
 * Requiere DATABASE_URL con DB ya migrada (provista por harness).
 * Verifica tablas, índices unique, FKs principales, enum y
 * registro de migración en payload_migrations.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getPayload } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

const DB_URL = process.env.DATABASE_URL
  ?? 'postgres://jozeuzz:jozeuzz@127.0.0.1:5435/jozeuzz'

let payload: Payload

// Helper para ejecutar SQL raw via drizzle del adapter
async function rawQuery<T = Record<string, unknown>>(query: ReturnType<typeof sql>): Promise<T[]> {
  const result = await (payload.db as { drizzle: { execute: (q: unknown) => Promise<{ rows: T[] }> } }).drizzle.execute(query)
  return result.rows
}

beforeAll(async () => {
  process.env.DATABASE_URL = DB_URL
  process.env.PAYLOAD_SECRET = process.env.PAYLOAD_SECRET ?? 'harness-secret'
  process.env.NEXT_PUBLIC_SERVER_URL = 'http://127.0.0.1:3000'

  const { default: config } = await import('@/payload.config')
  payload = await getPayload({ config: await config })
}, 30_000)

afterAll(async () => {
  await (payload.db as { destroy?: () => Promise<void> }).destroy?.()
})

describe('migración: schema verificado', () => {
  it('tablas principales existen en information_schema', async () => {
    type Row = { table_name: string }
    const rows = await rawQuery<Row>(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name`)
    const nombres = rows.map(r => r.table_name)
    expect(nombres).toContain('usuarios')
    expect(nombres).toContain('servicios')
    expect(nombres).toContain('solicitudes')
    expect(nombres).toContain('payload_migrations')
    expect(nombres).toContain('payload_locked_documents')
  })

  it('índices unique: usuarios_email_idx y servicios_slug_idx existen', async () => {
    type Row = { indexname: string }
    const rows = await rawQuery<Row>(sql`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY indexname`)
    const indices = rows.map(r => r.indexname)
    expect(indices).toContain('usuarios_email_idx')
    expect(indices).toContain('servicios_slug_idx')
  })

  it('FK: usuarios_sessions referencia usuarios', async () => {
    type Row = { constraint_name: string }
    const rows = await rawQuery<Row>(sql`
      SELECT constraint_name FROM information_schema.table_constraints
      WHERE constraint_type = 'FOREIGN KEY'
        AND table_schema = 'public'
        AND table_name = 'usuarios_sessions'`)
    const fks = rows.map(r => r.constraint_name)
    expect(fks.some(f => f.includes('parent'))).toBe(true)
  })

  it('FK: solicitudes referencia servicios', async () => {
    type Row = { constraint_name: string }
    const rows = await rawQuery<Row>(sql`
      SELECT constraint_name FROM information_schema.table_constraints
      WHERE constraint_type = 'FOREIGN KEY'
        AND table_schema = 'public'
        AND table_name = 'solicitudes'`)
    const fks = rows.map(r => r.constraint_name)
    expect(fks.some(f => f.includes('servicio'))).toBe(true)
  })

  it('payload_migrations registra exactamente 1 migración aplicada', async () => {
    type Row = { name: string; batch: number }
    const rows = await rawQuery<Row>(sql`
      SELECT name, batch FROM payload_migrations ORDER BY id`)
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('20261027_112804')
    expect(Number(rows[0].batch)).toBe(1)
  })

  it('enum enum_solicitudes_estado existe con valor recibida', async () => {
    type Row = { enumlabel: string }
    const rows = await rawQuery<Row>(sql`
      SELECT enumlabel FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'enum_solicitudes_estado'`)
    const labels = rows.map(r => r.enumlabel)
    expect(labels).toContain('recibida')
  })
})
