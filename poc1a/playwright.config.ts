import { defineConfig, devices } from '@playwright/test'
import { readFileSync } from 'node:fs'

const ORIGEN = process.env.POC_E2E_ORIGEN ?? 'https://127.0.0.1:3443'
const DESTINO = process.env.POC_E2E_DESTINO
if (!DESTINO) throw new Error('POC_E2E_DESTINO es obligatorio')
const SPKI = readFileSync('.tls/spki.txt', 'utf8').trim()
if (!SPKI) throw new Error('.tls/spki.txt es obligatorio')
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
    launchOptions: { args: [`--host-resolver-rules=MAP 127.0.0.1:${puertoOrigen} ${DESTINO}`, `--ignore-certificate-errors-spki-list=${SPKI}`] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
