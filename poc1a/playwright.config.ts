import { defineConfig, devices } from '@playwright/test'

// El servicio e2e comparte la red de `app` (network_mode: service:app). El navegador pide
// http://127.0.0.1:3101 —el origen configurado en serverURL/csrf— y Chromium lo redirige a :3000 dentro
// del contenedor: así las cookies Secure y la comprobación de Origin se ejercen sin tocar la configuración.
const ORIGEN = process.env.POC_E2E_ORIGEN ?? 'http://127.0.0.1:3101'
const DESTINO = process.env.POC_E2E_DESTINO ?? '127.0.0.1:3000'
const [, puertoOrigen] = new URL(ORIGEN).host.split(':')

export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: ORIGEN,
    launchOptions: { args: [`--host-resolver-rules=MAP 127.0.0.1:${puertoOrigen} ${DESTINO}`] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
