import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const raiz = path.resolve(__dirname, '../..')
const leer = (relativa: string) => fs.readFileSync(path.join(raiz, relativa), 'utf8')

describe('reglas estáticas del intake', () => {
  it('limita overrideAccess:true a persistir', () => {
    const intake = leer('src/lib/intake/persistir.ts')
    expect(intake.match(/overrideAccess:\s*true/g)).toHaveLength(1)
  })

  it('rutas intake delegan sólo en lib/intake', () => {
    for (const ruta of ['src/app/(intake)/solicitar/route.ts', 'src/app/(intake)/api/intake/route.ts']) {
      const imports = [...leer(ruta).matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1])
      expect(imports).toHaveLength(1)
      expect(imports[0]).toMatch(/^@\/lib\/intake\//)
    }
  })

  it('no usa console en rutas ni biblioteca intake', () => {
    const archivos = ['src/app/(intake)/solicitar/route.ts', 'src/app/(intake)/api/intake/route.ts', 'src/lib/intake/manejador.ts', 'src/lib/intake/persistir.ts']
    expect(archivos.map(leer).join('\n')).not.toMatch(/console\./)
  })

  it('manejador llama persistirIntake con dos argumentos', () => {
    expect(leer('src/lib/intake/manejador.ts')).toMatch(/persistirIntake\(payload,\s*\{[\s\S]*?\}\)/)
  })
})
