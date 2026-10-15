// Privacidad HTTP en anónimo (M1, B1, B2, B7 de la revisión de cierre). Corre contra dev y contra producción
// (POC_HTTP_BASE=http://app-prod:3000, POC_HTTP_SCHEMA=poc_prod). Crea sus propios datos con centinelas únicos
// y los borra al terminar. Si una prueba no se cumple se registra en EVIDENCIA.md; no se ajusta para ocultarlo.
import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const BASE = (process.env.POC_HTTP_BASE ?? 'http://localhost:3000').replace(/\/$/, '')
const U = randomBytes(4).toString('hex').toUpperCase()
const S = {
  borrador: `SNT-PRIV-BORRADOR-${U}`,
  publicado: `SNT-PRIV-PUBLICADO-${U}`,
  nota: `SNT-PRIV-NOTA-${U}`,
  notaPub: `SNT-PRIV-NOTAPUB-${U}`,
  solicitud: `SNT-PRIV-SOLICITUD-${U}`,
  obs: `SNT-PRIV-OBS-${U}`,
  contacto: `snt-priv-${U.toLowerCase()}@example.invalid`,
  medioAlt: `SNT-PRIV-MEDIO-ALT-${U}`,
  medioContenido: `SNT-PRIV-MEDIO-CONTENIDO-${U}`,
}

async function pedir(ruta: string, headers: Record<string, string> = {}) {
  const res = await fetch(`${BASE}${ruta}`, { headers: { connection: 'close', ...headers }, redirect: 'manual' })
  const texto = await res.text()
  let json: any
  try {
    json = JSON.parse(texto)
  } catch {
    json = undefined
  }
  return { status: res.status, texto, json, location: res.headers.get('location') ?? '' }
}

const ids: Record<string, number | string> = {}
let payload: any

beforeAll(async () => {
  process.env.POC_DB_SCHEMA = process.env.POC_HTTP_SCHEMA ?? 'public'
  process.env.POC_NO_PUSH = '1'
  const { getPayload } = await import('payload')
  const config = (await import('@payload-config')).default
  payload = await getPayload({ config })
  const datos = Buffer.from(S.medioContenido, 'utf8')
  const medio = await payload.create({
    collection: 'medios-privados',
    data: { alt: S.medioAlt },
    file: { data: datos, mimetype: 'text/plain', name: `snt-priv-${U.toLowerCase()}.txt`, size: datos.length },
    overrideAccess: true,
  })
  ids.medio = medio.id
  const bor = await payload.create({
    collection: 'proyectos',
    data: { slug: `snt-priv-bor-${U.toLowerCase()}`, titulo: S.borrador, notas_internas: S.nota, _status: 'draft' },
    draft: true,
    overrideAccess: true,
  })
  ids.borrador = bor.id
  const pub = await payload.create({
    collection: 'proyectos',
    data: {
      slug: `snt-priv-pub-${U.toLowerCase()}`,
      titulo: S.publicado,
      notas_internas: S.notaPub,
      medios: [{ relationTo: 'medios-privados', value: medio.id }],
      _status: 'published',
    },
    overrideAccess: true,
  })
  ids.publicado = pub.id
  const sol = await payload.create({
    collection: 'solicitudes',
    data: { nombre: S.solicitud, contacto: S.contacto, tipo_equipo: 'e', descripcion: 'd', observaciones_internas: S.obs },
    overrideAccess: true,
  })
  ids.solicitud = sol.id
})

afterAll(async () => {
  if (!payload) return
  const borrar = (collection: string, id?: number | string) =>
    id === undefined ? Promise.resolve() : payload.delete({ collection, id, overrideAccess: true }).catch(() => {})
  await borrar('proyectos', ids.borrador)
  await borrar('proyectos', ids.publicado)
  await borrar('solicitudes', ids.solicitud)
  await borrar('medios-privados', ids.medio)
  await payload.destroy()
})

const PRIVADOS = () => [S.borrador, S.nota, S.notaPub, S.solicitud, S.obs, S.contacto, S.medioAlt, S.medioContenido]
const sinPrivados = (texto: string) => {
  for (const s of PRIVADOS()) expect(texto).not.toContain(s)
}

describe('M1: /admin sin sesión no entrega datos', () => {
  const rutas = () => [
    `/admin/collections/proyectos/${ids.borrador}`,
    `/admin/collections/proyectos/${ids.publicado}`,
    `/admin/collections/solicitudes/${ids.solicitud}`,
    '/admin/collections/solicitudes',
    '/admin/collections/proyectos',
    '/admin/collections/medios-privados',
  ]
  for (const modo of ['html', 'rsc'] as const) {
    it(`GET /admin/... (${modo}) sin centinelas privados`, async () => {
      const headers: Record<string, string> = modo === 'rsc' ? { rsc: '1', accept: 'text/x-component' } : { accept: 'text/html' }
      for (const ruta of rutas()) {
        const r = await pedir(ruta, headers)
        sinPrivados(r.texto)
        sinPrivados(r.location)
        // El HTML de login no debe repetir el id del documento solicitado en el cuerpo (la URL de redirección sí lo trae).
        expect(r.texto).not.toContain(`"id":${JSON.stringify(ids.solicitud)}`)
        expect(r.texto).not.toContain(`/solicitudes/${ids.solicitud}"`)
      }
    })
  }
})

describe('B1: notas_internas no se filtra por REST', () => {
  it('where[notas_internas] no revela coincidencias ni el valor', async () => {
    for (const op of ['equals', 'like', 'contains']) {
      for (const valor of [S.nota, S.notaPub]) {
        for (const prefijo of ['', 'draft=true&']) {
          const r = await pedir(`/api/proyectos?${prefijo}where[notas_internas][${op}]=${encodeURIComponent(valor)}`)
          sinPrivados(r.texto)
          expect(r.json?.docs?.length ?? 0).toBe(0)
        }
      }
    }
  })
  it('sort=notas_internas no entrega el campo', async () => {
    for (const s of ['notas_internas', '-notas_internas']) {
      const r = await pedir(`/api/proyectos?sort=${s}`)
      sinPrivados(r.texto)
    }
  })
  it('select[notas_internas] no entrega el campo', async () => {
    for (const ruta of ['/api/proyectos?select[notas_internas]=true', `/api/proyectos/${ids.publicado}?select[notas_internas]=true`]) {
      const r = await pedir(ruta)
      sinPrivados(r.texto)
      expect(r.texto).not.toContain('"notas_internas"')
    }
  })
  it('depth no altera el resultado; el publicado sí es legible sin el campo', async () => {
    for (const d of [0, 1, 2, 5]) {
      const r = await pedir(`/api/proyectos/${ids.publicado}?depth=${d}`)
      expect(r.status).toBe(200)
      expect(r.json?.titulo).toBe(S.publicado)
      sinPrivados(r.texto.replace(S.publicado, ''))
      expect(r.json).not.toHaveProperty('notas_internas')
    }
  })
})

describe('B2: rutas REST auxiliares en anónimo', () => {
  it('/api/proyectos/versions sin datos', async () => {
    const r = await pedir('/api/proyectos/versions')
    expect(r.status).not.toBe(200)
    expect(r.json?.docs?.length ?? 0).toBe(0)
    sinPrivados(r.texto)
  })
  it('/api/proyectos/versions/:id no entrega datos', async () => {
    const r = await pedir(`/api/proyectos/versions/${ids.borrador}`)
    expect(r.status).not.toBe(200)
    sinPrivados(r.texto)
  })
  it('/api/solicitudes/count no entrega conteo', async () => {
    const r = await pedir('/api/solicitudes/count')
    expect(r.status).not.toBe(200)
    expect(r.json?.totalDocs).toBeUndefined()
  })
  it('registro (sin afirmar): /api/users/init', async () => {
    const r = await pedir('/api/users/init')
    // Sólo se registra lo que devuelve; el valor se anota en EVIDENCIA.md.
    console.log(`REGISTRO /api/users/init status=${r.status} cuerpo=${r.texto.slice(0, 120)}`)
    expect(r.texto).not.toContain('@')
  })
})

describe('B7: proyecto publicado que referencia un medio privado', () => {
  for (const d of [0, 1, 2]) {
    it(`depth=${d}: no sale el contenido del medio privado`, async () => {
      for (const ruta of [`/api/proyectos/${ids.publicado}?depth=${d}`, `/api/proyectos?depth=${d}&where[slug][like]=snt-priv-pub`]) {
        const r = await pedir(ruta)
        expect(r.status).toBe(200)
        expect(r.texto).not.toContain(S.medioAlt)
        expect(r.texto).not.toContain(S.medioContenido)
        expect(r.texto).not.toContain(`snt-priv-${U.toLowerCase()}.txt`)
        expect(r.texto).not.toContain('medios-privados/file')
        const doc = r.json?.docs?.[0] ?? r.json
        // Registro: qué sale de la relación (id/relationTo) con el medio privado.
        console.log(`REGISTRO B7 depth=${d} medios=${JSON.stringify(doc?.medios)}`)
      }
    })
  }
  it('la HTML pública del detalle no menciona el medio privado', async () => {
    const r = await pedir(`/proyectos/snt-priv-pub-${U.toLowerCase()}`)
    expect(r.status).toBe(200)
    expect(r.texto).not.toContain(S.medioAlt)
    expect(r.texto).not.toContain(S.medioContenido)
    expect(r.texto).not.toContain('medios-privados')
  })
})
