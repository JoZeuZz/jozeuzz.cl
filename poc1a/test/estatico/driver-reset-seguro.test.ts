import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const fuente = readFileSync(new URL('../../contrato-driver.mjs', import.meta.url), 'utf8')

describe('driver de contrato: el reset no filtra la contraseña sintética', () => {
  it('el error de reset nunca referencia r.stdout (la línea RESULTADO: lleva la contraseña)', () => {
    const inicio = fuente.indexOf('reset falló')
    expect(inicio).toBeGreaterThan(-1)
    const fragmento = fuente.slice(inicio, fuente.indexOf('\n', inicio))
    expect(fragmento).not.toMatch(/stdout/)
    expect(fragmento).toMatch(/r\.stderr/)
  })

  it('valida cada elemento de POC_RESET_ENV con NOMBRE=valor sin espacios', () => {
    expect(fuente).toContain('/^[A-Z_][A-Z0-9_]*=\\S*$/')
    expect(fuente).toMatch(/POC_RESET_ENV[^\n]*(inválid|invalid|debe)/)
  })
})
