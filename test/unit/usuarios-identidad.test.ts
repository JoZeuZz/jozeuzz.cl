import { describe, expect, it } from 'vitest'
import { rechazarCambioIdentidad } from '@/modules/identity/inmutables'

describe('Usuarios: identidad inmutable', () => {
  it('lanza si se intenta cambiar email', () => {
    const data = { nombre: 'Juan', email: 'nuevo@ejemplo.com' }
    const originalDoc = { id: 1, nombre: 'Juan', email: 'viejo@ejemplo.com' }
    expect(() => rechazarCambioIdentidad({ data, originalDoc })).toThrow(/email.*inmutable/i)
  })

  it('no lanza si email no cambia', () => {
    const data = { nombre: 'Actualizado', email: 'mismo@ejemplo.com' }
    const originalDoc = { id: 1, nombre: 'Juan', email: 'mismo@ejemplo.com' }
    expect(() => rechazarCambioIdentidad({ data, originalDoc })).not.toThrow()
  })

  it('no lanza en creación (sin originalDoc)', () => {
    const data = { nombre: 'Nuevo', email: 'nuevo@ejemplo.com' }
    expect(() => rechazarCambioIdentidad({ data, originalDoc: undefined })).not.toThrow()
  })
})
