import { sql } from 'drizzle-orm'
import type { Payload } from 'payload'

/**
 * Vacía todas las tablas del schema de la POC (colecciones, versiones, sesiones, bloqueos).
 * Sólo para scripts y pruebas: usa SQL directo y nunca se importa desde rutas públicas.
 */
export async function vaciarBase(payload: Payload): Promise<void> {
  const db = payload.db as unknown as {
    schemaName?: string
    drizzle: { execute: (q: unknown) => Promise<{ rows: { tablename: string }[] }> }
  }
  const schema = db.schemaName ?? 'public'
  const { rows } = await db.drizzle.execute(
    sql`SELECT tablename FROM pg_tables WHERE schemaname = ${schema}`,
  )
  if (rows.length === 0) return
  const lista = rows.map((r) => `"${schema}"."${r.tablename}"`).join(', ')
  await db.drizzle.execute(sql.raw(`TRUNCATE ${lista} RESTART IDENTITY CASCADE`))
}
