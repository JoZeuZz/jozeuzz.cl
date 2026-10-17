import { describe, expect, it } from 'vitest'

import { cargarConfigIntake, ErrorConfigIntake } from './config'

const secreta = 'a'.repeat(64)
const base = { INTAKE_SECRETO: secreta, PAYLOAD_SECRET: 'b'.repeat(64), INTAKE_ORIGEN_PUBLICO: 'https://127.0.0.1:3443' }

describe('cargarConfigIntake', () => {
  it('carga valores válidos sin leer process.env al importar', () => {
    expect(cargarConfigIntake(base)).toMatchObject({ secretoHex: secreta, origenPublico: base.INTAKE_ORIGEN_PUBLICO, tiempoMinimoMs: 3000 })
  })

  it.each([
    [{ ...base, INTAKE_SECRETO: undefined }],
    [{ ...base, INTAKE_SECRETO: 'abc' }],
    [{ ...base, INTAKE_SECRETO: 'a'.repeat(65) }],
    [{ ...base, INTAKE_SECRETO: base.PAYLOAD_SECRET }],
    [{ ...base, INTAKE_ORIGEN_PUBLICO: undefined }],
    [{ ...base, INTAKE_ORIGEN_PUBLICO: 'http://127.0.0.1:3443' }],
    [{ ...base, INTAKE_ORIGEN_PUBLICO: 'https://127.0.0.1:3443/ruta' }],
    [{ ...base, INTAKE_TIEMPO_MINIMO_MS: '1.5' }],
    [{ ...base, INTAKE_TIEMPO_MINIMO_MS: '60001' }],
    [{ ...base, INTAKE_TIEMPO_MINIMO_MS: '-1' }],
    [{ ...base, INTAKE_TIEMPO_MINIMO_MS: '0', NODE_ENV: 'production' }],
  ])('rechaza configuración inválida', (env) => {
    expect(() => cargarConfigIntake(env)).toThrow(ErrorConfigIntake)
  })

  it('acepta mínimo cero fuera de producción', () => {
    expect(cargarConfigIntake({ ...base, INTAKE_TIEMPO_MINIMO_MS: '0', NODE_ENV: 'test' }).tiempoMinimoMs).toBe(0)
  })

  it('normaliza secreto hex y rechaza PAYLOAD_SECRET equivalente con distinto casing', () => {
    const secretoMayusculas = 'AB'.repeat(32)

    expect(cargarConfigIntake({ ...base, INTAKE_SECRETO: secretoMayusculas }).secretoHex).toBe(secretoMayusculas.toLowerCase())
    expect(() => cargarConfigIntake({ ...base, INTAKE_SECRETO: secretoMayusculas, PAYLOAD_SECRET: secretoMayusculas.toLowerCase() })).toThrow(ErrorConfigIntake)
  })
})
