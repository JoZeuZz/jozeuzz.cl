import { describe, expect, it } from 'vitest'

const BASE = (process.env.POC_HTTP_BASE ?? 'https://127.0.0.1:3443').replace(/\/$/, '')
const ORIGEN = process.env.INTAKE_ORIGEN_PUBLICO ?? BASE
const datos = { nombre: 'HTTP sintético', contacto: 'http@example.invalid', tipo_equipo: 'pc', descripcion: 'Prueba sintética', sitio_web: '' }

async function preparar() {
  const respuesta = await fetch(`${BASE}/solicitar`, { redirect: 'manual' })
  const html = await respuesta.text()
  const token = /name="token" value="([^"]+)"/.exec(html)?.[1]
  const cookie = respuesta.headers.get('set-cookie')?.match(/__Host-intake=[^;]+/)?.[0]
  if (!token || !cookie) throw new Error('formulario intake sin token/cookie')
  return { respuesta, html, token, cookie }
}

async function enviar(token: string, cookie: string, extras: Record<string, string> = {}, cuerpo: unknown = datos) {
  return fetch(`${BASE}/api/intake`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json', origin: ORIGEN, cookie, 'x-poc-ip-sintetica': '203.0.113.19', ...extras }, body: JSON.stringify({ ...cuerpo as object, token }) })
}

describe('intake HTTP U5b', () => {
  it('GET entrega cookie __Host, no-cache y nonces distintos', async () => {
    const [uno, dos] = await Promise.all([preparar(), preparar()])
    expect(uno.respuesta.status).toBe(200)
    expect(uno.respuesta.headers.get('cache-control')).toBe('no-store, private')
    expect(uno.respuesta.headers.get('set-cookie')).toMatch(/^__Host-intake=[^;]+; Path=\/; Max-Age=7200; Secure; HttpOnly; SameSite=Strict$/)
    expect(uno.token).not.toBe(dos.token)
  })

  it('rechaza tipo, origen, CSRF, trampa y mínimo sin eco', async () => {
    const listo = await preparar()
    const casos: Array<[string, Record<string, string>, unknown, number, string]> = [
      ['tipo', { 'content-type': 'text/plain' }, datos, 415, 'tipo_no_soportado'],
      ['origin evil', { origin: 'https://evil.example' }, datos, 403, 'origen_invalido'],
      ['origin null', { origin: 'null' }, datos, 403, 'origen_invalido'],
      ['referer prefijo', { origin: '', referer: `${ORIGEN}.evil.example/` }, datos, 403, 'origen_invalido'],
      ['csrf cookie distinta', {}, datos, 403, 'csrf_invalido'],
      ['honeypot', {}, { ...datos, sitio_web: 'https://spam.invalid' }, 400, 'envio_rechazado'],
    ]
    for (const [, headers, cuerpo, status, codigo] of casos) {
      const r = await enviar(listo.token, headers.origin === undefined ? 'otra-cookie' : listo.cookie, headers, cuerpo)
      expect(r.status).toBe(status)
      expect(await r.json()).toEqual({ error: codigo })
    }
  })

  it('rechaza Content-Length alto antes de parsear', async () => {
    const listo = await preparar()
    const r = await enviar(listo.token, listo.cookie, { 'content-length': '32769' })
    expect(r.status).toBe(413)
    expect(await r.json()).toEqual({ error: 'cuerpo_demasiado_grande' })
  })

  it('acepta JSON y urlencoded tras mínimo; duplicado concurrente no crea dos', async () => {
    const listo = await preparar()
    await new Promise((resolve) => setTimeout(resolve, Number(process.env.INTAKE_TIEMPO_MINIMO_MS ?? 200) + 50))
    const [a, b] = await Promise.all([enviar(listo.token, listo.cookie), enviar(listo.token, listo.cookie)])
    expect([a.status, b.status]).toEqual([201, 201])
    const form = await fetch(`${BASE}/api/intake`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: ORIGEN, cookie: listo.cookie, 'x-poc-ip-sintetica': '203.0.113.20' }, body: new URLSearchParams({ ...datos, token: listo.token }) })
    expect([303, 403]).toContain(form.status)
  })
})
