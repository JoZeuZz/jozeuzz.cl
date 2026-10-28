import { describe, expect, it } from 'vitest'

describe('colecciones Payload', () => {
  it('declara GraphQL cerrado y slugs privados', async () => {
    process.env.DATABASE_URL = 'postgres://synthetic.invalid/db'
    process.env.PAYLOAD_SECRET = 'synthetic-secret'
    const { default: config } = await import('@/payload.config')
    const configured = await config

    expect(configured.graphQL.disable).toBe(true)
    expect(configured.collections.map((collection) => collection.slug)).toEqual(expect.arrayContaining([
      'usuarios',
      'servicios',
      'solicitudes',
    ]))
  })
})
