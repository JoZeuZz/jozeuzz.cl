import { createHmac } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

const { timingSafeEqualSpy } = vi.hoisted(() => ({ timingSafeEqualSpy: vi.fn() }))

vi.mock('node:crypto', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:crypto')>()
  return {
    ...real,
    timingSafeEqual: (...args: Parameters<typeof real.timingSafeEqual>) => {
      timingSafeEqualSpy(...args)
      return real.timingSafeEqual(...args)
    },
  }
})

import { derivarClaves } from './claves'
import { cargarConfigIntake } from './config'
import { emitirToken, TOKEN_TTL_MS, verificarToken } from './token'

const config = cargarConfigIntake({ INTAKE_SECRETO: 'ab'.repeat(32), PAYLOAD_SECRET: 'cd'.repeat(32), INTAKE_ORIGEN_PUBLICO: 'https://127.0.0.1:3443' })
const ahora = 1_700_000_000_000

const alterar = (texto: string) => `${texto.slice(0, -1)}${texto.endsWith('a') ? 'b' : 'a'}`
const firmaNoCanonica = (firma: string) => {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  const indice = alfabeto.indexOf(firma.at(-1)!)
  return `${firma.slice(0, -1)}${alfabeto[(indice & ~3) | 1]}`
}
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
    expect(verificarToken(config, `${cuerpo}.${firma.startsWith('A') ? 'B' : 'A'}${firma.slice(1)}`, ahora)).toBeNull()
  })

  it('rechaza firma base64url no canónica aunque decodifique los mismos bytes', () => {
    const [cuerpo, firma] = emitirToken(config, ahora).split('.')

    expect(verificarToken(config, `${cuerpo}.${firmaNoCanonica(firma)}`, ahora)).toBeNull()
  })

  it('compara firma de igual largo y evita timingSafeEqual para largo distinto canónico', () => {
    const token = emitirToken(config, ahora)

    timingSafeEqualSpy.mockClear()
    expect(verificarToken(config, token, ahora)).not.toBeNull()
    expect(timingSafeEqualSpy).toHaveBeenCalledOnce()

    const [cuerpo] = token.split('.')
    timingSafeEqualSpy.mockClear()
    expect(verificarToken(config, `${cuerpo}.${Buffer.alloc(31).toString('base64url')}`, ahora)).toBeNull()
    expect(timingSafeEqualSpy).not.toHaveBeenCalled()
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
