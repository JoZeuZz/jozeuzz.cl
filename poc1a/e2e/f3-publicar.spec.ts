import { expect, test } from '@playwright/test'

import { contextoAdmin, estado } from './comun'

const slug = `e2e-${Date.now().toString(36)}`
const TITULO = `E2E-TITULO-${slug}`

test('F3: crear, publicar y retirar como admin; el anónimo (otro contexto) sólo ve lo publicado', async ({ browser }) => {
  const admin = await contextoAdmin(browser)
  const anonimo = await browser.newContext()
  const page = await admin.newPage()

  // Crear borrador por la interfaz de administración.
  await page.goto('/admin/collections/proyectos/create')
  await page.locator('#field-slug').fill(slug)
  await page.locator('#field-titulo').fill(TITULO)
  await page.locator('#field-resumen').fill('E2E-RESUMEN')
  await page.getByRole('button', { name: 'Save Draft' }).click()
  await page.waitForURL(/\/admin\/collections\/proyectos\/\d+/, { timeout: 120_000 })

  // Borrador: el anónimo recibe 404 y no ve el título; el admin sí ve la vista previa.
  let anon = await estado(anonimo, `/proyectos/${slug}`)
  expect(anon.status).toBe(404)
  expect(anon.texto).not.toContain(TITULO)
  expect((await estado(anonimo, '/proyectos')).texto).not.toContain(TITULO)
  expect((await estado(anonimo, `/proyectos/${slug}?preview=1`)).status).toBe(404)
  const previa = await estado(admin, `/proyectos/${slug}?preview=1`)
  expect(previa.status).toBe(200)
  expect(previa.texto).toContain(TITULO)
  // Sin ?preview=1 el admin tampoco ve el borrador en la web pública.
  expect((await estado(admin, `/proyectos/${slug}`)).status).toBe(404)

  // Publicar.
  await page.getByRole('button', { name: /^Publish/ }).first().click()
  await expect(page.locator('body')).toContainText(/Updated successfully|successfully/i, { timeout: 60_000 })
  anon = await estado(anonimo, `/proyectos/${slug}`)
  expect(anon.status).toBe(200)
  expect(anon.texto).toContain(TITULO)
  expect((await estado(anonimo, '/proyectos')).texto).toContain(TITULO)
  expect((await estado(anonimo, '/sitemap.xml')).texto).toContain(`/proyectos/${slug}`)

  // Retirar (Unpublish nativo): el desplegable junto al botón de publicar.
  await page.reload()
  await page.locator('#action-save-draft').waitFor({ timeout: 60_000 })
  await page.locator('button.popup-button').first().click()
  await page.locator('#action-unpublish').click()
  await page.getByRole('button', { name: /Confirm|Unpublish/ }).last().click()
  await expect(page.locator('body')).toContainText(/successfully/i, { timeout: 60_000 })
  anon = await estado(anonimo, `/proyectos/${slug}`)
  expect(anon.status).toBe(404)
  expect(anon.texto).not.toContain(TITULO)
  expect((await estado(anonimo, '/sitemap.xml')).texto).not.toContain(`/proyectos/${slug}`)
  // El admin conserva el documento (retirado, no borrado).
  const aun = await estado(admin, `/proyectos/${slug}?preview=1`)
  expect(aun.status).toBe(200)
  expect(aun.texto).toContain(TITULO)

  await admin.close()
  await anonimo.close()
})
