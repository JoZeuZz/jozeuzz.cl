import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

it('migración eventos retiene solicitudes y desmonta relaciones antes de tabla', async () => {
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/migrations/20261016_055416_poc1b.ts')
  const text = await readFile(file, 'utf8')
  expect(text).toContain('ON DELETE restrict')
  const down = text.slice(text.indexOf('export async function down'))
  expect(down.indexOf('DROP CONSTRAINT "payload_locked_documents_rels_eventos_solicitud_fk"')).toBeLessThan(down.indexOf('DROP TABLE "poc_prod"."eventos_solicitud"'))
})
