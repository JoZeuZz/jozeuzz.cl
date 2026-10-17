import { sql } from 'drizzle-orm'

export const LIMITES = {
  intentos: { max: 30, ventanaMs: 600_000 },
  creaciones: { max: 5, ventanaMs: 600_000 },
} as const

type TipoLimite = 'intento' | 'creacion'
type FilaLimite = { n: number; reintentar_en_s: number }
type EjecutaLimite = { execute: (consulta: unknown) => Promise<{ rows: FilaLimite[] }> }

/** Schema donde el adaptador de Payload creó las tablas (Payload no fija search_path). */
export function schemaIntake(db: unknown): string {
  return (db as { schemaName?: string } | undefined)?.schemaName ?? 'public'
}

async function contar(db: EjecutaLimite, claveIp: string, tipo: TipoLimite, schema: string): Promise<{ permitido: boolean; reintentarEnS: number }> {
  const tabla = sql`${sql.identifier(schema)}.${sql.identifier('intake_limite')}`
  const resultado = await db.execute(sql`
    INSERT INTO ${tabla} (clave_hmac, tipo, ventana, n)
    VALUES (${claveIp}, ${tipo}, date_bin('10 minutes', now(), timestamptz '2000-01-01 00:00:00+00'), 1)
    ON CONFLICT (clave_hmac, tipo, ventana) DO UPDATE SET n = ${tabla}.n + 1
    RETURNING n, GREATEST(1, CEIL(EXTRACT(EPOCH FROM (ventana + interval '10 minutes' - now()))))::integer AS reintentar_en_s
  `)
  const fila = resultado.rows[0]
  if (!fila) throw new Error('intake_limite_sin_resultado')
  const limite = tipo === 'intento' ? LIMITES.intentos.max : LIMITES.creaciones.max
  return { permitido: fila.n <= limite, reintentarEnS: Math.max(1, fila.reintentar_en_s) }
}

export function contarIntento(db: EjecutaLimite, claveIp: string, schema: string) {
  return contar(db, claveIp, 'intento', schema)
}

export function contarCreacion(tx: EjecutaLimite, claveIp: string, schema: string) {
  return contar(tx, claveIp, 'creacion', schema)
}
