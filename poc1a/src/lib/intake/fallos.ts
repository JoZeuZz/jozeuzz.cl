import configPayload from '@payload-config'
import { sql } from 'drizzle-orm'
import { getPayload } from 'payload'

import type { SondaPersistencia } from './persistir'

// Inyección de fallos SÓLO DE PRUEBAS (diseño §5.4). El proxy de producción borra `X-Poc-Fallo`; además la sonda
// exige las dos condiciones literales de abajo (la regla estática (f) las comprueba) y Next elimina el bloque en
// `.next-prod` porque inlinea NODE_ENV (test/build/sin-inyeccion.test.mjs).
// Cada fallo provoca un error real de PostgreSQL/Drizzle cuyo texto lleva el nombre enviado.

export function sondaDePrueba(request: Request): SondaPersistencia | undefined {
  if (process.env.NODE_ENV !== 'production' && process.env.POC_FALLOS_INYECTABLES === '1') {
    const schema = process.env.POC_DB_SCHEMA && process.env.POC_DB_SCHEMA !== 'public' ? process.env.POC_DB_SCHEMA : 'public'
    switch (request.headers.get('x-poc-fallo')) {
      case 'intake-pg-check':
        // CHECK (tipo IN ('intento','creacion')): 23514 con «Failing row contains (…, <nombre>, …)».
        return { trasCupo: async (tx, d) => { await tx.execute(sql`INSERT INTO ${sql.identifier(schema)}.${sql.identifier('intake_limite')} (clave_hmac, tipo, ventana, n) VALUES (repeat('a', 64), ${d.nombre}, now(), 1)`) } }
      case 'intake-pg-tipo':
        // 22P02: «invalid input syntax for type integer: "<nombre>"».
        return { trasCupo: async (tx, d) => { await tx.execute(sql`SELECT ${d.nombre}::integer`) } }
      case 'intake-fuera':
        // U+0000 en un text de PostgreSQL: falla dentro de Payload/Drizzle con los params en el mensaje.
        return { antesDeCrear: (d) => ({ ...d, nombre: `${d.nombre}\u0000` }) }
      case 'intake-log-crudo':
        // Fuga deliberada: registra el error crudo en el logger de Payload (el saneamiento de log.ts debe neutralizarlo).
        return {
          trasCupo: async (tx, d) => {
            try { await tx.execute(sql`SELECT ${d.nombre}::integer`) } catch (error) {
              (await getPayload({ config: configPayload })).logger.error(error)
              throw error
            }
          },
        }
    }
  }
  return undefined
}
