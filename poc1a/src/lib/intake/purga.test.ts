import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'

import { PURGA_ENVIO_MS, PURGA_LIMITE_MS, purgarIntake, TOKEN_TTL_MS } from './purga'

const dialecto = new PgDialect()
const textos = (execute: ReturnType<typeof vi.fn>) => execute.mock.calls.map((llamada) => dialecto.sqlToQuery(llamada[0] as never).sql)

describe('purgarIntake', () => {
  it('conserva envío al menos durante el TTL del token', () => {
    expect(PURGA_ENVIO_MS).toBeGreaterThanOrEqual(TOKEN_TTL_MS)
    expect(PURGA_LIMITE_MS).toBe(1_200_000)
  })

  it('emite ambos DELETE calificados con el schema y limita cada proceso a 60 segundos', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(100_000))
    const execute = vi.fn().mockResolvedValue(undefined)
    const registrar = vi.fn()
    await purgarIntake({ execute }, registrar, 'poc_test')
    expect(execute).toHaveBeenCalledTimes(2)
    const [envio, limite] = textos(execute)
    expect(envio).toContain('DELETE FROM "poc_test"."intake_envio"')
    expect(envio).toContain("interval '4 hours'")
    expect(limite).toContain('DELETE FROM "poc_test"."intake_limite"')
    expect(limite).toContain("interval '20 minutes'")
    await purgarIntake({ execute }, registrar, 'poc_test')
    expect(execute).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(60_000)
    await purgarIntake({ execute }, registrar, 'poc_prod')
    expect(execute).toHaveBeenCalledTimes(4)
    expect(textos(execute)[2]).toContain('DELETE FROM "poc_prod"."intake_envio"')
    expect(registrar).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('registra fallo sin propagarlo', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(300_000))
    const execute = vi.fn().mockRejectedValueOnce(new Error('db'))
    const registrar = vi.fn()
    await expect(purgarIntake({ execute }, registrar, 'poc_test')).resolves.toBeUndefined()
    expect(registrar).toHaveBeenCalledWith({ evento: 'intake_purga' })
    vi.useRealTimers()
  })
})
