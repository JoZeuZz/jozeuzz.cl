import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const contrato = path.resolve(raiz, '..', 'contrato')
const baseValida = /^poc(1b|3)_[a-z0-9_]+$/
const casosAceptados = ['poc1b_x', 'poc3_x']
const casosRechazados = ['poc', 'poc_prod', 'poc3_', 'poc3_X', 'poc3_x;rm', 'poc4_x']

function literalesDeCampo(texto: string): string[] {
  const payloads = [...texto.matchAll(/\{(?=[^{}]*\bnombre\s*:)(?=[^{}]*\bcontacto\s*:)(?=[^{}]*\btipo_equipo\s*:)(?=[^{}]*\bdescripcion\s*:)[^{}]*\}/gs)]
  return payloads.flatMap(([payload]) => [...payload.matchAll(/(?:nombre|contacto|tipo_equipo|descripcion)\s*:\s*(['"`])([^'"`]+)\1/g)].map((m) => m[2]))
}

function direccionesIp(texto: string): string[] {
  return texto.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b|\b(?:[0-9a-f]{1,4}:){2,}[0-9a-f:]*\b/gi) ?? []
}

function esIpSinteticaPermitida(ip: string): boolean {
  return ip === '127.0.0.1' || /^203\.0\.113\.\d{1,3}$/.test(ip) || /^2001:db8:/i.test(ip)
}

function regexReal(texto: string): RegExp {
  const encontrada = texto.match(/\/(\^poc\(1b\|3\)_\[a-z0-9_\]\+\$)\//)
  expect(encontrada?.[1]).toBeDefined()
  return new RegExp(encontrada![1])
}

function ejecutar(comando: string, args: string[], env: Partial<NodeJS.ProcessEnv> = {}) {
  return spawnSync(comando, args, {
    cwd: raiz,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
}

describe('guardas de bases aisladas y datos sintéticos', () => {
  it('acepta sólo nombres poc1b_ o poc3_ minúsculos no vacíos', () => {
    expect(casosAceptados.every((base) => baseValida.test(base))).toBe(true)
    expect(casosRechazados.every((base) => !baseValida.test(base))).toBe(true)
  })

  it('activa guardas reales antes de operaciones externas', async () => {
    const [pocSh, driver, verificarDb] = await Promise.all([
      readFile(path.join(raiz, 'poc.sh'), 'utf8'),
      readFile(path.join(raiz, 'contrato-driver.mjs'), 'utf8'),
      readFile(path.join(raiz, 'scripts/verificar-db.ts'), 'utf8'),
    ])

    expect(pocSh).toMatch(/poc1b_\?\*\|poc3_\?\*/)
    for (const base of casosRechazados) {
      const resultado = ejecutar('/bin/sh', ['poc.sh', 'up-en', base])
      expect(resultado.status).toBe(2)
      expect(`${resultado.stdout}${resultado.stderr}`).toContain('base POC aislada inválida')
    }

    for (const [texto, operacion] of [[driver, 'spawnSync'], [verificarDb, 'getPayload']] as const) {
      const regex = regexReal(texto)
      expect(casosAceptados.every((base) => regex.test(base))).toBe(true)
      expect(casosRechazados.every((base) => !regex.test(base))).toBe(true)
      const guarda = texto.indexOf(regex.source)
      const throwAntesDeOperacion = texto.indexOf('throw new Error', guarda)
      expect(throwAntesDeOperacion).toBeGreaterThan(guarda)
      expect(texto.indexOf(operacion, throwAntesDeOperacion)).toBeGreaterThan(throwAntesDeOperacion)
    }

    const driverInvalido = ejecutar(process.execPath, ['contrato-driver.mjs'], { POC_TARGET_DATABASE: 'poc3_x;rm' })
    expect(driverInvalido.status).not.toBe(0)
    expect(`${driverInvalido.stdout}${driverInvalido.stderr}`).toContain('base POC aislada explícita')
    const verificacionInvalida = ejecutar(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/verificar-db.ts', 'poc3_x;rm'])
    expect(verificacionInvalida.status).not.toBe(0)
    expect(`${verificacionInvalida.stdout}${verificacionInvalida.stderr}`).toContain('base POC aislada explícita requerida')
  })

  it('mantiene datos de cliente y payload sintéticos reservados', async () => {
    const [fixture, util, driver] = await Promise.all([
      readFile(path.join(contrato, 'fixture.mjs'), 'utf8'),
      readFile(path.join(contrato, 'casos/util.mjs'), 'utf8'),
      readFile(path.join(raiz, 'contrato-driver.mjs'), 'utf8'),
    ])
    const archivos = { fixture, util, driver }
    const literales = Object.fromEntries(Object.entries(archivos).map(([nombre, texto]) => [nombre, literalesDeCampo(texto)]))

    expect(literales.fixture).toEqual(expect.arrayContaining([
      'SNT-NOMBRE',
      'snt-contacto@example.invalid',
      'SNT-EQUIPO',
      'SNT-DESCRIPCION',
    ]))
    expect(literales.fixture).not.toEqual([])
    const todos = Object.values(literales).flat()
    expect(todos.filter((valor) => !valor.includes('@')).every((valor) => valor.startsWith('SNT-'))).toBe(true)
    expect(todos.filter((valor) => valor.includes('@')).every((valor) => valor.endsWith('@example.invalid'))).toBe(true)

    const dominios = Object.values(archivos).flatMap((texto) => [...texto.matchAll(/\b[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+)/g)].map((m) => m[1]))
    expect(dominios.length).toBeGreaterThan(0)
    expect(dominios.every((dominio) => dominio === 'example.invalid')).toBe(true)
    expect(direccionesIp(fixture)).toEqual([])
    expect(direccionesIp(util)).toEqual([])
    expect(driver).toMatch(/POC_BASE_URL \?\? 'http:\/\/127\.0\.0\.1:3101'/)
    for (const texto of Object.values(archivos)) {
      expect(direccionesIp(texto).every(esIpSinteticaPermitida)).toBe(true)
    }
  })
})
