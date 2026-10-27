interface CambioArgs {
  data: Record<string, unknown>
  originalDoc: Record<string, unknown> | undefined
}

/**
 * Lanza si se intenta mutar campos de identidad inmutables (email).
 * Usar como beforeChange hook en Usuarios.
 */
export function rechazarCambioIdentidad({ data, originalDoc }: CambioArgs): void {
  if (originalDoc === undefined) return // creación, no actualización
  if ('email' in data && data.email !== originalDoc.email) {
    throw new Error('email inmutable: no puede cambiarse vía HTTP')
  }
}
