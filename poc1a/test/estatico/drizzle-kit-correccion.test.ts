import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src')
const leer = (ruta: string) => readFile(path.join(src, ruta), 'utf8')

describe('corrección de pushSchema de drizzle-kit', () => {
  it('payload.config.ts envuelve el adaptador y conserva push y afterSchemaInit', async () => {
    const config = await leer('payload.config.ts')
    expect(config).toContain("import { conCorreccionPushSchema } from './lib/drizzle-kit/correccion-push'")
    expect(config).toContain('db: conCorreccionPushSchema(postgresAdapter(')
    expect(config).toContain("push: process.env.POC_NO_PUSH !== '1'")
    expect(config).toContain('afterSchemaInit: [extenderEsquemaIntake]')
  })

  it('el esquema conserva la clave primaria compuesta de intake_limite', async () => {
    const esquema = await leer('lib/intake/esquema.ts')
    expect(esquema).toContain('primaryKey({ columns: [table.claveHmac, table.tipo, table.ventana] })')
  })

  it('el módulo sólo usa APIs públicas de Node y no escribe ni evalúa código', async () => {
    const modulo = await leer('lib/drizzle-kit/correccion-push.ts')
    for (const prohibido of ['_compile', '_load', 'require.cache', 'eval(', 'new Function', 'writeFile']) {
      expect(modulo).not.toContain(prohibido)
    }
    expect(modulo).toContain('compileFunction')
  })
})
