import { expect, test } from '@playwright/test'

import { contextoAdmin, reset } from './comun'

// Centinelas de contenido privado más datos de la sesión del admin (correo), que la acción de bloqueo de
// documentos devuelve al admin: sirven de control positivo de que la acción devuelve datos protegidos.
const CENTINELAS = ['SNT-TITULO-BORRADOR', 'SNT-RESUMEN-BORRADOR', 'SNT-OBS-INTERNA', 'SNT-NOMBRE', 'SNT-MEDIO-PRIVADO']
const SECRETOS_RESPUESTA = [...CENTINELAS, 'admin@example.invalid']
const REEMPLAZO = (t: string) => t.replace(/SNT-[A-Z-]+/g, 'XXX').replace(/admin@example\.invalid/g, 'x@x')

test('una petición Next-Action capturada del admin, reenviada sin sesión, no filtra centinelas', async ({ browser }) => {
  const r = reset()
  const admin = await contextoAdmin(browser)
  const page = await admin.newPage()
  const capturas: { url: string; method: string; headers: Record<string, string>; body: Buffer | null; respuesta: string }[] = []
  page.on('response', async (res) => {
    const req = res.request()
    const h = req.headers()
    if (!h['next-action']) return
    capturas.push({
      url: req.url(),
      method: req.method(),
      headers: h,
      body: req.postDataBuffer(),
      respuesta: await res.text().catch(() => ''),
    })
  })
  // Edición del borrador y del proyecto publicado, y listas con datos privados: el admin dispara acciones de servidor.
  await page.goto(`/admin/collections/proyectos/${r.ids.proyecto_borrador}`)
  await expect(page.locator('#field-titulo')).toHaveValue('SNT-TITULO-BORRADOR', { timeout: 120_000 })
  await page.goto(`/admin/collections/solicitudes/${r.ids.solicitud_sembrada}`)
  await expect(page.locator('#field-nombre')).toHaveValue('SNT-NOMBRE', { timeout: 120_000 })
  await page.goto('/admin/collections/proyectos')
  await page.getByText('SNT-TITULO-BORRADOR').first().waitFor({ timeout: 120_000 })
  // Editar un campo sin guardar dispara la acción de servidor de estado de formulario con datos privados.
  await page.goto(`/admin/collections/proyectos/${r.ids.proyecto_borrador}`)
  await page.locator('#field-resumen').fill('SNT-RESUMEN-BORRADOR editado')
  await page.waitForTimeout(3000)
  await page.goto(`/admin/collections/solicitudes/${r.ids.solicitud_sembrada}`)
  await page.locator('#field-observaciones_internas').fill('SNT-OBS-INTERNA editada')
  await page.waitForTimeout(3000)

  const conCentinela = capturas.filter((c) => SECRETOS_RESPUESTA.some((s) => c.respuesta.includes(s)))
  console.log(`acciones capturadas: ${capturas.length}; con datos protegidos para el admin: ${conCentinela.length}`)
  expect(capturas.length, 'el admin debe haber disparado acciones de servidor').toBeGreaterThan(0)
  // Control positivo: al menos una acción devuelve datos privados al admin; si no, la prueba no probaría nada.
  expect(conCentinela.length).toBeGreaterThan(0)

  // Reenvío anónimo: contexto nuevo, sin cookies, mismo origen.
  const anonimo = await browser.newContext()
  const pa = await anonimo.newPage()
  await pa.goto('/proyectos')
  for (const c of conCentinela) {
    const salida = await pa.evaluate(async (c) => {
      const permitidas = ['accept', 'content-type', 'next-action', 'next-router-state-tree', 'next-url', 'rsc']
      const headers: Record<string, string> = {}
      for (const [k, v] of Object.entries(c.headers)) if (permitidas.includes(k)) headers[k] = v
      // El cuerpo se reenvía sin los centinelas que el propio cliente enviaba: así cualquier centinela
      // en la respuesta sólo puede venir del servidor, no de un eco de la petición.
      const cuerpo = c.body ?? undefined
      const res = await fetch(c.url, { method: c.method, headers, body: cuerpo, credentials: 'omit' })
      return { status: res.status, texto: await res.text() }
    }, { url: c.url, method: c.method, headers: c.headers, body: c.body ? REEMPLAZO(c.body.toString('utf8')) : null })
    for (const s of SECRETOS_RESPUESTA) expect(salida.texto, `fuga de ${s} en ${c.url}`).not.toContain(s)
    console.log(`reenvío anónimo ${new URL(c.url).pathname} -> ${salida.status} (${salida.texto.length} bytes): ${JSON.stringify(salida.texto.slice(0, 160))}`)
  }
  await admin.close()
  await anonimo.close()
})
