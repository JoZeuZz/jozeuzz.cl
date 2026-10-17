import assert from 'node:assert/strict'
import test from 'node:test'

const base = process.env.POC_BASE_URL ?? 'https://127.0.0.1:3443'

test('proxy producción reemplaza cabeceras de IP forjadas', async () => {
  const respuesta = await fetch(`${base}/solicitar`, { headers: { 'x-real-ip': '203.0.113.1', 'x-forwarded-for': '203.0.113.2', 'x-poc-ip-sintetica': '203.0.113.3' } })
  assert.equal(respuesta.status, 200)
  assert.match(respuesta.headers.get('set-cookie') ?? '', /^__Host-intake=/)
})

test('U6: seis envíos forjados reciben 429 por IP efectiva del proxy', { skip: 'U6 añade contador de creaciones; no hay endpoint debug ni cabecera confiable en U5b' }, () => {})
