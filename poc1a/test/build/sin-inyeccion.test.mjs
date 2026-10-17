// POC-3 U7 (T-05 iv, NV-11): el build de producción no contiene la inyección de fallos de `src/lib/intake/fallos.ts`.
// Next inlinea NODE_ENV y debe eliminar el bloque. PRECONDICIÓN: `./poc.sh build-en poc3_intake` (genera .next-prod);
// después, desde la raíz del worktree: `.jz/bin/jz-run node --test poc1a/test/build/`. Falla si .next-prod/server no existe.
//
// Los marcadores son los valores de la cabecera x-poc-fallo exclusivos de fallos.ts. `POC_FALLOS_INYECTABLES` y
// `x-poc-fallo` no sirven aquí: `src/collections/Solicitudes.ts` los menciona en su propia guarda (valor `tras-estado`).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const servidor = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.next-prod/server')
const MARCADORES = ['intake-pg-check', 'intake-pg-tipo', 'intake-fuera', 'intake-log-crudo']

function archivos(directorio) {
  return fs.readdirSync(directorio, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = path.join(directorio, entrada.name)
    return entrada.isDirectory() ? archivos(ruta) : [ruta]
  })
}

test('existe .next-prod/server con archivos de build', () => {
  assert.ok(fs.existsSync(servidor), `falta ${servidor}: ejecuta ./poc.sh build-en poc3_intake antes`)
  assert.ok(archivos(servidor).length > 0, '.next-prod/server está vacío')
})

test('el build de producción no contiene los marcadores de fallos.ts', () => {
  assert.ok(fs.existsSync(servidor), `falta ${servidor}: ejecuta ./poc.sh build-en poc3_intake antes`)
  const encontrados = []
  for (const archivo of archivos(servidor)) {
    const contenido = fs.readFileSync(archivo, 'latin1')
    for (const marcador of MARCADORES) if (contenido.includes(marcador)) encontrados.push(`${marcador} en ${path.relative(servidor, archivo)}`)
  }
  assert.deepEqual(encontrados, [])
})
