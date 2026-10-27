import type { Access } from 'payload'

const capacidadGatewayCatalogo = Symbol('gateway-catalogo')

type ContextoGateway = Record<PropertyKey, unknown>

export const soloAdmin: Access = ({ req }) => req.user?.collection === 'usuarios'

export const usuarioPropio: Access = ({ id, req }) =>
  req.user?.collection === 'usuarios' && req.user.id === id

export const nadie: Access = () => false

export const servicioActivoPorGatewayOAdmin: Access = ({ req }) => {
  if (req.user?.collection === 'usuarios') return true

  const contexto = req.context as ContextoGateway
  if (contexto[capacidadGatewayCatalogo] === true) {
    return { activo: { equals: true } }
  }

  return false
}

export function contextoGatewayCatalogo(): ContextoGateway {
  return { [capacidadGatewayCatalogo]: true }
}
