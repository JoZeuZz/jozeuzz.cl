import { describe, expect, it, vi } from 'vitest'

import { PURGA_ENVIO_MS, PURGA_LIMITE_MS, purgarIntake, TOKEN_TTL_MS } from './purga'

describe('purgarIntake', () => {
  it('conserva envío al menos durante el TTL del token', () => {
    expect(PURGA_ENVIO_MS).toBeGreaterThanOrEqual(TOKEN_TTL_MS)
    expect(PURGA_LIMITE_MS).toBe(1_200_000)
  })

  it('emite ambos DELETE y registra fallo sin propagarlo', async () => {
    const execute = vi.fn().mockRejectedValueOnce(new Error('db'))
    const registrar = vi.fn()
    await expect(purgarIntake({ execute }, registrar)).resolves.toBeUndefined()
    expect(execute).toHaveBeenCalled()
    expect(registrar).toHaveBeenCalledWith({ evento: 'intake_purga' })
  })
})
