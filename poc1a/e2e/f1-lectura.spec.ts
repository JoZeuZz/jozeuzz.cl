import { expect, test } from '@playwright/test'

import { reset } from './comun'

test.use({ javaScriptEnabled: false })

test('F1: lectura pública sin JavaScript; los enlaces navegan', async ({ page }) => {
  const r = reset()
  await page.goto('/proyectos')
  await expect(page.locator('body')).toContainText('SNT-TITULO-PUBLICADO')
  await expect(page.locator('body')).not.toContainText('SNT-TITULO-BORRADOR')
  await page.getByRole('link', { name: 'SNT-TITULO-PUBLICADO' }).click()
  await expect(page).toHaveURL(new RegExp(`/proyectos/${r.refs.proyecto_publicado}$`))
  await expect(page.locator('h1')).toHaveText('SNT-TITULO-PUBLICADO')
  await expect(page.locator('body')).toContainText('SNT-RESUMEN-PUBLICADO')

  await page.goto('/servicios')
  await expect(page.locator('body')).toContainText('SNT-SERVICIO-ACTIVO')
  await expect(page.locator('body')).not.toContainText('SNT-SERVICIO-INACTIVO')
  await page.getByRole('link', { name: 'SNT-SERVICIO-ACTIVO' }).click()
  await expect(page.locator('body')).toContainText('SNT-DESC-SERVICIO-ACTIVO')

  const borrador = await page.goto(`/proyectos/${r.refs.proyecto_borrador}`)
  expect(borrador!.status()).toBe(404)
})
