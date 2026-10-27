/**
 * Tests adicionales Task3 QA — límites exactos faltantes + claves de error allowlist
 *
 * RED antes de ajustar validar.ts si alguno falla.
 * Cubre: contacto 3/200/2/201, tipoEquipo 2/120/1/121,
 * descripción exacta 4000, NFC/trim/collapse en contacto y tipoEquipo,
 * servicio ID Payload válido/inválido, claves de error solo allowlist pública.
 */
import { describe, expect, it } from 'vitest'
import { validarSolicitud } from '@/modules/intake/validar'

const CAMPOS_PUBLICOS = ['nombre', 'contacto', 'tipoEquipo', 'descripcion', 'servicio']

const BASE = {
  nombre: 'Juan Pérez',
  contacto: '+56912345678',
  tipoEquipo: 'Notebook',
  descripcion: 'Equipo no enciende. Se conecta el cargador pero nada ocurre.',
  website: '',
  token: 'tok-abc',
} as Record<string, unknown>

function camposError(r: ReturnType<typeof validarSolicitud>): string[] {
  if (r.ok) return []
  return Object.keys(r.campos)
}

describe('validarSolicitud — límites exactos adicionales', () => {
  // ── contacto ────────────────────────────────────────────────────────────
  it('acepta contacto exactamente 3 caracteres', () => {
    const r = validarSolicitud({ ...BASE, contacto: 'abc' })
    expect(r.ok).toBe(true)
  })

  it('rechaza contacto exactamente 2 caracteres', () => {
    const r = validarSolicitud({ ...BASE, contacto: 'ab' })
    expect(r.ok).toBe(false)
    expect(camposError(r).every(c => CAMPOS_PUBLICOS.includes(c))).toBe(true)
  })

  it('acepta contacto exactamente 200 caracteres', () => {
    const r = validarSolicitud({ ...BASE, contacto: 'x'.repeat(200) })
    expect(r.ok).toBe(true)
  })

  it('rechaza contacto exactamente 201 caracteres', () => {
    const r = validarSolicitud({ ...BASE, contacto: 'x'.repeat(201) })
    expect(r.ok).toBe(false)
    expect(camposError(r).every(c => CAMPOS_PUBLICOS.includes(c))).toBe(true)
  })

  // ── tipoEquipo ───────────────────────────────────────────────────────────
  it('acepta tipoEquipo exactamente 2 caracteres', () => {
    const r = validarSolicitud({ ...BASE, tipoEquipo: 'PC' })
    expect(r.ok).toBe(true)
  })

  it('rechaza tipoEquipo exactamente 1 caracter', () => {
    const r = validarSolicitud({ ...BASE, tipoEquipo: 'X' })
    expect(r.ok).toBe(false)
    expect(camposError(r).every(c => CAMPOS_PUBLICOS.includes(c))).toBe(true)
  })

  it('acepta tipoEquipo exactamente 120 caracteres', () => {
    const r = validarSolicitud({ ...BASE, tipoEquipo: 'T'.repeat(120) })
    expect(r.ok).toBe(true)
  })

  it('rechaza tipoEquipo exactamente 121 caracteres', () => {
    const r = validarSolicitud({ ...BASE, tipoEquipo: 'T'.repeat(121) })
    expect(r.ok).toBe(false)
    expect(camposError(r).every(c => CAMPOS_PUBLICOS.includes(c))).toBe(true)
  })

  // ── descripcion ──────────────────────────────────────────────────────────
  it('acepta descripcion exactamente 4000 caracteres', () => {
    const r = validarSolicitud({ ...BASE, descripcion: 'D'.repeat(4000) })
    expect(r.ok).toBe(true)
  })

  // ── NFC/trim/collapse en contacto y tipoEquipo ──────────────────────────
  it('normaliza NFC en contacto', () => {
    const nfd = '\u006E\u0303' + 'ame-contacto@test.invalid' // ñ NFD + resto
    const r = validarSolicitud({ ...BASE, contacto: nfd })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.datos.contacto.startsWith('ñ')).toBe(true)
  })

  it('trim espacios en contacto', () => {
    const r = validarSolicitud({ ...BASE, contacto: '  @usuario  ' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.datos.contacto).toBe('@usuario')
  })

  it('colapsa whitespace en contacto', () => {
    const r = validarSolicitud({ ...BASE, contacto: 'via\t  Whatsapp' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.datos.contacto).toBe('via Whatsapp')
  })

  it('normaliza NFC en tipoEquipo', () => {
    const nfd = 'porta\u0301til' // 'á' NFD en portátil
    const r = validarSolicitud({ ...BASE, tipoEquipo: nfd })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.datos.tipoEquipo).toBe('portátil')
  })

  it('trim y collapse en tipoEquipo', () => {
    const r = validarSolicitud({ ...BASE, tipoEquipo: '  Laptop\t Gaming  ' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.datos.tipoEquipo).toBe('Laptop Gaming')
  })

  // ── servicio: ID Payload válido/inválido ─────────────────────────────────
  it('acepta servicio como ID numérico en string', () => {
    const r = validarSolicitud({ ...BASE, servicio: '42' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.datos.servicio).toBe('42')
  })

  it('acepta servicio como string alfanumérico (slug o ID)', () => {
    const r = validarSolicitud({ ...BASE, servicio: 'servicio-reparacion-123' })
    expect(r.ok).toBe(true)
  })

  it('rechaza servicio string con solo espacios (colapsa a vacío)', () => {
    const r = validarSolicitud({ ...BASE, servicio: '   ' })
    expect(r.ok).toBe(false)
    expect(camposError(r).every(c => CAMPOS_PUBLICOS.includes(c))).toBe(true)
  })

  it('rechaza servicio null (tipo incorrecto)', () => {
    const r = validarSolicitud({ ...BASE, servicio: null })
    expect(r.ok).toBe(false)
    expect(camposError(r).every(c => CAMPOS_PUBLICOS.includes(c))).toBe(true)
  })

  it('rechaza servicio como número (tipo incorrecto)', () => {
    const r = validarSolicitud({ ...BASE, servicio: 42 })
    expect(r.ok).toBe(false)
    expect(camposError(r).every(c => CAMPOS_PUBLICOS.includes(c))).toBe(true)
  })

  // ── claves de error: solo allowlist pública en todos los rechazos ────────
  it('error por nombre corto: claves solo allowlist', () => {
    const r = validarSolicitud({ ...BASE, nombre: 'X' })
    expect(r.ok).toBe(false)
    expect(camposError(r).every(c => CAMPOS_PUBLICOS.includes(c))).toBe(true)
  })

  it('error por token vacío: claves solo allowlist', () => {
    const r = validarSolicitud({ ...BASE, token: '' })
    expect(r.ok).toBe(false)
    expect(camposError(r).every(c => CAMPOS_PUBLICOS.includes(c))).toBe(true)
  })

  it('error por clave admin estado: claves solo allowlist', () => {
    const r = validarSolicitud({ ...BASE, estado: 'recibida' })
    expect(r.ok).toBe(false)
    expect(camposError(r).every(c => CAMPOS_PUBLICOS.includes(c))).toBe(true)
  })
})
