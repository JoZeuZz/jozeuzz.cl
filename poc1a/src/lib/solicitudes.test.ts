import { describe, expect, it } from 'vitest'

import { validarTransicion } from './solicitudes'

describe('validarTransicion', () => {
  it('acepta recibida a en_gestion sin motivo', () => {
    expect(validarTransicion('recibida', 'en_gestion', undefined)).toEqual({ motivo_cierre: null })
  })

  it('exige motivo permitido para cerrar y rechaza estados terminales', () => {
    expect(() => validarTransicion('recibida', 'cerrada', undefined)).toThrow('motivo')
    expect(() => validarTransicion('cerrada', 'en_gestion', undefined)).toThrow('transición')
    expect(validarTransicion('en_gestion', 'cerrada', 'atendida')).toEqual({ motivo_cierre: 'atendida' })
  })
})
