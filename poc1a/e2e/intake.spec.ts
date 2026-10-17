import { expect, test, type Page } from '@playwright/test'

/**
 * POC-3 U8: accesibilidad del formulario público /solicitar (teclado, lector de pantalla y sin JavaScript).
 * Se ejecuta en Docker (`./poc.sh e2e-en poc3_intake`, `./poc.sh e2e-prod-en poc3_intake`) por el proxy TLS.
 * Datos sintéticos `SNT-E2E-…`; sin ignoreHTTPSErrors (la confianza viene de playwright.config.ts).
 */

// Mayor que el tiempo mínimo del intake (200 ms en Compose) para no caer en `envio_rechazado`.
const ESPERA_MS = 600

const idActivo = (page: Page) => page.evaluate(() => document.activeElement?.id ?? '')

async function abrir(page: Page) {
  await page.goto('/solicitar')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.waitForTimeout(ESPERA_MS)
}

async function llenarPorTeclado(page: Page, sufijo: string) {
  await page.locator('#nombre').focus()
  await page.keyboard.type(`SNT-E2E-nombre-${sufijo}`)
  await page.keyboard.press('Tab')
  await page.keyboard.type(`SNT-E2E-contacto-${sufijo}@example.invalid`)
  await page.keyboard.press('Tab')
  await page.keyboard.type(`SNT-E2E-equipo-${sufijo}`)
  await page.keyboard.press('Tab')
  await page.keyboard.type(`SNT-E2E-descripcion-${sufijo}`)
  await page.keyboard.press('Tab') // servicio, se deja en la opción vacía
  await page.keyboard.press('Tab') // Enviar
  await expect(page.getByRole('button', { name: 'Enviar solicitud' })).toBeFocused()
}

test.describe('intake accesible con JavaScript', () => {
  test('sólo teclado: Tab recorre los campos en orden y la trampa no recibe foco', async ({ page }) => {
    await abrir(page)
    const recorrido: string[] = []
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Tab')
      recorrido.push(await idActivo(page))
    }
    expect(recorrido.slice(0, 5)).toEqual(['nombre', 'contacto', 'tipo_equipo', 'descripcion', 'servicio'])
    await expect(page.getByRole('button', { name: 'Enviar solicitud' })).toBeFocused()
    expect(recorrido).not.toContain('sitio_web')
    await page.keyboard.press('Tab')
    expect(await idActivo(page)).not.toBe('sitio_web')
    await expect(page.locator('#sitio_web')).not.toBeFocused()
    await expect(page.locator('[aria-hidden="true"] #sitio_web')).toHaveAttribute('tabindex', '-1')
  })

  test('envío vacío: foco en nombre, resumen role=alert y campos marcados', async ({ page }) => {
    await abrir(page)
    await page.getByRole('button', { name: 'Enviar solicitud' }).focus()
    await page.keyboard.press('Enter')
    const alerta = page.getByRole('alert')
    await expect(alerta).toBeVisible()
    await expect(alerta).toContainText('Revisa los campos indicados')
    await expect(page.locator('#nombre')).toBeFocused()
    for (const campo of ['nombre', 'contacto', 'tipo_equipo', 'descripcion']) {
      const control = page.locator(`#${campo}`)
      await expect(control).toHaveAttribute('aria-invalid', 'true')
      await expect(control).toHaveAttribute('aria-describedby', `ayuda-${campo} error-${campo}`)
      await expect(page.locator(`#error-${campo}`)).toContainText('Error')
      await expect(alerta.locator(`a[href="#${campo}"]`)).toBeVisible()
    }
    await expect(page.locator('#servicio')).not.toHaveAttribute('aria-invalid', 'true')
  })

  test('envío válido por teclado: aviso role=status', async ({ page }) => {
    await abrir(page)
    await llenarPorTeclado(page, 'js')
    await page.keyboard.press('Enter')
    await page.waitForURL(/\/solicitar\?estado=recibida$/)
    await expect(page.getByRole('status')).toContainText('Solicitud recibida')
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('dos pestañas: la primera recibe el mensaje de csrf', async ({ context }) => {
    const primera = await context.newPage()
    await abrir(primera)
    const segunda = await context.newPage()
    await abrir(segunda) // el segundo GET sobrescribe la cookie __Host-intake
    await llenarPorTeclado(primera, 'pestana')
    await primera.keyboard.press('Enter')
    const alerta = primera.getByRole('alert')
    await expect(alerta).toBeVisible()
    await expect(alerta).toContainText('Vuelve a cargar el formulario')
    await expect(alerta).not.toContainText('SNT-E2E')
  })

  test('cookie __Host-intake: secure, httpOnly, SameSite Strict', async ({ context, page }) => {
    await abrir(page)
    const cookie = (await context.cookies()).find((c) => c.name === '__Host-intake')
    expect(cookie).toBeDefined()
    expect(cookie).toMatchObject({ secure: true, httpOnly: true, sameSite: 'Strict', path: '/' })
  })
})

test.describe('intake sin JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('envío válido: POST urlencoded, 303 y aviso role=status', async ({ page }) => {
    await abrir(page)
    await page.locator('#nombre').fill('SNT-E2E-nombre-nojs')
    await page.locator('#contacto').fill('SNT-E2E-contacto-nojs@example.invalid')
    await page.locator('#tipo_equipo').fill('SNT-E2E-equipo-nojs')
    await page.locator('#descripcion').fill('SNT-E2E-descripcion-nojs')
    const respuesta = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/intake')
    await page.getByRole('button', { name: 'Enviar solicitud' }).click()
    const post = await respuesta
    expect(post.status()).toBe(303)
    expect(post.request().headers()['content-type']).toContain('application/x-www-form-urlencoded')
    await page.waitForURL(/\/solicitar\?estado=recibida$/)
    await expect(page.getByRole('status')).toContainText('Solicitud recibida')
  })

  test('envío vacío: 400 con resumen role=alert y foco en nombre', async ({ page }) => {
    await abrir(page)
    const respuesta = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/intake')
    await page.getByRole('button', { name: 'Enviar solicitud' }).click()
    expect((await respuesta).status()).toBe(400)
    await expect(page.getByRole('alert')).toContainText('Revisa los campos indicados')
    await expect(page.locator('#nombre')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.locator('#nombre')).toHaveAttribute('autofocus', '')
    await expect(page.getByRole('alert').locator('a[href="#nombre"]')).toBeVisible()
  })
})
