import { describe, expect, it } from 'vitest'

import config from '@/payload.config'

describe('colecciones Payload', () => {
  it('declara GraphQL cerrado y slugs privados', async () => {
    const configured = await config

    expect(configured.graphQL.disable).toBe(true)
    expect(configured.collections.map((collection) => collection.slug)).toEqual(expect.arrayContaining([
      'usuarios',
      'servicios',
      'solicitudes',
    ]))
  })
})
