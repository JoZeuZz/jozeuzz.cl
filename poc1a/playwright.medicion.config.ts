import { defineConfig, devices } from '@playwright/test'
import { readFileSync } from 'node:fs'

// Medición aproximada de LCP/CLS/TBT contra producción vía TLS. No es Lighthouse.
const ORIGEN = process.env.POC_E2E_ORIGEN ?? 'https://127.0.0.1:3444'
const DESTINO = process.env.POC_E2E_DESTINO
if (!DESTINO) throw new Error('POC_E2E_DESTINO es obligatorio')
const SPKI = readFileSync('.tls/spki.txt', 'utf8').trim()
if (!SPKI) throw new Error('.tls/spki.txt es obligatorio')
const [, puerto] = new URL(ORIGEN).host.split(':')

export default defineConfig({
  testDir: './medicion',
  timeout: 300_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: ORIGEN,
    launchOptions: { args: [`--host-resolver-rules=MAP 127.0.0.1:${puerto} ${DESTINO}`, `--ignore-certificate-errors-spki-list=${SPKI}`] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Pixel 5'] } }],
})
