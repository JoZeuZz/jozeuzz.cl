import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const propio = path.join(raiz, 'test/estatico/retirada-r1.test.ts')
// Se construyen por partes para que este archivo no se detecte a sí mismo.
const MARCAS = ['POC_INTAKE_' + 'SINTETICO', 'solicitud-' + 'sintetico', 'solicitud-' + 'sintetica']

// Históricos permitidos: EVIDENCIA.md (registro de POC-1b), HANDOFF-POC-1B.md y docs/ describen R-1 en pasado.
const DIRECTORIOS = ['driver', 'scripts', 'test', 'e2e', 'src', 'medicion', 'proxy', '../contrato']
const ARCHIVOS = ['contrato-driver.mjs', 'poc.sh', 'compose.yaml', 'compose.pruebas.yaml', 'README.md', 'package.json']

async function listar(dir: string): Promise<string[]> {
  const salida: string[] = []
  for (const entrada of await readdir(dir, { withFileTypes: true })) {
    if (entrada.name === 'node_modules' || entrada.name.startsWith('.')) continue
    const ruta = path.join(dir, entrada.name)
    if (entrada.isDirectory()) salida.push(...(await listar(ruta)))
    else salida.push(ruta)
  }
  return salida
}

describe('retirada de R-1 (intake sintético)', () => {
  it('el script solicitud-sintetica.ts ya no existe', async () => {
    await expect(stat(path.join(raiz, 'scripts/' + 'solicitud-' + 'sintetica.ts'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('ningún archivo vivo referencia R-1', async () => {
    const rutas = [
      ...(await Promise.all(DIRECTORIOS.map((d) => listar(path.resolve(raiz, d))))).flat(),
      ...ARCHIVOS.map((a) => path.join(raiz, a)),
    ].filter((r) => r !== propio && /\.(m?[jt]sx?|sh|ya?ml|md|json|conf)$/.test(r))
    expect(rutas.length).toBeGreaterThan(20)
    const infractores: string[] = []
    for (const ruta of rutas) {
      const texto = await readFile(ruta, 'utf8')
      if (MARCAS.some((m) => texto.includes(m))) infractores.push(path.relative(raiz, ruta))
    }
    expect(infractores).toEqual([])
  })

  it('el driver sólo conoce el intake real', async () => {
    const driver = await readFile(path.join(raiz, 'contrato-driver.mjs'), 'utf8')
    expect(driver).toContain('/api/intake')
    expect(driver).toContain('/solicitar')
    expect(driver).not.toMatch(/process\.env\.POC_INTAKE_[A-Z]*SINTETIC/)
  })
})

describe('logs() del driver no pasa en vacío (IN-12)', () => {
  async function cargar() {
    const modulo = await import(pathToFileURL(path.join(raiz, 'driver/logs-intake.mjs')).href)
    return modulo.exigirEventoIntake as (lineas: string[], envios: number) => string[]
  }
  const linea = 'app-1  | {"level":30,"evento":"intake","codigo":"creada","duracion_ms":12}'

  it('lanza si hubo envíos y ninguna línea lleva "evento":"intake"', async () => {
    const exigir = await cargar()
    expect(() => exigir(['app-1  | {"level":30,"msg":"otra cosa"}'], 3)).toThrow(/evento.*intake/)
    expect(() => exigir([], 1)).toThrow(/evento.*intake/)
  })

  it('devuelve las líneas si hay al menos un evento intake', async () => {
    const exigir = await cargar()
    expect(exigir([linea, 'otra'], 2)).toEqual([linea, 'otra'])
  })

  it('sin envíos no exige evento (casos que sólo leen logs, p. ej. PR-02)', async () => {
    const exigir = await cargar()
    expect(exigir([], 0)).toEqual([])
  })

  it('el driver cuenta los envíos, reinicia el contador en reset y valida en logs()', async () => {
    const driver = await readFile(path.join(raiz, 'contrato-driver.mjs'), 'utf8')
    expect(driver).toMatch(/import \{ exigirEventoIntake \} from '\.\/driver\/logs-intake\.mjs'/)
    expect(driver).toMatch(/enviosDesdeReset\s*=\s*0/)
    expect(driver).toMatch(/enviosDesdeReset\s*\+=\s*1|enviosDesdeReset\+\+/)
    expect(driver).toMatch(/exigirEventoIntake\(\s*lineas\s*,\s*enviosDesdeReset\s*\)/)
  })
})
