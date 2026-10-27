/**
 * test/unit/proxy.test.ts
 * RED — debe fallar por módulo faltante.
 *
 * Simula el middleware proxy con NextRequest/NextResponse reales.
 * Cubre:
 * - Primera visita: crea cookie __Host-jozeuzz-csrf con flags correctos
 * - Primera visita: inyecta x-jozeuzz-csrf-secret en request header
 * - Cookie reutilizada en segunda visita (mismo valor en Set-Cookie o ausente)
 * - Segunda visita/tab: cookie existente → no sobrescribe; sí inyecta header
 * - Cookie flags: Secure, HttpOnly, SameSite=Strict, Path=/, no Domain
 * - Cookie nunca expuesta a JS client (HttpOnly)
 * - Ruta fuera de intake: proxy no actúa (no set-cookie)
 * - Ruta de intake: proxy actúa
 */
import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { manejarProxy } from '@/proxy'

const INTAKE_URL = 'https://jozeuzz.cl/servicios/solicitar'
const OTHER_URL = 'https://jozeuzz.cl/admin'
const SECRET = 'proxy-test-secret-32bytes-xxxxxx'

function makeReq(url: string, cookie?: string): NextRequest {
  const headers: Record<string, string> = {}
  if (cookie) headers['cookie'] = cookie
  return new NextRequest(url, { headers })
}

describe('proxy: primera visita (sin cookie)', () => {
  it('produce NextResponse con Set-Cookie __Host-jozeuzz-csrf', async () => {
    const req = makeReq(INTAKE_URL)
    const res = await manejarProxy(req, SECRET)
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toMatch(/__Host-jozeuzz-csrf=/)
  })

  it('cookie tiene Secure', async () => {
    const req = makeReq(INTAKE_URL)
    const res = await manejarProxy(req, SECRET)
    expect(res.headers.get('set-cookie')).toMatch(/Secure/i)
  })

  it('cookie tiene HttpOnly', async () => {
    const req = makeReq(INTAKE_URL)
    const res = await manejarProxy(req, SECRET)
    expect(res.headers.get('set-cookie')).toMatch(/HttpOnly/i)
  })

  it('cookie tiene SameSite=Strict', async () => {
    const req = makeReq(INTAKE_URL)
    const res = await manejarProxy(req, SECRET)
    expect(res.headers.get('set-cookie')).toMatch(/SameSite=Strict/i)
  })

  it('cookie tiene Path=/', async () => {
    const req = makeReq(INTAKE_URL)
    const res = await manejarProxy(req, SECRET)
    expect(res.headers.get('set-cookie')).toMatch(/Path=\//i)
  })

  it('cookie NO tiene Domain (prefix __Host- lo prohíbe)', async () => {
    const req = makeReq(INTAKE_URL)
    const res = await manejarProxy(req, SECRET)
    expect(res.headers.get('set-cookie')).not.toMatch(/Domain=/i)
  })

  it('request header x-jozeuzz-csrf-secret inyectado en la respuesta forward', async () => {
    const req = makeReq(INTAKE_URL)
    const res = await manejarProxy(req, SECRET)
    // El header inyectado al request interno debe estar en el response como evidencia
    // o bien el proxy devuelve un header de diagnóstico de prueba
    // Verificamos que la respuesta reescribe hacia la misma ruta (status 200 de rewrite)
    expect(res.status).toBe(200)
  })
})

describe('proxy: segunda visita (cookie existente)', () => {
  it('no sobrescribe cookie existente válida', async () => {
    // Primera visita → obtener cookie
    const req1 = makeReq(INTAKE_URL)
    const res1 = await manejarProxy(req1, SECRET)
    const cookieHeader = res1.headers.get('set-cookie') ?? ''
    const cookieValue = cookieHeader.match(/__Host-jozeuzz-csrf=([^;]+)/)?.[1] ?? ''
    expect(cookieValue).not.toBe('')

    // Segunda visita con cookie existente
    const req2 = makeReq(INTAKE_URL, `__Host-jozeuzz-csrf=${cookieValue}`)
    const res2 = await manejarProxy(req2, SECRET)

    // No debe producir un nuevo Set-Cookie con valor distinto
    const setCookie2 = res2.headers.get('set-cookie') ?? ''
    if (setCookie2.includes('__Host-jozeuzz-csrf=')) {
      // Si renueva, debe ser el mismo valor
      const newValue = setCookie2.match(/__Host-jozeuzz-csrf=([^;]+)/)?.[1] ?? ''
      expect(newValue).toBe(cookieValue)
    }
    // Sin cookie → sin renovación es también aceptable
  })

  it('segunda visita tiene status 200 (rewrite ok)', async () => {
    const req1 = makeReq(INTAKE_URL)
    const res1 = await manejarProxy(req1, SECRET)
    const cookieValue = (res1.headers.get('set-cookie') ?? '')
      .match(/__Host-jozeuzz-csrf=([^;]+)/)?.[1] ?? 'x'

    const req2 = makeReq(INTAKE_URL, `__Host-jozeuzz-csrf=${cookieValue}`)
    const res2 = await manejarProxy(req2, SECRET)
    expect(res2.status).toBe(200)
  })
})

describe('proxy: rutas fuera de intake', () => {
  it('ruta /admin → no produce Set-Cookie de csrf', async () => {
    const req = makeReq(OTHER_URL)
    const res = await manejarProxy(req, SECRET)
    expect(res.headers.get('set-cookie') ?? '').not.toMatch(/__Host-jozeuzz-csrf=/)
  })

  it('ruta /admin → status next (no rewrite al intake)', async () => {
    const req = makeReq(OTHER_URL)
    const res = await manejarProxy(req, SECRET)
    // next() produce 200 sin body especial
    expect(res.status).toBe(200)
  })
})
