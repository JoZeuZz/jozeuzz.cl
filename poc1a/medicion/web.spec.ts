// Aproximación de LCP, CLS y TBT con PerformanceObserver, emulación móvil (Pixel 5), CPU x4 y red «Slow 4G» por CDP.
// DECLARADA COMO APROXIMACIÓN: no es Lighthouse (no está instalado y no se instalan paquetes en la POC).
import { test } from '@playwright/test'

const RUTAS = ['/proyectos', '/proyectos/snt-proyecto-publicado']
const mediana = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

test('LCP/CLS/TBT aproximados (mediana de 3)', async ({ browser }) => {
  for (const ruta of RUTAS) {
    const res: { lcp: number; cls: number; tbt: number; fcp: number; transfer: number }[] = []
    for (let i = 0; i < 3; i++) {
      const ctx = await browser.newContext({ ...test.info().project.use })
      const page = await ctx.newPage()
      const cdp = await ctx.newCDPSession(page)
      await cdp.send('Network.enable')
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 })
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
      await page.addInitScript(() => {
        const w = window as any
        w.__m = { lcp: 0, cls: 0, fcp: 0, tareas: [] as [number, number][] }
        new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__m.lcp = e.startTime }).observe({ type: 'largest-contentful-paint', buffered: true })
        new PerformanceObserver((l) => { for (const e of l.getEntries() as any[]) if (!e.hadRecentInput) w.__m.cls += e.value }).observe({ type: 'layout-shift', buffered: true })
        new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') w.__m.fcp = e.startTime }).observe({ type: 'paint', buffered: true })
        new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__m.tareas.push([e.startTime, e.duration]) }).observe({ type: 'longtask', buffered: true })
      })
      let transfer = 0
      page.on('response', async (r) => { transfer += Number((await r.headerValue('content-length')) ?? 0) })
      await page.goto(ruta, { waitUntil: 'load' })
      await page.waitForTimeout(4000)
      const m = await page.evaluate(() => (window as any).__m)
      const tbt = (m.tareas as [number, number][]).filter(([ini]) => ini >= m.fcp).reduce((a, [, d]) => a + Math.max(0, d - 50), 0)
      res.push({ lcp: m.lcp, cls: m.cls, tbt, fcp: m.fcp, transfer })
      await ctx.close()
    }
    const med = (k: 'lcp' | 'cls' | 'tbt' | 'fcp' | 'transfer') => +mediana(res.map((r) => r[k])).toFixed(3)
    console.log(`WEB ${ruta} ` + JSON.stringify({ lcp_ms: med('lcp'), fcp_ms: med('fcp'), cls: med('cls'), tbt_ms: med('tbt'), runs: res.map((r) => ({ lcp: +r.lcp.toFixed(0), tbt: +r.tbt.toFixed(0), cls: +r.cls.toFixed(4) })) }))
  }
})
