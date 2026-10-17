import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const raiz = path.resolve(__dirname, '../..')
const leer = (relativa: string) => fs.readFileSync(path.join(raiz, relativa), 'utf8')

/** Texto entre paréntesis de la llamada cuyo `(` está en `indiceParentesis` (balanceado, respeta comillas). */
function argumentosDeLlamada(fuente: string, indiceParentesis: number): string {
  let profundidad = 0
  let comilla = ''
  for (let i = indiceParentesis; i < fuente.length; i += 1) {
    const c = fuente[i] as string
    if (comilla) { if (c === '\\') i += 1; else if (c === comilla) comilla = ''; continue }
    if (c === "'" || c === '"' || c === '`') comilla = c
    else if (c === '(' || c === '[' || c === '{') profundidad += 1
    else if (c === ')' || c === ']' || c === '}') { profundidad -= 1; if (profundidad === 0) return fuente.slice(indiceParentesis + 1, i) }
  }
  throw new Error('paréntesis sin cerrar')
}

/** Divide por comas de nivel cero (fuera de (), [], {} y cadenas). */
function dividirNivelCero(texto: string): string[] {
  const partes: string[] = []
  let profundidad = 0
  let comilla = ''
  let inicio = 0
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i] as string
    if (comilla) { if (c === '\\') i += 1; else if (c === comilla) comilla = ''; continue }
    if (c === "'" || c === '"' || c === '`') comilla = c
    else if ('([{'.includes(c)) profundidad += 1
    else if (')]}'.includes(c)) profundidad -= 1
    else if (c === ',' && profundidad === 0) { partes.push(texto.slice(inicio, i)); inicio = i + 1 }
  }
  if (texto.slice(inicio).trim()) partes.push(texto.slice(inicio))
  return partes
}

const CLAVES_LOG_INTAKE = new Set(['evento', 'codigo', 'duracion_ms', 'correlacion', 'err_name', 'pg_code'])

/** Problemas de cada llamada `logger.<nivel>(…)` o `logger[…](…)`: primer argumento no literal o claves fuera de la lista. */
function problemasLogger(fuente: string, restringirClaves: boolean): string[] {
  const problemas: string[] = []
  for (const m of fuente.matchAll(/\blogger(?:\.(?:trace|debug|info|warn|error|fatal)|\[[^\]]*\])\s*\(/g)) {
    const primero = (dividirNivelCero(argumentosDeLlamada(fuente, m.index + m[0].length - 1))[0] ?? '').trim()
    if (!/^\{[\s\S]*\}$/.test(primero)) { problemas.push(`primer argumento no literal: ${primero.slice(0, 40)}`); continue }
    if (!restringirClaves) continue
    for (const entrada of dividirNivelCero(primero.slice(1, -1))) {
      const texto = entrada.trim()
      if (texto.startsWith('...')) { if (texto !== '...metadatos') problemas.push(`spread no permitido: ${texto}`); continue }
      const clave = (texto.split(':')[0] ?? '').trim()
      if (!CLAVES_LOG_INTAKE.has(clave)) problemas.push(`clave no permitida: ${clave}`)
    }
  }
  return problemas
}

function archivosFuente(relativa: string): string[] {
  const resultado: string[] = []
  for (const entrada of fs.readdirSync(path.join(raiz, relativa), { withFileTypes: true })) {
    const ruta = path.posix.join(relativa, entrada.name)
    if (entrada.isDirectory()) resultado.push(...archivosFuente(ruta))
    else if (/\.(ts|tsx)$/.test(entrada.name) && !/\.test\.tsx?$/.test(entrada.name)) resultado.push(ruta)
  }
  return resultado
}

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

  it('manejador llama persistirIntake con dos argumentos o con sondaDePrueba(request) como tercero', () => {
    const fuente = leer('src/lib/intake/manejador.ts')
    const llamadas = [...fuente.matchAll(/persistirIntake\(/g)].filter((m) => !fuente.slice(Math.max(0, m.index - 20), m.index).includes('import'))
    expect(llamadas).toHaveLength(1)
    const argumentos = dividirNivelCero(argumentosDeLlamada(fuente, (llamadas[0]?.index ?? 0) + 'persistirIntake'.length))
    expect(argumentos[0]?.trim()).toBe('payload')
    expect(argumentos[1]?.trim()).toMatch(/^\{[\s\S]*\}$/)
    expect([2, 3]).toContain(argumentos.length)
    if (argumentos.length === 3) expect(argumentos[2]?.trim()).toBe('sondaDePrueba(request)')
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

  it('el catch del manejador también espera respuestaError y captura su rechazo', () => {
    const manejador = leer('src/lib/intake/manejador.ts')
    const inicio = manejador.indexOf('} catch (error) {\n    const intake')
    const captura = manejador.slice(inicio, manejador.indexOf('} finally {', inicio))
    expect(inicio).toBeGreaterThan(0)
    expect(captura).not.toMatch(/return\s+respuestaError\(/)
    expect(captura).toMatch(/try \{ return await respuestaError\(/)
    expect(captura).toMatch(/\} catch \{[^}]*codigo = 'interno'[^}]*respuestaJson\(500/)
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

  it('(c) no hay console. en src/lib/intake ni en src/app/(intake)', () => {
    const archivos = [...archivosFuente('src/lib/intake'), ...archivosFuente('src/app/(intake)')]
    expect(archivos.length).toBeGreaterThan(10)
    for (const archivo of archivos) expect(leer(archivo), archivo).not.toMatch(/console\./)
  })

  it('(e) toda llamada a logger en src/** (salvo fallos.ts) lleva un literal de objeto como primer argumento', () => {
    const archivos = archivosFuente('src').filter((archivo) => !archivo.endsWith('src/lib/intake/fallos.ts'))
    for (const archivo of archivos) expect(problemasLogger(leer(archivo), false), archivo).toEqual([])
  })

  it('(e) en src/lib/intake/** las claves del literal están en la lista cerrada', () => {
    const archivos = archivosFuente('src/lib/intake').filter((archivo) => !archivo.endsWith('/fallos.ts'))
    const conLlamadas = archivos.filter((archivo) => /\blogger(?:\.|\[)/.test(leer(archivo)))
    expect(conLlamadas.length).toBeGreaterThanOrEqual(2)
    for (const archivo of conLlamadas) expect(problemasLogger(leer(archivo), true), archivo).toEqual([])
  })

  it('(e) el analizador detecta las fugas que debe impedir', () => {
    expect(problemasLogger('payload.logger.error(err)', false)).toHaveLength(1)
    expect(problemasLogger('payload.logger.error(dato)', false)).toHaveLength(1)
    expect(problemasLogger("logger.info('texto')", false)).toHaveLength(1)
    expect(problemasLogger('x.logger.error({ err })', false)).toEqual([])
    expect(problemasLogger('x.logger.error({ err })', true)).toEqual(['clave no permitida: err'])
    expect(problemasLogger("x.logger.error({ evento: 'a', msg: error.message })", true)).toEqual(['clave no permitida: msg'])
    expect(problemasLogger("x.logger.error({ ...otro, evento: 'a' })", true)).toEqual(['spread no permitido: ...otro'])
    expect(problemasLogger("x.logger[n]({ evento: 'a', codigo, duracion_ms: f(1, 2), ...metadatos })", true)).toEqual([])
  })

  it('(f) fallos.ts exige los dos literales de seguridad', () => {
    const fallos = leer('src/lib/intake/fallos.ts')
    expect(fallos).toContain("process.env.NODE_ENV !== 'production'")
    expect(fallos).toContain("process.env.POC_FALLOS_INYECTABLES === '1'")
  })

  it('payload.config.ts fija el logger sin PII con la forma {options}', () => {
    const configuracion = leer('src/payload.config.ts')
    expect(configuracion).toContain('logger: { options: opcionesLogger() }')
    expect(configuracion).not.toMatch(/pino-pretty|transport/)
  })

  it('sólo el manejador importa fallos.ts', () => {
    const importadores = archivosFuente('src').filter((archivo) => /from\s+['"](?:\.\/|@\/lib\/intake\/)fallos['"]/.test(leer(archivo)))
    expect(importadores).toEqual(['src/lib/intake/manejador.ts'])
  })
})
