import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const leer = (ruta: string) => readFile(path.join(raiz, ruta), 'utf8')

it('H-1: test/http/intake.test.ts apunta por defecto al proxy por nombre de servicio, no a 127.0.0.1 (que dentro de app no escucha)', async () => {
  const fuente = await leer('test/http/intake.test.ts')
  const base = /const BASE = \(process\.env\.POC_HTTP_BASE \?\? '([^']+)'\)/.exec(fuente)?.[1]
  expect(base).toBe('https://proxy:3443')
  // `proxy` está en el SAN de la CA efímera y NODE_EXTRA_CA_CERTS de app apunta a esa CA.
  expect(await leer('poc.sh')).toContain('subjectAltName=IP:127.0.0.1,DNS:proxy')
})

it('H-2: el caso honeypot lleva token y cookie válidos (el manejador comprueba CSRF antes que la trampa)', async () => {
  const fuente = await leer('test/http/intake.test.ts')
  const manejador = await leer('src/lib/intake/manejador.ts')
  expect(manejador.indexOf("'csrf_invalido'")).toBeLessThan(manejador.indexOf('cuerpo.sitio_web'))
  // La cookie ajena sólo está permitida para el caso explícito de CSRF.
  const usos = fuente.split('\n').filter((l) => l.includes('otra-cookie'))
  expect(usos).toHaveLength(1)
  expect(usos[0]).toContain("nombre === 'csrf cookie distinta'")
})
