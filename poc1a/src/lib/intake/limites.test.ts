import { describe, expect, it, vi } from 'vitest'

import { LIMITES, contarCreacion, contarIntento } from './limites'

const claveIp = 'a'.repeat(64)

describe('límites intake', () => {
  it('cuenta intentos mediante UPSERT atómico y bloquea el trigésimo primero', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ n: 31, reintentar_en_s: 0 }] })

    await expect(contarIntento({ execute }, claveIp)).resolves.toEqual({ permitido: false, reintentarEnS: 1 })
    expect(LIMITES).toEqual({ intentos: { max: 30, ventanaMs: 600_000 }, creaciones: { max: 5, ventanaMs: 600_000 } })
    const consulta = JSON.stringify(execute.mock.calls[0]?.[0])
    expect(consulta).toContain('ON CONFLICT (clave_hmac, tipo, ventana) DO UPDATE SET n = intake_limite.n + 1')
    expect(consulta).toContain("date_bin('10 minutes', now(), timestamptz '2000-01-01 00:00:00+00')")
  })

  it('cuenta creaciones y conserva el Retry-After devuelto por ventana', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ n: 5, reintentar_en_s: 42 }] })

    await expect(contarCreacion({ execute }, claveIp)).resolves.toEqual({ permitido: true, reintentarEnS: 42 })
    expect(JSON.stringify(execute.mock.calls[0]?.[0])).toContain('creacion')
  })
})
