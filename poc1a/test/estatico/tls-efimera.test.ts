import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const hayOpenssl = spawnSync('openssl', ['version']).status === 0

const modo = async (ruta: string) => ((await stat(ruta)).mode & 0o777).toString(8)

// Ejecuta la función real tls_efimera() de poc.sh con sh y openssl, en un directorio temporal.
it.skipIf(!hayOpenssl)('tls_efimera() deja los permisos reales: .tls 755, ca.crt y spki.txt 644, servidor.key 600, sin ca.key (I-7)', async () => {
  const script = await readFile(path.join(raiz, 'poc.sh'), 'utf8')
  const funcion = /tls_efimera\(\) \{[\s\S]*?\n\}/.exec(script)?.[0]
  expect(funcion, 'función tls_efimera en poc.sh').toBeTruthy()
  const dir = await mkdtemp(path.join(tmpdir(), 'tls-efimera-'))
  try {
    const r = spawnSync('sh', ['-eu', '-c', `${funcion}\ntls_efimera`], { cwd: dir, encoding: 'utf8' })
    expect(r.status, r.stderr).toBe(0)
    expect(await modo(path.join(dir, '.tls'))).toBe('755')
    expect(await modo(path.join(dir, '.tls/ca.crt'))).toBe('644')
    expect(await modo(path.join(dir, '.tls/spki.txt'))).toBe('644')
    expect(await modo(path.join(dir, '.tls/servidor.key'))).toBe('600')
    expect(existsSync(path.join(dir, '.tls/ca.key'))).toBe(false)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
