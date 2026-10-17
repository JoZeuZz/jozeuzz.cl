import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src')

it('declara tablas intake equivalentes en schema runtime y migración de producción', async () => {
  const [esquema, migracion, indice] = await Promise.all([
    readFile(path.join(src, 'lib/intake/esquema.ts'), 'utf8'),
    readFile(path.join(src, 'migrations/20261017_120000_poc3_intake.ts'), 'utf8'),
    readFile(path.join(src, 'migrations/index.ts'), 'utf8'),
  ])

  expect(esquema).toContain('export const extenderEsquemaIntake: PostgresSchemaHook')
  expect(esquema).toContain('adapter.pgSchema.table')
  expect(esquema).toContain('intake_envio')
  expect(esquema).toContain('clave')
  expect(esquema).toContain('creada_en')
  expect(esquema).toContain('intake_limite')
  expect(esquema).toContain('clave_hmac')
  expect(esquema).toContain('tipo')
  expect(esquema).toContain('ventana')
  expect(esquema).toContain('n')

  expect(migracion).toContain('CREATE TABLE "poc_prod"."intake_envio"')
  expect(migracion).toContain("CHECK (\"clave\" ~ '^[0-9a-f]{64}$')")
  expect(migracion).toContain('"creada_en" timestamp(3) with time zone NOT NULL DEFAULT now()')
  expect(migracion).toContain('CREATE INDEX "intake_envio_creada_en_idx"')
  expect(migracion).toContain('CREATE TABLE "poc_prod"."intake_limite"')
  expect(migracion).toContain("CHECK (\"clave_hmac\" ~ '^[0-9a-f]{64}$')")
  expect(migracion).toContain("CHECK (\"tipo\" IN ('intento', 'creacion'))")
  expect(migracion).toContain('"n" integer NOT NULL CHECK ("n" >= 1)')
  expect(migracion).toContain('PRIMARY KEY ("clave_hmac", "tipo", "ventana")')
  expect(migracion).toContain('CREATE INDEX "intake_limite_ventana_idx"')

  const down = migracion.slice(migracion.indexOf('export async function down'))
  expect(down).toContain('DROP TABLE "poc_prod"."intake_limite"')
  expect(down).toContain('DROP TABLE "poc_prod"."intake_envio"')
  expect(indice).toContain("from './20261017_120000_poc3_intake'")
  expect(indice).toContain("name: '20261017_120000_poc3_intake'")
})
