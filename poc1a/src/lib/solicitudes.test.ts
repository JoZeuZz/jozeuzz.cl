import { describe, expect, it } from 'vitest'

import { solicitudPublica, validarSolicitudPublica, validarTransicion } from './solicitudes'

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

const solicitudValida = () => ({ nombre: 'Nombre', contacto: 'contacto@example.invalid', tipo_equipo: 'notebook', descripcion: 'Descripción' })

describe('validarSolicitudPublica', () => {
  it.each(['nombre', 'contacto', 'tipo_equipo', 'descripcion'] as const)('rechaza %s ausente', (campo) => {
    const entrada = solicitudValida()
    delete entrada[campo]

    expect(validarSolicitudPublica(entrada)).toEqual({ ok: false, codigo: 'datos_invalidos', campos: [campo] })
  })

  it.each([123, {}, []])('rechaza campos obligatorios que no son string: %j', (valor) => {
    for (const campo of ['nombre', 'contacto', 'tipo_equipo', 'descripcion'] as const) {
      expect(validarSolicitudPublica({ ...solicitudValida(), [campo]: valor })).toEqual({ ok: false, codigo: 'datos_invalidos', campos: [campo] })
    }
  })

  it('mide descripción en code points', () => {
    expect(validarSolicitudPublica({ ...solicitudValida(), descripcion: '😀'.repeat(4000) })).toMatchObject({ ok: true })
    expect(validarSolicitudPublica({ ...solicitudValida(), descripcion: '😀'.repeat(4001) })).toEqual({ ok: false, codigo: 'datos_invalidos', campos: ['descripcion'] })
  })

  it('mide nombre en code points y rechaza NUL', () => {
    expect(validarSolicitudPublica({ ...solicitudValida(), nombre: '😀'.repeat(120) })).toMatchObject({ ok: true })
    expect(validarSolicitudPublica({ ...solicitudValida(), nombre: '😀'.repeat(121) })).toEqual({ ok: false, codigo: 'datos_invalidos', campos: ['nombre'] })
    expect(validarSolicitudPublica({ ...solicitudValida(), nombre: 'válido\u0000' })).toEqual({ ok: false, codigo: 'datos_invalidos', campos: ['nombre'] })
  })

  it.each(['estado', 'motivo_cierre', 'observaciones_internas', 'id', 'creada_en'])('rechaza campo administrativo %s', (campo) => {
    expect(validarSolicitudPublica({ ...solicitudValida(), [campo]: 'forjado' })).toEqual({ ok: false, codigo: 'campos_no_permitidos' })
  })

  it('rechaza __proto__ propio sin depender de literal inseguro', () => {
    const entrada = Object.assign(Object.create(null), solicitudValida()) as Record<string, unknown>
    Object.defineProperty(entrada, '__proto__', { value: 'forjado', enumerable: true })

    expect(validarSolicitudPublica(entrada)).toEqual({ ok: false, codigo: 'campos_no_permitidos' })
  })

  it('acepta servicio ausente o vacío y valida slug', () => {
    expect(validarSolicitudPublica(solicitudValida())).toEqual({ ok: true, datos: { ...solicitudValida(), servicio: undefined } })
    expect(validarSolicitudPublica({ ...solicitudValida(), servicio: '' })).toEqual({ ok: true, datos: { ...solicitudValida(), servicio: undefined } })
    expect(validarSolicitudPublica({ ...solicitudValida(), servicio: null })).toEqual({ ok: false, codigo: 'datos_invalidos', campos: ['servicio'] })
    expect(validarSolicitudPublica({ ...solicitudValida(), servicio: 'No-valido' })).toEqual({ ok: false, codigo: 'datos_invalidos', campos: ['servicio'] })
    expect(validarSolicitudPublica({ ...solicitudValida(), servicio: 'soporte-remoto' })).toEqual({ ok: true, datos: { ...solicitudValida(), servicio: 'soporte-remoto' } })
  })
})
