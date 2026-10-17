import type { BasePostgresAdapter, PostgresSchemaHook } from '@payloadcms/drizzle/postgres'
import { check, index, integer, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const extenderEsquemaIntake: PostgresSchemaHook = ({ adapter: schemaAdapter, schema }) => {
  const adapter = schemaAdapter as typeof schemaAdapter & Pick<BasePostgresAdapter, 'pgSchema'>
  const intakeEnvio = schema.tables.intake_envio ?? adapter.pgSchema.table(
    'intake_envio',
    {
      clave: text('clave').primaryKey(),
      creadaEn: timestamp('creada_en', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    },
    (table) => [
      check('intake_envio_clave_hex_check', sql`${table.clave} ~ '^[0-9a-f]{64}$'`),
      index('intake_envio_creada_en_idx').on(table.creadaEn),
    ],
  )
  const intakeLimite = schema.tables.intake_limite ?? adapter.pgSchema.table(
    'intake_limite',
    {
      claveHmac: text('clave_hmac').notNull(),
      tipo: text('tipo').notNull(),
      ventana: timestamp('ventana', { withTimezone: true, precision: 3 }).notNull(),
      n: integer('n').notNull(),
    },
    (table) => [
      primaryKey({ columns: [table.claveHmac, table.tipo, table.ventana] }),
      check('intake_limite_clave_hmac_hex_check', sql`${table.claveHmac} ~ '^[0-9a-f]{64}$'`),
      check('intake_limite_tipo_check', sql`${table.tipo} IN ('intento', 'creacion')`),
      check('intake_limite_n_positivo_check', sql`${table.n} >= 1`),
      index('intake_limite_ventana_idx').on(table.ventana),
    ],
  )

  return {
    ...schema,
    tables: {
      ...schema.tables,
      intake_envio: intakeEnvio,
      intake_limite: intakeLimite,
    },
  }
}
