import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'

import { LIMITES, contarCreacion, contarIntento } from './limites'

const claveIp = 'a'.repeat(64)
const dialecto = new PgDialect()
const render = (consulta: unknown) => dialecto.sqlToQuery(consulta as never)

describe('límites intake', () => {
  it('cuenta intentos mediante UPSERT atómico y bloquea el trigésimo primero', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ n: 31, reintentar_en_s: 0 }] })

    await expect(contarIntento({ execute }, claveIp, 'poc_test')).resolves.toEqual({ permitido: false, reintentarEnS: 1 })
    expect(LIMITES).toEqual({ intentos: { max: 30, ventanaMs: 600_000 }, creaciones: { max: 5, ventanaMs: 600_000 } })
    const { sql: texto } = render(execute.mock.calls[0]?.[0])
    expect(texto).toContain('ON CONFLICT (clave_hmac, tipo, ventana) DO UPDATE SET n = "poc_test"."intake_limite".n + 1')
    expect(texto).toContain("date_bin('10 minutes', now(), timestamptz '2000-01-01 00:00:00+00')")
  })

  it('califica la tabla con el schema del adaptador, no con el search_path', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ n: 1, reintentar_en_s: 5 }] })
    await contarIntento({ execute }, claveIp, 'poc_test')
    await contarCreacion({ execute }, claveIp, 'poc_prod')

    const intento = render(execute.mock.calls[0]?.[0])
    const creacion = render(execute.mock.calls[1]?.[0])
    expect(intento.sql).toContain('INSERT INTO "poc_test"."intake_limite"')
    expect(intento.sql).not.toMatch(/INSERT INTO intake_limite/)
    expect(creacion.sql).toContain('INSERT INTO "poc_prod"."intake_limite"')
    expect(creacion.sql).not.toContain('poc_test')
  })

  it('pasa clave y tipo como parámetros, no interpolados', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ n: 1, reintentar_en_s: 5 }] })
    await contarCreacion({ execute }, claveIp, 'poc_test')

    const { sql: texto, params } = render(execute.mock.calls[0]?.[0])
    expect(texto).not.toContain(claveIp)
    expect(params).toEqual([claveIp, 'creacion'])
  })

  it('cuenta creaciones y conserva el Retry-After devuelto por ventana', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ n: 5, reintentar_en_s: 42 }] })

    await expect(contarCreacion({ execute }, claveIp, 'poc_test')).resolves.toEqual({ permitido: true, reintentarEnS: 42 })
    expect(render(execute.mock.calls[0]?.[0]).params).toContain('creacion')
  })

  it.each([0, -7])('normaliza Retry-After %i a 1 segundo en el borde de la ventana', async (reintentar) => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ n: 6, reintentar_en_s: reintentar }] })

    await expect(contarCreacion({ execute }, claveIp, 'poc_test')).resolves.toEqual({ permitido: false, reintentarEnS: 1 })
  })
})
