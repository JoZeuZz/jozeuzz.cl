import { readFile, access as fsAccess } from 'node:fs/promises'
import assert from 'node:assert/strict'
import test from 'node:test'

test('fija runtime, stack y gates obligatorios', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'))
  assert.equal(pkg.engines.node, '>=24.22.0 <25')
  assert.match(pkg.packageManager, /^npm@\d+\.\d+\.\d+$/)
  assert.equal(pkg.dependencies.next, '16.4.1')
  assert.equal(pkg.dependencies.payload, '3.90.2')
  assert.equal(pkg.dependencies['@payloadcms/db-postgres'], '3.90.2')
  for (const gate of ['build', 'lint', 'typecheck', 'test']) {
    assert.equal(typeof pkg.scripts[gate], 'string')
  }
  assert.equal(Object.hasOwn(pkg.dependencies, 'drizzle-orm'), false)
})

test('gitignore protege secretos y credenciales', async () => {
  const gi = await readFile('.gitignore', 'utf8')
  assert.match(gi, /\.env\.\*/, 'debe ignorar .env.*')
  assert.match(gi, /\*\.pem/, 'debe ignorar *.pem')
  assert.match(gi, /\*\.key/, 'debe ignorar *.key')
})

test('integration-harness: todos npm exec llevan --offline', async () => {
  const src = await readFile('scripts/integration-harness', 'utf8')
  // Ninguna línea con "npm exec" debe omitir "--offline"
  const lines = src.split('\n')
  const violations = lines.filter(line => {
    const stripped = line.trim()
    // ignorar comentarios
    if (stripped.startsWith('#')) return false
    // detectar npm exec sin --offline
    return /\bnpm exec\b/.test(line) && !/npm exec --offline/.test(line)
  })
  assert.deepEqual(violations, [], `npm exec sin --offline:\n${violations.join('\n')}`)
})

test('integration-harness: binarios locales existen en node_modules/.bin', async () => {
  for (const bin of ['payload', 'vitest', 'next']) {
    await fsAccess(`node_modules/.bin/${bin}`)
      .catch(() => { throw new Error(`binario local faltante: node_modules/.bin/${bin}`) })
  }
})
