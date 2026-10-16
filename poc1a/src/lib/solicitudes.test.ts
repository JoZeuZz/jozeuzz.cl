import { getPayload } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { listarServiciosPublicos } from './publico'
import { solicitudPublica, validarSolicitudPublica, validarTransicion } from './solicitudes'

vi.mock('payload', async (importOriginal) => ({ ...await importOriginal<typeof import('payload')>(), getPayload: vi.fn() }))

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

  it('mide nombre, contacto y tipo_equipo en code points', () => {
    expect(validarSolicitudPublica({ ...solicitudValida(), nombre: '😀'.repeat(120) })).toMatchObject({ ok: true })
    expect(validarSolicitudPublica({ ...solicitudValida(), nombre: '😀'.repeat(121) })).toEqual({ ok: false, codigo: 'datos_invalidos', campos: ['nombre'] })
    expect(validarSolicitudPublica({ ...solicitudValida(), contacto: '😀'.repeat(200) })).toMatchObject({ ok: true })
    expect(validarSolicitudPublica({ ...solicitudValida(), contacto: '😀'.repeat(201) })).toEqual({ ok: false, codigo: 'datos_invalidos', campos: ['contacto'] })
    expect(validarSolicitudPublica({ ...solicitudValida(), tipo_equipo: '😀'.repeat(120) })).toMatchObject({ ok: true })
    expect(validarSolicitudPublica({ ...solicitudValida(), tipo_equipo: '😀'.repeat(121) })).toEqual({ ok: false, codigo: 'datos_invalidos', campos: ['tipo_equipo'] })
  })

  it.each(['nombre', 'contacto', 'tipo_equipo', 'descripcion'] as const)('rechaza U+0000 en %s', (campo) => {
    expect(validarSolicitudPublica({ ...solicitudValida(), [campo]: 'válido\u0000' })).toEqual({ ok: false, codigo: 'datos_invalidos', campos: [campo] })
  })

  it.each(['estado', 'motivo_cierre', 'observaciones_internas', 'id', 'creada_en', 'campo_forjado'])('rechaza campo no permitido %s', (campo) => {
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
    expect(validarSolicitudPublica({ ...solicitudValida(), servicio: 'a'.repeat(80) })).toMatchObject({ ok: true })
    expect(validarSolicitudPublica({ ...solicitudValida(), servicio: 'a'.repeat(81) })).toEqual({ ok: false, codigo: 'datos_invalidos', campos: ['servicio'] })
  })

  it('acepta token y sitio_web sin incluirlos en datos guardables', () => {
    expect(validarSolicitudPublica({ ...solicitudValida(), token: 'token', sitio_web: 'https://forjado.invalid' })).toEqual({
      ok: true,
      datos: { ...solicitudValida(), servicio: undefined },
    })
  })

  it('consulta servicios públicos sólo activos', async () => {
    const find = vi.fn().mockResolvedValue({ docs: [{ slug: 'activo', titulo: 'Activo', descripcion: null }] })
    vi.mocked(getPayload).mockResolvedValue({ find } as never)

    await expect(listarServiciosPublicos()).resolves.toEqual([{ slug: 'activo', titulo: 'Activo', descripcion: '' }])
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ where: { activo: { equals: true } }, overrideAccess: false }))
  })
})
