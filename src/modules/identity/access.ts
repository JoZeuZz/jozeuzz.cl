import type { Access } from 'payload'

export const soloAdmin: Access = ({ req }) => req.user?.collection === 'usuarios'

export const usuarioPropio: Access = ({ id, req }) =>
  req.user?.collection === 'usuarios' && req.user.id === id

export const nadie: Access = () => false

/**
 * Crea una función Access que permite:
 * - admin autenticado: true (lectura completa)
 * - portador de capability (símbolo privado en context): filtro activo
 * - cualquier otro: false
 *
 * El símbolo y el factory de context se instancian en catalog/publico.ts.
 * Este módulo nunca crea ni exporta capability directamente.
 */
export function crearAccesoServiciosPorCapabilityOAdmin(
  esCapabilityActiva: (context: Record<PropertyKey, unknown>) => boolean
): Access {
  return ({ req }) => {
    if (req.user?.collection === 'usuarios') return true
    if (esCapabilityActiva(req.context as Record<PropertyKey, unknown>)) {
      return { activo: { equals: true } }
    }
    return false
  }
}
