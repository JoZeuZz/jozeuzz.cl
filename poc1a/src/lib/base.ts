import { sql } from 'drizzle-orm'
import type { Payload } from 'payload'

/**
 * Vacía las tablas de datos del schema de la POC (colecciones, versiones, sesiones, bloqueos).
 * Conserva `payload_migrations`: es el registro de migraciones aplicadas, no datos.
 * Sólo para scripts y pruebas: usa SQL directo y nunca se importa desde rutas públicas.
 */
export async function vaciarBase(payload: Payload): Promise<void> {
  const db = payload.db as unknown as {
    schemaName?: string
    drizzle: { execute: (q: unknown) => Promise<{ rows: { tablename: string }[] }> }
  }
  const schema = db.schemaName ?? 'public'
  const { rows } = await db.drizzle.execute(
    sql`SELECT tablename FROM pg_tables WHERE schemaname = ${schema} AND tablename <> 'payload_migrations'`,
  )
  if (rows.length === 0) return
  const lista = rows.map((r) => `"${schema}"."${r.tablename}"`).join(', ')
  await db.drizzle.execute(sql.raw(`TRUNCATE ${lista} RESTART IDENTITY CASCADE`))
}
