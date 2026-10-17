import { eq } from 'drizzle-orm'
import { commitTransaction, createLocalReq, initTransaction, killTransaction, type Payload } from 'payload'

import type { DatosSolicitudPublica } from '@/lib/solicitudes'

import { purgarIntake } from './purga'
import { contarCreacion, schemaIntake } from './limites'

export type DatosSolicitud = Omit<DatosSolicitudPublica, 'servicio'> & { servicio?: number }
export type ResultadoPersistencia = { tipo: 'creada' } | { tipo: 'duplicada' } | { tipo: 'limite'; reintentarEnS: number }
type TxIntake = { execute: (consulta: unknown) => Promise<{ rows: { n: number; reintentar_en_s: number }[] }>; insert: (tabla: unknown) => { values: (valor: unknown) => { onConflictDoNothing: () => { returning: () => Promise<unknown[]> } } } }
export type SondaPersistencia = { trasReserva?: (tx: TxIntake) => Promise<void>; trasCupo?: (tx: TxIntake, d: DatosSolicitud) => Promise<void>; antesDeCrear?: (d: DatosSolicitud) => DatosSolicitud }

export async function persistirIntake(payload: Payload, entrada: { datos: DatosSolicitud; claveEnvio: string; claveIp: string }, sonda?: SondaPersistencia): Promise<ResultadoPersistencia> {
  const req = await createLocalReq({ context: { canal: 'intake' } }, payload)
  try {
    await initTransaction(req)
    const db = payload.db as typeof payload.db & { sessions: Record<string, { db: TxIntake }>; tables: { intake_envio: unknown } }
    const transactionID = req.transactionID
    if (!transactionID || transactionID instanceof Promise || !db.sessions[transactionID]?.db) throw new Error('intake_transaccion_invalida')
    const tx = db.sessions[transactionID].db
    const reserva = await tx.insert(db.tables.intake_envio).values({ clave: entrada.claveEnvio }).onConflictDoNothing().returning()
    if (reserva.length === 0) { await killTransaction(req); return { tipo: 'duplicada' } }
    await sonda?.trasReserva?.(tx)
    const cupo = await contarCreacion(tx, entrada.claveIp, schemaIntake(db))
    if (!cupo.permitido) { await killTransaction(req); return { tipo: 'limite', reintentarEnS: cupo.reintentarEnS } }
    await sonda?.trasCupo?.(tx, entrada.datos)
    const datos = sonda?.antesDeCrear?.(entrada.datos) ?? entrada.datos
    await payload.create({ collection: 'solicitudes', data: datos as never, req, overrideAccess: true, depth: 0, draft: false, select: { id: true } as never })
    await commitTransaction(req)
    const fuera = db.drizzle as { select: () => { from: (tabla: unknown) => { where: (predicado: unknown) => Promise<unknown[]> } } }
    const tablaEnvio = db.tables.intake_envio as { clave: unknown }
    const existe = await fuera.select().from(db.tables.intake_envio).where(eq(tablaEnvio.clave as never, entrada.claveEnvio as never))
    if (existe.length === 0) throw new Error('intake_reserva_ausente')
    await purgarIntake(db.drizzle as never, (dato) => payload.logger.error(dato), schemaIntake(db))
    return { tipo: 'creada' }
  } catch (error) { await killTransaction(req); throw error }
}
