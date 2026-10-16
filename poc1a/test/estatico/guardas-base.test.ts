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
  return [...texto.matchAll(/(?:nombre|contacto|tipo_equipo|descripcion)\s*:\s*(['"`])([^'"`]+)\1/g)].map((m) => m[2])
}

function direccionesIp(texto: string): string[] {
  return texto.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b|\b(?:[0-9a-f]{1,4}:){2,}[0-9a-f:]*\b/gi) ?? []
}

function esIpSinteticaPermitida(ip: string): boolean {
  return ip === '127.0.0.1' || /^203\.0\.113\.\d{1,3}$/.test(ip) || /^2001:db8:/i.test(ip)
}

describe('guardas de bases aisladas y datos sintéticos', () => {
  it('acepta sólo nombres poc1b_ o poc3_ minúsculos no vacíos', () => {
    expect(casosAceptados.every((base) => baseValida.test(base))).toBe(true)
    expect(casosRechazados.every((base) => !baseValida.test(base))).toBe(true)
  })

  it('usa guarda equivalente en los cuatro puntos de entrada', async () => {
    const [pocSh, driver, verificarDb, solicitudSintetica] = await Promise.all([
      readFile(path.join(raiz, 'poc.sh'), 'utf8'),
      readFile(path.join(raiz, 'contrato-driver.mjs'), 'utf8'),
      readFile(path.join(raiz, 'scripts/verificar-db.ts'), 'utf8'),
      readFile(path.join(raiz, 'scripts/solicitud-sintetica.ts'), 'utf8'),
    ])

    expect(pocSh).toMatch(/poc1b_\?\*\|poc3_\?\*/)
    for (const texto of [driver, verificarDb, solicitudSintetica]) {
      expect(texto).toContain('^poc(1b|3)_[a-z0-9_]+$')
    }
  })

  it('mantiene datos de cliente y payload sintéticos reservados', async () => {
    const archivos = await Promise.all([
      readFile(path.join(contrato, 'fixture.mjs'), 'utf8'),
      readFile(path.join(contrato, 'casos/util.mjs'), 'utf8'),
      readFile(path.join(raiz, 'contrato-driver.mjs'), 'utf8'),
    ])

    const dominios = archivos.flatMap((texto) => [...texto.matchAll(/\b[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+)/g)].map((m) => m[1]))
    expect(dominios).toEqual(expect.arrayContaining(['example.invalid']))
    expect(dominios.every((dominio) => dominio === 'example.invalid')).toBe(true)
    for (const texto of archivos) {
      expect(direccionesIp(texto).every(esIpSinteticaPermitida)).toBe(true)
    }
    expect(literalesDeCampo(archivos[0])).toEqual(expect.arrayContaining([
      'SNT-NOMBRE',
      'snt-contacto@example.invalid',
      'SNT-EQUIPO',
      'SNT-DESCRIPCION',
    ]))
    expect(literalesDeCampo(archivos[0]).filter((valor) => !valor.includes('@')).every((valor) => valor.startsWith('SNT-'))).toBe(true)
  })
})
