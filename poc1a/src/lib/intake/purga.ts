import { sql } from 'drizzle-orm'

export const TOKEN_TTL_MS = 7_200_000
export const PURGA_ENVIO_MS = 14_400_000
export const PURGA_LIMITE_MS = 1_200_000
let ultimaPurga = 0

export async function purgarIntake(db: { execute: (consulta: unknown) => Promise<unknown> }, registrar: (dato: { evento: 'intake_purga' }) => void): Promise<void> {
  if (Date.now() - ultimaPurga < 60_000) return
  ultimaPurga = Date.now()
  try {
    await db.execute(sql`DELETE FROM intake_envio WHERE creada_en < now() - interval '4 hours'`)
    await db.execute(sql`DELETE FROM intake_limite WHERE ventana < now() - interval '20 minutes'`)
  } catch { registrar({ evento: 'intake_purga' }) }
}
