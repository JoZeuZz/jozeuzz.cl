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

it('reset-e2e recibe URL del driver, CA efímera y entorno de producción (B-2/B-3)', async () => {
  const script = await readFile(path.join(raiz, 'poc.sh'), 'utf8')
  const lineaReset = (orden: string) => ramaCase(script, orden).split('\n').find((l) => l.includes('scripts/reset-e2e.mjs')) ?? ''
  const dev = lineaReset('e2e-en')
  expect(dev).toContain('POC_BASE_URL=https://127.0.0.1:3443')
  expect(dev).toContain('NODE_EXTRA_CA_CERTS="$PWD/.tls/ca.crt"')
  expect(dev).toContain('POC_TARGET_DATABASE="$base"')
  const prod = lineaReset('e2e-prod-en')
  expect(prod).toContain('POC_BASE_URL=https://127.0.0.1:3444')
  expect(prod).toContain('NODE_EXTRA_CA_CERTS="$PWD/.tls/ca.crt"')
  expect(prod).toContain("POC_RESET_ENV='POC_DB_SCHEMA=poc_prod POC_MEDIA_DIR=/app/media-store-prod'")
  // El driver sólo lee POC_RESET_ENV: variables sueltas de schema/medios se ignorarían y reiniciarían el schema equivocado.
  expect(prod.replace(/POC_RESET_ENV='[^']*'/, '')).not.toMatch(/\bPOC_(DB_SCHEMA|MEDIA_DIR)=/)
})

it('la orden heredada e2e no ejecuta nada: falla indicando e2e-en o e2e-prod-en', async () => {
  const script = await readFile(path.join(raiz, 'poc.sh'), 'utf8')
  const rama = ramaCase(script, 'e2e')
  expect(rama).not.toContain('reset-e2e.mjs')
  expect(rama).not.toContain('playwright')
  expect(rama).not.toContain('$C ')
  expect(rama).toMatch(/>&2/)
  expect(rama).toContain('e2e-en <base>')
  expect(rama).toContain('e2e-prod-en <base>')
  expect(rama).toMatch(/exit [1-9]/)
  // Ninguna invocación de reset-e2e.mjs omite la URL y la CA que exige el driver (contrato-driver.mjs).
  const invocaciones = script.split('\n').filter((l) => l.includes('node scripts/reset-e2e.mjs'))
  expect(invocaciones.length).toBeGreaterThan(0)
  for (const linea of invocaciones) {
    expect(linea).toContain('POC_BASE_URL=')
    expect(linea).toContain('NODE_EXTRA_CA_CERTS=')
  }
})

it('tls_efimera deja permisos legibles para los contenedores y la clave sólo para nginx (I-7)', async () => {
  const script = await readFile(path.join(raiz, 'poc.sh'), 'utf8')
  const funcion = /tls_efimera\(\) \{[\s\S]*?\n\}/.exec(script)?.[0] ?? ''
  expect(funcion).toContain('chmod 755 .tls')
  expect(funcion).not.toContain('chmod 700 .tls')
  expect(funcion).toMatch(/chmod 644 \.tls\/ca\.crt \.tls\/spki\.txt/)
  expect(funcion).toContain('chmod 600 .tls/servidor.key')
  expect(funcion).toContain('rm -f .tls/ca.key')
  // Nada más se hace legible: ningún chmod abre la clave del servidor ni otros archivos.
  const modos = [...funcion.matchAll(/chmod (\d+) (.+)/g)].map((m) => `${m[1]} ${m[2].trim()}`)
  expect(modos).toEqual(['644 .tls/ca.crt .tls/spki.txt', '755 .tls', '600 .tls/servidor.key'])
  expect(funcion).toContain('umask 077')
  expect(funcion.indexOf('chmod 755 .tls')).toBeGreaterThan(funcion.indexOf('rm -f .tls/ca.key'))
})

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
