import { createHmac } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { derivarClaves } from './claves'
import { cargarConfigIntake } from './config'
import { emitirToken, TOKEN_TTL_MS, verificarToken } from './token'

const config = cargarConfigIntake({ INTAKE_SECRETO: 'ab'.repeat(32), PAYLOAD_SECRET: 'cd'.repeat(32), INTAKE_ORIGEN_PUBLICO: 'https://127.0.0.1:3443' })
const ahora = 1_700_000_000_000

const alterar = (texto: string) => `${texto.slice(0, -1)}${texto.endsWith('a') ? 'b' : 'a'}`
const firmarCuerpo = (cuerpo: Record<string, unknown>) => {
  const parte = Buffer.from(JSON.stringify(cuerpo)).toString('base64url')
  const firma = createHmac('sha256', derivarClaves(config.secretoHex).token).update(`intake-token|${parte}`).digest('base64url')
  return `${parte}.${firma}`
}

describe('token CSRF', () => {
  it('emite y verifica token válido con nonce de 16 bytes y TTL fijo', () => {
    const token = emitirToken(config, ahora)
    const verificado = verificarToken(config, token, ahora + 1)

    expect(token.length).toBeLessThanOrEqual(512)
    expect(verificado?.n).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(verificado).toEqual({ n: verificado?.n, e: ahora })
  })

  it('rechaza cuerpo alterado con firma correcta de cookie y firma alterada', () => {
    const token = emitirToken(config, ahora)
    const [cuerpo, firma] = token.split('.')
    const json = JSON.parse(Buffer.from(cuerpo, 'base64url').toString()) as { n: string }
    json.n = alterar(json.n)
    const cuerpoAlterado = Buffer.from(JSON.stringify(json)).toString('base64url')

    expect(verificarToken(config, `${cuerpoAlterado}.${firma}`, ahora)).toBeNull()
    expect(verificarToken(config, `${cuerpo}.${alterar(firma)}`, ahora)).toBeNull()
  })

  it.each([
    ['caducado', () => verificarToken(config, emitirToken(config, ahora), ahora + TOKEN_TTL_MS)],
    ['firma de largo distinto', () => verificarToken(config, `${emitirToken(config, ahora)}.x`, ahora)],
    ['tres partes', () => verificarToken(config, `${emitirToken(config, ahora)}.extra`, ahora)],
    ['más de 512 caracteres', () => verificarToken(config, 'a'.repeat(513), ahora)],
  ])('rechaza %s', (_nombre, verificar) => {
    expect(verificar()).toBeNull()
  })

  it.each([
    ['e demasiado futuro', { e: ahora + 5001, x: ahora + 5001 + TOKEN_TTL_MS }],
    ['kid desconocido', { k: '2' }],
  ])('rechaza %s', (_nombre, cambios) => {
    const [cuerpo] = emitirToken(config, ahora).split('.')
    const json = { ...JSON.parse(Buffer.from(cuerpo, 'base64url').toString()), ...cambios }

    expect(verificarToken(config, firmarCuerpo(json), ahora)).toBeNull()
  })
})
