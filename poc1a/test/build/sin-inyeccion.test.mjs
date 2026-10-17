// POC-3 U7 (T-05 iv, NV-11): el build de producción no contiene la inyección de fallos de `src/lib/intake/fallos.ts`.
// Next inlinea NODE_ENV y debe eliminar el bloque. PRECONDICIÓN: `./poc.sh build-en poc3_intake` (genera .next-prod);
// después, desde poc1a/: `node --test test/build/sin-inyeccion.test.mjs`. Falla si .next-prod/server no existe o es
// obsoleto. La lógica (marcadores sólo en *.js, controles positivos, BUILD_ID) está en `comprobar-build.mjs`.
//
// Los marcadores son los valores de la cabecera x-poc-fallo exclusivos de fallos.ts. `POC_FALLOS_INYECTABLES` y
// `x-poc-fallo` no sirven aquí: `src/collections/Solicitudes.ts` los menciona en su propia guarda (valor `tras-estado`).
import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { comprobarBuild } from './comprobar-build.mjs'

const raizApp = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

test('el build de producción es actual y no contiene los marcadores de fallos.ts', () => {
  assert.deepEqual(comprobarBuild(raizApp), [])
})
