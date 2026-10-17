import assert from 'node:assert/strict'
import test from 'node:test'

const base = process.env.POC_BASE_URL ?? 'https://127.0.0.1:3443'

test('proxy producción reemplaza cabeceras de IP forjadas', async () => {
  const respuesta = await fetch(`${base}/solicitar`, { headers: { 'x-real-ip': '203.0.113.1', 'x-forwarded-for': '203.0.113.2', 'x-poc-ip-sintetica': '203.0.113.3' } })
  assert.equal(respuesta.status, 200)
  assert.match(respuesta.headers.get('set-cookie') ?? '', /^__Host-intake=/)
})

test('proxy producción ignora IP forjada y comparte cupo entre seis envíos', async () => {
  const datos = { nombre: 'SNT producción', contacto: 'snt@example.invalid', tipo_equipo: 'pc', descripcion: 'SNT-IP', sitio_web: '' }
  const respuestas = []
  for (let intento = 1; intento <= 6; intento += 1) {
    const formulario = await fetch(`${base}/solicitar`, { headers: { 'x-real-ip': `203.0.113.${intento}`, 'x-forwarded-for': `198.51.100.${intento}`, 'x-poc-ip-sintetica': `2001:db8:${intento}::1` } })
    const html = await formulario.text()
    const token = /name="token" value="([^"]+)"/.exec(html)?.[1]
    const cookie = formulario.headers.get('set-cookie')?.match(/__Host-intake=[^;]+/)?.[0]
    assert.ok(token)
    assert.ok(cookie)
    await new Promise((resolve) => setTimeout(resolve, Number(process.env.INTAKE_TIEMPO_MINIMO_MS ?? 200) + 50))
    respuestas.push(await fetch(`${base}/api/intake`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base, cookie, 'x-real-ip': `203.0.113.${100 + intento}`, 'x-forwarded-for': `198.51.100.${100 + intento}`, 'x-poc-ip-sintetica': `2001:db8:${100 + intento}::1` }, body: JSON.stringify({ ...datos, token }) }))
  }
  assert.deepEqual(respuestas.map((respuesta) => respuesta.status), [201, 201, 201, 201, 201, 429])
  assert.match(respuestas[5].headers.get('retry-after') ?? '', /^[1-9][0-9]*$/)
  assert.deepEqual(await respuestas[5].json(), { error: 'limite_creaciones' })
})
