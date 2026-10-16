import { describe, expect, it } from 'vitest'

import { origenValido } from './origen'

const origen = 'https://127.0.0.1:3443'

describe('origenValido', () => {
  it('acepta Origin exacto', () => {
    expect(origenValido(new Headers({ Origin: origen }), origen)).toBe(true)
  })

  it.each([
    [new Headers({ Origin: 'https://evil.example' })],
    [new Headers({ Origin: 'null' })],
    [new Headers()],
    [new Headers({ Referer: 'https://127.0.0.1:3443.evil.example/' })],
    [new Headers({ Referer: 'no-es-url' })],
  ])('rechaza origen ausente, nulo, ajeno o engañoso', (headers) => {
    expect(origenValido(headers, origen)).toBe(false)
  })

  it('usa origen exacto de Referer sólo si Origin falta', () => {
    expect(origenValido(new Headers({ Referer: `${origen}/solicitar` }), origen)).toBe(true)
    expect(origenValido(new Headers({ Origin: 'https://evil.example', Referer: `${origen}/` }), origen)).toBe(false)
  })
})
