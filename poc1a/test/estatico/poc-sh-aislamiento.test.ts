import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

function ramaCase(script: string, orden: string): string {
  const escape = orden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const encontrada = script.match(new RegExp(`\\n  ${escape}\\)([\\s\\S]*?)(?=\\n  (?:[a-z][a-z0-9-]*|\\*)\\)|\\nesac)`, 'i'))
  expect(encontrada, `rama ${orden}`).toBeTruthy()
  return encontrada![1]
}

it('regenera CA efímera y limita override de pruebas a órdenes explícitas', async () => {
  const [script, compose, driver, playwright, medicion, ignore, sonda] = await Promise.all([
    readFile(path.join(raiz, 'poc.sh'), 'utf8'),
    readFile(path.join(raiz, 'compose.yaml'), 'utf8'),
    readFile(path.join(raiz, 'contrato-driver.mjs'), 'utf8'),
    readFile(path.join(raiz, 'playwright.config.ts'), 'utf8'),
    readFile(path.join(raiz, 'playwright.medicion.config.ts'), 'utf8'),
    readFile(path.join(raiz, '..', '.gitignore'), 'utf8'),
    readFile(path.join(raiz, 'scripts/sonda-red.mjs'), 'utf8'),
  ])

  const conPruebas = ['up-pruebas-en', 'up-fallos-en', 'up-prod-pruebas-en']
  const sinPruebas = ['init', 'deps', 'up', 'db-up', 'up-en', 'comprobar-en', 'down', 'ps', 'logs', 'logs-since', 'restart', 'psql', 'resetdb', 'exec', 'exec-en', 'e2e', 'e2e-en', 'e2e-prod-en', 'medir-web', 'build', 'build-en', 'migrate-create', 'migrate', 'migrate-en', 'psql-en', 'up-prod', 'up-prod-en', 'down-prod', 'stats', 'destroy']
  for (const orden of conPruebas) expect(ramaCase(script, orden)).toContain('$CP')
  for (const orden of sinPruebas) expect(ramaCase(script, orden)).not.toContain('$CP')
  for (const orden of ['up-en', 'up-pruebas-en', 'up-fallos-en', 'comprobar-en', 'exec-en', 'e2e-en', 'e2e-prod-en', 'medir-web', 'build-en', 'migrate-en', 'psql-en', 'up-prod-en', 'up-prod-pruebas-en']) {
    expect(ramaCase(script, orden)).toContain('nombre_poc1b "$base"')
  }
  expect(script).toContain('tls_efimera()')
  expect(script).toContain('prime256v1')
  expect(script).toContain('subjectAltName=IP:127.0.0.1,DNS:proxy')
  expect(script).toContain('extendedKeyUsage=serverAuth')
  expect(script).toContain('rm -f .tls/ca.key')
  expect(script).toContain('--force-recreate proxy')
  expect(script).toContain('POC_DATABASE_NAME="$base"')
  expect(script).toContain('logs --no-color --since "$t" proxy app app-prod db')
  expect(script).toContain('sonda-red)')
  expect(ignore).toContain('.tls/')
  expect(script).toContain("grep -q '^INTAKE_SECRETO=' .env")
  expect(script).toContain("printf 'INTAKE_SECRETO=%s\\n' \"$(openssl rand -hex 32)\" >> .env")
  expect(compose).toContain('${INTAKE_SECRETO:?ejecuta ./poc.sh init}')
  expect(driver).toContain("https://127.0.0.1:<puerto>")
  expect(driver).toContain("/.tls/ca.crt")
  expect(driver).toContain("NODE_TLS_REJECT_UNAUTHORIZED === '0'")
  expect(driver).toContain("['logs-since', estado.t0]")
  for (const config of [playwright, medicion]) {
    expect(config).toContain('https://127.0.0.1:')
    expect(config).toContain('POC_E2E_DESTINO')
    expect(config).toContain('ignore-certificate-errors-spki-list')
    expect(config).not.toContain('ignoreHTTPSErrors')
  }
  expect(sonda).toContain('http://app:3000/')
  expect(sonda).toContain('http://app-prod:3000/')
  expect(sonda).toContain('https://proxy:3443/solicitar')
})
