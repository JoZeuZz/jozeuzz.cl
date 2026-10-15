// Seguridad HTTP de la candidata A. Corre en el contenedor contra el servidor real (por defecto
// http://localhost:3000, next dev). Si un comportamiento no es el esperado, la prueba falla y el
// hallazgo se registra en EVIDENCIA.md: no se ajusta la prueba para ocultarlo.
import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const BASE = (process.env.POC_HTTP_BASE ?? 'http://localhost:3000').replace(/\/$/, '')
const ORIGEN_PROPIO = process.env.POC_SERVER_URL ?? 'http://127.0.0.1:3101'
const ORIGEN_AJENO = 'http://evil.example.invalid'

const pwd = () => `p-${randomBytes(12).toString('hex')}`
const emailSintetico = (p: string) => `${p}-${randomBytes(4).toString('hex')}@example.invalid`

async function pedir(metodo: string, ruta: string, opts: { cuerpo?: unknown; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { connection: 'close', ...(opts.headers ?? {}) }
  if (opts.cuerpo !== undefined) headers['content-type'] = 'application/json'
  const res = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers,
    body: opts.cuerpo === undefined ? undefined : JSON.stringify(opts.cuerpo),
    redirect: 'manual',
  })
  const texto = await res.text()
  let json: any
  try {
    json = JSON.parse(texto)
  } catch {
    json = undefined
  }
  return { res, status: res.status, texto, json }
}

const loginDe = (email: string, password: string, headers: Record<string, string> = {}) =>
  pedir('POST', '/api/users/login', { cuerpo: { email, password }, headers })

let payload: any
const creados: (number | string)[] = []
let adminEmail = ''
let adminPass = ''
let adminId: number | string
let proyectoId: number | string

async function crearUsuario(prefijo: string) {
  const email = emailSintetico(prefijo)
  const password = pwd()
  const u = await payload.create({ collection: 'users', data: { email, password }, overrideAccess: true })
  creados.push(u.id)
  return { email, password, id: u.id }
}

beforeAll(async () => {
  // La prueba actúa sobre la misma base que el servidor (schema public): se fija antes de cargar la configuración.
  process.env.POC_DB_SCHEMA = 'public'
  process.env.POC_NO_PUSH = '1'
  const { getPayload } = await import('payload')
  const config = (await import('@payload-config')).default
  payload = await getPayload({ config })
  const a = await crearUsuario('seg-admin')
  adminEmail = a.email
  adminPass = a.password
  adminId = a.id
  const p = await payload.create({
    collection: 'proyectos',
    data: { slug: `seg-${randomBytes(4).toString('hex')}`, titulo: 'SEG-BORRADOR', _status: 'draft' },
    draft: true,
    overrideAccess: true,
  })
  proyectoId = p.id
})

afterAll(async () => {
  if (payload) {
    for (const id of creados) await payload.delete({ collection: 'users', id, overrideAccess: true }).catch(() => {})
    if (proyectoId) await payload.delete({ collection: 'proyectos', id: proyectoId, overrideAccess: true }).catch(() => {})
    await payload.destroy()
  }
})

describe('cookies de sesión', () => {
  it('Set-Cookie lleva HttpOnly, Secure y SameSite=Strict', async () => {
    const r = await loginDe(adminEmail, adminPass)
    expect(r.status).toBe(200)
    const cookies = r.res.headers.getSetCookie().filter((c) => c.startsWith('payload-token='))
    expect(cookies.length).toBe(1)
    expect(cookies[0]).toMatch(/HttpOnly/i)
    expect(cookies[0]).toMatch(/;\s*Secure/i)
    expect(cookies[0]).toMatch(/SameSite=Strict/i)
  })
})

describe('CSRF', () => {
  let cookie = ''
  beforeAll(async () => {
    const r = await loginDe(adminEmail, adminPass)
    cookie = r.res.headers.getSetCookie().find((c) => c.startsWith('payload-token='))!.split(';')[0]
  })
  const patch = (headers: Record<string, string>) =>
    pedir('PATCH', `/api/proyectos/${proyectoId}`, { cuerpo: { titulo: 'SEG-MODIFICADO' }, headers: { cookie, ...headers } })
  const titulo = async () => (await payload.findByID({ collection: 'proyectos', id: proyectoId, draft: true, overrideAccess: true })).titulo

  it('control positivo: cookie + Origin propio sí muta', async () => {
    const r = await patch({ origin: ORIGEN_PROPIO })
    expect(r.status).toBe(200)
    expect(await titulo()).toBe('SEG-MODIFICADO')
    await payload.update({ collection: 'proyectos', id: proyectoId, data: { titulo: 'SEG-BORRADOR' }, draft: true, overrideAccess: true })
  })
  it('cookie + Origin ajeno: no autenticado, sin efecto', async () => {
    const r = await patch({ origin: ORIGEN_AJENO })
    expect([401, 403]).toContain(r.status)
    expect(await titulo()).toBe('SEG-BORRADOR')
  })
  it('cookie sin Origin: no autenticado, sin efecto', async () => {
    const r = await patch({})
    expect([401, 403]).toContain(r.status)
    expect(await titulo()).toBe('SEG-BORRADOR')
  })
})

describe('bloqueo por intentos fallidos', () => {
  it('6 logins erróneos bloquean la cuenta; la contraseña correcta deja de valer', async () => {
    const u = await crearUsuario('seg-bloqueo')
    for (let i = 0; i < 6; i++) {
      const r = await loginDe(u.email, 'incorrecta-' + i)
      expect(r.status).toBe(401)
    }
    const r = await loginDe(u.email, u.password)
    expect(r.status).not.toBe(200)
    expect(r.json?.token).toBeUndefined()
    const fila = await payload.findByID({ collection: 'users', id: u.id, overrideAccess: true, showHiddenFields: true })
    expect(fila.lockUntil).toBeTruthy()
  })
})

describe('registro inicial', () => {
  it('first-register se deniega con un admin existente y no crea usuarios', async () => {
    const antes = (await payload.count({ collection: 'users', overrideAccess: true })).totalDocs
    const email = emailSintetico('seg-fr')
    const r = await pedir('POST', '/api/users/first-register', { cuerpo: { email, password: pwd() } })
    expect(r.status).toBeGreaterThanOrEqual(400)
    const despues = (await payload.count({ collection: 'users', overrideAccess: true })).totalDocs
    expect(despues).toBe(antes)
  })
})

describe('colecciones internas y access en anónimo', () => {
  for (const ruta of ['/api/payload-migrations', '/api/payload-locked-documents', '/api/payload-preferences', '/api/users', '/api/solicitudes']) {
    it(`GET ${ruta} no devuelve datos`, async () => {
      const r = await pedir('GET', ruta)
      expect(r.status).not.toBe(200)
      expect(r.json?.docs?.length ?? 0).toBe(0)
    })
  }
  it('GET /api/access no concede nada privado a un anónimo', async () => {
    const r = await pedir('GET', '/api/access')
    expect(r.json?.user ?? null).toBeNull()
    const permisos = JSON.stringify(r.json?.collections ?? {})
    // Un anónimo sólo puede leer; ninguna operación de escritura debe aparecer concedida.
    expect(permisos).not.toMatch(/"(create|update|delete)":\{"permission":true/)
    expect(r.texto).not.toMatch(/solicitudes":\{[^}]*"read":\{"permission":true/)
  })
})

describe('borradores', () => {
  it('?draft=true&where[_status][equals]=draft no devuelve borradores', async () => {
    for (const q of ['draft=true&where[_status][equals]=draft', 'draft=true&where[version._status][equals]=draft', 'where[_status][equals]=draft']) {
      const r = await pedir('GET', `/api/proyectos?${q}`)
      expect(JSON.stringify(r.json?.docs ?? [])).not.toContain('SEG-BORRADOR')
      expect(r.texto).not.toContain('SEG-BORRADOR')
    }
  })
  it('findByID del borrador con draft=true da 404', async () => {
    const r = await pedir('GET', `/api/proyectos/${proyectoId}?draft=true`)
    expect(r.status).toBe(404)
    expect(r.texto).not.toContain('SEG-BORRADOR')
  })
})
