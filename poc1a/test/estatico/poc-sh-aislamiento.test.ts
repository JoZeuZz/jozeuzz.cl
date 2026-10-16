import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

describe('harness POC-1b aislado', () => {
  it('e2e-en exige base POC-1b y propaga target a app y runner', async () => {
    const script = await readFile(path.join(raiz, 'poc.sh'), 'utf8')

    expect(script).toMatch(/e2e-en\)/)
    expect(script).toMatch(/base="\$\{1:\?uso: e2e-en <base-poc1b>\}"; nombre_poc1b "\$base"/)
    expect(script).toMatch(/POC_DATABASE_NAME="\$base" \$C up -d db app/)
    expect(script).toMatch(/POC_DATABASE_NAME="\$base" \$C --profile e2e run --rm -e POC_DATABASE_NAME -e E2E_RESET e2e/)
  })
})
