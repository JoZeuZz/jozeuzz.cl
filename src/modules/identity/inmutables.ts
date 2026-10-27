interface CambioArgs {
  data: Record<string, unknown>
  originalDoc: Record<string, unknown> | undefined
  operation: 'create' | 'update' | string
}

/**
 * Lanza si se intenta mutar campos de identidad inmutables (email).
 * Solo activo en operación 'update'; ignorado en 'create'.
 * Usar como beforeChange hook en Usuarios.
 */
export function rechazarCambioIdentidad({ data, originalDoc, operation }: CambioArgs): void {
  if (operation !== 'update') return
  if (originalDoc === undefined) return
  if ('email' in data && data.email !== originalDoc.email) {
    throw new Error('email inmutable: no puede cambiarse vía HTTP')
  }
}
