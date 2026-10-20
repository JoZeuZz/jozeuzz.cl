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

it('e2e-prod-en levanta app (dev) en la base destino y la verifica antes del reset', async () => {
  const script = await readFile(path.join(raiz, 'poc.sh'), 'utf8')
  const rama = ramaCase(script, 'e2e-prod-en')
  // El reset corre con `exec-en` dentro del servicio app (dev): debe existir y apuntar a $base.
  const levanta = rama.indexOf('POC_DATABASE_NAME="$base" $C up -d db app\n')
  const verifica = rama.indexOf('$C exec -T app npx tsx scripts/verificar-db.ts "$base"')
  const reset = rama.indexOf('scripts/reset-e2e.mjs')
  expect(levanta).toBeGreaterThan(-1)
  expect(verifica).toBeGreaterThan(levanta)
  expect(reset).toBeGreaterThan(verifica)
})

it('exec-en comprueba que app está conectado a la base pedida antes de ejecutar', async () => {
  const script = await readFile(path.join(raiz, 'poc.sh'), 'utf8')
  const rama = ramaCase(script, 'exec-en')
  const verifica = rama.indexOf('scripts/verificar-db.ts "$base"')
  const ejecuta = rama.indexOf('$C exec -T app "$@"')
  expect(verifica).toBeGreaterThan(-1)
  expect(ejecuta).toBeGreaterThan(verifica)
})

it('el mensaje de uso no anuncia la orden e2e retirada', async () => {
  const script = await readFile(path.join(raiz, 'poc.sh'), 'utf8')
  expect(script).not.toMatch(/\|e2e \[args\]/)
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
  const modos = [...funcion.matchAll(/^\s*chmod (\d+) (.+)/gm)].map((m) => `${m[1]} ${m[2].trim()}`)
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
  const sinPruebas = ['init', 'init-volumes', 'probe-mounts', 'run-prod-en', 'manifest-patch-axe', 'deps', 'up','db-up', 'up-en', 'comprobar-en', 'down', 'ps', 'logs', 'logs-since', 'restart', 'psql', 'resetdb', 'exec', 'exec-en', 'e2e', 'e2e-en', 'e2e-prod-en', 'medir-web', 'build', 'build-en', 'migrate-create', 'migrate', 'migrate-en', 'psql-en', 'up-prod', 'up-prod-en', 'down-prod', 'stats', 'destroy']
  for (const orden of conPruebas) expect(ramaCase(script, orden)).toContain('$CP')
  for (const orden of sinPruebas) expect(ramaCase(script, orden)).not.toContain('$CP')
  for (const orden of ['up-en', 'up-pruebas-en', 'up-fallos-en', 'comprobar-en', 'exec-en', 'e2e-en', 'e2e-prod-en', 'medir-web', 'build-en', 'migrate-en', 'psql-en', 'up-prod-en', 'up-prod-pruebas-en', 'run-prod-en']) {
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
  expect(driver).toContain('servicioDeSolicitud(')
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

it('init prepara los puntos de montaje sin seguir enlaces simbólicos', async () => {
  const script = await readFile(path.join(raiz, 'poc.sh'), 'utf8')
  const rama = ramaCase(script, 'init')
  const dirs = 'node_modules .npm-cache .next .next-prod media-store media-store-test media-store-prod test-results playwright-report blob-report'
  expect(rama).toContain(`for punto in ${dirs} next-env.d.ts; do`)
  expect(rama).toContain('if [ -L "$punto" ]; then')
  expect(rama).toMatch(/enlace simbólico[^\n]*>&2; exit 1/)
  expect(rama).toContain(`for dir in ${dirs}; do`)
  expect(rama).toContain('mkdir -p "$dir"')
  expect(rama).toContain('[ -e next-env.d.ts ] || : > next-env.d.ts')
  expect(rama.indexOf('[ -L "$punto" ]')).toBeLessThan(rama.indexOf('mkdir -p "$dir"'))
  expect(rama).not.toMatch(/chown|chmod|rm -r|ln /)
})

it('init-volumes ejecuta bootstrap root acotado antes de UID 1000', async () => {
  const script = await readFile(path.join(raiz, 'poc.sh'), 'utf8')
  const rama = ramaCase(script, 'init-volumes')
  expect(rama).toContain('[ "$#" -eq 0 ]')
  expect(rama).toContain('$C --profile volumes-init run --rm --no-deps volumes-init')
  expect(rama).not.toMatch(/docker\.sock|privileged|cap_add/)
})

it('probe-mounts prueba RO de fuente/node_modules y RW sólo en allowlist', async () => {
  const script = await readFile(path.join(raiz, 'poc.sh'), 'utf8')
  const rama = ramaCase(script, 'probe-mounts')
  for (const ruta of ['/app/package.json', '/app/package-lock.json', '/app/poc.sh', '/app/compose.yaml', '/app/next-env.d.ts']) expect(rama).toContain(ruta)
  expect(rama).toContain('[ "$(id -u)" -eq 1000 ]')
  expect(rama).toContain('denegar /app')
  expect(rama).toContain('$C --profile deps run --rm --no-deps deps sh -ceu "$PROBE" sh rw /app/.npm-cache /tmp')
  expect(rama).toContain('$C run --rm --no-deps app sh -ceu "$PROBE" sh ro /app/.next /app/media-store /app/media-store-test /app/media-store-prod /tmp')
  expect(rama).toContain('$C --profile prod run --rm --no-deps app-prod sh -ceu "$PROBE" sh ro /app/.next-prod /app/media-store-prod /tmp')
  expect(rama).toContain('$C --profile e2e run --rm --no-deps e2e sh -ceu "$PROBE" sh ro /app/test-results /app/playwright-report /app/blob-report /tmp')
})

it('run-prod-en ejecuta D21 dentro de app-prod y conserva next_prod', async () => {
  const script = await readFile(path.join(raiz, 'poc.sh'), 'utf8')
  const rama = ramaCase(script, 'run-prod-en')
  expect(rama).toContain('nombre_poc1b "$base"')
  expect(rama).toContain('shift')
  expect(rama).toContain('POC_DATABASE_NAME="$base"')
  expect(rama).toContain('POC_DB_SCHEMA=poc_prod')
  expect(rama).toContain('POC_NO_PUSH=1')
  expect(rama).toContain('$C --profile prod run --rm --no-deps app-prod "$@"')
  expect(rama).not.toContain('exec -T')
})

it('manifest-patch-axe emite JSON base64 desde tmpfs sin bind RW ni diff', async () => {
  const script = await readFile(path.join(raiz, 'poc.sh'), 'utf8')
  const rama = ramaCase(script, 'manifest-patch-axe')
  expect(rama).toContain('[ "$#" -eq 0 ]')
  expect(rama).toContain('node:24.22.0-trixie-slim@sha256:7f486cabe892bff8fef04c0f7da8dba84a560be3e4e2740b7a86afc57ebec315')
  expect(rama).toContain('--user 1000:1000')
  expect(rama).toContain('--read-only')
  expect(rama).toContain('--cap-drop ALL')
  expect(rama).toContain('--security-opt no-new-privileges:true')
  expect(rama).toContain('--tmpfs /tmp:rw,nosuid,nodev,noexec,uid=1000,gid=1000,mode=0700,size=64m')
  expect(rama).toContain('src="$PWD/package.json",dst=/source/package.json,readonly')
  expect(rama).toContain('src="$PWD/package-lock.json",dst=/source/package-lock.json,readonly')
  expect(rama).toContain('npm install --package-lock-only --ignore-scripts --save-exact --save-dev @axe-core/playwright@4.13.0 >&2')
  expect(rama).toContain('packageJson: fs.readFileSync("package.json").toString("base64")')
  expect(rama).toContain('packageLockJson: fs.readFileSync("package-lock.json").toString("base64")')
  expect(rama).toContain('process.stdout.write(JSON.stringify(salida))')
  expect(rama).not.toMatch(/type=bind[^\n]*dst=\/app(?!\/)/)
  expect(rama).not.toContain('diff ')
  expect(rama).not.toContain('git apply')
})

it('migrate-create está deshabilitada: /app es de sólo lectura', async () => {
  const script = await readFile(path.join(raiz, 'poc.sh'), 'utf8')
  const rama = ramaCase(script, 'migrate-create')
  expect(rama).toContain('migrate-create deshabilitada: /app es sólo lectura; las migraciones se crean fuera de los contenedores con revisión humana')
  expect(rama).toContain('>&2; exit 2')
  expect(rama).not.toContain('$C')
  expect(rama).not.toContain('migrate:create')
  // migrate y migrate-en conservan su comportamiento.
  expect(ramaCase(script, 'migrate')).toContain('$C --profile prod run --rm app-prod npm run payload -- migrate')
  expect(ramaCase(script, 'migrate-en')).toContain('POC_DATABASE_NAME="$base" POC_DB_SCHEMA=poc_prod POC_NO_PUSH=1 $C --profile prod run --rm app-prod npm run payload -- migrate')
})

it('el mensaje de uso anuncia las órdenes nuevas', async () => {
  const script = await readFile(path.join(raiz, 'poc.sh'), 'utf8')
  const uso = script.split('\n').find((l) => l.includes('echo "uso: ./poc.sh')) ?? ''
  for (const orden of ['init-volumes', 'probe-mounts', 'run-prod-en <base> <cmd>', 'manifest-patch-axe']) expect(uso).toContain(orden)
})
