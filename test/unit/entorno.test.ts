import { describe, expect, it } from 'vitest'

import { configuracionPayload } from '@/modules/config/entorno'

describe('configuracionPayload', () => {
  it('rechaza secreto o base de datos ausentes sin revelar valores', () => {
    expect(() => configuracionPayload({ DATABASE_URL: 'postgres://synthetic.invalid/db' })).toThrow('PAYLOAD_SECRET requerido')
    expect(() => configuracionPayload({ PAYLOAD_SECRET: 'synthetic-secret' })).toThrow('DATABASE_URL requerida')
  })

  it('acepta valores sintéticos completos', () => {
    expect(configuracionPayload({ DATABASE_URL: 'postgres://synthetic.invalid/db', PAYLOAD_SECRET: 'synthetic-secret' })).toEqual({
      databaseURL: 'postgres://synthetic.invalid/db',
      payloadSecret: 'synthetic-secret',
    })
  })
})
