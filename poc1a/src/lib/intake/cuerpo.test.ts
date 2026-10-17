import { describe, expect, it } from 'vitest'

import { ErrorCuerpoIntake, leerCuerpoIntake } from './cuerpo'

const solicitud = (body: BodyInit, headers: HeadersInit = {}) => new Request('https://intake.invalid/api/intake', { method: 'POST', body, headers })

describe('leerCuerpoIntake', () => {
  it('rechaza Content-Length mayor que 32 KiB antes de leerlo', async () => {
    await expect(leerCuerpoIntake(solicitud('{}', { 'content-length': '32769' }), 'application/json')).rejects.toEqual(new ErrorCuerpoIntake('cuerpo_demasiado_grande'))
  })

  it('cancela stream que supera 32 KiB', async () => {
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(32_769)); controller.close() } })
    const request = new Request('https://intake.invalid/api/intake', { method: 'POST', body: stream, duplex: 'half' } as RequestInit & { duplex: string })
    await expect(leerCuerpoIntake(request, 'application/json')).rejects.toEqual(new ErrorCuerpoIntake('cuerpo_demasiado_grande'))
  })

  it.each([
    ['UTF-8 inválido', new Uint8Array([0xff])],
    ['JSON que no es objeto plano', '[1,2]'],
  ])('rechaza %s', async (_nombre, body) => {
    await expect(leerCuerpoIntake(solicitud(body), 'application/json')).rejects.toEqual(new ErrorCuerpoIntake('cuerpo_invalido'))
  })

  it('rechaza claves urlencoded repetidas', async () => {
    await expect(leerCuerpoIntake(solicitud('nombre=a&nombre=b'), 'application/x-www-form-urlencoded')).rejects.toEqual(new ErrorCuerpoIntake('cuerpo_invalido'))
  })
})
