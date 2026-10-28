import { describe, expect, it } from 'vitest'
import { rechazarCambioIdentidad } from '@/modules/identity/inmutables'

describe('Usuarios: identidad inmutable', () => {
  // ── email ──────────────────────────────────────────────────────────────
  it('lanza si se intenta cambiar email en update', () => {
    const data = { nombre: 'Juan', email: 'nuevo@ejemplo.com' }
    const originalDoc = { id: 1, nombre: 'Juan', email: 'viejo@ejemplo.com' }
    expect(() => rechazarCambioIdentidad({ data, originalDoc, operation: 'update' })).toThrow(/email.*inmutable/i)
  })

  it('no lanza si email no cambia en update', () => {
    const data = { nombre: 'Juan', email: 'mismo@ejemplo.com' }
    const originalDoc = { id: 1, nombre: 'Juan', email: 'mismo@ejemplo.com' }
    expect(() => rechazarCambioIdentidad({ data, originalDoc, operation: 'update' })).not.toThrow()
  })

  // ── nombre ─────────────────────────────────────────────────────────────
  it('lanza si se intenta cambiar nombre en update', () => {
    const data = { nombre: 'OtroNombre', email: 'mismo@ejemplo.com' }
    const originalDoc = { id: 1, nombre: 'NombreOriginal', email: 'mismo@ejemplo.com' }
    expect(() => rechazarCambioIdentidad({ data, originalDoc, operation: 'update' })).toThrow(/nombre.*inmutable/i)
  })

  it('no lanza si nombre no cambia en update', () => {
    const data = { nombre: 'MismoNombre', email: 'mismo@ejemplo.com' }
    const originalDoc = { id: 1, nombre: 'MismoNombre', email: 'mismo@ejemplo.com' }
    expect(() => rechazarCambioIdentidad({ data, originalDoc, operation: 'update' })).not.toThrow()
  })

  it('no lanza en creación (operation=create)', () => {
    const data = { nombre: 'Nuevo', email: 'nuevo@ejemplo.com' }
    const originalDoc = { id: 0, nombre: '', email: '' }
    expect(() => rechazarCambioIdentidad({ data, originalDoc, operation: 'create' })).not.toThrow()
  })

  it('no lanza cuando originalDoc undefined en update (borde)', () => {
    const data = { nombre: 'Nuevo', email: 'nuevo@ejemplo.com' }
    expect(() => rechazarCambioIdentidad({ data, originalDoc: undefined, operation: 'update' })).not.toThrow()
  })
})
