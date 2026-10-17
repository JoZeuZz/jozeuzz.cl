import { describe, expect, it, vi } from 'vitest'

import { PURGA_ENVIO_MS, PURGA_LIMITE_MS, purgarIntake, TOKEN_TTL_MS } from './purga'

describe('purgarIntake', () => {
  it('conserva envío al menos durante el TTL del token', () => {
    expect(PURGA_ENVIO_MS).toBeGreaterThanOrEqual(TOKEN_TTL_MS)
    expect(PURGA_LIMITE_MS).toBe(1_200_000)
  })

  it('emite ambos DELETE con umbrales y limita cada proceso a 60 segundos', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(100_000))
    const execute = vi.fn().mockResolvedValue(undefined)
    const registrar = vi.fn()
    await purgarIntake({ execute }, registrar)
    expect(execute).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(execute.mock.calls)).toContain('intake_envio')
    expect(JSON.stringify(execute.mock.calls)).toContain("interval '4 hours'")
    expect(JSON.stringify(execute.mock.calls)).toContain('intake_limite')
    expect(JSON.stringify(execute.mock.calls)).toContain("interval '20 minutes'")
    await purgarIntake({ execute }, registrar)
    expect(execute).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(60_000)
    await purgarIntake({ execute }, registrar)
    expect(execute).toHaveBeenCalledTimes(4)
    expect(registrar).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('registra fallo sin propagarlo', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(300_000))
    const execute = vi.fn().mockRejectedValueOnce(new Error('db'))
    const registrar = vi.fn()
    await expect(purgarIntake({ execute }, registrar)).resolves.toBeUndefined()
    expect(registrar).toHaveBeenCalledWith({ evento: 'intake_purga' })
    vi.useRealTimers()
  })
})
