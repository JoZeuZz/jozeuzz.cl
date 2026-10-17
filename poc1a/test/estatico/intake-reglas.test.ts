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

  it('declara las tres suites de cobertura U5b', () => {
    for (const ruta of ['test/http/intake.test.ts', 'test/integracion/intake-persistir.int.test.ts', 'test/docker/ip-produccion.test.mjs']) expect(fs.existsSync(path.join(raiz, ruta))).toBe(true)
  })

  it('el manejador espera las promesas devueltas dentro del try', () => {
    const manejador = leer('src/lib/intake/manejador.ts')
    const cuerpo = manejador.slice(manejador.indexOf('export async function manejarIntake'), manejador.indexOf('} catch (error) {\n    const intake'))
    expect(cuerpo).not.toMatch(/return\s+respuestaError\(/)
    expect(cuerpo).toMatch(/return await respuestaError\(/)
  })

  it('las consultas de límites y purga califican el schema del adaptador', () => {
    for (const ruta of ['src/lib/intake/limites.ts', 'src/lib/intake/purga.ts']) {
      const fuente = leer(ruta)
      expect(fuente).not.toMatch(/(?:FROM|INTO)\s+intake_/)
      expect(fuente).toContain('sql.identifier(schema)')
    }
  })

  it('el cupo de creaciones del driver de contrato coincide con LIMITES', async () => {
    const { LIMITES } = await import('../../src/lib/intake/limites')
    const driver = leer('contrato-driver.mjs')
    const max = /limite:\s*\{\s*max:\s*(\d+)\s*\}/.exec(driver)?.[1]
    expect(Number(max)).toBe(LIMITES.creaciones.max)
  })

  it('carga configuración una vez y no registra errores crudos', () => {
    const manejador = leer('src/lib/intake/manejador.ts')
    expect(manejador.match(/cargarConfigIntake\(/g)).toHaveLength(1)
    expect(manejador).not.toMatch(/logger\.(?:info|error)\(error\)/)
    expect(manejador).not.toMatch(/logger\.(?:info|error)\(\{[^}]*\berror\b/)
  })
})
