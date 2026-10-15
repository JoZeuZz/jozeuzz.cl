import { expect, type Browser, type BrowserContext } from '@playwright/test'

export type Reset = { refs: Record<string, string>; ids: Record<string, string>; password: string; email: string }

/** El reset lo hace ./poc.sh e2e (en el host) y lo entrega por entorno: no hay ruta HTTP de semilla. */
export function reset(): Reset {
  const crudo = process.env.E2E_RESET
  if (!crudo) throw new Error('falta E2E_RESET: ejecuta las E2E con ./poc.sh e2e')
  return JSON.parse(crudo)
}

export async function contextoAdmin(browser: Browser): Promise<BrowserContext> {
  const r = reset()
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto('/admin/login')
  await page.locator('#field-email').fill(r.email)
  await page.locator('#field-password').fill(r.password)
  await page.getByRole('button', { name: 'Login' }).click()
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 120_000 })
  await expect(page.locator('body')).toContainText(/Dashboard|Collections/i, { timeout: 60_000 })
  await page.close()
  return ctx
}

export async function estado(ctx: BrowserContext, ruta: string) {
  const page = await ctx.newPage()
  const res = await page.goto(ruta)
  const texto = await page.content()
  await page.close()
  return { status: res!.status(), texto }
}
