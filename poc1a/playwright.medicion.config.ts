import { defineConfig, devices } from '@playwright/test'

// Medición aproximada de LCP/CLS/TBT contra producción (app-prod:3000 vía la red de `app`). No es Lighthouse.
const ORIGEN = process.env.POC_E2E_ORIGEN ?? 'http://127.0.0.1:3102'
const DESTINO = process.env.POC_E2E_DESTINO ?? 'app-prod:3000'
const [, puerto] = new URL(ORIGEN).host.split(':')

export default defineConfig({
  testDir: './medicion',
  timeout: 300_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: ORIGEN,
    launchOptions: { args: [`--host-resolver-rules=MAP 127.0.0.1:${puerto} ${DESTINO}`] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Pixel 5'] } }],
})
