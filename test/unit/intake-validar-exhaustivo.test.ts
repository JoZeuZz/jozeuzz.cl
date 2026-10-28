/**
 * Tests exhaustivos Task3 para validarSolicitud
 * Cubre: campos faltantes, tipos incorrectos, claves admin prohibidas,
 * límites exactos, token, honeypot, NFC/whitespace, servicio opcional/formato ID,
 * contacto multicanal (no solo email).
 */
import { describe, expect, it } from 'vitest'
import { validarSolicitud } from '@/modules/intake/validar'

const BASE = {
  nombre: 'Juan Pérez',
  contacto: '+56912345678',
  tipoEquipo: 'Notebook',
  descripcion: 'Equipo no enciende. Se conecta el cargador pero nada ocurre.',
  website: '',
  token: 'tok-abc',
} as Record<string, unknown>

describe('validarSolicitud exhaustivo', () => {
  // --- Caso válido base ---
  it('acepta caso mínimo válido sin servicio', () => {
    const r = validarSolicitud(BASE)
    expect(r.ok).toBe(true)
  })

  it('acepta caso con servicio como string no vacío', () => {
    const r = validarSolicitud({ ...BASE, servicio: 'abcd1234efgh5678' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.datos.servicio).toBe('abcd1234efgh5678')
  })

  // --- Campos faltantes ---
  it.each([
    ['nombre'],
    ['contacto'],
    ['tipoEquipo'],
    ['descripcion'],
    ['token'],
    ['website'],
  ])('rechaza cuando falta %s', (campo) => {
    const copia = { ...BASE }
    delete copia[campo]
    const r = validarSolicitud(copia)
    expect(r.ok).toBe(false)
  })

  // --- Tipos incorrectos ---
  it.each([
    ['nombre', 42],
    ['contacto', true],
    ['tipoEquipo', {}],
    ['descripcion', null],
    ['token', 123],
  ])('rechaza cuando %s es tipo incorrecto (%s)', (campo, valor) => {
    const r = validarSolicitud({ ...BASE, [campo]: valor })
    expect(r.ok).toBe(false)
  })

  // --- Claves admin prohibidas ---
  it.each([
    'estado',
    'motivoCierre',
    'observacionesInternas',
    'createdAt',
  ])('rechaza clave admin "%s" en entrada pública', (clave) => {
    const r = validarSolicitud({ ...BASE, [clave]: 'valor' })
    expect(r.ok).toBe(false)
  })

  // --- Honeypot ---
  it('rechaza honeypot website no vacío', () => {
    const r = validarSolicitud({ ...BASE, website: 'bot' })
    expect(r.ok).toBe(false)
  })

  // --- Token ---
  it('rechaza token vacío', () => {
    const r = validarSolicitud({ ...BASE, token: '' })
    expect(r.ok).toBe(false)
  })

  it('excluye token de datos validados', () => {
    const r = validarSolicitud(BASE)
    if (!r.ok) throw new Error('debería ser ok')
    expect('token' in r.datos).toBe(false)
    expect(r.token).toBe('tok-abc')
  })

  // --- Límites exactos ---
  it('rechaza nombre < 2 caracteres', () => {
    const r = validarSolicitud({ ...BASE, nombre: 'A' })
    expect(r.ok).toBe(false)
  })

  it('acepta nombre exactamente 2 caracteres', () => {
    const r = validarSolicitud({ ...BASE, nombre: 'Jo' })
    expect(r.ok).toBe(true)
  })

  it('rechaza nombre > 120 caracteres', () => {
    const r = validarSolicitud({ ...BASE, nombre: 'A'.repeat(121) })
    expect(r.ok).toBe(false)
  })

  it('acepta nombre exactamente 120 caracteres', () => {
    const r = validarSolicitud({ ...BASE, nombre: 'A'.repeat(120) })
    expect(r.ok).toBe(true)
  })

  it('rechaza descripcion < 20 caracteres', () => {
    const r = validarSolicitud({ ...BASE, descripcion: 'Muy corta' })
    expect(r.ok).toBe(false)
  })

  it('acepta descripcion exactamente 20 caracteres', () => {
    const r = validarSolicitud({ ...BASE, descripcion: 'A'.repeat(20) })
    expect(r.ok).toBe(true)
  })

  it('rechaza descripcion > 4000 caracteres', () => {
    const r = validarSolicitud({ ...BASE, descripcion: 'A'.repeat(4001) })
    expect(r.ok).toBe(false)
  })

  // --- NFC y whitespace ---
  it('normaliza NFC en nombre', () => {
    // 'ñ' como NFC vs NFD
    const nfd = '\u006E\u0303' // n + combining tilde = ñ NFD
    const r = validarSolicitud({ ...BASE, nombre: `${nfd}ame` })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.datos.nombre).toBe('ñame')
  })

  it('colapsa tabs y espacios múltiples en nombre', () => {
    const r = validarSolicitud({ ...BASE, nombre: 'Juan\t  Pérez' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.datos.nombre).toBe('Juan Pérez')
  })

  it('trim espacios al inicio y fin', () => {
    const r = validarSolicitud({ ...BASE, nombre: '  Ana  ' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.datos.nombre).toBe('Ana')
  })

  // --- Contacto multicanal (no solo email) ---
  it('acepta teléfono como contacto', () => {
    const r = validarSolicitud({ ...BASE, contacto: '+56912345678' })
    expect(r.ok).toBe(true)
  })

  it('acepta email como contacto', () => {
    const r = validarSolicitud({ ...BASE, contacto: 'ana@example.com' })
    expect(r.ok).toBe(true)
  })

  it('acepta handle de red social como contacto', () => {
    const r = validarSolicitud({ ...BASE, contacto: '@usuario_red' })
    expect(r.ok).toBe(true)
  })

  it('rechaza contacto vacío', () => {
    const r = validarSolicitud({ ...BASE, contacto: '  ' })
    expect(r.ok).toBe(false)
  })

  // --- Servicio opcional ---
  it('acepta ausencia de campo servicio', () => {
    const copia = { ...BASE }
    delete copia.servicio
    const r = validarSolicitud(copia)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.datos.servicio).toBeUndefined()
  })

  it('rechaza servicio como string vacío (si se envía debe tener contenido)', () => {
    const r = validarSolicitud({ ...BASE, servicio: '' })
    expect(r.ok).toBe(false)
  })

  // --- Estructura de entrada inválida ---
  it('rechaza null como entrada', () => {
    expect(validarSolicitud(null).ok).toBe(false)
  })

  it('rechaza array como entrada', () => {
    expect(validarSolicitud([]).ok).toBe(false)
  })

  it('rechaza string como entrada', () => {
    expect(validarSolicitud('texto').ok).toBe(false)
  })
})
