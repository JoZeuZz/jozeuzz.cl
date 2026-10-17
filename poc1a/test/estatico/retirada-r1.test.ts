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

describe('README: gate de la unidad 9', () => {
  const idsDe = (linea: string) => linea.split('--solo ')[1].trim().split(',')

  it('documenta 44 casos en app y 43 (sin EV-04) en app-prod, con P-U1-01 pendiente', async () => {
    const readme = await readFile(path.join(raiz, 'README.md'), 'utf8')
    const seccion = readme.slice(readme.indexOf('## POC-3 U9'))
    expect(seccion.startsWith('## POC-3 U9')).toBe(true)
    const lineas = seccion.split('\n').filter((l) => l.includes('contrato/run.mjs') && l.includes('--solo '))
    expect(lineas).toHaveLength(2)
    const [enApp, enProd] = lineas.map(idsDe)
    expect(enApp).toHaveLength(44)
    expect(new Set(enApp).size).toBe(44)
    expect(enApp).toContain('EV-04')
    expect(enProd).toHaveLength(43)
    expect(enProd).not.toContain('EV-04')
    expect(enProd.filter((id) => id !== 'EV-04').sort()).toEqual([...enApp].filter((id) => id !== 'EV-04').sort())
    expect(lineas[0]).toContain('POC_BASE_URL=https://127.0.0.1:3443')
    expect(lineas[1]).toContain('POC_BASE_URL=https://127.0.0.1:3444')
    expect(lineas[1]).toContain("POC_RESET_ENV='POC_DB_SCHEMA=poc_prod POC_MEDIA_DIR=/app/media-store-prod'")
    for (const l of lineas) expect(l).toContain('POC_TARGET_DATABASE=poc3_intake')
    expect(seccion.match(/--alcance poc-3/g)).toHaveLength(2)
    expect(seccion).toContain('node medicion/intake-latencia.mjs')
    expect(seccion).toContain('P-U1-01')
    expect(seccion).toContain('up-fallos-en poc3_intake')
    expect(seccion).toContain('up-prod-pruebas-en poc3_intake')
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
    expect(driver).toMatch(/import \{ servicioDeSolicitud \} from '\.\/driver\/servicio-solicitud\.mjs'/)
    expect(driver).toContain('servicioDeSolicitud(d, estado.idPorSlug)')
    expect(driver).toMatch(/setTimeout\(resolve, 1500\)[\s\S]*?\['logs-since', estado\.t0\]/)
  })
})
