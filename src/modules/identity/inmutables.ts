interface CambioArgs {
  data: Record<string, unknown>
  originalDoc: Record<string, unknown> | undefined
  operation: 'create' | 'update' | string
}

// Campos de identidad que no pueden cambiarse vía HTTP ni Local API own update.
// Password/recovery queda Task8 (singleton admin / login HTTP).
const CAMPOS_INMUTABLES: ReadonlyArray<string> = ['email', 'nombre']

/**
 * Lanza si se intenta mutar campos de identidad inmutables (email, nombre).
 * Solo activo en operación 'update'; ignorado en 'create'.
 * Usar como beforeChange hook en Usuarios.
 */
export function rechazarCambioIdentidad({ data, originalDoc, operation }: CambioArgs): void {
  if (operation !== 'update') return
  if (originalDoc === undefined) return
  for (const campo of CAMPOS_INMUTABLES) {
    if (campo in data && data[campo] !== originalDoc[campo]) {
      throw new Error(`${campo} inmutable: no puede cambiarse vía HTTP`)
    }
  }
}
