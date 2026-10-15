import type { Access, FieldAccess } from 'payload'

/** Administrador = usuario autenticado de la colección `users` (única colección con auth). */
export const esAdmin = (u: unknown): boolean =>
  (u as { collection?: string } | null | undefined)?.collection === 'users'

export const soloAdmin: Access = ({ req }) => esAdmin(req.user)
export const soloAdminCampo: FieldAccess = ({ req }) => esAdmin(req.user)
export const nadie: Access = () => false

/** Anónimo: sólo documentos publicados. Admin: todo. */
export const publicadoOAdmin: Access = ({ req }) =>
  esAdmin(req.user) || { _status: { equals: 'published' } }

/** Anónimo: sólo registros activos. Admin: todo. */
export const activoOAdmin: Access = ({ req }) => esAdmin(req.user) || { activo: { equals: true } }
