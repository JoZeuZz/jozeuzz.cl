import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

describe('migraciones Payload', () => {
  it('importa argumentos de migración sólo como tipos', async () => {
    const directorio = path.resolve('src/migrations')
    const archivos = (await readdir(directorio)).filter((archivo) => archivo.endsWith('.ts') && archivo !== 'index.ts')
    for (const archivo of archivos) {
      const contenido = await readFile(path.join(directorio, archivo), 'utf8')
      expect(contenido).toMatch(/type MigrateUpArgs/)
      expect(contenido).toMatch(/type MigrateDownArgs/)
      expect(contenido).not.toMatch(/import\s*\{[^}]*\bMigrateUpArgs\b(?!\s*[,}])/)
    }
  })
})
