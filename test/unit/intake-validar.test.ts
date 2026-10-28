import { describe, expect, it } from 'vitest'

import { validarSolicitud } from '@/modules/intake/validar'

const valida = {
  nombre: '  Ána\tPérez  ',
  contacto: 'ana@example.invalid',
  tipoEquipo: 'Notebook',
  descripcion: 'Necesito revisar el equipo porque no inicia correctamente.',
  servicio: 'servicio-1',
  website: '',
  token: 'token-sintetico',
}

describe('validarSolicitud', () => {
  it('normaliza entrada válida y excluye honeypot/token', () => {
    expect(validarSolicitud(valida)).toEqual({
      ok: true,
      datos: { nombre: 'Ána Pérez', contacto: 'ana@example.invalid', tipoEquipo: 'Notebook', descripcion: valida.descripcion, servicio: 'servicio-1' },
      token: 'token-sintetico',
    })
  })

  it.each([
    [{ ...valida, nombre: ' ' }],
    [{ ...valida, estado: 'cerrada' }],
    [{ ...valida, website: 'robot' }],
    [{ ...valida, token: '' }],
  ])('rechaza entrada no pública', (entrada) => {
    const resultado = validarSolicitud(entrada)
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(Object.keys(resultado.campos).every((campo) => ['nombre', 'contacto', 'tipoEquipo', 'descripcion', 'servicio'].includes(campo))).toBe(true)
  })
})
