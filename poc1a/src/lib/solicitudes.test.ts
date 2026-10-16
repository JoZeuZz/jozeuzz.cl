import { describe, expect, it } from 'vitest'

import { solicitudPublica, validarTransicion } from './solicitudes'

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

it('allowlist R-1 descarta campos administrativos', () => {
  expect(solicitudPublica({ nombre: 'n', contacto: 'c', tipo_equipo: 'e', descripcion: 'd', servicio: 1, estado: 'cerrada', motivo_cierre: 'spam', observaciones_internas: 'o', actor: 'x' })).toEqual({ nombre: 'n', contacto: 'c', tipo_equipo: 'e', descripcion: 'd', servicio: 1 })
})
