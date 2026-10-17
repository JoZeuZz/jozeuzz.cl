import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/publico', () => ({ listarServiciosPublicos: vi.fn().mockResolvedValue([]) }))

import { respuestaFormulario } from './formulario'
import { cargarConfigIntake } from './config'

const config = cargarConfigIntake({ INTAKE_SECRETO: 'ab'.repeat(32), PAYLOAD_SECRET: 'cd'.repeat(32), INTAKE_ORIGEN_PUBLICO: 'https://127.0.0.1:3443' })

describe('respuestaFormulario', () => {
  it('emite HTML, cabeceras y cookie CSRF __Host exactos', async () => {
    const response = await respuestaFormulario(config)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store, private')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('referrer-policy')).toBe('same-origin')
    expect(response.headers.get('content-security-policy')).toBe("default-src 'none'; style-src-attr 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'")
    expect(response.headers.get('set-cookie')).toMatch(/^__Host-intake=[^;]+; Path=\/; Max-Age=7200; Secure; HttpOnly; SameSite=Strict$/)
    expect(await response.text()).toContain('name="token"')
  })
})
