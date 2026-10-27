/**
 * Integración real: identidad inmutable en Usuarios
 *
 * Verifica wiring real del hook beforeChange en colección Usuarios:
 * - Usuario puede leer su propio documento (read own positive)
 * - Intento de cambiar email vía Local API → lanza error
 * - Intento de cambiar nombre vía Local API → permitido
 * - Anónimo no puede leer documento ajeno
 *
 * Reutiliza DB del harness (DATABASE_URL del entorno).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getPayload } from 'payload'
import type { Payload } from 'payload'

const DB_URL = process.env.DATABASE_URL
  ?? 'postgres://jozeuzz:jozeuzz@127.0.0.1:5435/jozeuzz'

let payload: Payload
let usuarioId: number
let usuarioUser: { id: number; email: string; collection: 'usuarios' }

beforeAll(async () => {
  process.env.DATABASE_URL = DB_URL
  process.env.PAYLOAD_SECRET = process.env.PAYLOAD_SECRET ?? 'harness-secret'
  process.env.NEXT_PUBLIC_SERVER_URL = 'http://127.0.0.1:3000'

  const { default: config } = await import('@/payload.config')
  payload = await getPayload({ config: await config })

  // Crear usuario de prueba
  const email = 'identidad-hook@test.invalid'
  const existe = await payload.find({
    collection: 'usuarios',
    where: { email: { equals: email } },
    overrideAccess: true,
  })
  if (existe.docs.length === 0) {
    const doc = await payload.create({
      collection: 'usuarios',
      data: {
        nombre: 'Usuario Hook Test',
        email,
        password: 'Hook-Test-Secret-2026!',
      },
      overrideAccess: true,
    })
    usuarioId = doc.id as number
  } else {
    usuarioId = existe.docs[0].id as number
  }

  usuarioUser = { id: usuarioId, email, collection: 'usuarios' }
}, 60_000)

afterAll(async () => {
  try {
    await payload.delete({ collection: 'usuarios', id: usuarioId, overrideAccess: true })
  } catch {
    // best-effort
  }
  await (payload.db as { destroy?: () => Promise<void> }).destroy?.()
})

describe('Usuarios: identidad inmutable — wiring real', () => {
  it('usuario puede leer su propio documento (read own positive)', async () => {
    const doc = await payload.findByID({
      collection: 'usuarios',
      id: usuarioId,
      overrideAccess: false,
      user: usuarioUser,
    })
    expect((doc as { id: number }).id).toBe(usuarioId)
  })

  it('anónimo no puede leer documento de otro usuario', async () => {
    const err = await payload.findByID({
      collection: 'usuarios',
      id: usuarioId,
      overrideAccess: false,
      user: null,
    }).catch(e => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toMatch(/forbidden|not allowed|not found/i)
  })

  it('intento de cambiar email vía Local API → Forbidden o error inmutable', async () => {
    const err = await payload.update({
      collection: 'usuarios',
      id: usuarioId,
      data: { email: 'otro-email@test.invalid' },
      overrideAccess: false,
      user: usuarioUser,
    }).catch(e => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toMatch(/inmutable|forbidden|not allowed/i)
  })

  it('usuario puede cambiar nombre (nombre no es inmutable)', async () => {
    const doc = await payload.update({
      collection: 'usuarios',
      id: usuarioId,
      data: { nombre: 'Nombre Actualizado Test' },
      overrideAccess: false,
      user: usuarioUser,
    })
    expect((doc as { nombre: string }).nombre).toBe('Nombre Actualizado Test')
  })
})
