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

  it('payload.config.ts fija la raíz de drizzle-kit sin depender de process.cwd()', async () => {
    const config = await leer('payload.config.ts')
    expect(config).toContain("{ raiz: path.resolve(dirname, '..') }")
  })

  it('el esquema conserva la clave primaria compuesta de intake_limite', async () => {
    const esquema = await leer('lib/intake/esquema.ts')
    expect(esquema).toContain('primaryKey({ columns: [table.claveHmac, table.tipo, table.ventana] })')
  })

  it('el módulo sólo usa APIs públicas de Node y no escribe ni evalúa código', async () => {
    const modulo = await leer('lib/drizzle-kit/correccion-push.ts')
    const prohibidos: (string | RegExp)[] = [
      '_compile',
      '_load',
      'require.cache',
      'eval(',
      'new Function',
      'writeFile',
      'runInThisContext',
      'runInNewContext',
      'runInContext',
      // «compileFunction(» es legítimo: «Function(» se prohíbe sólo como identificador completo.
      /(?<![A-Za-z0-9_$])Function\(/,
      'Module.prototype',
      'process.binding',
      'globalThis',
      'appendFile',
      'mkdir',
      'unlink',
      // «rm(» sólo como llamada completa, no como final de «form(», «confirm(», etc.
      /(?<![A-Za-z0-9_$])rm\(/,
      // La raíz es obligatoria: ningún valor por defecto depende del directorio de trabajo.
      'process.cwd',
      // Borrado y escritura.
      'rmSync',
      'rmdir',
      'rename',
      'copyFile',
      'createWriteStream',
      'symlink',
      'chmod',
      'truncate',
      // Ejecución de procesos. «exec(» sólo como llamada completa: no colisiona con «RegExp.exec»
      // porque el módulo no la usa; si apareciera, esta regex la rechazaría a propósito.
      'child_process',
      'spawn',
      /(?<![A-Za-z0-9_$])exec\(/,
      'execSync',
      'execFile',
      // Carga y evaluación dinámica de código.
      /(?<![A-Za-z0-9_$.])import\(/,
      'vm.Script',
      'new Script',
      'createScript',
      'SourceTextModule',
      '(0, eval)',
      // Internos de proceso y globales.
      'process.dlopen',
      '_linkedBinding',
      'global.',
    ]
    for (const prohibido of prohibidos) {
      if (typeof prohibido === 'string') expect(modulo).not.toContain(prohibido)
      else expect(modulo).not.toMatch(prohibido)
    }
    expect(modulo).toContain('compileFunction')
    expect(modulo).toContain('readFileSync')
  })
})
