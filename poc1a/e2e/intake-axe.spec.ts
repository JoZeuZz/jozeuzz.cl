import { expect, test, type Page } from '@playwright/test'

/**
 * POC-3 U8 / P3-05: auditoría axe (WCAG 2.0 A y AA) del formulario público.
 * Requiere `@axe-core/playwright@4.13.0` (instalación humana, ver README «POC-3 U8»). El import es dinámico
 * y la suite se omite (skip) si el paquete falta, para que `playwright test` completo no se rompa al cargar
 * este archivo. Mientras el paquete no exista, el archivo está excluido de tsconfig.json. Datos `SNT-E2E-…`.
 */

const ESPERA_MS = 600

async function cargarAxe() {
  try {
    return (await import('@axe-core/playwright')).default
  } catch {
    return null
  }
}

async function auditar(page: Page) {
  const AxeBuilder = await cargarAxe()
  test.skip(!AxeBuilder, '@axe-core/playwright no está instalado (README, POC-3 U8)')
  const resultado = await new AxeBuilder!({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(resultado.violations, JSON.stringify(resultado.violations.map((v) => ({ id: v.id, nodos: v.nodes.map((n) => n.target) })))).toEqual([])
}

test('axe: formulario vacío sin violaciones', async ({ page }) => {
  await page.goto('/solicitar')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await auditar(page)
})

test('axe: formulario con errores sin violaciones', async ({ page }) => {
  await page.goto('/solicitar')
  await page.waitForTimeout(ESPERA_MS)
  await page.getByRole('button', { name: 'Enviar solicitud' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await auditar(page)
})

test('axe: aviso de éxito sin violaciones', async ({ page }) => {
  await page.goto('/solicitar')
  await page.waitForTimeout(ESPERA_MS)
  await page.locator('#nombre').fill('SNT-E2E-nombre-axe')
  await page.locator('#contacto').fill('SNT-E2E-contacto-axe@example.invalid')
  await page.locator('#tipo_equipo').fill('SNT-E2E-equipo-axe')
  await page.locator('#descripcion').fill('SNT-E2E-descripcion-axe')
  await page.getByRole('button', { name: 'Enviar solicitud' }).click()
  await page.waitForURL(/\/solicitar\?estado=recibida$/)
  await expect(page.getByRole('status')).toBeVisible()
  await auditar(page)
})
